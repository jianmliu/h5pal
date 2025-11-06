import services, {
  worldService,
  scriptService,
  battleService,
  resourceService
} from '../services/index.js';

const STREAM_ALIASES = Object.freeze({
  'environment.viewport': 'viewport$',
  'partyTrail.party': 'party$',
  'partyTrail.followers': 'followerCount$',
  'scene.events.objects': 'sceneEventObjects$',
  'scene.events.id': 'sceneId$',
  'scene.events.collision': 'collisionState$',
  'scene.events.version': 'sceneEventVersion$',
  'battleState.state': 'battleState$',
  'battleState.enemyTeam': 'enemyTeam$',
  'battleState.battleFields': 'battleFields$'
});

function resolveAdapter(entryOrId) {
  if (!services || !services.adapterManifest) {
    throw new Error('[ai-gateway] adapter manifest unavailable');
  }

  if (typeof entryOrId === 'object' && entryOrId !== null) {
    return entryOrId;
  }

  const manifestEntry = services.adapterManifest[entryOrId];
  if (!manifestEntry) {
    throw new Error(`[ai-gateway] unknown adapter '${entryOrId}'`);
  }
  return manifestEntry;
}

function getModule(adapterEntry) {
  if (adapterEntry.module) {
    return adapterEntry.module;
  }
  throw new Error(`[ai-gateway] adapter '${adapterEntry.id}' not loaded. Call load() first.`);
}

async function loadAdapter(id) {
  const entry = resolveAdapter(id);
  return entry.load();
}

function getObservable(adapterModule, streamName) {
  if (!adapterModule || typeof streamName !== 'string') {
    return null;
  }

  const candidates = [streamName];
  const lastSegment = streamName.includes('.') ? streamName.slice(streamName.lastIndexOf('.') + 1) : streamName;

  if (!streamName.endsWith('$')) {
    candidates.push(`${lastSegment}$`);
  }
  if (lastSegment !== streamName) {
    candidates.push(lastSegment);
  }
  const alias = STREAM_ALIASES[streamName];
  if (alias && !candidates.includes(alias)) {
    candidates.push(alias);
  }

  const tryCandidate = (key) => {
    if (!key || !Object.prototype.hasOwnProperty.call(adapterModule, key)) {
      return null;
    }
    const value = adapterModule[key];
    if (typeof value === 'function') {
      if (typeof value.asObservable === 'function') {
        return value.asObservable();
      }
      return value();
    }
    if (value && typeof value.asObservable === 'function') {
      return value.asObservable();
    }
    if (value && typeof value.subscribe === 'function') {
      return value;
    }
    return null;
  };

  for (let idx = 0; idx < candidates.length; idx++) {
    const observable = tryCandidate(candidates[idx]);
    if (observable) {
      return observable;
    }
  }

  const values = Object.values(adapterModule);
  for (let idx = 0; idx < values.length; idx++) {
    const entry = values[idx];
    if (!entry) {
      continue;
    }
    const label = typeof entry === 'function' ? entry.label : entry.label;
    if (label !== streamName) {
      continue;
    }
    if (typeof entry === 'function') {
      if (typeof entry.asObservable === 'function') {
        return entry.asObservable();
      }
      return entry();
    }
    if (typeof entry.asObservable === 'function') {
      return entry.asObservable();
    }
    if (typeof entry.subscribe === 'function') {
      return entry;
    }
  }

  return null;
}

function subscribe(options) {
  const { adapter, stream, handler, throttleMs = 0, maxPayloadSize = 0 } = options || {};

  if (typeof handler !== 'function') {
    throw new TypeError('[ai-gateway] subscribe requires a handler');
  }

  const entry = resolveAdapter(adapter);
  if (Array.isArray(entry.streams) && entry.streams.length > 0) {
    if (!stream) {
      throw new Error(
        `[ai-gateway] adapter '${entry.id}' exposes multiple streams. Specify one of: ${entry.streams.join(', ')}`
      );
    }
    if (!entry.streams.includes(stream)) {
      throw new Error(
        `[ai-gateway] stream '${stream}' not found on adapter '${entry.id}'. Known streams: ${entry.streams.join(', ')}`
      );
    }
  }

  const targetStream = stream || entry.primaryStream;
  if (!targetStream) {
    throw new Error(`[ai-gateway] adapter '${entry.id}' does not publish observable streams`);
  }

  const adapterModule = getModule(entry);
  const observable = getObservable(adapterModule, targetStream.replace(/\./g, '.'));

  if (!observable || typeof observable.subscribe !== 'function') {
    throw new Error(`[ai-gateway] stream '${targetStream}' is not observable`);
  }

  let lastEmission = 0;
  const subscription = observable.subscribe((value) => {
    const now = Date.now();
    if (throttleMs > 0 && now - lastEmission < throttleMs) {
      return;
    }
    lastEmission = now;

    if (maxPayloadSize > 0) {
      try {
        const encoded = serializeForSizeCheck(value);
        if (encoded && encoded.length > maxPayloadSize) {
          throw new Error(`[ai-gateway] payload for ${entry.id}:${targetStream} exceeds ${maxPayloadSize} bytes`);
        }
      } catch (err) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[ai-gateway] payload size check failed', err);
        }
      }
    }

    handler(value);
  });
  return () => {
    try {
      subscription.unsubscribe();
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[ai-gateway] failed to unsubscribe cleanly', err);
      }
    }
  };
}

