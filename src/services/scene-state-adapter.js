import { sceneEventSignals } from '../state/slices/scene-events.js';
import { createAdapterObservable } from './adapter-helpers.js';

const sceneSignals = sceneEventSignals();

export function getSceneIdValue() {
  const value = sceneSignals.sceneId.value;
  if (Number.isFinite(value)) {
    return value;
  }
  return 0;
}

export const sceneId$ = createAdapterObservable({
  name: 'scene.state.id',
  signal: sceneSignals.sceneId,
  getValue: getSceneIdValue
});

export default {
  getSceneIdValue,
  sceneId$
};
