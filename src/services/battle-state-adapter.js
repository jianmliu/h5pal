import { battleFormationSignals } from '../state/slices/battle-formation.js';
import { audioResourceSignals } from '../state/slices/audio-resources.js';
import { autoBattleSignal } from '../state/slices/auto-battle.js';
import battleService from './battle-service.js';
import worldService from './world-service.js';

const stateListeners = new Set();
let stateSubscriptions = [];
let battleStateCache = null;

function notifyState(event) {
  stateListeners.forEach((listener) => {
    if (typeof listener !== 'function') {
      return;
    }
    try {
      listener(event);
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[battleStateAdapter] listener error', err);
      }
    }
  });
}

function refreshBattleStateCache(source) {
  if (battleService && typeof battleService.getState === 'function') {
    const proxiedState = battleService.getState();
    if (proxiedState) {
      battleStateCache = proxiedState;
      return battleStateCache;
    }
  }
  if (worldService && typeof worldService.getBattleState === 'function') {
    const fallback = worldService.getBattleState();
    if (fallback) {
      battleStateCache = fallback;
      return battleStateCache;
    }
  }
  if (source === 'dispose') {
    battleStateCache = null;
  }
  return battleStateCache;
}

function ensureBattleStateSubscription() {
  if (stateSubscriptions.length > 0) {
    return;
  }
  refreshBattleStateCache('init');
  if (!battleService || typeof battleService.on !== 'function') {
    return;
  }
  const handleStateChanged = () => {
    const previous = battleStateCache;
    const next = refreshBattleStateCache('stateChanged') || null;
    notifyState({
      type: 'stateChanged',
      state: next || {},
      previous: previous || {}
    });
  };
  const handleStateMutated = () => {
    const previous = battleStateCache;
    const next = refreshBattleStateCache('stateMutated') || null;
    notifyState({
      type: 'stateMutated',
      state: next || {},
      previous: previous || {}
    });
  };
  battleService.on('stateChanged', handleStateChanged);
  battleService.on('stateMutated', handleStateMutated);
  stateSubscriptions = [
    () => battleService.off('stateChanged', handleStateChanged),
    () => battleService.off('stateMutated', handleStateMutated)
  ];
}

function teardownBattleStateSubscription() {
  stateSubscriptions.forEach((dispose) => {
    if (typeof dispose === 'function') {
      dispose();
    }
  });
  stateSubscriptions = [];
  refreshBattleStateCache('dispose');
}

function getBattleFormationSignal(key) {
  const signals = battleFormationSignals();
  return signals[key];
}

function getAudioSignal(key) {
  const signals = audioResourceSignals();
  return signals[key];
}

function getAutoBattleFlagSignal() {
  return autoBattleSignal();
}

export function getEnemyTeamEntry(teamId) {
  const signal = getBattleFormationSignal('enemyTeam');
  const list = signal && signal.value ? signal.value : [];
  return teamId != null && teamId >= 0 && teamId < list.length ? list[teamId] : null;
}

export function getEnemyFormationPosition(index, maxEnemyIndex) {
  const positionsSignal = getBattleFormationSignal('enemyPositions');
  const positions = positionsSignal ? positionsSignal.value : null;
  if (!positions || !Array.isArray(positions.pos)) {
    return null;
  }
  const rows = positions.pos[index];
  if (!rows || !Array.isArray(rows)) {
    return null;
  }
  return rows[Math.min(Math.max(maxEnemyIndex, 0), rows.length - 1)] || null;
}

export function getBattleFieldEntry(fieldId) {
  const battleFieldsSignal = getBattleFormationSignal('battleFields');
  const fields = battleFieldsSignal && battleFieldsSignal.value ? battleFieldsSignal.value : [];
  return fieldId != null && fieldId >= 0 && fieldId < fields.length ? fields[fieldId] : null;
}

export function getBattleFieldId() {
  const signal = getAudioSignal('battleFieldId');
  const value = signal ? signal.value : 0;
  return typeof value === 'number' ? value : 0;
}

export function getBattleMusicTrack() {
  const signal = getAudioSignal('battleMusicTrack');
  const value = signal ? signal.value : 0;
  return typeof value === 'number' ? value : 0;
}

export function getMusicTrack() {
  const signal = getAudioSignal('musicTrack');
  const value = signal ? signal.value : 0;
  return typeof value === 'number' ? value : 0;
}

export function isAutoBattleEnabled() {
  const signal = getAutoBattleFlagSignal();
  return !!(signal && signal.value);
}

export function getEnemyTeamSignal() {
  return getBattleFormationSignal('enemyTeam');
}

export function getBattleFieldsSignal() {
  return getBattleFormationSignal('battleFields');
}

export function getBattleStateSnapshot() {
  return refreshBattleStateCache('snapshot') || {};
}

export function subscribeBattleState(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }
  ensureBattleStateSubscription();
  stateListeners.add(listener);
  listener({
    type: 'snapshot',
    state: getBattleStateSnapshot()
  });
  return () => {
    stateListeners.delete(listener);
    if (stateListeners.size === 0) {
      notifyState({ type: 'disposed' });
      teardownBattleStateSubscription();
    }
  };
}
