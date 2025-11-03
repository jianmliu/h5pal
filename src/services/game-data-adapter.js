import worldService from './world-service.js';
import { gameDataSignals, getLevelUpExpTableValue, getLevelUpMagicTableValue } from '../state/slices/game-data.js';

const listeners = new Set();
let subscriptions = [];
let initialised = false;

let magicTableCache = [];
let storeTableCache = [];
let enemyTableCache = [];
let battleEffectTableCache = [];
let expStateCache = null;
let levelUpTableCache = null;
let levelUpMagicTableCache = [];

function getGameDataStore() {
  if (typeof globalThis !== 'undefined' && globalThis.GameData) {
    return globalThis.GameData;
  }
  if (typeof global !== 'undefined' && global.GameData) {
    return global.GameData;
  }
  return null;
}

function clone(value) {
  if (!value) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => clone(entry));
  }
  if (entryIsTypedArray(value)) {
    return value.slice();
  }
  if (typeof value === 'object') {
    const result = {};
    Object.keys(value).forEach((key) => {
      result[key] = clone(value[key]);
    });
    return result;
  }
  return value;
}

function entryIsTypedArray(entry) {
  return ArrayBuffer.isView(entry) && typeof entry.slice === 'function';
}

function refreshMagicCache() {
  const signals = gameDataSignals();
  const latest = signals.magic.value;
  if (Array.isArray(latest) && latest.length > 0) {
    magicTableCache = latest;
    return magicTableCache;
  }
  if (worldService && typeof worldService.syncObjectStores === 'function') {
    worldService.syncObjectStores();
  }
  magicTableCache = gameDataSignals().magic.value || [];
  return magicTableCache;
}

function refreshStoreCache() {
  const signals = gameDataSignals();
  const latest = signals.store.value;
  if (Array.isArray(latest) && latest.length > 0) {
    storeTableCache = latest;
    return storeTableCache;
  }
  if (worldService && typeof worldService.syncObjectStores === 'function') {
    worldService.syncObjectStores();
  }
  storeTableCache = gameDataSignals().store.value || [];
  return storeTableCache;
}

function refreshEnemyCache() {
  const signals = gameDataSignals();
  const latest = signals.enemy.value;
  if (Array.isArray(latest) && latest.length > 0) {
    enemyTableCache = latest;
    return enemyTableCache;
  }
  if (worldService && typeof worldService.syncObjectStores === 'function') {
    worldService.syncObjectStores();
  }
  enemyTableCache = gameDataSignals().enemy.value || [];
  return enemyTableCache;
}

function refreshBattleEffectCache() {
  const signals = gameDataSignals();
  const latest = signals.battleEffects.value;
  if (Array.isArray(latest) && latest.length > 0) {
    battleEffectTableCache = latest;
    return battleEffectTableCache;
  }
  if (worldService && typeof worldService.syncObjectStores === 'function') {
    worldService.syncObjectStores();
  }
  battleEffectTableCache = gameDataSignals().battleEffects.value || [];
  return battleEffectTableCache;
}

function refreshExpCache() {
  const signals = gameDataSignals();
  const latest = signals.exp.value;
  if (latest) {
    expStateCache = latest;
    return expStateCache;
  }
  const current = worldService.getExpState ? worldService.getExpState() : null;
  expStateCache = current || null;
  return expStateCache;
}

function refreshLevelUpCache() {
  const signals = gameDataSignals();
  const latest = signals.levelUpExp.value;
  if (Array.isArray(latest) && latest.length > 0) {
    levelUpTableCache = latest.slice();
    return levelUpTableCache;
  }
  const store = getGameDataStore();
  if (store && Array.isArray(store.levelUpExp) && store.levelUpExp.length > 0) {
    levelUpTableCache = store.levelUpExp.slice();
    return levelUpTableCache;
  }
  const fallback = getLevelUpExpTableValue([]);
  if (Array.isArray(fallback) && fallback.length > 0) {
    levelUpTableCache = fallback.slice();
    return levelUpTableCache;
  }
  levelUpTableCache = Array.isArray(fallback) ? fallback : [];
  return levelUpTableCache;
}

