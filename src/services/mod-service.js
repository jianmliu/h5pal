import config from '../js/pal/config.js';
import palette from '../js/pal/palette.js';

const GLOBAL_SCOPE = typeof globalThis !== 'undefined'
  ? globalThis
  : (typeof window !== 'undefined'
    ? window
    : (typeof global !== 'undefined' ? global : {}));
const HAS_DOM = typeof window !== 'undefined' && typeof document !== 'undefined';
const GLOBAL_FETCH = typeof GLOBAL_SCOPE.fetch === 'function'
  ? GLOBAL_SCOPE.fetch.bind(GLOBAL_SCOPE)
  : null;
const ImageCtor = HAS_DOM
  ? (typeof window.Image !== 'undefined' ? window.Image : GLOBAL_SCOPE.Image)
  : null;

function toAbsoluteUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalized = path.replace(/^[.\/]+/, '');
  return './' + normalized;
}

class ModService {
  constructor() {
    this.manifest = null;
    this.readyPromise = null;
    this.backgroundOverrides = new Map();
    this.paletteMap = null;
    this.versionToken = '';
  }

  async prepare() {
    if (!config.enableModAssets || !HAS_DOM || !GLOBAL_FETCH) {
      return false;
    }
    if (this.readyPromise) {
      return this.readyPromise;
    }
    this.readyPromise = this._loadManifest()
      .then(async (manifest) => {
        if (!manifest) {
          return false;
        }
        this.manifest = manifest;
        this.versionToken = manifest.generatedAt || Date.now().toString();
        await this._preloadBackgrounds(manifest);
        return true;
      })
      .catch((err) => {
        console.warn('[mod-service] prepare failed', err);
        return false;
      });
    return this.readyPromise;
  }

  getDecompressedOverride(name, chunkIndex) {
    if (!this.manifest || !name) {
      return null;
    }
    if (name !== 'FBP') {
      return null;
    }
    return this.backgroundOverrides.get(chunkIndex) || null;
  }

  async _loadManifest() {
    const manifestUrl = config.resolveModAssetPath
      ? config.resolveModAssetPath('mod-manifest.json')
      : null;
    if (!manifestUrl) {
      return null;
    }
    try {
      const response = await GLOBAL_FETCH(manifestUrl, { cache: 'no-store' });
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (err) {
      console.warn('[mod-service] manifest fetch failed', err);
      return null;
    }
  }

  async _preloadBackgrounds(manifest) {
    if (!manifest || !manifest.backgrounds) {
      return;
    }
    const entries = Object.entries(manifest.backgrounds);
    if (!entries.length) {
      return;
    }
    const tasks = entries.map(([chunkIndex, entry]) =>
      this._loadBackgroundOverride(Number(chunkIndex), entry)
    );
    await Promise.all(tasks);
  }

  async _loadBackgroundOverride(chunkIndex, entry) {
    if (!entry || !entry.path || !entry.width || !entry.height) {
      return;
    }
    try {
      const imageData = await this._loadImageData(entry);
      if (!imageData) {
        return;
      }
      const pixels = this._convertImageDataToPalette(imageData);
      pixels.width = entry.width;
      pixels.height = entry.height;
      this.backgroundOverrides.set(chunkIndex, pixels);
    } catch (err) {
      console.warn(`[mod-service] failed to load background ${chunkIndex}`, err);
    }
  }

  async _loadImageData(entry) {
    if (!HAS_DOM || !ImageCtor) {
      return null;
    }
    const src = toAbsoluteUrl(entry.path);
    if (!src) {
      return null;
    }
    const cacheBust = this.versionToken
      ? `${src}${src.indexOf('?') === -1 ? '?' : '&'}v=${encodeURIComponent(this.versionToken)}`
      : src;
    const img = new ImageCtor();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';

    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = cacheBust;
    });

    const canvas = this._getCanvas(entry.width, entry.height);
    if (!canvas) {
      return null;
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, entry.width, entry.height);
    ctx.drawImage(img, 0, 0, entry.width, entry.height);
    return ctx.getImageData(0, 0, entry.width, entry.height);
  }

  _getCanvas(width, height) {
    if (!HAS_DOM) {
      return null;
    }
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
    }
    this.canvas.width = width;
    this.canvas.height = height;
    return this.canvas;
  }

  _convertImageDataToPalette(imageData) {
    const { data, width, height } = imageData;
    const totalPixels = width * height;
    const result = new Uint8Array(totalPixels);
    const paletteMap = this._getPaletteColorMap();
    for (let i = 0, j = 0; i < totalPixels; i++, j += 4) {
      const r = data[j];
      const g = data[j + 1];
      const b = data[j + 2];
      const alpha = data[j + 3];
      const key = alpha === 0 ? '0,0,0' : `${r},${g},${b}`;
      result[i] = paletteMap.get(key) ?? 0;
    }
    return result;
  }

  _getPaletteColorMap() {
    if (this.paletteMap) {
      return this.paletteMap;
    }
    const map = new Map();
    const reference = this._resolvePaletteReference();
    if (Array.isArray(reference)) {
      reference.forEach((color, idx) => {
        if (!color) {
          return;
        }
        const key = `${color.r},${color.g},${color.b}`;
        if (!map.has(key)) {
          map.set(key, idx);
        }
      });
    }
    map.set('0,0,0', 0);
    this.paletteMap = map;
    return map;
  }

  _resolvePaletteReference() {
    if (!palette || typeof palette.get !== 'function') {
      return null;
    }
    try {
      return palette.get(0, false);
    } catch (err) {
      if (this._tryInitPaletteFromGlobals()) {
        try {
          return palette.get(0, false);
        } catch (innerErr) {
          console.warn('[mod-service] failed to read palette after init', innerErr);
          return null;
        }
      }
      console.warn('[mod-service] failed to read palette', err);
      return null;
    }
  }

  _tryInitPaletteFromGlobals() {
    if (!palette || typeof palette.init !== 'function') {
      return false;
    }
    const files = GLOBAL_SCOPE && GLOBAL_SCOPE.Files ? GLOBAL_SCOPE.Files : null;
    const pat = files && files.PAT;
    if (!pat || typeof pat.readChunk !== 'function') {
      return false;
    }
    try {
      palette.init(pat);
      return true;
    } catch (err) {
      console.warn('[mod-service] unable to initialise palette from Files.PAT', err);
      return false;
    }
  }
}

const modService = new ModService();

export default modService;
