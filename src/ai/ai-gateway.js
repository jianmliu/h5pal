import services, {
  worldService,
  scriptService,
  battleService,
  resourceService
} from '../services/index.js';
import input, { Key } from '../js/pal/input.js';

const GLOBAL_ROOT = (() => {
  if (typeof globalThis !== 'undefined') return globalThis;
  if (typeof window !== 'undefined') return window;
  if (typeof global !== 'undefined') return global;
  return {};
})();

function getGlobalEnum(name) {
  if (!name) {
    return null;
  }
  const value = GLOBAL_ROOT[name];
  return value || null;
}

function getBattleActionEnum() {
  return getGlobalEnum('BattleActionType');
}

function getBattleUIStateEnum() {
  return getGlobalEnum('BattleUIState');
}

function getBattleMenuStateEnum() {
  return getGlobalEnum('BattleMenuState');
}

const BATTLE_ACTION_ALIASES = Object.freeze({
  attack: 'Attack',
  physical: 'Attack',
  fight: 'Attack',
  defend: 'Defend',
  guard: 'Defend',
  pass: 'Pass',
  wait: 'Pass',
  idle: 'Pass',
  flee: 'Flee',
  escape: 'Flee',
  magic: 'Magic',
  spell: 'Magic',
  castmagic: 'Magic',
  cast: 'Magic',
  coopmagic: 'CoopMagic',
  cooperative: 'CoopMagic',
  combo: 'CoopMagic',
  useitem: 'UseItem',
  item: 'UseItem',
  heal: 'UseItem',
  throwitem: 'ThrowItem',
  toss: 'ThrowItem',
  attackmate: 'AttackMate'
});

const TARGETED_ACTIONS = new Set(['Attack', 'Magic', 'CoopMagic', 'UseItem', 'ThrowItem', 'AttackMate']);

const DEFAULT_TARGET_TYPES = Object.freeze({
  Attack: 'enemy',
  Magic: 'enemy',
  CoopMagic: 'enemy',
  ThrowItem: 'enemy',
  AttackMate: 'ally',
  UseItem: 'ally'
});

function resolveBattleActionName(action) {
  if (typeof action === 'number' && Number.isFinite(action)) {
    const enumRef = getBattleActionEnum();
    if (enumRef) {
      const match = Object.keys(enumRef).find((key) => enumRef[key] === action);
      if (match) {
        return match;
      }
    }
    return null;
  }
  if (!action) {
    return null;
  }
  if (typeof action === 'string') {
    const normalized = action.replace(/[\s_-]/g, '').toLowerCase();
    if (normalized in BATTLE_ACTION_ALIASES) {
      return BATTLE_ACTION_ALIASES[normalized];
    }
    const direct = action[0].toUpperCase() + action.slice(1);
    if (direct in BATTLE_ACTION_ALIASES) {
      return BATTLE_ACTION_ALIASES[direct];
    }
    return direct;
  }
  return null;
}

function resolveBattleActionType(action) {
  const actionEnum = getBattleActionEnum();
  if (!actionEnum) {
    return null;
  }
  if (typeof action === 'number' && Number.isFinite(action)) {
    return action;
  }
  const resolvedName = resolveBattleActionName(action);
  if (!resolvedName) {
    return null;
  }
  if (typeof actionEnum[resolvedName] === 'number') {
    return actionEnum[resolvedName];
  }
  return null;
}

function ensureBattleContext() {
  if (!battleService || typeof battleService.getState !== 'function') {
    throw new Error('[ai-gateway] battleService unavailable');
  }
  if (!worldService || typeof worldService.isInBattle !== 'function' || !worldService.isInBattle()) {
    throw new Error('[ai-gateway] battleCommand requires an active battle');
  }
  const state = battleService.getState();
  if (!state) {
    throw new Error('[ai-gateway] battle state unavailable');
  }
  const ui = typeof battleService.getUI === 'function'
    ? battleService.getUI()
    : (state.UI || null);
  if (!ui) {
    throw new Error('[ai-gateway] battle UI unavailable');
  }
  return { state, ui };
}

