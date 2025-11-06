import reactiveContext from '../state/reactive-context.js';
import { viewportSignals } from '../state/slices/viewport.js';
import { audioResourceSignals } from '../state/slices/audio-resources.js';
import { timeFlagSignals } from '../state/slices/time-flags.js';

const viewportSlice = viewportSignals();
const audioSlice = audioResourceSignals();
const timeSlice = timeFlagSignals();

function createValueStream(signal, projector) {
  return reactiveContext.signalToObservable(signal, (value) => {
    if (typeof projector === 'function') {
      return projector(value);
    }
    return value;
  });
}

function getViewportValue() {
  const value = viewportSlice.viewport.value;
  if (Number.isFinite(value)) {
    return value;
  }
  return 0;
}

function getPartyOffsetValue() {
  const value = viewportSlice.partyOffset.value;
  if (Number.isFinite(value)) {
    return value;
  }
  return 0;
}

function getPartyDirectionValue() {
  const value = viewportSlice.partyDirection.value;
  if (Number.isFinite(value)) {
    return value;
  }
  return 0;
}

function getCurrentSaveSlotValue() {
  const value = viewportSlice.currentSaveSlot.value;
  if (Number.isFinite(value) && value >= 1) {
    return value;
  }
  return 1;
}

function getPaletteIdValue() {
  const value = audioSlice.paletteId.value;
  if (Number.isFinite(value)) {
    return value;
  }
  return 0;
}

function getScreenWaveValue() {
  const value = audioSlice.screenWave.value;
  if (Number.isFinite(value)) {
    return value;
  }
  return 0;
}

function getLayerValue() {
  const value = audioSlice.layer.value;
  if (Number.isFinite(value)) {
    return value;
  }
  return 0;
}

function isNightPaletteEnabled() {
  const value = audioSlice.nightPalette.value;
  if (typeof value === 'boolean') {
    return value;
  }
  return false;
}

function shouldFadeIn() {
  const value = timeSlice.needToFadeIn.value;
  if (typeof value === 'boolean') {
    return value;
  }
  return false;
}

function getWaveProgressionValue() {
  const value = timeSlice.waveProgression.value;
  if (Number.isFinite(value)) {
    return value;
  }
  return 0;
}

export function viewport$() {
  return createValueStream(viewportSlice.viewport, () => getViewportValue());
}

export function partyOffset$() {
  return createValueStream(viewportSlice.partyOffset, () => getPartyOffsetValue());
}

export function partyDirection$() {
  return createValueStream(viewportSlice.partyDirection, () => getPartyDirectionValue());
}

export function currentSaveSlot$() {
  return createValueStream(viewportSlice.currentSaveSlot, () => getCurrentSaveSlotValue());
}

export function paletteId$() {
  return createValueStream(audioSlice.paletteId, () => getPaletteIdValue());
}

export function screenWave$() {
  return createValueStream(audioSlice.screenWave, () => getScreenWaveValue());
}

export function layer$() {
  return createValueStream(audioSlice.layer, () => getLayerValue());
}

export function nightPalette$() {
  return createValueStream(audioSlice.nightPalette, () => isNightPaletteEnabled());
}

export function fadeIn$() {
  return createValueStream(timeSlice.needToFadeIn, () => shouldFadeIn());
}

export function waveProgression$() {
  return createValueStream(timeSlice.waveProgression, () => getWaveProgressionValue());
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
  getWaveProgressionValue,
  viewport$,
  partyOffset$,
  partyDirection$,
  currentSaveSlot$,
  paletteId$,
  screenWave$,
  layer$,
  nightPalette$,
  fadeIn$,
  waveProgression$
};
