import EventBus from './event-bus.js';

function resolveGlobalStore() {
  if (typeof globalThis !== 'undefined' && globalThis.Global) {
    return globalThis.Global;
  }
  if (typeof global !== 'undefined' && global.Global) {
    return global.Global;
  }
  return null;
}

function ensureGlobalStore() {
  let store = resolveGlobalStore();
  if (!store && typeof globalThis !== 'undefined') {
    store = {};
    globalThis.Global = store;
  }
  return store;
}

function resolveGameDataStore() {
  if (typeof globalThis !== 'undefined' && globalThis.GameData) {
    return globalThis.GameData;
  }
  if (typeof global !== 'undefined' && global.GameData) {
    return global.GameData;
  }
  return null;
}

function ensureGameDataStore() {
  let store = resolveGameDataStore();
  if (!store && typeof globalThis !== 'undefined') {
    store = {};
    globalThis.GameData = store;
  }
  return store;
}

class StateService extends EventBus {
  getGlobal(key) {
    const store = resolveGlobalStore();
    if (!store) return undefined;
    return key ? store[key] : store;
  }

  setGlobal(key, value) {
    const store = ensureGlobalStore();
    if (!store) return value;
    const previous = store[key];
    store[key] = value;
    this.fire('globalChanged', { key, previous, value });
    return value;
  }

  updateGlobal(patch) {
    Object.keys(patch).forEach((key) => {
      this.setGlobal(key, patch[key]);
    });
  }

  mutateGlobal(key, mutator) {
    const store = ensureGlobalStore();
    if (!store) return undefined;
    const current = store[key];
    const result = mutator ? mutator(current) : current;
    if (typeof result !== 'undefined' && result !== current) {
      return this.setGlobal(key, result);
    }
    this.fire('globalChanged', { key, previous: current, value: current });
    return current;
  }

  getGameData(key) {
    const store = resolveGameDataStore();
    if (!store) return undefined;
    return key ? store[key] : store;
  }

  setGameData(key, value) {
    const store = ensureGameDataStore();
    if (!store) return value;
    const previous = store[key];
    store[key] = value;
    this.fire('gameDataChanged', { key, previous, value });
    return value;
  }

  updateGameData(patch) {
    Object.keys(patch).forEach((key) => {
      this.setGameData(key, patch[key]);
    });
  }

  mutateGameData(key, mutator) {
    const store = ensureGameDataStore();
    if (!store) return undefined;
    const current = store[key];
    const result = mutator ? mutator(current) : current;
    if (typeof result !== 'undefined' && result !== current) {
      return this.setGameData(key, result);
    }
    this.fire('gameDataChanged', { key, previous: current, value: current });
    return current;
  }
}

const stateService = new StateService();

export { StateService };
export default stateService;
