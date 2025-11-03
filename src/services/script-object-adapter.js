import worldService from './world-service.js';
import { scriptObjectSignals } from '../state/slices/script-objects.js';

const listeners = new Set();
let subscriptions = [];
let initialised = false;

let scriptEntriesCache = [];
let objectTableCache = [];
let objectDescCache = null;

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

function refreshScriptEntriesCache() {
  const latest = scriptObjectSignals().scriptEntries.value;
  if (Array.isArray(latest) && latest.length > 0) {
    scriptEntriesCache = latest;
    return scriptEntriesCache;
  }
  if (worldService && typeof worldService.syncScriptRegisters === 'function') {
    worldService.syncScriptRegisters();
  }
  const refreshed = scriptObjectSignals().scriptEntries.value;
  scriptEntriesCache = Array.isArray(refreshed) ? refreshed : [];
  return scriptEntriesCache;
}

function refreshObjectTableCache() {
  const signals = scriptObjectSignals();
  let latest = signals.objectTable.value;
  if (!Array.isArray(latest) || latest.length === 0) {
    if (worldService && typeof worldService.syncObjectStores === 'function') {
      worldService.syncObjectStores();
    }
    latest = signals.objectTable.value;
  }
  if (Array.isArray(latest)) {
    objectTableCache = latest;
  } else {
    objectTableCache = [];
  }
  return objectTableCache;
}

function refreshObjectDescCache() {
  const latest = scriptObjectSignals().objectDesc.value;
  if (typeof latest !== 'undefined') {
    objectDescCache = latest;
    return objectDescCache;
  }
  if (worldService && typeof worldService.syncObjectStores === 'function') {
    worldService.syncObjectStores();
  }
  const refreshed = scriptObjectSignals().objectDesc.value;
  objectDescCache = typeof refreshed === 'undefined' ? null : refreshed;
  return objectDescCache;
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
        console.error('[scriptObjectAdapter] listener error', err);
      }
    }
  });
}

function ensureInitialised() {
  if (initialised) {
    return;
  }
  refreshScriptEntriesCache();
  refreshObjectTableCache();
  refreshObjectDescCache();

  const signals = scriptObjectSignals();
  subscriptions = [
    signals.scriptEntries.subscribe((value) => {
      if (Array.isArray(value) && value !== scriptEntriesCache) {
        const previous = scriptEntriesCache;
        scriptEntriesCache = value;
        notify({ type: 'scriptEntries', value, previous });
      }
    }),
    signals.objectTable.subscribe((value) => {
      if (Array.isArray(value) && value !== objectTableCache) {
        const previous = objectTableCache;
        objectTableCache = value;
        notify({ type: 'objectTable', value, previous });
      }
    }),
    signals.objectDesc.subscribe((value) => {
      if (value !== objectDescCache) {
        const previous = objectDescCache;
        objectDescCache = value;
        notify({ type: 'objectDesc', value, previous });
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
    scriptEntries: scriptEntriesCache,
    objectTable: objectTableCache,
    objectDesc: objectDescCache
  });
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      teardown();
      scriptEntriesCache = [];
      objectTableCache = [];
      objectDescCache = null;
    }
  };
}

function getScriptEntries() {
  ensureInitialised();
  return scriptEntriesCache;
}

function getScriptEntry(index) {
  const entries = getScriptEntries();
  if (!entries || typeof index !== 'number') {
    return null;
  }
  return entries[index] || null;
}

function getObjectTable() {
  ensureInitialised();
  return objectTableCache;
}

function getObjectEntry(id) {
  ensureInitialised();
  if (!Array.isArray(objectTableCache) && typeof objectTableCache.length !== 'number') {
    return null;
  }
  return objectTableCache[id] || null;
}

function getObjectDesc() {
  ensureInitialised();
  return objectDescCache;
}

function getObjectDescEntry(id) {
  const table = getObjectDesc();
  if (!table) {
    return null;
  }
  for (let i = 0; i < table.length; i++) {
    const entry = table[i];
    if (entry && entry.id === id) {
      return entry;
    }
  }
  return null;
}

function dispose() {
  notify({ type: 'disposed' });
  teardown();
  listeners.clear();
  scriptEntriesCache = [];
  objectTableCache = [];
  objectDescCache = null;
}

export default {
  subscribe,
  getScriptEntries,
  getScriptEntry,
  getObjectTable,
  getObjectEntry,
  getObjectDesc,
  getObjectDescEntry,
  dispose
};
