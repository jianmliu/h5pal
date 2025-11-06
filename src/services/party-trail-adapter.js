import { Observable } from 'rxjs';
import {
  partyStream,
  trailStream,
  followerCountStream,
  getPartyValue,
  getTrailValue,
  getFollowerCountValue
} from '../state/slices/party-trail.js';
import stateService from './state-service.js';
import worldService from './world-service.js';

let initialised = false;
let partyCache = [];
let trailCache = [];
let followerCountCache = 0;
let subscriptions = [];
const listeners = new Set();

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

function toPlainPartyMember(entry, index) {
  if (!entry || typeof entry !== 'object') {
    return {
      playerRole: typeof index === 'number' ? index : 0,
      x: 0,
      y: 0,
      frame: 0,
      imageOffset: 0
    };
  }
  return {
    playerRole: Number.isFinite(entry.playerRole) ? entry.playerRole : (Number(entry.playerRole) || index || 0),
    x: Number.isFinite(entry.x) ? entry.x : Number(entry.x) || 0,
    y: Number.isFinite(entry.y) ? entry.y : Number(entry.y) || 0,
    frame: Number.isFinite(entry.frame) ? entry.frame : Number(entry.frame) || 0,
    imageOffset: Number.isFinite(entry.imageOffset) ? entry.imageOffset : Number(entry.imageOffset) || 0
  };
}

function toPlainTrailEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return { x: 0, y: 0, direction: 0 };
  }
  return {
    x: Number.isFinite(entry.x) ? entry.x : Number(entry.x) || 0,
    y: Number.isFinite(entry.y) ? entry.y : Number(entry.y) || 0,
    direction: Number.isFinite(entry.direction) ? entry.direction : Number(entry.direction) || 0
  };
}

function refreshPartyCache() {
  const sliceValue = getPartyValue([]);
  if (Array.isArray(sliceValue) && sliceValue.length > 0) {
    partyCache = sliceValue.map(toPlainPartyMember);
    return partyCache;
  }
  const globalParty = stateService.getGlobal('party');
  if (Array.isArray(globalParty) && globalParty.length > 0) {
    partyCache = globalParty.map(toPlainPartyMember);
    return partyCache;
  }
  if (worldService && typeof worldService.getParty === 'function') {
    const fallback = worldService.getParty();
    if (Array.isArray(fallback) && fallback.length > 0) {
      partyCache = fallback.map(toPlainPartyMember);
      return partyCache;
    }
  }
  partyCache = [];
  return partyCache;
}

function refreshTrailCache() {
  const sliceValue = getTrailValue([]);
  if (Array.isArray(sliceValue) && sliceValue.length > 0) {
    trailCache = sliceValue.map(toPlainTrailEntry);
    return trailCache;
  }
  const globalTrail = stateService.getGlobal('trail');
  if (Array.isArray(globalTrail) && globalTrail.length > 0) {
    trailCache = globalTrail.map(toPlainTrailEntry);
    return trailCache;
  }
  if (worldService && typeof worldService.getTrail === 'function') {
    const fallback = worldService.getTrail();
    if (Array.isArray(fallback) && fallback.length > 0) {
      trailCache = fallback.map(toPlainTrailEntry);
      return trailCache;
    }
  }
  trailCache = [];
  return trailCache;
}

function refreshFollowerCountCache() {
  const sliceValue = getFollowerCountValue(0);
  if (Number.isFinite(sliceValue) && sliceValue >= 0) {
    followerCountCache = sliceValue;
    return followerCountCache;
  }
  const globalCount = stateService.getGlobal('numFollower');
  if (Number.isFinite(globalCount) && globalCount >= 0) {
    followerCountCache = Math.trunc(globalCount);
    return followerCountCache;
  }
  // TODO(rxjs-cleanup): drop worldService fallback once follower slice is always hydrated early.
  if (worldService && typeof worldService.getFollowerCount === 'function') {
    const fallback = worldService.getFollowerCount();
    if (Number.isFinite(fallback) && fallback >= 0) {
      followerCountCache = Math.trunc(fallback);
      return followerCountCache;
    }
  }
  followerCountCache = Math.max(0, Math.trunc(sliceValue || 0));
  return followerCountCache;
}

