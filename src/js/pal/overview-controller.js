import config from './config';

const HAS_DOM = typeof window !== 'undefined' && typeof document !== 'undefined';
const DEFAULT_FOLDER = 'map-overview';
const LAYER_ID = 'pal-overview-layer';
const VEIL_ID = 'pal-overview-veil';
const INDICATOR_ID = 'pal-overview-indicator';
const OVERVIEW_WIDTH = 220;
const OVERVIEW_HEIGHT = 220;
const OVERVIEW_OFFSET = 12;
const raf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
  ? window.requestAnimationFrame.bind(window)
  : (fn) => setTimeout(fn, 16);
const PAL_X = typeof window !== 'undefined' && typeof window.PAL_X === 'function'
  ? window.PAL_X
  : (pos) => pos & 0xFFFF;
const PAL_Y = typeof window !== 'undefined' && typeof window.PAL_Y === 'function'
  ? window.PAL_Y
  : (pos) => (pos >> 16) & 0xFFFF;
const MAP_WIDTH = 64 * 32;
const MAP_HEIGHT = 128 * 16;
const VIEWPORT_WIDTH = 320;
const VIEWPORT_HEIGHT = 200;

function createLayerElement() {
  if (!HAS_DOM) return null;
  const wrap = document.getElementById('wrap') || document.body;
  if (!wrap) {
    return null;
  }
  const div = document.createElement('div');
  div.id = LAYER_ID;
  div.style.position = 'absolute';
  div.style.width = `${OVERVIEW_WIDTH}px`;
  div.style.height = `${OVERVIEW_HEIGHT}px`;
  div.style.right = `${OVERVIEW_OFFSET}px`;
  div.style.bottom = `${OVERVIEW_OFFSET}px`;
  div.style.backgroundSize = 'contain';
  div.style.backgroundRepeat = 'no-repeat';
  div.style.backgroundPosition = 'center';
  div.style.opacity = '0';
  div.style.transition = 'opacity 200ms ease-out';
  div.style.pointerEvents = 'none';
  div.style.zIndex = '5';
  div.style.display = 'none';
  wrap.appendChild(div);
  return div;
}

function createVeilElement() {
  if (!HAS_DOM) return null;
  const wrap = document.getElementById('wrap') || document.body;
  if (!wrap) return null;
  const veil = document.createElement('div');
  veil.id = VEIL_ID;
  veil.style.display = 'none';
  wrap.appendChild(veil);
  return veil;
}

function createIndicatorElement() {
  if (!HAS_DOM) return null;
  const wrap = document.getElementById('wrap') || document.body;
  if (!wrap) return null;
  const dot = document.createElement('div');
  dot.id = INDICATOR_ID;
  dot.style.display = 'none';
  wrap.appendChild(dot);
  return dot;
}