function resolveBattleTarget(payload = {}, uiSnapshot = {}, options = {}) {
  const defaultType = options.defaultType || 'enemy';
  const targetInput = payload.target && typeof payload.target === 'object' ? payload.target : null;
  const providedType = payload.targetType || (targetInput && targetInput.type);
  const resolvedType = typeof providedType === 'string'
    ? providedType.toLowerCase()
    : defaultType;
  const targetType = resolvedType === 'ally' || resolvedType === 'player' || resolvedType === 'self'
    ? (resolvedType === 'self' ? 'self' : 'ally')
    : 'enemy';
  const scope = (payload.scope || payload.targetScope || (targetInput && targetInput.scope) || '').toLowerCase();
  const applyAll = payload.applyAll === true
    || payload.all === true
    || payload.targetIndex === 'all'
    || (typeof payload.target === 'string' && payload.target.toLowerCase() === 'all')
    || scope === 'all';
  let rawIndex = payload.targetIndex;
  if (rawIndex != null && !Number.isFinite(rawIndex)) {
    const numeric = Number(rawIndex);
    if (!Number.isNaN(numeric)) {
      rawIndex = numeric;
    }
  }
  if (targetInput && typeof targetInput.index !== 'undefined') {
    rawIndex = targetInput.index;
    if (rawIndex != null && !Number.isFinite(rawIndex)) {
      const numericTarget = Number(rawIndex);
      if (!Number.isNaN(numericTarget)) {
        rawIndex = numericTarget;
      }
    }
  }
  if (targetType === 'self' && typeof uiSnapshot.curPlayerIndex === 'number') {
    rawIndex = uiSnapshot.curPlayerIndex;
  }
  let selectedIndex = Number.isFinite(rawIndex) ? Math.trunc(rawIndex) : null;
  if (applyAll || Number(rawIndex) === -1) {
    selectedIndex = -1;
  }
  if (selectedIndex === null || Number.isNaN(selectedIndex)) {
    if (targetType === 'ally') {
      selectedIndex = 0;
    } else if (typeof uiSnapshot.prevEnemyTarget === 'number') {
      selectedIndex = uiSnapshot.prevEnemyTarget;
    } else {
      selectedIndex = 0;
    }
  }
  let uiState = null;
  const uiEnum = getBattleUIStateEnum();
  if (uiEnum) {
    if (targetType === 'ally' || targetType === 'self') {
      uiState = selectedIndex === -1 ? uiEnum.SelectTargetPlayerAll : uiEnum.SelectTargetPlayer;
    } else {
      uiState = selectedIndex === -1 ? uiEnum.SelectTargetEnemyAll : uiEnum.SelectTargetEnemy;
    }
  }
  return { selectedIndex, uiState, targetType };
}

function handleBattleCommand(payload = {}) {
  const { state, ui } = ensureBattleContext();
  const actionInput = payload.action || payload.command || payload.actionType;
  const resolvedName = resolveBattleActionName(actionInput);
  const actionType = resolveBattleActionType(actionInput);
  if (typeof actionType !== 'number') {
    throw new Error('[ai-gateway] battleCommand requires a valid action');
  }
  const explicitTarget =
    payload.applyAll === true ||
    typeof payload.targetIndex !== 'undefined' ||
    !!payload.target ||
    typeof payload.targetType === 'string';
  const needsTarget = (resolvedName && TARGETED_ACTIONS.has(resolvedName)) || explicitTarget;
  const updates = { actionType };
  if (resolvedName && resolvedName in DEFAULT_TARGET_TYPES && !payload.targetType) {
    payload.targetType = DEFAULT_TARGET_TYPES[resolvedName];
  }
  if (needsTarget) {
    const { selectedIndex, uiState, targetType } = resolveBattleTarget(payload, ui, {
      defaultType: DEFAULT_TARGET_TYPES[resolvedName] || 'enemy'
    });
    if (typeof selectedIndex === 'number' && !Number.isNaN(selectedIndex)) {
      updates.selectedIndex = selectedIndex;
      if (targetType === 'enemy' && selectedIndex >= 0) {
        updates.prevEnemyTarget = selectedIndex;
      }
    }
    if (uiState != null) {
      updates.state = uiState;
    }
  }
  if (Number.isFinite(payload.objectId)) {
    updates.objectID = Math.trunc(payload.objectId);
  } else if (Number.isFinite(payload.magicId)) {
    updates.objectID = Math.trunc(payload.magicId);
  } else if (Number.isFinite(payload.itemId)) {
    updates.objectID = Math.trunc(payload.itemId);
  } else if (needsTarget && resolvedName && (resolvedName === 'Magic' || resolvedName === 'UseItem' || resolvedName === 'ThrowItem')) {
    throw new Error('[ai-gateway] battleCommand requires objectId/magicId/itemId for this action');
  }
  if (Number.isFinite(payload.curPlayerIndex)) {
    updates.curPlayerIndex = Math.trunc(payload.curPlayerIndex);
  }
  const menuEnum = getBattleMenuStateEnum();
  if (menuEnum && typeof menuEnum.Main === 'number') {
    updates.menuState = menuEnum.Main;
  }
  if (typeof battleService.setUI !== 'function') {
    throw new Error('[ai-gateway] battleService.setUI unavailable');
  }
  battleService.setUI(updates);
  const shouldCommit = payload.commit !== false;
  if (shouldCommit) {
    if (typeof battleService.commitAction !== 'function') {
      throw new Error('[ai-gateway] battle module is missing commitAction');
    }
    battleService.commitAction(!!payload.repeat);
  }
  const message = resolvedName ? `battleCommand:${resolvedName}` : 'battleCommand';
  return normalizeResult(true, `${message}${shouldCommit ? ' committed' : ' staged'}`);
}

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

function normalizeResult(success, message, extra = {}) {
  return Object.assign({ success: !!success, message }, extra);
}

