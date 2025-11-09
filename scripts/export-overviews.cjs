#!/usr/bin/env node
/**
 * Render PAL maps (MAP.MKF/GOP.MKF) into overview PNGs for Phase A overlay.
 *
 * Usage:
 *   node scripts/export-overviews.cjs --maps=0,1,2 --zoom=1 --prefix=scene-
 *
 * Defaults:
 *   output dir: pal-assets/exported-assets/map-overview
 *   maps:       all MAP.MKF chunks
 *   zoom:       1 (integer)
 *   prefix:     scene-
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const PAL_ASSET_DIR = path.join(ROOT, 'pal-assets');
const OUTPUT_DIR = path.join(PAL_ASSET_DIR, 'exported-assets', 'map-overview');
const MANIFEST_NAME = 'map-overview-manifest.json';

// Minimal DOM-ish shims for game modules.
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = { userAgent: 'node' };
}
if (typeof globalThis.performance === 'undefined') {
  globalThis.performance = { now: () => Date.now() };
}
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 16);
}
if (typeof globalThis.cancelAnimationFrame === 'undefined') {
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
if (typeof globalThis.Image === 'undefined') {
  globalThis.Image = class ImageMock {};
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = null;
}
if (typeof globalThis.sprintf !== 'function') {
  globalThis.sprintf = (...args) => args.join(' ');
}
if (typeof globalThis.DEBUG === 'undefined') {
  globalThis.DEBUG = {
    Timing: false,
    ShowSpriteRect: false,
    ShowSpritePos: false,
    ShowSpriteSize: false
  };
}

async function bootstrapModules() {
  const fileUrl = (relPath) => pathToFileURL(path.join(ROOT, relPath)).href;
  await import(fileUrl('src/js/pal/binary-helper.js'));
  await import(fileUrl('src/js/pal/common.js'));
  await import(fileUrl('src/js/pal/pal-global.js'));
  const [{ default: MKF }, { default: Map }] = await Promise.all([
    import(fileUrl('src/js/pal/mkf.js')),
    import(fileUrl('src/js/pal/map.js'))
  ]);
  return { MKF, Map };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    zoom: 1,
    prefix: 'map-',
    zeroPad: false,
    outDir: OUTPUT_DIR,
    mapIds: null
  };
  args.forEach((arg) => {
    if (arg.startsWith('--zoom=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0) {
        options.zoom = Math.max(1, Math.round(value));
      }
    } else if (arg.startsWith('--prefix=')) {
      options.prefix = arg.split('=')[1] || options.prefix;
    } else if (arg === '--pad' || arg === '--zero-pad') {
      options.zeroPad = true;
    } else if (arg.startsWith('--out=')) {
      options.outDir = path.resolve(arg.split('=')[1]);
    } else if (arg.startsWith('--maps=')) {
      const raw = arg.split('=')[1];
      options.mapIds = raw
        .split(',')
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isFinite(n) && n >= 0);
    }
  });
  return options;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadFileBytes(filePath) {
  const buffer = fs.readFileSync(filePath);
  return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
}

function loadPalette(MKFConstructor) {
  const patPath = path.join(PAL_ASSET_DIR, 'PAT.MKF');
  if (!fs.existsSync(patPath)) {
    throw new Error('PAT.MKF missing');
  }
  const data = loadFileBytes(patPath);
  const mkf = new MKFConstructor(data);
  const chunk = mkf.readChunk(0);
  const palette = new Array(256);
  for (let i = 0; i < 256; i++) {
    const r = chunk[i * 3] << 2;
    const g = chunk[i * 3 + 1] << 2;
    const b = chunk[i * 3 + 2] << 2;
    palette[i] = { r, g, b };
  }
  return palette;
}

function buildSceneMapping(MKFConstructor) {
  const mapping = new Map();
  try {
    const sssPath = path.join(PAL_ASSET_DIR, 'SSS.MKF');
    if (!fs.existsSync(sssPath)) {
      return mapping;
    }
    const mkf = new MKFConstructor(loadFileBytes(sssPath));
    if (typeof mkf.readChunk !== 'function') {
      return mapping;
    }
    const chunk = mkf.readChunk(1);
    const SceneCtor = globalThis.Scene;
    const readTypedArray = globalThis.readTypedArray;
    if (!chunk || !SceneCtor || typeof readTypedArray !== 'function') {
      return mapping;
    }
    const entries = readTypedArray(SceneCtor, chunk) || [];
    entries.forEach((entry, index) => {
      if (!entry || typeof entry.mapNum !== 'number') {
        return;
      }
      const mapNum = entry.mapNum;
      if (!Number.isFinite(mapNum) || mapNum < 0) {
        return;
      }
      const sceneId = index + 1;
      if (!mapping.has(mapNum)) {
        mapping.set(mapNum, []);
      }
      mapping.get(mapNum).push(sceneId);
    });
  } catch (err) {
    console.warn('[export-overviews] failed to parse scene table', err && err.message ? err.message : err);
  }
  return mapping;
}

function computeTilePosition(x, y, h) {
  return {
    x: x * 32 + h * 16 - 16,
    y: y * 16 + h * 8 - 8
  };
}

function decodeAndBlit(frame, dest, destWidth, destHeight, offsetX, offsetY, zoom, palette) {
  if (!frame) return;
  let data = frame;
  if (data[0] === 0x02 && data[1] === 0x00 && data[2] === 0x00 && data[3] === 0x00) {
    data = data.subarray(4);
  }
  const width = data[0] | (data[1] << 8);
  const height = data[2] | (data[3] << 8);
  const total = width * height;
  let i = 0;
  let idx = 4;
  while (i < total && idx < data.length) {
    const T = data[idx++];
    if ((T & 0x80) && T <= 0x80 + width) {
      i += T - 0x80;
    } else {
      for (let j = 0; j < T && i + j < total && idx + j < data.length; j++) {
        const pixel = data[idx + j];
        const localIndex = i + j;
        const localY = Math.floor(localIndex / width);
        const localX = localIndex % width;
        const baseX = offsetX + localX * zoom;
        const baseY = offsetY + localY * zoom;
        const color = palette[pixel] || palette[0];
        for (let zy = 0; zy < zoom; zy++) {
          const py = baseY + zy;
          if (py < 0 || py >= destHeight) continue;
          for (let zx = 0; zx < zoom; zx++) {
            const px = baseX + zx;
            if (px < 0 || px >= destWidth) continue;
            const outOffset = (py * destWidth + px) * 4;
            dest[outOffset] = color.r;
            dest[outOffset + 1] = color.g;
            dest[outOffset + 2] = color.b;
            dest[outOffset + 3] = 255;
          }
        }
      }
      idx += T;
      i += T;
    }
  }
}

function rasterizeMap(mapInstance, palette, options = {}) {
  const placements = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const tilesX = 64;
  const tilesY = 128;
  const zoom = options.zoom || 1;

  for (let layer = 0; layer < 2; layer++) {
    for (let y = 0; y < tilesY; y++) {
      for (let h = 0; h < 2; h++) {
        for (let x = 0; x < tilesX; x++) {
          const frame = mapInstance.getTileBitmap(x, y, h, layer);
          if (!frame || typeof frame.width !== 'number' || typeof frame.height !== 'number') {
            continue;
          }
          const pos = computeTilePosition(x, y, h);
          placements.push({ frame, x: pos.x, y: pos.y, layer, ySort: pos.y });
          minX = Math.min(minX, pos.x);
          minY = Math.min(minY, pos.y);
          maxX = Math.max(maxX, pos.x + frame.width);
          maxY = Math.max(maxY, pos.y + frame.height);
        }
      }
    }
  }

  if (!placements.length) {
    return null;
  }

  minX = Math.floor(minX);
  minY = Math.floor(minY);
  const width = Math.ceil(maxX - minX);
  const height = Math.ceil(maxY - minY);
  const outputWidth = Math.max(1, Math.round(width * zoom));
  const outputHeight = Math.max(1, Math.round(height * zoom));
  const buffer = new Uint8ClampedArray(outputWidth * outputHeight * 4);

  // Draw bottom layers first by y-sort then layer.
  placements.sort((a, b) => {
    if (a.ySort === b.ySort) {
      return a.layer - b.layer;
    }
    return a.ySort - b.ySort;
  });

  placements.forEach((placement) => {
    const offsetX = Math.round((placement.x - minX) * zoom);
    const offsetY = Math.round((placement.y - minY) * zoom);
    decodeAndBlit(placement.frame, buffer, outputWidth, outputHeight, offsetX, offsetY, zoom, palette);
  });

  const bounds = {
    minX,
    minY,
    maxX: Math.ceil(maxX),
    maxY: Math.ceil(maxY),
    width,
    height
  };

  return { width: outputWidth, height: outputHeight, data: buffer, bounds };
}

function savePNG(image, targetPath) {
  return new Promise((resolve, reject) => {
    const png = new PNG({ width: image.width, height: image.height });
    png.data.set(image.data);
    png.pack()
      .pipe(fs.createWriteStream(targetPath))
      .on('finish', resolve)
      .on('error', reject);
  });
}

(async function main() {
  try {
    const { MKF, Map } = await bootstrapModules();
    const options = parseArgs();
    ensureDir(options.outDir);

    const mapPath = path.join(PAL_ASSET_DIR, 'MAP.MKF');
    const gopPath = path.join(PAL_ASSET_DIR, 'GOP.MKF');
    if (!fs.existsSync(mapPath) || !fs.existsSync(gopPath)) {
      console.error('[export-overviews] MAP.MKF or GOP.MKF missing in pal-assets');
      process.exit(1);
    }
    const mapMKF = new MKF(loadFileBytes(mapPath));
    const gopMKF = new MKF(loadFileBytes(gopPath));
    const palette = loadPalette(MKF);
    const mapSceneMapping = buildSceneMapping(MKF);
    const manifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      zoom: options.zoom,
      maps: {},
      scenes: {}
    };

    const totalMaps = mapMKF.getChunkCount();
    const mapIds = Array.isArray(options.mapIds) && options.mapIds.length
      ? options.mapIds
      : Array.from({ length: totalMaps }, (_, idx) => idx);

    for (const mapId of mapIds) {
      try {
        const mapInstance = Map.fromFile(mapId, mapMKF, gopMKF);
        if (!mapInstance) {
          console.warn(`[export-overviews] Map ${mapId} missing, skipped`);
          continue;
        }
        const image = rasterizeMap(mapInstance, palette, { zoom: options.zoom });
        if (!image) {
          console.warn(`[export-overviews] Map ${mapId} produced empty image`);
          continue;
        }
        const mapLabel = options.zeroPad
          ? String(mapId).padStart(3, '0')
          : String(mapId);
        const filename = `${options.prefix}${mapLabel}.png`;
        const targetPath = path.join(options.outDir, filename);
        await savePNG(image, targetPath);
        const relatedScenes = mapSceneMapping.get(mapId) || [];
        manifest.maps[mapId] = {
          mapId,
          image: filename,
          bounds: image.bounds,
          imageSize: { width: image.width, height: image.height },
          scenes: relatedScenes.slice()
        };
        relatedScenes.forEach((sceneId) => {
          manifest.scenes[sceneId] = { sceneId, mapId };
        });
        console.log(`[export-overviews] wrote ${targetPath}`);
      } catch (err) {
        console.warn(`[export-overviews] failed map ${mapId}:`, err && err.message ? err.message : err);
      }
    }
    const manifestPath = path.join(options.outDir, MANIFEST_NAME);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`[export-overviews] wrote manifest ${manifestPath}`);
    console.log('[export-overviews] done');
  } catch (err) {
    console.error('[export-overviews] fatal', err);
    process.exit(1);
  }
})();
