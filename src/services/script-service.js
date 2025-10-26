import EventBus from './event-bus.js';
import scriptModule from '../js/pal/script.js';

class ScriptService extends EventBus {
  constructor(moduleRef = scriptModule) {
    super();
    this.module = moduleRef;
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