function simulateKey(palKey) {
  if (!palKey) {
    throw new Error('[ai-gateway] invalid key');
  }
  if (!input || typeof input.fire !== 'function') {
    throw new Error('[ai-gateway] input module unavailable');
  }
  if (typeof input.simulateKeyPress === 'function') {
    input.simulateKeyPress(palKey, 160);
    return;
  }
  input.fire('keydown', palKey);
  if (typeof setTimeout === 'function') {
    setTimeout(() => {
      input.fire('keyup', palKey);
    }, 100);
  } else {
    input.fire('keyup', palKey);
  }
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
    return normalizeResult(true, `Facing direction ${direction}`);
  },
  interact: ({ eventId }) => {
    if (typeof scriptService !== 'object' || typeof scriptService.runTriggerScript !== 'function') {
      throw new Error('[ai-gateway] scriptService.runTriggerScript unavailable');
    }
    const targetEventId = Number.isFinite(eventId) ? eventId : 0xFFFF;
    scriptService.runTriggerScript(0, targetEventId);
    return normalizeResult(true, `Triggered event ${targetEventId}`);
  },
  startBattle: ({ formationId }) => {
    if (!battleService || typeof battleService.startBattle !== 'function') {
      throw new Error('[ai-gateway] battleService.startBattle unavailable');
    }
    const resolved = Number.isFinite(formationId) ? formationId : 0;
    battleService.startBattle(resolved);
    return normalizeResult(true, `startBattle formation=${resolved}`);
  },
  useItem: ({ itemId, targetIndex }) => {
    if (!worldService || typeof worldService.useInventoryItem !== 'function') {
      throw new Error('[ai-gateway] worldService.useInventoryItem unavailable');
    }
    if (!Number.isFinite(itemId)) {
      throw new TypeError('[ai-gateway] useItem requires numeric itemId');
    }
    worldService.useInventoryItem(itemId, targetIndex);
    return normalizeResult(true, `useItem ${itemId} -> ${targetIndex}`);
  },
  openMenu: ({ menu }) => {
    if (!scriptService || typeof scriptService.openMenu !== 'function') {
      throw new Error('[ai-gateway] scriptService.openMenu unavailable');
    }
    scriptService.openMenu(menu);
    return normalizeResult(true, `openMenu ${menu || 'main'}`);
  },
  castMagic: ({ magicId, casterIndex, targetIndex }) => {
    if (!battleService || typeof battleService.castMagic !== 'function') {
      throw new Error('[ai-gateway] battleService.castMagic unavailable');
    }
    if (!Number.isFinite(magicId)) {
      throw new TypeError('[ai-gateway] castMagic requires numeric magicId');
    }
    battleService.castMagic({ magicId, casterIndex, targetIndex });
    return normalizeResult(true, `castMagic ${magicId}`);
  },
  saveGame: ({ slot }) => {
    if (!resourceService || typeof resourceService.saveGame !== 'function') {
      throw new Error('[ai-gateway] resourceService.saveGame unavailable');
    }
    const resolvedSlot = Number.isFinite(slot) ? slot : undefined;
    resourceService.saveGame(resolvedSlot);
    return normalizeResult(true, `saveGame slot=${resolvedSlot ?? 'default'}`);
  },
  dialog: ({ action = 'advance', direction } = {}) => {
    const Key = typeof globalThis !== 'undefined' ? globalThis.Key : null;
    if (!Key) {
      throw new Error('[ai-gateway] PAL Key map unavailable');
    }
    const dirMap = {
      up: Key.Up,
      north: Key.Up,
      down: Key.Down,
      south: Key.Down,
      left: Key.Left,
      west: Key.Left,
      right: Key.Right,
      east: Key.Right
    };
    if (direction) {
      const resolvedDir = dirMap[String(direction).toLowerCase()];
      if (!resolvedDir) {
        throw new Error(`[ai-gateway] dialog direction '${direction}' unsupported`);
      }
      simulateKey(resolvedDir);
    }
    const normalizedAction = String(action || '').toLowerCase();
    switch (normalizedAction) {
      case 'advance':
      case 'confirm':
      case 'next':
        simulateKey(Key.Search);
        break;
      case 'cancel':
      case 'back':
        simulateKey(Key.Menu);
        break;
      case 'none':
      case 'noop':
        break;
      default:
        throw new Error(`[ai-gateway] dialog action '${action}' unsupported`);
    }
    return normalizeResult(true, `dialog ${normalizedAction || 'advance'}`);
  },
  battleCommand: (payload) => handleBattleCommand(payload)
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
      return normalizeResult(false, `action '${type}' throttled (${cooldownMs}ms)`);
    }
    actionCooldowns.set(type, now);
  }
  try {
    const result = handler(payload);
    if (result && typeof result === 'object' && 'success' in result) {
      return result;
    }
    return normalizeResult(true, `action '${type}' executed`);
  } catch (err) {
    return normalizeResult(false, err && err.message ? err.message : String(err));
  }
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
