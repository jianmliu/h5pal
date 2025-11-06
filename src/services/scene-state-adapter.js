import reactiveContext from '../state/reactive-context.js';
import { sceneEventSignals } from '../state/slices/scene-events.js';

const sceneSignals = sceneEventSignals();

export function getSceneIdValue() {
  const value = sceneSignals.sceneId.value;
  if (Number.isFinite(value)) {
    return value;
  }
  return 0;
}

export function sceneId$() {
  return reactiveContext.signalToObservable(sceneSignals.sceneId, () => getSceneIdValue());
}

export default {
  getSceneIdValue,
  sceneId$
};
