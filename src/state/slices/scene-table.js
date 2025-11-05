import reactiveContext from '../reactive-context.js';

const SCENE_TABLE_KEY = 'world.scene.table';

function ensureSceneTableSignal(initialValue = []) {
  return reactiveContext.ensureSignal(
    SCENE_TABLE_KEY,
    Array.isArray(initialValue) ? initialValue : []
  );
}

export function sceneTableSignal(initialValue = []) {
  return ensureSceneTableSignal(initialValue);
}

export function getSceneTableValue(fallback = []) {
  const signal = ensureSceneTableSignal(fallback);
  return Array.isArray(signal.value) ? signal.value : fallback;
}

export function updateSceneTableValue(table, options = {}) {
  const resolved = Array.isArray(table) ? table : [];
  const previous = reactiveContext.getSignal(SCENE_TABLE_KEY, resolved);
  const signal = ensureSceneTableSignal(previous);
  if (signal.value !== resolved) {
    reactiveContext.setSignal(SCENE_TABLE_KEY, resolved);
    if (options.emitEvent !== false) {
      reactiveContext.rootEvent$.next({
        type: 'world/scene/tableChanged',
        value: resolved,
        previous,
        source: options.source || 'worldService'
      });
    }
  }
  return resolved;
}

export function resetSceneTableSlice() {
  reactiveContext.setSignal(SCENE_TABLE_KEY, []);
}

