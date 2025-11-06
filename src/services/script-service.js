import EventBus from './event-bus.js';
import co from '../js/pal/co.js';
import uigame from '../js/pal/uigame.js';
import scriptModule from '../js/pal/script.js';

class ScriptService extends EventBus {
  constructor(moduleRef = scriptModule) {
    super();
    this.module = moduleRef;
    this._activeMenuTask = null;
  }

  setModule(moduleRef) {
    this.module = moduleRef;
  }

  getModule() {
    return this.module;
  }

  *runTriggerScript(scriptEntry, eventObjectID) {
    this.fire('beforeRunTriggerScript', { scriptEntry, eventObjectID });
    const nextEntry = yield* this.module.runTriggerScript.call(this.module, scriptEntry, eventObjectID);
    this.fire('afterRunTriggerScript', {
      scriptEntry,
      eventObjectID,
      nextEntry,
      success: this.module.scriptSuccess
    });
    return nextEntry;
  }

  openMenu(menu) {
    const key = (function resolveMenuKey(value) {
      if (!value) {
        return 'main';
      }
      if (typeof value === 'string') {
        return value.toLowerCase();
      }
      if (typeof value === 'object') {
        if (typeof value.name === 'string') {
          return value.name.toLowerCase();
        }
        if (typeof value.type === 'string') {
          return value.type.toLowerCase();
        }
      }
      return 'main';
    })(menu);

    const menuMap = {
      main: uigame.inGameMenu ? uigame.inGameMenu.bind(uigame) : null,
      inventory: uigame.inventoryMenu ? uigame.inventoryMenu.bind(uigame) : null,
      status: uigame.playerStatus ? uigame.playerStatus.bind(uigame) : null,
      magic: uigame.inGameMagicMenu ? uigame.inGameMagicMenu.bind(uigame) : null,
      system: uigame.systemMenu ? uigame.systemMenu.bind(uigame) : null
    };

    const handler = menuMap[key] || menuMap.main;
    if (typeof handler !== 'function') {
      return Promise.resolve(false);
    }

    if (this._activeMenuTask) {
      return this._activeMenuTask;
    }

    const task = co(handler)
      .catch((err) => {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[script-service] openMenu failed', err);
        }
        return false;
      })
      .finally(() => {
        this._activeMenuTask = null;
      });

    this._activeMenuTask = task;
    return task;
  }
}

const serviceInstance = new ScriptService();

const scriptService = new Proxy(serviceInstance, {
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

export { ScriptService };
export default scriptService;
