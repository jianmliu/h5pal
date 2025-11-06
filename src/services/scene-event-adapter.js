import worldService from './world-service.js';
import stateService from './state-service.js';
import reactiveContext from '../state/reactive-context.js';
import { Observable } from 'rxjs';
import { sceneEventSignals } from '../state/slices/scene-events.js';
import { getSceneEventObjectRange as getSceneEventObjectRangeSnapshot } from './scene-data-adapter.js';
import { createAdapterObservable } from './adapter-helpers.js';

const listeners = new Set();
let subscriptions = [];
let initialised = false;

let sceneIdCache = 0;
let eventObjectsCache = [];
let eventObjectsVersion = 0;
let collisionStateCache = null;

const sceneSignals = sceneEventSignals();

const sceneIdStream = reactiveContext.signalToObservable(sceneSignals.sceneId, () => getSceneId());
const eventObjectsStream = reactiveContext.signalToObservable(
  sceneSignals.eventObjects,
  () => getEventObjects()
);
const collisionStateStream = reactiveContext.signalToObservable(
  sceneSignals.collisionState,
  () => getCollisionState()
);
const eventVersionStream = new Observable((subscriber) => {
  ensureInitialised();
  subscriber.next(eventObjectsVersion);
  const unsubscribe = subscribe((event) => {
    if (!event) {
      return;
    }
    if (event.type === 'eventObjects') {
      subscriber.next(eventObjectsVersion);
    }
    if (event.type === 'disposed') {
      subscriber.complete();
    }
  });
  return () => {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  };
});

function normalizeEventEntry(entry) {
  if (!entry) {
    return null;
  }
  const index = Number.isFinite(entry.index) ? Math.trunc(entry.index) : null;
  const id = Number.isFinite(entry.id) ? Math.trunc(entry.id) : null;
  return {
    index,
    id,
    state: entry.state || null
  };
}

function normalizeEventEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.map((entry) => normalizeEventEntry(entry));
}

function entriesEqual(left, right) {
  if (left === right) {
    return true;
  }
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return false;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i++) {
    const a = left[i];
    const b = right[i];
    if (!a && !b) {
      continue;
    }
    if (!a || !b) {
      return false;
    }
    if (a.id !== b.id || a.index !== b.index || a.state !== b.state) {
      return false;
    }
  }
  return true;
}

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
  const normalized = normalizeEventEntries(nextValue);
  if (!entriesEqual(eventObjectsCache, normalized)) {
    eventObjectsCache = normalized;
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
  // TODO(rxjs-cleanup): drop worldService fallback once scene event slice guarantees hydration.
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

function cloneForConsumer(entry) {
  return entry
    ? { index: entry.index, id: entry.id, state: entry.state }
    : null;
}

function getEventObjects() {
  ensureInitialised();
  if (!Array.isArray(eventObjectsCache) || eventObjectsCache.length === 0) {
    return [];
  }
  const results = [];
  for (let i = 0; i < eventObjectsCache.length; i++) {
    const entry = eventObjectsCache[i];
    if (entry && entry.state) {
      results.push(cloneForConsumer(entry));
    }
  }
  return results;
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
  const range = getSceneEventObjectRangeSnapshot();
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

export function sceneId$() {
  ensureInitialised();
  return sceneIdStream;
}

export function sceneEventObjects$() {
  ensureInitialised();
  return eventObjectsStream;
}

export function collisionState$() {
  ensureInitialised();
  return collisionStateStream;
}

export function sceneEventVersion$() {
  ensureInitialised();
  return eventVersionStream;
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
  sceneId$,
  sceneEventObjects$,
  collisionState$,
  sceneEventVersion$,
  dispose
};

export {
  getSceneId as getSceneIdValue,
  getEventObjects as getEventObjectsValue,
  getCollisionState as getCollisionStateValue
};
