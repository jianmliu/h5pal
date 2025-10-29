import reactiveContext from '../reactive-context.js';

const PLAYER_STATUS_KEY = 'world.status.playerMatrix';
const POISON_STATUS_KEY = 'world.status.poisonMatrix';

function cloneMatrix(matrix) {
  if (!Array.isArray(matrix)) {
    return [];
  }
  return matrix.map((row) => {
    if (Array.isArray(row)) {
      return row.slice();
    }
    if (row && typeof row === 'object') {
      if (row.uint8Array) {
        return { uint8Array: row.uint8Array.slice() };
      }
      return { ...row };
    }
    return row;
  });
}

function ensureMatrixSignal(key, initialValue = []) {
  return reactiveContext.ensureSignal(key, cloneMatrix(initialValue));
}

export function statusSignals() {
  return {
    player: ensureMatrixSignal(PLAYER_STATUS_KEY, []),
    poison: ensureMatrixSignal(POISON_STATUS_KEY, [])
  };
}

export function getPlayerStatusMatrixValue(fallback = []) {
  return cloneMatrix(ensureMatrixSignal(PLAYER_STATUS_KEY, fallback).value);
}

export function updatePlayerStatusMatrix(matrix, options = {}) {
  const resolved = cloneMatrix(matrix);
  const previous = reactiveContext.getSignal(PLAYER_STATUS_KEY, []);
  const signal = ensureMatrixSignal(PLAYER_STATUS_KEY, previous);
  const changed = JSON.stringify(signal.value) !== JSON.stringify(resolved);
  if (changed) {
    reactiveContext.setSignal(PLAYER_STATUS_KEY, resolved);
    if (options.emitEvent !== false) {
      reactiveContext.rootEvent$.next({
        type: 'world/status/playerMatrixChanged',
        value: resolved,
        previous,
        source: options.source || 'worldService'
      });
    }
  }
  return resolved;
}

export function mutatePlayerStatusMatrix(mutator, options = {}) {
  const signal = ensureMatrixSignal(PLAYER_STATUS_KEY, []);
  const current = cloneMatrix(signal.value);
  const next = typeof mutator === 'function' ? mutator(current) : current;
  return updatePlayerStatusMatrix(typeof next === 'undefined' ? current : next, options);
}

export function getPoisonStatusMatrixValue(fallback = []) {
  return cloneMatrix(ensureMatrixSignal(POISON_STATUS_KEY, fallback).value);
}

export function updatePoisonStatusMatrix(matrix, options = {}) {
  const resolved = cloneMatrix(matrix);
  const previous = reactiveContext.getSignal(POISON_STATUS_KEY, []);
  const signal = ensureMatrixSignal(POISON_STATUS_KEY, previous);
  const changed = JSON.stringify(signal.value) !== JSON.stringify(resolved);
  if (changed) {
    reactiveContext.setSignal(POISON_STATUS_KEY, resolved);
    if (options.emitEvent !== false) {
      reactiveContext.rootEvent$.next({
        type: 'world/status/poisonMatrixChanged',
        value: resolved,
        previous,
        source: options.source || 'worldService'
      });
    }
  }
  return resolved;
}

export function mutatePoisonStatusMatrix(mutator, options = {}) {
  const signal = ensureMatrixSignal(POISON_STATUS_KEY, []);
  const current = cloneMatrix(signal.value);
  const next = typeof mutator === 'function' ? mutator(current) : current;
  return updatePoisonStatusMatrix(typeof next === 'undefined' ? current : next, options);
}

export function resetStatusSlices() {
  reactiveContext.setSignal(PLAYER_STATUS_KEY, []);
  reactiveContext.setSignal(POISON_STATUS_KEY, []);
}
