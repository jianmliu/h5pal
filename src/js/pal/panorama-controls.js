const SCALE_MIN = 0.75;
const SCALE_MAX = 2.0;
const SCALE_STEP = 0.05;

function resolvePalPanorama() {
  if (typeof window !== 'undefined' && window.PAL_PANORAMA) {
    return window.PAL_PANORAMA;
  }
  return null;
}

class PanoramaControls {
  constructor() {
    this.initialized = false;
    this.mode = 'off';
    this.scale = 1;
  }

  init() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    this.syncFromRenderer();
  }

  syncFromRenderer() {
    const api = resolvePalPanorama();
    const current = api && typeof api.getScale === 'function'
      ? api.getScale()
      : 1;
    if (Number.isFinite(current) && current > 0) {
      this.scale = current;
    }
  }

  setScale(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return this.scale;
    }
    const clamped = Math.min(SCALE_MAX, Math.max(SCALE_MIN, numeric));
    this.scale = clamped;
    const api = resolvePalPanorama();
    if (api && typeof api.setScale === 'function') {
      api.setScale(clamped);
    }
    return this.scale;
  }

  getScale() {
    return this.scale;
  }

  getScaleLimits() {
    return {
      min: SCALE_MIN,
      max: SCALE_MAX,
      step: SCALE_STEP
    };
  }

  setMode(mode) {
    this.mode = mode === 'panorama' ? 'panorama' : 'off';
  }
}

const instance = new PanoramaControls();

if (typeof window !== 'undefined') {
  window.PAL_PANORAMA_UI = {
    setMode: (mode) => instance.setMode(mode),
    refresh: () => instance.syncFromRenderer(),
    setScale: (value) => instance.setScale(value),
    getScale: () => instance.getScale(),
    getScaleLimits: () => instance.getScaleLimits()
  };
}

export default instance;
