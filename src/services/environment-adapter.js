import worldService from './world-service.js';
import { viewportSignals } from '../state/slices/viewport.js';
import { audioResourceSignals } from '../state/slices/audio-resources.js';
import { timeFlagSignals } from '../state/slices/time-flags.js';
import { gameFlagSignals } from '../state/slices/game-flags.js';

const viewportSlice = viewportSignals();
const audioSlice = audioResourceSignals();
const timeSlice = timeFlagSignals();
const gameFlagSlice = gameFlagSignals();

function getViewportValue() {
  const value = viewportSlice.viewport.value;
  if (Number.isFinite(value)) {
    return value;
  }
  return typeof worldService.getViewport === 'function' ? worldService.getViewport() : 0;
}

function getPartyOffsetValue() {
  const value = viewportSlice.partyOffset.value;
  if (Number.isFinite(value)) {
    return value;
  }
  return typeof worldService.getPartyOffset === 'function' ? worldService.getPartyOffset() : 0;
}

function getPartyDirectionValue() {
  const value = viewportSlice.partyDirection.value;
  if (Number.isFinite(value)) {
    return value;
  }
  return typeof worldService.getPartyDirection === 'function' ? worldService.getPartyDirection() : 0;
}

function getCurrentSaveSlotValue() {
  const value = viewportSlice.currentSaveSlot.value;
  if (Number.isFinite(value) && value >= 1) {
    return value;
  }
  return typeof worldService.getCurrentSaveSlot === 'function' ? worldService.getCurrentSaveSlot() : 1;
}

function getPaletteIdValue() {
  const value = audioSlice.paletteId.value;
  if (Number.isFinite(value)) {
    return value;
  }
  return typeof worldService.getPaletteId === 'function' ? worldService.getPaletteId() : 0;
}

function getScreenWaveValue() {
  const value = audioSlice.screenWave.value;
  if (Number.isFinite(value)) {
    return value;
  }
  return typeof worldService.getScreenWave === 'function' ? worldService.getScreenWave() : 0;
}

function getLayerValue() {
  const value = audioSlice.layer.value;
  if (Number.isFinite(value)) {
    return value;
  }
  return typeof worldService.getLayer === 'function' ? worldService.getLayer() : 0;
}

function isNightPaletteEnabled() {
  const value = audioSlice.nightPalette.value;
  if (typeof value === 'boolean') {
    return value;
  }
  return typeof worldService.getNightPaletteFlag === 'function' ? !!worldService.getNightPaletteFlag() : false;
}

function shouldFadeIn() {
  const value = timeSlice.needToFadeIn.value;
  if (typeof value === 'boolean') {
    return value;
  }
  return typeof worldService.getNeedToFadeIn === 'function' ? !!worldService.getNeedToFadeIn() : false;
}

function getWaveProgressionValue() {
  const value = timeSlice.waveProgression.value;
  if (Number.isFinite(value)) {
    return value;
  }
  return typeof worldService.getWaveProgression === 'function' ? worldService.getWaveProgression() : 0;
}

export {
  getViewportValue,
  getPartyOffsetValue,
  getPartyDirectionValue,
  getCurrentSaveSlotValue,
  getPaletteIdValue,
  getScreenWaveValue,
  getLayerValue,
  isNightPaletteEnabled,
  shouldFadeIn,
  getWaveProgressionValue
};

export default {
  getViewportValue,
  getPartyOffsetValue,
  getPartyDirectionValue,
  getCurrentSaveSlotValue,
  getPaletteIdValue,
  getScreenWaveValue,
  getLayerValue,
  isNightPaletteEnabled,
  shouldFadeIn,
  getWaveProgressionValue
};
