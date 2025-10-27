import EventBus from './event-bus.js';
import stateService from './state-service.js';

function ensureGameGlobal() {
  let store = stateService.getGlobal();
  if (store) {
    return store;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.Global = globalThis.Global || {};
    store = globalThis.Global;
  } else if (typeof global !== 'undefined') {
    global.Global = global.Global || {};
    store = global.Global;
  }
  return store;
}

class BattleService extends EventBus {
  constructor() {
    super();
    this.module = null;
    this.rawState = null;
    this.state = null;
    this._globalAccessorInstalled = false;
    this._proxyCache = new WeakMap();
  }

  bindModule(moduleRef) {
    if (this.module === moduleRef) {
      this._installGlobalAccessor();
      this._syncStateFromGlobal();
      return;
    }
    this.module = moduleRef;
    this._installGlobalAccessor();
    this._syncStateFromGlobal();
  }

  _syncStateFromGlobal() {
    const gameGlobal = stateService.getGlobal();
    if (gameGlobal && gameGlobal.battle && this.rawState !== gameGlobal.battle.__raw__) {
      this.rawState = gameGlobal.battle.__raw__ || gameGlobal.battle;
      this.state = gameGlobal.battle;
    }
    return this.state;
  }

  _wrapState(target) {
    if (!target || typeof target !== 'object') {
      return target;
    }
    const service = this;
    const cache = new WeakMap();

    const isTypedArray = (value) => ArrayBuffer.isView(value) && !(value instanceof DataView);

    function wrap(obj, path) {
      if (!obj || typeof obj !== 'object' || isTypedArray(obj)) {
        return obj;
      }
      if (cache.has(obj)) {
        return cache.get(obj);
      }
      const proxy = new Proxy(obj, {
        get(t, prop, receiver) {
          if (prop === '__raw__') {
            return obj;
          }
          const value = Reflect.get(t, prop, receiver);
          if (typeof value === 'function') {
            return value.bind(t);
          }
          return wrap(value, path.concat(prop));
        },
        set(t, prop, value, receiver) {
          const previous = t[prop];
          const result = Reflect.set(t, prop, value, receiver);
          service.fire('stateMutated', {
            path: path.concat(prop),
            value,
            previous,
            state: service.state
          });
          return result;
        },
        deleteProperty(t, prop) {
          const previous = t[prop];
          const result = Reflect.deleteProperty(t, prop);
          service.fire('stateMutated', {
            path: path.concat(prop),
            value: undefined,
            previous,
            state: service.state,
            deleted: true
          });
          return result;
        }
      });
      cache.set(obj, proxy);
      return proxy;
    }

    this._proxyCache = cache;
    return wrap(target, []);
  }

  _installGlobalAccessor() {
    const gameGlobal = ensureGameGlobal();
    if (!gameGlobal || this._globalAccessorInstalled) {
      return;
    }
    const service = this;
    let backingValue = stateService.getGlobal('battle') || this.state || null;

    Object.defineProperty(gameGlobal, 'battle', {
      configurable: true,
      enumerable: true,
      get() {
        return service.state || backingValue;
      },
      set(nextState) {
        const previous = service.state || backingValue || null;
        service.rawState = nextState;
        service.state = service._wrapState(nextState);
        backingValue = service.state;
        service.fire('stateChanged', { previous, state: service.state });
      }
    });

    this._globalAccessorInstalled = true;
    if (backingValue && !this.state) {
      this.rawState = backingValue.__raw__ || backingValue;
      this.state = backingValue;
    }
  }

  getModule() {
    return this.module;
  }

  getState() {
    if (this.state) {
      return this.state;
    }
    if (this.rawState) {
      this.state = this._wrapState(this.rawState);
      return this.state;
    }
    this._syncStateFromGlobal();
    if (this.state) {
      return this.state;
    }
    return null;
  }

  replaceState(nextState) {
    const gameGlobal = stateService.getGlobal();
    const previous = this.getState();
    if (gameGlobal) {
      if (!this._globalAccessorInstalled) {
        this._installGlobalAccessor();
      }
      const descriptor = Object.getOwnPropertyDescriptor(gameGlobal, 'battle');
      if (descriptor && typeof descriptor.set === 'function') {
        descriptor.set.call(gameGlobal, nextState);
        return this.state;
      }
      this.rawState = nextState;
      this.state = this._wrapState(nextState);
      stateService.setGlobal('battle', this.state);
      return this.state;
    }
    this.rawState = nextState;
    this.state = this._wrapState(nextState);
    this.fire('stateChanged', { previous, state: this.state });
    return this.state;
  }

  updateState(updater) {
    const current = this.getState();
    const next = updater ? updater(current) || current : current;
    if (next !== current) {
      return this.replaceState(next);
    }
    this.fire('stateChanged', { previous: current, state: current });
    return current;
  }

  _ensureModule(method) {
    if (!this.module || typeof this.module[method] !== 'function') {
      throw new Error(`Battle module is not bound or missing method "${method}"`);
    }
    return this.module[method];
  }

