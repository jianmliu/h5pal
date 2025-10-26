import EventBus from './event-bus.js';

function getGlobal() {
  if (typeof globalThis !== 'undefined') return globalThis;
  if (typeof window !== 'undefined') return window;
  if (typeof global !== 'undefined') return global;
  return {};
}

function getGameGlobal() {
  const root = getGlobal();
  return typeof root.Global !== 'undefined' ? root.Global : null;
}

class BattleService extends EventBus {
  constructor() {
    super();
    this.module = null;
    this.state = null;
    this._globalAccessorInstalled = false;
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
    const gameGlobal = getGameGlobal();
    if (gameGlobal && gameGlobal.battle && this.state !== gameGlobal.battle) {
      this.state = gameGlobal.battle;
    }
    return this.state;
  }

  _installGlobalAccessor() {
    const gameGlobal = getGameGlobal();
    if (!gameGlobal || this._globalAccessorInstalled) {
      return;
    }
    const service = this;
    let backingValue = gameGlobal.battle || this.state || null;

    Object.defineProperty(gameGlobal, 'battle', {
      configurable: true,
      enumerable: true,
      get() {
        return service.state || backingValue;
      },
      set(nextState) {
        const previous = service.state || backingValue || null;
        backingValue = nextState;
        service.state = nextState;
        service.fire('stateChanged', { previous, state: nextState });
      }
    });

    this._globalAccessorInstalled = true;
    if (backingValue && !this.state) {
      this.state = backingValue;
    }
  }

  getModule() {
    return this.module;
  }

  getState() {
    return this._syncStateFromGlobal();
  }

  replaceState(nextState) {
    const gameGlobal = getGameGlobal();
    const previous = this.getState();
    this.state = nextState;
    if (gameGlobal) {
      if (this._globalAccessorInstalled) {
        gameGlobal.battle = nextState;
      } else {
        gameGlobal.battle = nextState;
        this.state = gameGlobal.battle;
      }
    } else {
      this.fire('stateChanged', { previous, state: nextState });
    }
    return nextState;
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
