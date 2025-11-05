import worldService from './world-service.js';
import stateService from './state-service.js';
import { sceneEventSignals } from '../state/slices/scene-events.js';

const listeners = new Set();
let subscriptions = [];
let initialised = false;

let sceneIdCache = 0;
let eventObjectsCache = [];
let eventObjectsVersion = 0;
let collisionStateCache = null;

function teardown() {
  subscriptions.forEach((subscription) => {
    if (!subscription) {
      return;
    }
    if (typeof subscription.unsubscribe === 'function') {
      subscription.unsubscribe();
    } else if (typeof subscription === 'function') {
      subscription();
    }
  });
  subscriptions = [];
  initialised = false;
}

function setEventObjectsCache(nextValue) {
  const resolved = Array.isArray(nextValue) ? nextValue : [];
  if (resolved !== eventObjectsCache) {
    eventObjectsCache = resolved;
    eventObjectsVersion++;
  }
  return eventObjectsCache;
}

function refreshSceneId() {
  sceneIdCache = sceneEventSignals().sceneId.value;
  return sceneIdCache;
}

function refreshEventObjects() {
  const latest = sceneEventSignals().eventObjects.value;
  if (Array.isArray(latest) && latest.length > 0) {
    return setEventObjectsCache(latest);
  }
  if (worldService && typeof worldService.getEventObjectsInCurrentScene === 'function') {
    const fallback = worldService.getEventObjectsInCurrentScene();
    return setEventObjectsCache(fallback);
  }
  return setEventObjectsCache([]);
}

function refreshCollisionState() {
  collisionStateCache = sceneEventSignals().collisionState.value;
  return collisionStateCache;
}

function notify(event) {
  listeners.forEach((listener) => {
    if (typeof listener !== 'function') {
      return;
    }
    try {
      listener(event);
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[sceneEventAdapter] listener error', err);
      }
    }
  });
}

function ensureInitialised() {
  if (initialised) {
    return;
  }
  refreshSceneId();
  refreshEventObjects();
  refreshCollisionState();

  const signals = sceneEventSignals();
  subscriptions = [
    signals.sceneId.subscribe((value) => {
      if (value !== sceneIdCache) {
        const previous = sceneIdCache;
        sceneIdCache = value;
        notify({ type: 'sceneId', value, previous });
      }
    }),
    signals.eventObjects.subscribe((value) => {
      if (value !== eventObjectsCache) {
        const previous = eventObjectsCache;
        setEventObjectsCache(value);
        notify({
          type: 'eventObjects',
          value: eventObjectsCache,
          previous,
          version: eventObjectsVersion
        });
      }
    }),
    signals.collisionState.subscribe((value) => {
      if (value !== collisionStateCache) {
        const previous = collisionStateCache;
        collisionStateCache = value;
        notify({ type: 'collisionState', value, previous });
      }
    })
  ];

  initialised = true;
}

function subscribe(listener) {
  ensureInitialised();
  if (typeof listener !== 'function') {
    return () => {};
  }
  listeners.add(listener);
  listener({
    type: 'snapshot',
    sceneId: sceneIdCache,
    eventObjects: eventObjectsCache,
    collisionState: collisionStateCache,
    version: eventObjectsVersion
  });
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      notify({ type: 'disposed' });
      teardown();
      sceneIdCache = 0;
      eventObjectsCache = [];
      eventObjectsVersion = 0;
      collisionStateCache = null;
    }
  };
}

function getSceneId() {
  ensureInitialised();
  return sceneIdCache;
}

function getEventObjects() {
  ensureInitialised();
  return eventObjectsCache;
}

function getEventObjectsVersion() {
  ensureInitialised();
  return eventObjectsVersion;
}

function getEventObjectIds() {
  ensureInitialised();
  return eventObjectsCache
    .map((entry) => (entry ? entry.id : null))
    .filter((id) => Number.isFinite(id));
}

function getGlobalEventObjects() {
  if (!stateService || typeof stateService.getGameData !== 'function') {
    return [];
  }
  const table = stateService.getGameData('eventObject');
  if (!table) {
    return [];
  }
  const length = Array.isArray(table)
    ? table.length
    : (typeof table.length === 'number' ? table.length : 0);
  if (!length) {
    return [];
  }
  const results = [];
  for (let i = 0; i < length; i++) {
    const state = table[i];
    if (!state) {
      continue;
    }
    results.push({
      index: i,
      id: i + 1,
      state
    });
  }
  return results;
}

function findEventObjectEntry(predicate) {
  ensureInitialised();
  if (typeof predicate !== 'function') {
    return null;
  }
  const cacheLength = eventObjectsCache.length;
  for (let i = 0; i < cacheLength; i++) {
    const entry = eventObjectsCache[i];
    if (entry && predicate(entry)) {
      return entry;
    }
  }
  const globalEntries = getGlobalEventObjects();
  for (let i = 0; i < globalEntries.length; i++) {
    const entry = globalEntries[i];
    if (entry && predicate(entry)) {
      return entry;
    }
  }
  return null;
}

function getEventObjectEntryById(id) {
  if (!Number.isFinite(id)) {
    return null;
  }
  return findEventObjectEntry((entry) => entry.id === id);
}

function getEventObjectEntryByIndex(index) {
  if (!Number.isFinite(index)) {
    return null;
  }
  return findEventObjectEntry((entry) => entry.index === index);
}

function getEventObjectIdForRelativeIndex(relativeIndex) {
  ensureInitialised();
  if (!Number.isFinite(relativeIndex)) {
    return null;
  }
  const range = typeof worldService.getSceneEventObjectRange === 'function'
    ? worldService.getSceneEventObjectRange()
    : null;
  if (!range || typeof range.start !== 'number') {
    return null;
  }
  const absoluteIndex = range.start + Math.trunc(relativeIndex);
  const entry = getEventObjectEntryByIndex(absoluteIndex);
  return entry && Number.isFinite(entry.id) ? entry.id : null;
}

function getEventObjectStateById(id) {
  const entry = getEventObjectEntryById(id);
  return entry ? entry.state : null;
}

function getEventObjectStateByIndex(index) {
  const entry = getEventObjectEntryByIndex(index);
  return entry ? entry.state : null;
}

function getCollisionState() {
  ensureInitialised();
  return collisionStateCache;
}

function getListenerCount() {
  return listeners.size;
}

function dispose() {
  notify({ type: 'disposed' });
  teardown();
  listeners.clear();
  sceneIdCache = 0;
  eventObjectsCache = [];
  eventObjectsVersion = 0;
  collisionStateCache = null;
}

export default {
  subscribe,
  getSceneId,
  getEventObjects,
  getEventObjectsVersion,
  getEventObjectIds,
  getEventObjectEntryById,
  getEventObjectEntryByIndex,
  getEventObjectIdForRelativeIndex,
  getEventObjectStateById,
  getEventObjectStateByIndex,
  getCollisionState,
  getListenerCount,
  dispose
};