export async function ensureAdaptersLoaded(adapterIds = []) {
  const ids = Array.isArray(adapterIds) ? adapterIds : [adapterIds];
  await Promise.all(ids.map((id) => loadAdapter(id)));
}

const ACTION_HANDLERS = {
  move: ({ direction }) => {
    if (typeof direction !== 'number') {
      throw new TypeError('[ai-gateway] move requires numeric direction');
    }
    if (!worldService || typeof worldService.setPartyDirection !== 'function') {
      throw new Error('[ai-gateway] worldService.setPartyDirection unavailable');
    }
    worldService.setPartyDirection(direction);
  },
  interact: ({ eventId }) => {
    if (typeof scriptService !== 'object' || typeof scriptService.runTriggerScript !== 'function') {
      throw new Error('[ai-gateway] scriptService.runTriggerScript unavailable');
    }
    const targetEventId = Number.isFinite(eventId) ? eventId : 0xFFFF;
    scriptService.runTriggerScript(0, targetEventId);
  },
  startBattle: ({ formationId }) => {
    if (!battleService || typeof battleService.startBattle !== 'function') {
      throw new Error('[ai-gateway] battleService.startBattle unavailable');
    }
    battleService.startBattle(formationId);
  },
  useItem: ({ itemId, targetIndex }) => {
    if (!worldService || typeof worldService.useInventoryItem !== 'function') {
      throw new Error('[ai-gateway] worldService.useInventoryItem unavailable');
    }
    if (!Number.isFinite(itemId)) {
      throw new TypeError('[ai-gateway] useItem requires numeric itemId');
    }
    worldService.useInventoryItem(itemId, targetIndex);
  },
  openMenu: ({ menu }) => {
    if (!scriptService || typeof scriptService.openMenu !== 'function') {
      throw new Error('[ai-gateway] scriptService.openMenu unavailable');
    }
    scriptService.openMenu(menu);
  },
  castMagic: ({ magicId, casterIndex, targetIndex }) => {
    if (!battleService || typeof battleService.castMagic !== 'function') {
      throw new Error('[ai-gateway] battleService.castMagic unavailable');
    }
    if (!Number.isFinite(magicId)) {
      throw new TypeError('[ai-gateway] castMagic requires numeric magicId');
    }
    battleService.castMagic({ magicId, casterIndex, targetIndex });
  },
  saveGame: ({ slot }) => {
    if (!resourceService || typeof resourceService.saveGame !== 'function') {
      throw new Error('[ai-gateway] resourceService.saveGame unavailable');
    }
    const resolvedSlot = Number.isFinite(slot) ? slot : undefined;
    resourceService.saveGame(resolvedSlot);
  }
};

const actionCooldowns = new Map();

export function dispatch(action) {
  const { type } = action || {};
  if (typeof type !== 'string') {
    throw new TypeError('[ai-gateway] dispatch requires a string action type');
  }
  const handler = ACTION_HANDLERS[type];
  if (!handler) {
    throw new Error(`[ai-gateway] unsupported action type '${type}'`);
  }
  const payload = action.payload || {};
  const cooldownMs = Number.isFinite(payload.cooldownMs) ? payload.cooldownMs : 0;
  if (cooldownMs > 0) {
    const last = actionCooldowns.get(type) || 0;
    const now = Date.now();
    if (now - last < cooldownMs) {
      throw new Error(`[ai-gateway] action '${type}' throttled (${cooldownMs}ms)`);
    }
    actionCooldowns.set(type, now);
  }
  return handler(action.payload || {});
}

export default {
  manifest: services.adapterManifest,
  loadAdapter,
  subscribe,
  dispatch
};
function serializeForSizeCheck(value) {
  const seen = new WeakSet();
  const replacer = (key, val) => {
    if (val && typeof val === 'object') {
      if (ArrayBuffer.isView(val)) {
        return {
          constructor: val.constructor && val.constructor.name ? val.constructor.name : 'TypedArray',
          byteLength: (() => {
            try {
              return typeof val.byteLength === 'number' ? val.byteLength : null;
            } catch (error) {
              return null;
            }
          })()
        };
      }
      if (val instanceof ArrayBuffer || Object.prototype.toString.call(val) === '[object ArrayBuffer]') {
        let length = null;
        try {
          length = typeof val.byteLength === 'number' ? val.byteLength : null;
        } catch (error) {
          length = null;
        }
        return { constructor: 'ArrayBuffer', byteLength: length };
      }
      if (seen.has(val)) {
        return '[Circular]';
      }
      seen.add(val);
    }
    return val;
  };
  return JSON.stringify(value, replacer);
}