function notify(event) {
  if (!event) {
    return;
  }
  listeners.forEach((listener) => {
    if (typeof listener !== 'function') {
      return;
    }
    try {
      listener(event);
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[partyTrailAdapter] listener error', err);
      }
    }
  });
}

function ensureInitialised() {
  if (initialised) {
    return;
  }

  if (worldService && typeof worldService.isInitialised === 'function' && !worldService.isInitialised()) {
    worldService.init();
  }

  refreshPartyCache();
  refreshTrailCache();
  refreshFollowerCountCache();

  subscriptions = [
    partyStream(partyCache).subscribe(() => {
      const previous = partyCache;
      const next = refreshPartyCache();
      notify({ type: 'party', value: next, previous });
    }),
    trailStream(trailCache).subscribe(() => {
      const previous = trailCache;
      const next = refreshTrailCache();
      notify({ type: 'trail', value: next, previous });
    }),
    followerCountStream(followerCountCache).subscribe((value) => {
      const previous = followerCountCache;
      if (Number.isFinite(value)) {
        followerCountCache = value;
      } else {
        refreshFollowerCountCache();
      }
      notify({ type: 'followerCount', value: followerCountCache, previous });
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
    party: partyCache,
    trail: trailCache,
    followerCount: followerCountCache
  });
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      teardown();
    }
  };
}

function createEventStream(extractor) {
  return new Observable((subscriber) => {
    ensureInitialised();
    const snapshot = extractor({
      type: 'snapshot',
      party: partyCache,
      trail: trailCache,
      followerCount: followerCountCache
    });
    if (typeof snapshot !== 'undefined') {
      subscriber.next(snapshot);
    }
    const unsubscribe = subscribe((event) => {
      if (!event) {
        return;
      }
      if (event.type === 'disposed') {
        subscriber.complete();
        return;
      }
      const value = extractor(event);
      if (typeof value !== 'undefined') {
        subscriber.next(value);
      }
    });
    return () => {
      unsubscribe();
    };
  });
}

const partyObservable = createEventStream((event) => {
  if (event.type === 'snapshot') {
    return Array.isArray(event.party) ? event.party : partyCache;
  }
  if (event.type === 'party') {
    return Array.isArray(event.value) ? event.value : partyCache;
  }
  return undefined;
});

const trailObservable = createEventStream((event) => {
  if (event.type === 'snapshot') {
    return Array.isArray(event.trail) ? event.trail : trailCache;
  }
  if (event.type === 'trail') {
    return Array.isArray(event.value) ? event.value : trailCache;
  }
  return undefined;
});

const followerCountObservable = createEventStream((event) => {
  if (event.type === 'snapshot') {
    return Number.isFinite(event.followerCount) ? event.followerCount : followerCountCache;
  }
  if (event.type === 'followerCount') {
    return Number.isFinite(event.value) ? event.value : followerCountCache;
  }
  return undefined;
});

function getPartyState() {
  ensureInitialised();
  return partyCache;
}

function getTrailState() {
  ensureInitialised();
  return trailCache;
}

function getPartyMember(index) {
  ensureInitialised();
  if (!Array.isArray(partyCache)) {
    return null;
  }
  return partyCache[index] || null;
}

function getFollowerCount() {
  ensureInitialised();
  return followerCountCache;
}

export function party$() {
  ensureInitialised();
  return partyObservable;
}

export function trail$() {
  ensureInitialised();
  return trailObservable;
}

export function followerCount$() {
  ensureInitialised();
  return followerCountObservable;
}

function dispose() {
  notify({ type: 'disposed' });
  teardown();
  listeners.clear();
  partyCache = [];
  trailCache = [];
  followerCountCache = 0;
}

export default {
  subscribe,
  getPartyState,
  getTrailState,
  getPartyMember,
  getFollowerCount,
  party$,
  trail$,
  followerCount$,
  dispose
};
