import { battleFormationSignals } from '../state/slices/battle-formation.js';
import { audioResourceSignals } from '../state/slices/audio-resources.js';
import { autoBattleSignal } from '../state/slices/auto-battle.js';

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
