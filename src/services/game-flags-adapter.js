import { gameFlagSignals } from '../state/slices/game-flags.js';
import reactiveContext from '../state/reactive-context.js';

const flagSignals = gameFlagSignals();

function normaliseNumber(value, fallback = 0) {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function createFlagStream(signal, resolver) {
  return reactiveContext.signalToObservable(signal, () => resolver());
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

export function collect$() {
  return createFlagStream(flagSignals.collect, getCollectValue);
}

export function chaseRange$() {
  return createFlagStream(flagSignals.chaseRange, getChaseRange);
}

export function chaseSpeedChangeCycles$() {
  return createFlagStream(flagSignals.chaseSpeedChangeCycles, getChaseSpeedChangeCycles);
}

export function battleSpeed$() {
  return createFlagStream(flagSignals.battleSpeed, getBattleSpeed);
}

export default {
  getCollectValue,
  getChaseRange,
  getChaseSpeedChangeCycles,
  getBattleSpeed,
  collect$,
  chaseRange$,
  chaseSpeedChangeCycles$,
  battleSpeed$
};
