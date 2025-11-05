import worldService from './world-service.js';
import { sceneEventSignals } from '../state/slices/scene-events.js';

const sceneSignals = sceneEventSignals();

export function getSceneIdValue() {
  const value = sceneSignals.sceneId.value;
  if (Number.isFinite(value)) {
    return value;
  }
  return typeof worldService.getSceneId === 'function' ? worldService.getSceneId() : 0;
}

export default {
  getSceneIdValue
};
