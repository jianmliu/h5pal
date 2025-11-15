import EventBus from './event-bus.js';
import uigame from '../js/pal/uigame.js';
import scriptModule from '../js/pal/script.js';
import panoramaRenderer from '../js/pal/panorama-renderer.js';
import panoramaDialog from '../js/pal/panorama-dialog.js';
import config from '../js/pal/config.js';
import scene from '../js/pal/scene.js';

const localOverlayState = { depth: 0, shouldRestore: false };

function getOverlayState() {
  if (typeof window !== 'undefined') {
    if (!window.__PAL_CLASSIC_OVERLAY__) {
      window.__PAL_CLASSIC_OVERLAY__ = { depth: 0, shouldRestore: false };
    }
    return window.__PAL_CLASSIC_OVERLAY__;
  }
  return localOverlayState;
}

function setLegacyCanvasVisible(show = true) {
  if (typeof document === 'undefined') {
    return;
  }
  const canvas = document.getElementById('cvs');
  if (canvas) {
    canvas.style.display = show ? '' : 'none';
  }
}

function enterClassicOverlay() {
  const state = getOverlayState();
  if (state.depth === 0) {
    const overlayActive = typeof window !== 'undefined' && window.PAL_OVERLAY_ACTIVE === 'panorama';
    const rendererActive = panoramaRenderer && typeof panoramaRenderer.getMode === 'function'
      ? panoramaRenderer.getMode() === 'panorama'
      : false;
    state.shouldRestore = config.enablePanorama && (overlayActive || rendererActive);
    if (state.shouldRestore) {
      if (typeof window !== 'undefined' && typeof window.PAL_SET_OVERLAY_MODE === 'function') {
        window.PAL_SET_OVERLAY_MODE('off');
      } else if (rendererActive && typeof panoramaRenderer.setMode === 'function') {
        panoramaRenderer.setMode('off');
      }
      if (panoramaDialog && typeof panoramaDialog.setMode === 'function') {
        panoramaDialog.setMode('off');
      }
    }
    setLegacyCanvasVisible(true);
    runGenerator(refreshClassicView()).catch((err) => {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[script-service] refreshClassicView failed', err);
      }
    });
  }
  state.depth += 1;
  return { shouldRestore: state.shouldRestore };
}

function exitClassicOverlay(state) {
  const guard = getOverlayState();
  guard.depth = Math.max(0, guard.depth - 1);
  if (!state || !state.shouldRestore || guard.depth > 0) {
    return;
  }
  if (typeof window !== 'undefined' && typeof window.PAL_SET_OVERLAY_MODE === 'function') {
    window.PAL_SET_OVERLAY_MODE('panorama');
  } else {
    if (panoramaRenderer && typeof panoramaRenderer.setMode === 'function') {
      panoramaRenderer.setMode('panorama');
    }
    if (panoramaDialog && typeof panoramaDialog.setMode === 'function') {
      panoramaDialog.setMode('panorama');
    }
  }
  guard.shouldRestore = false;
  setLegacyCanvasVisible(false);
}

function runGenerator(iterator) {
  if (typeof iterator === 'function') {
    try {
      iterator = iterator();
    } catch (err) {
      return Promise.reject(err);
    }
  }
  if (!iterator || typeof iterator.next !== 'function') {
    return Promise.resolve(iterator);
  }
  return new Promise((resolve, reject) => {
    function step(nextFn, arg) {
      let result;
      try {
        result = nextFn.call(iterator, arg);
      } catch (err) {
        reject(err);
        return;
      }
      if (!result || result.done) {
        resolve(result && result.value);
        return;
      }
      Promise.resolve(result.value).then(
        (value) => step(iterator.next, value),
        (err) => step(iterator.throw, err)
      );
    }
    step(iterator.next, undefined);
  });
}

function* refreshClassicView() {
  if (scene && typeof scene.makeScene === 'function') {
    yield* scene.makeScene();
  }
  const targetSurface =
    (scene && scene.surface) ||
    (typeof globalThis !== 'undefined' && globalThis.ui && globalThis.ui.surface) ||
    null;
  if (targetSurface && typeof targetSurface.updateScreen === 'function') {
    targetSurface.updateScreen(null);
  }
}

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

    const task = runGenerator(function* wrappedMenu() {
      const overlayState = enterClassicOverlay();
      try {
        yield* refreshClassicView();
        return yield* handler();
      } finally {
        exitClassicOverlay(overlayState);
      }
    })
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
