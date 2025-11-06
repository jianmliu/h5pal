import scriptObjectAdapter from '../../services/script-object-adapter.js';
import sceneEventAdapter from '../../services/scene-event-adapter.js';
import worldService from '../../services/world-service.js';
import battleService from '../../services/battle-service.js';
import reactiveContext from '../../state/reactive-context.js';
import debugOverlay from './debug-overlay';
import scene from './scene';
import battle from './battle';
import { SPRITE_STATS } from './sprite';
import { RLE_STATS } from './rle';
import { filter as rxFilter, tap as rxTap, take as rxTake } from 'rxjs/operators';

const reactiveTraceSessions = new Map();
const perfHookRegistry = new Map();
const renderProfileSessions = new Map();
let sceneEventSession = null;

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function startReactiveTrace(name = 'default', options = {}) {
  const sessionKey = typeof name === 'string' && name.trim() ? name.trim() : 'default';
  stopReactiveTrace(sessionKey);
  const { filter: matcher, limit } = options || {};
  let count = 0;
  const start = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
  const rootEvent$ = typeof reactiveContext.rootEvent$.asObservable === 'function'
    ? reactiveContext.rootEvent$.asObservable()
    : reactiveContext.rootEvent$;
  let stream$ = rootEvent$;
  if (typeof matcher === 'function') {
    stream$ = stream$.pipe(rxFilter((event) => {
      try {
        return matcher(event);
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[reactive.trace] filter error', err);
        }
        return false;
      }
    }));
  }
  stream$ = stream$.pipe(rxTap((event) => {
    count += 1;
    const end = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
    const payload = {
      ...event,
      session: sessionKey,
      index: count,
      elapsed: Math.round(end - start)
    };
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[reactive.trace]', payload);
    }
  }));
  if (Number.isFinite(limit) && limit > 0) {
    stream$ = stream$.pipe(rxTake(limit));
  }
  const session = {
    subscription: null,
    options: { ...options },
    start,
    get count() {
      return count;
    }
  };
  const subscription = stream$.subscribe({
    complete() {
      reactiveTraceSessions.delete(sessionKey);
    },
    error(err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[reactive.trace] subscription error', err);
      }
      reactiveTraceSessions.delete(sessionKey);
    }
  });
  session.subscription = subscription;
  reactiveTraceSessions.set(sessionKey, session);
  return sessionKey;
}

function stopReactiveTrace(name = 'default') {
  const sessionKey = typeof name === 'string' && name.trim() ? name.trim() : 'default';
  const entry = reactiveTraceSessions.get(sessionKey);
  if (entry && entry.subscription) {
    entry.subscription.unsubscribe();
  }
  reactiveTraceSessions.delete(sessionKey);
}

function listReactiveTraces() {
  return Array.from(reactiveTraceSessions.keys());
}

function profileMethod(target, methodName, label, options = {}) {
  if (!target || typeof target[methodName] !== 'function') {
    return null;
  }
  const hookKey = label || methodName;
  if (perfHookRegistry.has(hookKey)) {
    const entry = perfHookRegistry.get(hookKey);
    entry.target[entry.methodName] = entry.original;
    perfHookRegistry.delete(hookKey);
  }
  const original = target[methodName];
  const threshold = Number.isFinite(options.threshold) ? options.threshold : 0;
  const logArgs = !!options.logArgs;
  const logResult = !!options.logResult;
  const wrapper = function profiledMethod(...args) {
    const start = now();
    let result;
    let threw = false;
    try {
      result = original.apply(this, args);
    } catch (err) {
      threw = true;
      throw err;
    } finally {
      const duration = now() - start;
      if (duration >= threshold && typeof console !== 'undefined' && console.debug) {
        const payload = {
          label: hookKey,
          method: methodName,
          duration: Number(duration.toFixed(3))
        };
        if (logArgs) {
          payload.args = args;
        }
        if (!threw && logResult) {
          payload.result = result;
        }
        console.debug('[perf.profile]', payload);
      }
    }
    return result;
  };
  Object.defineProperty(wrapper, 'name', {
    value: `${methodName}__profiled`,
    configurable: true
  });
  target[methodName] = wrapper;
  perfHookRegistry.set(hookKey, { target, methodName, original });
  return () => {
    if (perfHookRegistry.has(hookKey)) {
      target[methodName] = original;
      perfHookRegistry.delete(hookKey);
    }
  };
}

