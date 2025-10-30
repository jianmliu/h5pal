import worldService from './world-service.js';
import { sceneEventSignals } from '../state/slices/scene-events.js';

const listeners = new Set();
let subscriptions = [];
let initialised = false;

let sceneIdCache = 0;
let eventObjectsCache = [];
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

function refreshSceneId() {
  sceneIdCache = sceneEventSignals().sceneId.value;
  return sceneIdCache;
}

function refreshEventObjects() {
  const latest = sceneEventSignals().eventObjects.value;
  if (Array.isArray(latest)) {
    eventObjectsCache = latest;
    return eventObjectsCache;
  }
  const sceneObjects = worldService.getEventObjectsInCurrentScene ? worldService.getEventObjectsInCurrentScene() : [];
  eventObjectsCache = Array.isArray(sceneObjects) ? sceneObjects : [];
  return eventObjectsCache;
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
        eventObjectsCache = Array.isArray(value) ? value : [];
        notify({ type: 'eventObjects', value: eventObjectsCache, previous });
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
    collisionState: collisionStateCache
  });
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      notify({ type: 'disposed' });
      teardown();
      sceneIdCache = 0;
      eventObjectsCache = [];
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

function getCollisionState() {
  ensureInitialised();
  return collisionStateCache;
}

function dispose() {
  notify({ type: 'disposed' });
  teardown();
  listeners.clear();
  sceneIdCache = 0;
  eventObjectsCache = [];
  collisionStateCache = null;
}

export default {
  subscribe,
  getSceneId,
  getEventObjects,
  getCollisionState,
  dispose
};