function refreshLevelUpMagicCache() {
  const signals = gameDataSignals();
  const latest = signals.levelUpMagic.value;
  if (Array.isArray(latest) && latest.length > 0) {
    levelUpMagicTableCache = latest;
    return levelUpMagicTableCache;
  }
  const store = getGameDataStore();
  if (store && Array.isArray(store.levelUpMagic) && store.levelUpMagic.length > 0) {
    levelUpMagicTableCache = store.levelUpMagic;
    return levelUpMagicTableCache;
  }
  const fallback = getLevelUpMagicTableValue([]);
  levelUpMagicTableCache = Array.isArray(fallback) ? fallback : [];
  return levelUpMagicTableCache;
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

function ensureInitialised() {
  if (initialised) {
    return;
  }
  refreshMagicCache();
  refreshStoreCache();
  refreshEnemyCache();
  refreshBattleEffectCache();
  refreshExpCache();
  refreshLevelUpCache();
  refreshLevelUpMagicCache();

  const signals = gameDataSignals();
  subscriptions = [
    signals.magic.subscribe((value) => {
      magicTableCache = Array.isArray(value) ? value : [];
      notify({ type: 'magic', value: magicTableCache });
    }),
    signals.store.subscribe((value) => {
      storeTableCache = Array.isArray(value) ? value : [];
      notify({ type: 'store', value: storeTableCache });
    }),
    signals.enemy.subscribe((value) => {
      enemyTableCache = Array.isArray(value) ? value : [];
      notify({ type: 'enemy', value: enemyTableCache });
    }),
    signals.battleEffects.subscribe((value) => {
      battleEffectTableCache = Array.isArray(value) ? value : [];
      notify({ type: 'battleEffect', value: battleEffectTableCache });
    }),
    signals.exp.subscribe((value) => {
      expStateCache = value || null;
      notify({ type: 'exp', value: expStateCache });
    }),
    signals.levelUpExp.subscribe((value) => {
      levelUpTableCache = Array.isArray(value) ? value.slice() : [];
      notify({ type: 'levelUpExp', value: levelUpTableCache });
    }),
    signals.levelUpMagic.subscribe((value) => {
      levelUpMagicTableCache = Array.isArray(value) ? value : [];
      notify({ type: 'levelUpMagic', value: levelUpMagicTableCache });
    })
  ];
  initialised = true;
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
        console.error('[gameDataAdapter] listener error', err);
      }
    }
  });
}

function subscribe(listener) {
  ensureInitialised();
  if (typeof listener !== 'function') {
    return () => {};
  }
  listeners.add(listener);
  listener({
    type: 'snapshot',
    magicTable: magicTableCache,
    storeTable: storeTableCache,
    enemyTable: enemyTableCache,
    battleEffectTable: battleEffectTableCache,
    expState: expStateCache,
    levelUpExpTable: Array.isArray(levelUpTableCache) ? levelUpTableCache : [],
    levelUpMagicTable: Array.isArray(levelUpMagicTableCache) ? levelUpMagicTableCache : []
  });
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      teardown();
      magicTableCache = [];
      storeTableCache = [];
      enemyTableCache = [];
      battleEffectTableCache = [];
      expStateCache = null;
      levelUpTableCache = null;
      levelUpMagicTableCache = [];
    }
  };
}

function getMagicEntry(id) {
  ensureInitialised();
  if (typeof id !== 'number' || id < 0) {
    return null;
  }
  return magicTableCache[id] || null;
}

function getStoreEntry(id) {
  ensureInitialised();
  if (typeof id !== 'number' || id < 0) {
    return null;
  }
  return storeTableCache[id] || null;
}

function getEnemyEntry(id) {
  ensureInitialised();
  if (typeof id !== 'number' || id < 0) {
    return null;
  }
  return enemyTableCache[id] || null;
}

function getBattleEffectIndexRow(id) {
  ensureInitialised();
  if (typeof id !== 'number' || id < 0) {
    return null;
  }
  return battleEffectTableCache[id] || null;
}

function getExpStateSnapshot() {
  ensureInitialised();
  return expStateCache ? clone(expStateCache) : null;
}

function getLevelUpExpValue(level) {
  if (typeof level !== 'number' || level < 0) {
    return 0;
  }
  if (!Array.isArray(levelUpTableCache)) {
    refreshLevelUpCache();
  }
  if (Array.isArray(levelUpTableCache)) {
    const value = levelUpTableCache[level];
    if (typeof value === 'number') {
      return value;
    }
  }
  if (worldService && typeof worldService.getLevelUpExp === 'function') {
    return worldService.getLevelUpExp(level) || 0;
  }
  return 0;
}

function getLevelUpExpTable() {
  if (!Array.isArray(levelUpTableCache)) {
    refreshLevelUpCache();
  }
  if (Array.isArray(levelUpTableCache)) {
    return levelUpTableCache.slice();
  }
  return [];
}

function getLevelUpMagicTable() {
  ensureInitialised();
  if (!Array.isArray(levelUpMagicTableCache) || levelUpMagicTableCache.length === 0) {
    refreshLevelUpMagicCache();
  }
  if (Array.isArray(levelUpMagicTableCache)) {
    return clone(levelUpMagicTableCache);
  }
  return [];
}

function getLevelUpMagicEntry(index) {
  if (typeof index !== 'number' || index < 0) {
    return null;
  }
  ensureInitialised();
  if (!Array.isArray(levelUpMagicTableCache) || levelUpMagicTableCache.length === 0) {
    refreshLevelUpMagicCache();
  }
  if (!Array.isArray(levelUpMagicTableCache)) {
    return null;
  }
  const entry = levelUpMagicTableCache[index];
  return entry ? clone(entry) : null;
}

export default {
  subscribe,
  getMagicEntry,
  getStoreEntry,
  getEnemyEntry,
  getBattleEffectIndexRow,
  getExpStateSnapshot,
  getLevelUpExpValue,
  getLevelUpExpTable,
  getLevelUpMagicTable,
  getLevelUpMagicEntry
};