function startRenderProfiling(options = {}) {
  const sessionName = typeof options.name === 'string' && options.name.trim() ? options.name.trim() : 'render';
  stopRenderProfiling(sessionName);
  const config = {
    threshold: Number.isFinite(options.threshold) ? options.threshold : 0,
    logArgs: !!options.logArgs,
    logResult: !!options.logResult
  };
  const hooks = [
    profileMethod(scene, 'renderMap', 'scene.renderMap', config),
    profileMethod(scene, 'renderSprites', 'scene.renderSprites', config),
    profileMethod(scene, 'updatePartyGestures', 'scene.updatePartyGestures', config),
    profileMethod(battle, 'makeScene', 'battle.makeScene', config),
    profileMethod(battleService, 'runSystems', 'battleService.runSystems', config)
  ].filter(Boolean);
  renderProfileSessions.set(sessionName, hooks);
  return sessionName;
}

function stopRenderProfiling(name = 'render') {
  const sessionName = typeof name === 'string' && name.trim() ? name.trim() : 'render';
  const hooks = renderProfileSessions.get(sessionName) || [];
  hooks.forEach((dispose) => {
    if (typeof dispose === 'function') {
      dispose();
    }
  });
  renderProfileSessions.delete(sessionName);
}

function listRenderProfiles() {
  return Array.from(renderProfileSessions.keys());
}

function getSceneSpriteCache(options = {}) {
  const cache = scene && scene.playerSpriteCache ? scene.playerSpriteCache : null;
  if (!cache) {
    return [];
  }
  const entries = Object.keys(cache).map((key) => {
    const sprite = cache[key];
    return {
      spriteNum: Number(key),
      frameCount: sprite && typeof sprite.frameCount === 'number' ? sprite.frameCount : 0,
      bufferLength: sprite && sprite.buf ? sprite.buf.length : 0
    };
  });
  entries.sort((a, b) => (b.frameCount || 0) - (a.frameCount || 0));
  const limit = Number.isFinite(options.limit) ? Math.max(0, options.limit) : entries.length;
  return entries.slice(0, limit);
}

function getSpriteStats(options = {}) {
  const cacheEntries = getSceneSpriteCache(options);
  return {
    stats: { ...SPRITE_STATS },
    cacheSize: cacheEntries.length,
    cache: cacheEntries
  };
}

function getRLEStats() {
  return {
    calls: RLE_STATS.calls,
    decorated: RLE_STATS.decorated,
    reused: RLE_STATS.reused,
    totalBytes: RLE_STATS.totalBytes,
    histogram: { ...RLE_STATS.histogram },
    last: RLE_STATS.last
  };
}

function formatScriptEntry(entryId) {
  if (!Number.isFinite(entryId)) {
    return null;
  }
  const entry = scriptObjectAdapter.getScriptEntry(entryId);
  if (!entry) {
    return null;
  }
  const operands = Array.isArray(entry.operand) ? entry.operand.slice() : [];
  return {
    id: entryId,
    operation: entry.operation,
    operand: operands
  };
}

function inspectEventObject(eventId) {
  if (!Number.isFinite(eventId)) {
    return null;
  }
  const entry = sceneEventAdapter.getEventObjectEntryById(Math.trunc(eventId));
  if (!entry) {
    return { id: eventId, missing: true };
  }
  const state = entry.state || null;
  const triggerScript = state ? state.triggerScript : null;
  const autoScript = state ? state.autoScript : null;
  return {
    id: entry.id,
    index: entry.index,
    state,
    triggerScript,
    autoScript,
    triggerEntry: formatScriptEntry(triggerScript),
    autoEntry: formatScriptEntry(autoScript)
  };
}

function listTriggerScripts(ids) {
  const targets = Array.isArray(ids) ? ids : [ids];
  return targets.map((id) => inspectEventObject(id));
}

