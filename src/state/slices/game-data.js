import reactiveContext from '../reactive-context.js';

const MAGIC_TABLE_KEY = 'world.gameData.magicTable';
const STORE_TABLE_KEY = 'world.gameData.storeTable';
const EXP_STATE_KEY = 'world.gameData.expState';
const ENEMY_TABLE_KEY = 'world.gameData.enemyTable';
const BATTLE_EFFECT_TABLE_KEY = 'world.gameData.battleEffectTable';

function cloneTable(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (!entry) {
        return entry;
      }
      if (Array.isArray(entry)) {
        return entry.slice();
      }
      if (entry && typeof entry === 'object') {
        if (entry.uint8Array) {
          return { ...entry, uint8Array: entry.uint8Array.slice() };
        }
        return { ...entry };
      }
      return entry;
    });
  }
  if (ArrayBuffer.isView(value) && typeof value.slice === 'function') {
    return value.slice();
  }
  return [];
}

function cloneStoreTable(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      return entry;
    }
    const clone = { ...entry };
    if (Array.isArray(entry.items)) {
      clone.items = entry.items.slice();
    }
    return clone;
  });
}

function cloneExpState(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const clone = { ...value };
  if (Array.isArray(value.primaryExp)) {
    clone.primaryExp = value.primaryExp.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return entry;
      }
      return { ...entry };
    });
  }
  if (Array.isArray(value.secondaryExp)) {
    clone.secondaryExp = value.secondaryExp.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return entry;
      }
      return { ...entry };
    });
  }
  return clone;
}

function ensureMagicSignal(initialValue = []) {
  return reactiveContext.ensureSignal(MAGIC_TABLE_KEY, cloneTable(initialValue));
}

function ensureStoreSignal(initialValue = []) {
  return reactiveContext.ensureSignal(STORE_TABLE_KEY, cloneStoreTable(initialValue));
}

function ensureExpSignal(initialValue = null) {
  return reactiveContext.ensureSignal(EXP_STATE_KEY, cloneExpState(initialValue));
}

function ensureEnemySignal(initialValue = []) {
  return reactiveContext.ensureSignal(ENEMY_TABLE_KEY, cloneTable(initialValue));
}

function ensureBattleEffectSignal(initialValue = []) {
  return reactiveContext.ensureSignal(BATTLE_EFFECT_TABLE_KEY, cloneTable(initialValue));
}

export function gameDataSignals() {
  return {
    magic: ensureMagicSignal([]),
    store: ensureStoreSignal([]),
    enemy: ensureEnemySignal([]),
    battleEffects: ensureBattleEffectSignal([]),
    exp: ensureExpSignal(null)
  };
}

function setSignalValue(key, ensureFn, cloneFn, value, options = {}) {
  const resolved = cloneFn(value);
  const previous = reactiveContext.getSignal(key, resolved);
  const signal = ensureFn(previous);
  const changed = JSON.stringify(signal.value) !== JSON.stringify(resolved);
  if (changed) {
    reactiveContext.setSignal(key, resolved);
    if (options.emitEvent !== false) {
      reactiveContext.rootEvent$.next({
        type: `world/gameData/${key}/changed`,
        value: resolved,
        previous,
        source: options.source || 'worldService'
      });
    }
  }
  return resolved;
}

export function updateMagicTableValue(table, options = {}) {
  return setSignalValue(MAGIC_TABLE_KEY, ensureMagicSignal, cloneTable, table, options);
}

export function updateStoreTableValue(table, options = {}) {
  return setSignalValue(STORE_TABLE_KEY, ensureStoreSignal, cloneStoreTable, table, options);
}

export function updateEnemyTableValue(table, options = {}) {
  return setSignalValue(ENEMY_TABLE_KEY, ensureEnemySignal, cloneTable, table, options);
}

export function updateBattleEffectTableValue(table, options = {}) {
  return setSignalValue(BATTLE_EFFECT_TABLE_KEY, ensureBattleEffectSignal, cloneTable, table, options);
}

export function updateExpStateValue(state, options = {}) {
  const resolved = cloneExpState(state);
  const previous = reactiveContext.getSignal(EXP_STATE_KEY, resolved);
  const signal = ensureExpSignal(previous);
  const changed = JSON.stringify(signal.value) !== JSON.stringify(resolved);
  if (changed) {
    reactiveContext.setSignal(EXP_STATE_KEY, resolved);
    if (options.emitEvent !== false) {
      reactiveContext.rootEvent$.next({
        type: 'world/gameData/expState/changed',
        value: resolved,
        previous,
        source: options.source || 'worldService'
      });
    }
  }
  return resolved;
}

export function getMagicTableValue(fallback = []) {
  return cloneTable(ensureMagicSignal(fallback).value);
}

export function getStoreTableValue(fallback = []) {
  return cloneStoreTable(ensureStoreSignal(fallback).value);
}

export function getEnemyTableValue(fallback = []) {
  return cloneTable(ensureEnemySignal(fallback).value);
}

export function getBattleEffectTableValue(fallback = []) {
  return cloneTable(ensureBattleEffectSignal(fallback).value);
}

export function getExpStateValue() {
  const signal = ensureExpSignal(null);
  const value = signal.value;
  return value ? cloneExpState(value) : null;
}

export function resetGameDataSlice() {
  reactiveContext.setSignal(MAGIC_TABLE_KEY, []);
  reactiveContext.setSignal(STORE_TABLE_KEY, []);
  reactiveContext.setSignal(ENEMY_TABLE_KEY, []);
  reactiveContext.setSignal(BATTLE_EFFECT_TABLE_KEY, []);
  reactiveContext.setSignal(EXP_STATE_KEY, null);
}