  *_wrapGeneratorCall(method, payloadBuilder, ...args) {
    const fn = this._ensureModule(method);
    const payload = payloadBuilder ? payloadBuilder(...args) : {};
    this.fire(`before${method[0].toUpperCase()}${method.slice(1)}`, payload);
    const result = yield* fn.apply(this.module, args);
    this._syncStateFromGlobal();
    this.fire(`after${method[0].toUpperCase()}${method.slice(1)}`, {
      ...payload,
      result,
      state: this.state
    });
    return result;
  }

  *init(...args) {
    return yield* this._wrapGeneratorCall('init', (...params) => ({ args: params }), ...args);
  }

  *start(enemyTeam, isBoss) {
    return yield* this._wrapGeneratorCall('start', (team, boss) => ({ enemyTeam: team, isBoss: boss }), enemyTeam, isBoss);
  }

  *won(...args) {
    return yield* this._wrapGeneratorCall('won', (...params) => ({ args: params }), ...args);
  }

  *playerEscape(...args) {
    return yield* this._wrapGeneratorCall('playerEscape', (...params) => ({ args: params }), ...args);
  }

  *enemyEscape(...args) {
    return yield* this._wrapGeneratorCall('enemyEscape', (...params) => ({ args: params }), ...args);
  }

  emitStateChanged() {
    const state = this.getState();
    this.fire('stateChanged', { previous: state, state });
  }

  withState(callback, options = {}) {
    const state = this.getState();
    if (!state || typeof callback !== 'function') {
      return null;
    }
    const result = callback(state);
    if (options.emit !== false) {
      this.emitStateChanged();
    }
    return result;
  }

  set(path, value, options = {}) {
    const state = this.getState();
    if (!state) return null;
    const segments = Array.isArray(path) ? path : [path];
    let target = state;
    for (let i = 0; i < segments.length - 1; i++) {
      if (target == null) return null;
      target = target[segments[i]];
    }
    if (target == null) return null;
    const key = segments[segments.length - 1];
    const nextValue = typeof value === 'function' ? value(target[key]) : value;
    target[key] = nextValue;
    if (options.emit !== false) {
      this.emitStateChanged();
    }
    return target[key];
  }

  update(path, updater, options = {}) {
    return this.set(path, updater, options);
  }

  getPlayer(index) {
    const state = this.getState();
    return state && state.player ? state.player[index] : null;
  }

  updatePlayer(index, updater, options) {
    return this.update(['player', index], updater, options);
  }

  setPlayer(index, patch, options) {
    return this.updatePlayer(index, function(player) {
      if (!player) return player;
      if (typeof patch === 'function') {
        return patch(player) || player;
      }
      Object.assign(player, patch);
      return player;
    }, options);
  }

  getEnemy(index) {
    const state = this.getState();
    return state && state.enemy ? state.enemy[index] : null;
  }

  updateEnemy(index, updater, options) {
    return this.update(['enemy', index], updater, options);
  }

  setEnemy(index, patch, options) {
    return this.updateEnemy(index, function(enemy) {
      if (!enemy) return enemy;
      if (typeof patch === 'function') {
        return patch(enemy) || enemy;
      }
      Object.assign(enemy, patch);
      return enemy;
    }, options);
  }

  getUI() {
    const state = this.getState();
    return state ? state.UI : null;
  }

  updateUI(updater, options) {
    return this.update(['UI'], updater, options);
  }

  setUI(patch, options) {
    return this.updateUI(function(uiState) {
      if (!uiState) return uiState;
      if (typeof patch === 'function') {
        return patch(uiState) || uiState;
      }
      Object.assign(uiState, patch);
      return uiState;
    }, options);
  }

  getActionQueue() {
    const state = this.getState();
    return state ? state.actionQueue : null;
  }

  updateActionQueue(index, updater, options) {
    if (typeof index === 'function' && updater === undefined) {
      return this.update(['actionQueue'], index, options);
    }
    return this.update(['actionQueue', index], updater, options);
  }

  setActionQueue(index, patch, options) {
    return this.updateActionQueue(index, function(queueItem) {
      if (!queueItem) return queueItem;
      if (typeof patch === 'function') {
        return patch(queueItem) || queueItem;
      }
      Object.assign(queueItem, patch);
      return queueItem;
    }, options);
  }

  getSceneBuffer() {
    const state = this.getState();
    return state ? state.sceneBuf : null;
  }

  setSceneBuffer(buffer, options) {
    return this.set(['sceneBuf'], buffer, options);
  }

  getBackground() {
    const state = this.getState();
    return state ? state.background : null;
  }

  setBackground(background, options) {
    return this.set(['background'], background, options);
  }

  setEnemyHealth(index, updater, options) {
    return this.updateEnemy(index, function(enemy) {
      if (!enemy || !enemy.e) return enemy;
      if (typeof updater === 'function') {
        enemy.e.health = updater(enemy.e.health);
      } else {
        enemy.e.health = updater;
      }
      return enemy;
    }, options);
  }

  setEnemyMagic(index, value, options) {
    return this.updateEnemy(index, function(enemy) {
      if (!enemy || !enemy.e) return enemy;
      enemy.e.magic = typeof value === 'function' ? value(enemy.e.magic) : value;
      return enemy;
    }, options);
  }

