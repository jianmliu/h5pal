import EventBus from './event-bus.js';
import battleModule from '../js/pal/battle.js';

class BattleService extends EventBus {
  constructor(moduleRef = battleModule) {
    super();
    this.module = moduleRef;
  }

  setModule(moduleRef) {
    this.module = moduleRef;
  }

  getModule() {
    return this.module;
  }

  *init(...args) {
    this.fire('beforeInit', { args });
    const result = yield* this.module.init(...args);
    this.fire('afterInit', { args, result });
    return result;
  }

  *start(enemyTeam, isBoss) {
    this.fire('beforeStart', { enemyTeam, isBoss });
    const result = yield* this.module.start(enemyTeam, isBoss);
    this.fire('afterStart', { enemyTeam, isBoss, result });
    return result;
  }

  *won(...args) {
    this.fire('beforeWon', { args });
    const result = yield* this.module.won(...args);
    this.fire('afterWon', { args, result });
    return result;
  }

  *playerEscape(...args) {
    this.fire('beforePlayerEscape', { args });
    const result = yield* this.module.playerEscape(...args);
    this.fire('afterPlayerEscape', { args, result });
    return result;
  }

  *enemyEscape(...args) {
    this.fire('beforeEnemyEscape', { args });
    const result = yield* this.module.enemyEscape(...args);
    this.fire('afterEnemyEscape', { args, result });
    return result;
  }
}

const serviceInstance = new BattleService();

const battleService = new Proxy(serviceInstance, {
  get(target, prop, receiver) {
    if (prop === 'module' || prop in target) {
      return Reflect.get(target, prop, receiver);
    }
    const value = target.module[prop];
    if (typeof value === 'function') {
      return value.bind(target.module);
    }
    return value;
  },
  set(target, prop, value) {
    if (prop === 'module' || prop in target) {
      target[prop] = value;
    } else {
      target.module[prop] = value;
    }
    return true;
  },
  has(target, prop) {
    return prop in target || prop in target.module;
  },
  ownKeys(target) {
    const targetKeys = Reflect.ownKeys(target);
    const moduleKeys = Reflect.ownKeys(target.module);
    return Array.from(new Set([...targetKeys, ...moduleKeys]));
  },
  getOwnPropertyDescriptor(target, prop) {
    if (prop in target) {
      return Object.getOwnPropertyDescriptor(target, prop);
    }
    return Object.getOwnPropertyDescriptor(target.module, prop);
  }
});

export { BattleService };
export default battleService;
