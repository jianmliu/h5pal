import { gameFlagSignals } from '../state/slices/game-flags.js';

const flagSignals = gameFlagSignals();

function normaliseNumber(value, fallback = 0) {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

export function getCollectValue() {
  return normaliseNumber(flagSignals.collect.value, 0);
}

export function getChaseRange() {
  return normaliseNumber(flagSignals.chaseRange.value, 0);
}

export function getChaseSpeedChangeCycles() {
  return normaliseNumber(flagSignals.chaseSpeedChangeCycles.value, 0);
}

export function getBattleSpeed() {
  return normaliseNumber(flagSignals.battleSpeed.value, 2);
}

export default {
  getCollectValue,
  getChaseRange,
  getChaseSpeedChangeCycles,
  getBattleSpeed
};
