import worldService from './world-service.js';
import {
  partyStream,
  trailStream,
  followerCountStream
} from '../state/slices/party-trail.js';

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

function refreshPartyCache() {
  const latest = worldService.getParty();
  partyCache = Array.isArray(latest) ? latest : [];
  return partyCache;
}

function refreshTrailCache() {
  const latest = worldService.getTrail();
  trailCache = Array.isArray(latest) ? latest : [];
  return trailCache;
}

function refreshFollowerCountCache() {
  const latest = worldService.getFollowerCount();
  followerCountCache = Number.isFinite(latest) ? latest : 0;
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
  dispose
};