function dumpSceneEventObjects(limit = 10) {
  const entries = sceneEventAdapter.getEventObjects() || [];
  const slice = Number.isFinite(limit) ? entries.slice(0, Math.max(0, limit)) : entries;
  return slice.map((entry) => inspectEventObject(entry && entry.id));
}

function traceBattleLoop(iterations = 1) {
  const limit = Number.isFinite(iterations) ? Math.max(1, iterations) : 1;
  const history = [];
  for (let i = 0; i < limit; i++) {
    const state = typeof worldService.getBattleState === 'function' ? worldService.getBattleState() : null;
    const playerActions = state && Array.isArray(state.player)
      ? state.player.map((player) => player && player.action)
      : null;
    const queue = state && Array.isArray(state.queue)
      ? state.queue.map((entry) => entry && entry.action)
      : null;
    history.push({ index: i, playerActions, queue, state });
  }
  return history;
}

function resolveScriptSequence(startEntry, depth = 10) {
  const results = [];
  let current = Number.isFinite(startEntry) ? startEntry : null;
  for (let i = 0; i < depth && Number.isFinite(current) && current > 0; i++) {
    const entry = formatScriptEntry(current);
    if (!entry) {
      results.push({ id: current, missing: true });
      break;
    }
    results.push(entry);
    // Simple heuristic: treat operand[0] as the next jump target if operation is 0x0003 (unconditional jump)
    if (entry.operation === 0x0003 && Number.isFinite(entry.operand[0]) && entry.operand[0] > 0) {
      current = entry.operand[0];
    } else {
      current += 1;
    }
  }
  return results;
}

function startSceneEventLogging(options = {}) {
  stopSceneEventLogging();
  if (!sceneEventAdapter || typeof sceneEventAdapter.subscribe !== 'function') {
    return () => {};
  }
  const logger = typeof options.logger === 'function'
    ? options.logger
    : (typeof console !== 'undefined' && console.debug ? console.debug.bind(console) : null);
  const includeSnapshot = options.includeSnapshot === true;
  const subscription = sceneEventAdapter.subscribe((event) => {
    if (!logger) {
      return;
    }
    const payload = {
      type: event.type,
      sceneId: sceneEventAdapter.getSceneId(),
      version: sceneEventAdapter.getEventObjectsVersion(),
      timestamp: new Date().toISOString()
    };
    if (event.type === 'eventObjects') {
      const next = Array.isArray(event.value) ? event.value.filter((entry) => entry && entry.state) : [];
      const previous = Array.isArray(event.previous) ? event.previous.filter((entry) => entry && entry.state) : [];
      payload.size = next.length;
      payload.previousSize = previous.length;
      if (includeSnapshot) {
        payload.snapshot = sceneEventAdapter.getEventObjects();
      }
    }
    logger('[scene.events]', payload);
  });

  sceneEventSession = {
    unsubscribe: subscription,
    options: { ...options }
  };
  return stopSceneEventLogging;
}

function stopSceneEventLogging() {
  if (sceneEventSession && typeof sceneEventSession.unsubscribe === 'function') {
    sceneEventSession.unsubscribe();
  }
  sceneEventSession = null;
}

export {
  formatScriptEntry,
  inspectEventObject,
  listTriggerScripts,
  dumpSceneEventObjects,
  traceBattleLoop,
  resolveScriptSequence,
  startReactiveTrace,
  stopReactiveTrace,
  listReactiveTraces,
  startRenderProfiling,
  stopRenderProfiling,
  listRenderProfiles,
  debugOverlay,
  getSpriteStats,
  getRLEStats,
  startSceneEventLogging,
  stopSceneEventLogging
};

export default {
  formatScriptEntry,
  inspectEventObject,
  listTriggerScripts,
  dumpSceneEventObjects,
  traceBattleLoop,
  resolveScriptSequence,
  startReactiveTrace,
  stopReactiveTrace,
  listReactiveTraces,
  startRenderProfiling,
  stopRenderProfiling,
  listRenderProfiles,
  debugOverlay,
  getSpriteStats,
  getRLEStats,
  startSceneEventLogging,
  stopSceneEventLogging
};
