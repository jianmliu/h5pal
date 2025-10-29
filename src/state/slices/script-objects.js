import reactiveContext from '../reactive-context.js';

const SCRIPT_ENTRIES_KEY = 'world.script.entries';
const OBJECT_TABLE_KEY = 'world.script.objectTable';
const OBJECT_DESC_KEY = 'world.script.objectDesc';

function ensureSignal(key, fallback) {
  return reactiveContext.ensureSignal(key, fallback);
}

function normaliseEntries(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value.length === 'number') {
    return value;
  }
  return [];
}

function normaliseObjectTable(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value.length === 'number') {
    return value;
  }
  return [];
}

function setSignalValue(key, value, options = {}) {
  const previous = reactiveContext.getSignal(key, value);
  const signal = ensureSignal(key, previous);
  if (signal.value !== value) {
    reactiveContext.setSignal(key, value);
    if (options.emitEvent !== false) {
      reactiveContext.rootEvent$.next({
        type: `world/script/${key}/changed`,
        value,
        previous,
        source: options.source || 'worldService'
      });
    }
  }
  return value;
}

export function scriptObjectSignals() {
  return {
    scriptEntries: ensureSignal(SCRIPT_ENTRIES_KEY, []),
    objectTable: ensureSignal(OBJECT_TABLE_KEY, []),
    objectDesc: ensureSignal(OBJECT_DESC_KEY, null)
  };
}

export function updateScriptEntriesValue(entries, options = {}) {
  return setSignalValue(SCRIPT_ENTRIES_KEY, normaliseEntries(entries), options);
}

export function updateObjectTableValue(table, options = {}) {
  return setSignalValue(OBJECT_TABLE_KEY, normaliseObjectTable(table), options);
}

export function updateObjectDescValue(desc, options = {}) {
  return setSignalValue(OBJECT_DESC_KEY, desc || null, options);
}

export function resetScriptObjectSlice() {
  reactiveContext.setSignal(SCRIPT_ENTRIES_KEY, []);
  reactiveContext.setSignal(OBJECT_TABLE_KEY, []);
  reactiveContext.setSignal(OBJECT_DESC_KEY, null);
}
