import reactiveContext from '../reactive-context.js';

const MUSIC_TRACK_KEY = 'world.audio.musicTrack';
const BATTLE_MUSIC_TRACK_KEY = 'world.audio.battleMusicTrack';
const BATTLE_FIELD_KEY = 'world.audio.battleFieldId';
const SCREEN_WAVE_KEY = 'world.audio.screenWave';
const PALETTE_ID_KEY = 'world.audio.paletteId';
const NIGHT_PALETTE_KEY = 'world.audio.nightPalette';
const LAYER_KEY = 'world.audio.layer';

function ensureNumberSignal(key, fallback = 0) {
  const value = Number.isFinite(fallback) ? Math.trunc(fallback) : 0;
  return reactiveContext.ensureSignal(key, value);
}

function ensureBooleanSignal(key, fallback = false) {
  return reactiveContext.ensureSignal(key, !!fallback);
}

function getNumberSignalValue(key, fallback = 0) {
  return ensureNumberSignal(key, fallback).value;
}

function getBooleanSignalValue(key, fallback = false) {
  return ensureBooleanSignal(key, fallback).value;
}

export function audioResourceSignals() {
  return {
    musicTrack: ensureNumberSignal(MUSIC_TRACK_KEY, 0),
    battleMusicTrack: ensureNumberSignal(BATTLE_MUSIC_TRACK_KEY, 0),
    battleFieldId: ensureNumberSignal(BATTLE_FIELD_KEY, 0),
    screenWave: ensureNumberSignal(SCREEN_WAVE_KEY, 0),
    paletteId: ensureNumberSignal(PALETTE_ID_KEY, 0),
    nightPalette: ensureBooleanSignal(NIGHT_PALETTE_KEY, false),
    layer: ensureNumberSignal(LAYER_KEY, 0)
  };
}

function updateNumberSignal(key, value, options = {}) {
  const resolved = Number.isFinite(value) ? Math.trunc(value) : 0;
  const previous = reactiveContext.getSignal(key, resolved);
  const signal = ensureNumberSignal(key, previous);
  if (signal.value !== resolved) {
    reactiveContext.setSignal(key, resolved);
    if (options.emitEvent !== false) {
      reactiveContext.rootEvent$.next({
        type: `world/audio/${key}/changed`,
        value: resolved,
        previous,
        source: options.source || 'worldService'
      });
    }
  }
  return resolved;
}

function updateBooleanSignal(key, value, options = {}) {
  const resolved = !!value;
  const previous = reactiveContext.getSignal(key, resolved);
  const signal = ensureBooleanSignal(key, previous);
  if (signal.value !== resolved) {
    reactiveContext.setSignal(key, resolved);
    if (options.emitEvent !== false) {
      reactiveContext.rootEvent$.next({
        type: `world/audio/${key}/changed`,
        value: resolved,
        previous,
        source: options.source || 'worldService'
      });
    }
  }
  return resolved;
}

export function updateMusicTrackValue(value, options = {}) {
  return updateNumberSignal(MUSIC_TRACK_KEY, value, options);
}

export function updateBattleMusicTrackValue(value, options = {}) {
  return updateNumberSignal(BATTLE_MUSIC_TRACK_KEY, value, options);
}

export function updateBattleFieldIdValue(value, options = {}) {
  return updateNumberSignal(BATTLE_FIELD_KEY, value, options);
}

export function updateScreenWaveValue(value, options = {}) {
  return updateNumberSignal(SCREEN_WAVE_KEY, value, options);
}

export function updatePaletteIdValue(value, options = {}) {
  return updateNumberSignal(PALETTE_ID_KEY, value, options);
}

export function updateLayerValue(value, options = {}) {
  return updateNumberSignal(LAYER_KEY, value, options);
}

export function updateNightPaletteValue(value, options = {}) {
  return updateBooleanSignal(NIGHT_PALETTE_KEY, value, options);
}

export function getScreenWaveValue(fallback = 0) {
  return getNumberSignalValue(SCREEN_WAVE_KEY, fallback);
}

export function getPaletteIdValue(fallback = 0) {
  return getNumberSignalValue(PALETTE_ID_KEY, fallback);
}

export function getLayerValue(fallback = 0) {
  return getNumberSignalValue(LAYER_KEY, fallback);
}

export function getNightPaletteValue(fallback = false) {
  return getBooleanSignalValue(NIGHT_PALETTE_KEY, fallback);
}

export function resetAudioResourceSlice() {
  reactiveContext.setSignal(MUSIC_TRACK_KEY, 0);
  reactiveContext.setSignal(BATTLE_MUSIC_TRACK_KEY, 0);
  reactiveContext.setSignal(BATTLE_FIELD_KEY, 0);
  reactiveContext.setSignal(SCREEN_WAVE_KEY, 0);
  reactiveContext.setSignal(PALETTE_ID_KEY, 0);
  reactiveContext.setSignal(NIGHT_PALETTE_KEY, false);
  reactiveContext.setSignal(LAYER_KEY, 0);
}
