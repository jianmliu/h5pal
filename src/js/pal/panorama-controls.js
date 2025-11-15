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
    this.container = null;
    this.slider = null;
    this.label = null;
  }

  init() {
    if (this.initialized || typeof document === 'undefined') {
      return;
    }
    const wrap = document.getElementById('wrap') || document.body;
    if (!wrap) {
      return;
    }
    const container = document.createElement('div');
    container.id = 'pal-panorama-controls';
    container.style.position = 'absolute';
    container.style.left = '12px';
    container.style.bottom = '12px';
    container.style.padding = '8px 12px';
    container.style.background = 'rgba(0, 0, 0, 0.65)';
    container.style.border = '1px solid rgba(255, 255, 255, 0.2)';
    container.style.borderRadius = '10px';
    container.style.color = '#fff';
    container.style.font = '13px/1.4 sans-serif';
    container.style.display = 'none';
    container.style.zIndex = '6';

    const title = document.createElement('div');
    title.textContent = 'Panorama Zoom';
    title.style.fontWeight = '600';
    title.style.marginBottom = '6px';
    container.appendChild(title);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(SCALE_MIN);
    slider.max = String(SCALE_MAX);
    slider.step = String(SCALE_STEP);
    slider.style.width = '160px';
    slider.style.marginRight = '8px';

    const label = document.createElement('span');
    label.textContent = '1.00x';
    label.style.minWidth = '48px';
    label.style.display = 'inline-block';

    const controlsRow = document.createElement('div');
    controlsRow.style.display = 'flex';
    controlsRow.style.alignItems = 'center';
    controlsRow.appendChild(slider);
    controlsRow.appendChild(label);

    container.appendChild(controlsRow);
    wrap.appendChild(container);

    slider.addEventListener('input', (event) => {
      const value = Number(event.target.value);
      this.updateLabel(value);
      const api = resolvePalPanorama();
      if (api && typeof api.setScale === 'function') {
        api.setScale(value);
      }
    });

    this.container = container;
    this.slider = slider;
    this.label = label;
    this.initialized = true;
    this.syncFromRenderer();
  }

  syncFromRenderer() {
    if (!this.initialized) {
      return;
    }
    const api = resolvePalPanorama();
    const current = api && typeof api.getScale === 'function'
      ? api.getScale()
      : 1;
    this.slider.value = String(current);
    this.updateLabel(current);
  }

  updateLabel(value) {
    if (this.label) {
      this.label.textContent = `${value.toFixed(2)}x`;
    }
  }

  setMode(mode) {
    this.mode = mode === 'panorama' ? 'panorama' : 'off';
    if (!this.initialized) {
      return;
    }
    if (this.mode === 'panorama') {
      this.syncFromRenderer();
      this.container.style.display = 'block';
    } else {
      this.container.style.display = 'none';
    }
  }
}

const instance = new PanoramaControls();

if (typeof window !== 'undefined') {
  window.PAL_PANORAMA_UI = {
    setMode: (mode) => instance.setMode(mode),
    refresh: () => instance.syncFromRenderer()
  };
}

export default instance;
