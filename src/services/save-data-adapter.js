import stateService from './state-service.js';
import worldService from './world-service.js';

function getStructFromState(key, fallback) {
  const struct = stateService.getGlobal(key);
  if (struct && typeof struct === 'object') {
    return struct;
  }
  return typeof fallback === 'function' ? fallback() : null;
}

export function getPartyStructSnapshot() {
  return getStructFromState('party', () => (
    typeof worldService.getPartyStruct === 'function'
      ? worldService.getPartyStruct()
      : null
  ));
}

export function getTrailStructSnapshot() {
  return getStructFromState('trail', () => (
    typeof worldService.getTrailStruct === 'function'
      ? worldService.getTrailStruct()
      : null
  ));
}

export function getExpStructSnapshot() {
  return getStructFromState('exp', () => (
    typeof worldService.getExpState === 'function'
      ? worldService.getExpState()
      : null
  ));
}

export function getPoisonStructSnapshot() {
  return getStructFromState('poisonStatus', () => (
    typeof worldService.getPoisonStatusStruct === 'function'
      ? worldService.getPoisonStatusStruct()
      : null
  ));
}

export function getInventoryStructSnapshot() {
  return getStructFromState('inventory', () => (
    typeof worldService.getInventoryStruct === 'function'
      ? worldService.getInventoryStruct()
      : null
  ));
}

export default {
  getPartyStructSnapshot,
  getTrailStructSnapshot,
  getExpStructSnapshot,
  getPoisonStructSnapshot,
  getInventoryStructSnapshot
};

