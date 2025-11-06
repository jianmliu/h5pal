import stateService from './state-service.js';
import worldService from './world-service.js';

function getStructFromState(key) {
  const struct = stateService.getGlobal(key);
  if (struct && typeof struct === 'object') {
    return struct;
  }
  return null;
}

export function getPartyStructSnapshot() {
  return getStructFromState('party');
}

export function getTrailStructSnapshot() {
  return getStructFromState('trail');
}

export function getExpStructSnapshot() {
  const struct = stateService.getGlobal('exp');
  if (struct && typeof struct === 'object') {
    return struct;
  }
  // TODO(rxjs-cleanup): remove worldService exp fallback once save-data slice is authoritative.
  return typeof worldService.getExpState === 'function'
    ? worldService.getExpState()
    : null;
}

export function getPoisonStructSnapshot() {
  return getStructFromState('poisonStatus');
}

export function getInventoryStructSnapshot() {
  return getStructFromState('inventory');
}

export default {
  getPartyStructSnapshot,
  getTrailStructSnapshot,
  getExpStructSnapshot,
  getPoisonStructSnapshot,
  getInventoryStructSnapshot
};