function dedupe(list) {
  const seen = new Set();
  const result = [];
  list.forEach((item) => {
    if (item && !seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  });
  return result;
}

function buildCandidatePaths(sceneId) {
  const names = [
    `${DEFAULT_FOLDER}/scene-${sceneId}.png`,
    `${DEFAULT_FOLDER}/${sceneId}.png`
  ];
  const urls = [];
  names.forEach((relativePath) => {
    if (typeof config.resolveModAssetPath === 'function') {
      urls.push(config.resolveModAssetPath(relativePath));
    }
    if (typeof config.resolveAssetPath === 'function') {
      urls.push(config.resolveAssetPath(relativePath));
    }
  });
  return dedupe(urls);
}

function loadImageForScene(sceneId) {
  if (!HAS_DOM) {
    return Promise.reject(new Error('DOM unavailable'));
  }
  const candidates = buildCandidatePaths(sceneId);
  if (!candidates.length) {
    return Promise.reject(new Error('no overview assets configured'));
  }
  return new Promise((resolve, reject) => {
    const tryLoad = (index) => {
      if (index >= candidates.length) {
        reject(new Error('overview asset missing'));
        return;
      }
      const img = new Image();
      img.onload = () => resolve({ url: candidates[index], width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => tryLoad(index + 1);
      img.src = candidates[index];
    };
    tryLoad(0);
  });
}

class OverviewController {
  constructor() {
    this.enabled = false;
    this.layer = null;
    this.veil = null;
    this.indicator = null;
    this.sceneId = null;
    this.cache = new Map();
    this.viewportValue = null;
    this.activeImage = null;
  }

  setEnabled(flag) {
    this.enabled = !!flag;
    if (!HAS_DOM) return;
    if (!this.enabled) {
      this.hideLayer();
    } else {
      this.layer = this.layer || createLayerElement();
      this.veil = this.veil || createVeilElement();
      this.indicator = this.indicator || createIndicatorElement();
      if (this.sceneId) {
        this.showForScene(this.sceneId);
      }
    }
  }

  toggle() {
    this.setEnabled(!this.enabled);
  }

  hideLayer() {
    this.activeImage = null;
    if (this.layer) {
      this.layer.style.opacity = '0';
      this.layer.style.display = 'none';
    }
    if (this.veil) {
      this.veil.style.opacity = '0';
      this.veil.style.display = 'none';
    }
    if (this.indicator) {
      this.indicator.style.opacity = '0';
      this.indicator.style.display = 'none';
    }
  }

  showLayerWithImage(url) {
    if (!this.layer) {
      this.layer = createLayerElement();
    }
    if (!this.veil) {
      this.veil = createVeilElement();
    }
    if (!this.indicator) {
      this.indicator = createIndicatorElement();
    }
    if (!this.layer) {
      return;
    }
    this.activeImage = url;
    this.cachedImageSize = null;
    this.layer.style.backgroundImage = url ? `url('${url}')` : '';
    if (url) {
      this.layer.style.display = 'block';
      this.applyViewportTransform();
      raf(() => {
        this.layer.style.opacity = '1';
      });
      if (this.veil) {
        this.veil.style.display = 'block';
        this.veil.style.opacity = '1';
      }
      this.updateIndicatorPosition();
    } else {
      this.hideLayer();
    }
  }

  setViewport(value) {
    this.viewportValue = value;
    this.applyViewportTransform();
    this.updateIndicatorPosition();
  }

  applyViewportTransform() {
    if (!this.layer) return;
    this.layer.style.backgroundPosition = 'center';
  }

  updateIndicatorPosition() {
    if (!this.enabled || !this.layer || !this.indicator || !this.activeImage) {
      if (this.indicator) {
        this.indicator.style.opacity = '0';
        this.indicator.style.display = 'none';
      }
      return;
    }
    if (typeof this.viewportValue !== 'number') {
      this.indicator.style.opacity = '0';
      this.indicator.style.display = 'none';
      return;
    }
    const viewportX = PAL_X(this.viewportValue) || 0;
    const viewportY = PAL_Y(this.viewportValue) || 0;
    const maxX = Math.max(1, MAP_WIDTH - VIEWPORT_WIDTH);
    const maxY = Math.max(1, MAP_HEIGHT - VIEWPORT_HEIGHT);
    const ratioX = Math.min(1, Math.max(0, viewportX / maxX));
    const ratioY = Math.min(1, Math.max(0, viewportY / maxY));
    const layerWidth = this.layer.clientWidth || 220;
    const layerHeight = this.layer.clientHeight || 220;
    const indicatorWidth = Math.max(8, (VIEWPORT_WIDTH / MAP_WIDTH) * layerWidth);
    const indicatorHeight = Math.max(8, (VIEWPORT_HEIGHT / MAP_HEIGHT) * layerHeight);
    const posX = ratioX * (layerWidth - indicatorWidth);
    const posY = ratioY * (layerHeight - indicatorHeight);
    this.indicator.style.width = `${indicatorWidth}px`;
    this.indicator.style.height = `${indicatorHeight}px`;
    this.indicator.style.transform = `translate(${posX}px, ${posY}px)`;
    this.indicator.style.display = 'block';
    this.indicator.style.opacity = '1';
  }

  showForScene(sceneId) {
    if (!HAS_DOM || !this.enabled) {
      return;
    }
    this.layer = this.layer || createLayerElement();
    if (!this.layer) {
      return;
    }
    this.sceneId = sceneId;
    if (sceneId === null || typeof sceneId === 'undefined') {
      this.hideLayer();
      return;
    }
    if (this.cache.has(sceneId)) {
      const cached = this.cache.get(sceneId);
      if (cached && cached.url) {
        this.showLayerWithImage(cached.url);
      } else {
        this.hideLayer();
      }
      return;
    }
    const promise = loadImageForScene(sceneId)
      .then((asset) => {
    this.cache.set(sceneId, asset);
    this.cachedImageSize = asset ? { width: asset.width, height: asset.height } : null;
        if (this.sceneId === sceneId && this.enabled) {
          this.showLayerWithImage(asset.url);
        }
        return asset;
      })
      .catch((err) => {
        console.warn('[overview] missing asset for scene', sceneId, err && err.message ? err.message : err);
        this.cache.set(sceneId, null);
        if (this.sceneId === sceneId) {
          this.hideLayer();
        }
        return null;
      });
    this.cache.set(sceneId, null);
    return promise;
  }

  applyScene(sceneId) {
    this.sceneId = sceneId;
    if (!this.enabled) {
      return;
    }
    this.showForScene(sceneId);
  }
}

const controller = new OverviewController();

if (typeof window !== 'undefined') {
  window.PAL_OVERVIEW = {
    enable: () => controller.setEnabled(true),
    disable: () => controller.setEnabled(false),
    toggle: () => controller.toggle(),
    setEnabled: (flag) => controller.setEnabled(flag)
  };
}

export default controller;