  setEnemyMagicRate(index, value, options) {
    return this.updateEnemy(index, function(enemy) {
      if (!enemy || !enemy.e) return enemy;
      enemy.e.magicRate = typeof value === 'function' ? value(enemy.e.magicRate) : value;
      return enemy;
    }, options);
  }

  setEnemyStatus(index, statusIndex, value, options) {
    return this.updateEnemy(index, function(enemy) {
      if (!enemy || !enemy.status) return enemy;
      const idx = Number(statusIndex);
      if (!Number.isNaN(idx)) {
        enemy.status[idx] = typeof value === 'function' ? value(enemy.status[idx]) : value;
      }
      return enemy;
    }, options);
  }

  setEnemyPoison(index, slot, patch, options) {
    return this.updateEnemy(index, function(enemy) {
      if (!enemy) return enemy;
      const slotIndex = Number(slot);
      if (Number.isNaN(slotIndex)) return enemy;
      if (!enemy.poisons) {
        enemy.poisons = [];
      }
      const poison = enemy.poisons[slotIndex] || (enemy.poisons[slotIndex] = {});
      if (typeof patch === 'function') {
        patch(poison);
      } else if (patch && typeof patch === 'object') {
        Object.assign(poison, patch);
      }
      return enemy;
    }, options);
  }

  clearEnemyPoison(index, slot, options) {
    return this.setEnemyPoison(index, slot, function(poison) {
      poison.poisonID = 0;
      poison.poisonScript = 0;
      return poison;
    }, options);
  }

  setEnemyPosition(index, pos, options) {
    return this.updateEnemy(index, function(enemy) {
      if (!enemy) return enemy;
      enemy.pos = typeof pos === 'function' ? pos(enemy.pos) : pos;
      return enemy;
    }, options);
  }

  setEnemyColorShift(index, value, options) {
    return this.updateEnemy(index, function(enemy) {
      if (!enemy) return enemy;
      enemy.colorShift = typeof value === 'function' ? value(enemy.colorShift) : value;
      return enemy;
    }, options);
  }

  replaceEnemy(index, enemyData, options) {
    return this.updateEnemy(index, function() {
      return enemyData;
    }, options);
  }

  setEnemyObject(index, objectID, options) {
    return this.updateEnemy(index, function(enemy) {
      if (!enemy) return enemy;
      enemy.objectID = typeof objectID === 'function' ? objectID(enemy.objectID) : objectID;
      return enemy;
    }, options);
  }

  setEnemyFrame(index, frame, options) {
    return this.updateEnemy(index, function(enemy) {
      if (!enemy) return enemy;
      enemy.wCurrentFrame = typeof frame === 'function' ? frame(enemy.wCurrentFrame) : frame;
      return enemy;
    }, options);
  }

  setHidingTime(value, options) {
    return this.set(['hidingTime'], value, options);
  }

  setBattleBlow(value, options) {
    return this.set(['blow'], value, options);
  }

  setBattleResult(value, options) {
    return this.set(['battleResult'], value, options);
  }

  setPlayerActionType(index, actionType, options) {
    return this.updatePlayer(index, function(player) {
      if (!player || !player.action) return player;
      player.action.actionType = typeof actionType === 'function' ? actionType(player.action.actionType) : actionType;
      return player;
    }, options);
  }

  setPlayerColorShift(index, value, options) {
    return this.updatePlayer(index, function(player) {
      if (!player) return player;
      player.colorShift = typeof value === 'function' ? value(player.colorShift) : value;
      return player;
    }, options);
  }
}

const serviceInstance = new BattleService();

const battleService = new Proxy(serviceInstance, {
  get(target, prop, receiver) {
    if (prop === 'module' || prop === 'state' || prop in target) {
      return Reflect.get(target, prop, receiver);
    }
    const moduleRef = target.getModule();
    if (moduleRef && prop in moduleRef) {
      const value = moduleRef[prop];
      if (typeof value === 'function') {
        return value.bind(moduleRef);
      }
      return value;
    }
    return undefined;
  },
  set(target, prop, value) {
    if (prop === 'module' || prop === 'state' || prop in target) {
      target[prop] = value;
    } else if (target.getModule()) {
      target.getModule()[prop] = value;
    } else {
      target[prop] = value;
    }
    return true;
  },
  has(target, prop) {
    if (prop in target) return true;
    const moduleRef = target.getModule();
    return moduleRef ? prop in moduleRef : false;
  },
  ownKeys(target) {
    const keys = new Set(Reflect.ownKeys(target));
    const moduleRef = target.getModule();
    if (moduleRef) {
      Reflect.ownKeys(moduleRef).forEach((key) => keys.add(key));
    }
    return Array.from(keys);
  },
  getOwnPropertyDescriptor(target, prop) {
    if (prop in target) {
      return Object.getOwnPropertyDescriptor(target, prop);
    }
    const moduleRef = target.getModule();
    if (moduleRef && prop in moduleRef) {
      return Object.getOwnPropertyDescriptor(moduleRef, prop);
    }
    return undefined;
  }
});

export { BattleService };
export default battleService;
