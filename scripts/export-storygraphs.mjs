#!/usr/bin/env node
import fs from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import util from 'util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT = path.resolve(ROOT, '../ultimate/pal-assets/exported-storygraphs');
const outputArg = process.argv[2];
const OUTPUT_DIR = path.resolve(process.cwd(), outputArg || DEFAULT_OUTPUT);
const ASSET_DIR = path.resolve(ROOT, 'pal-assets');
const MOD_ASSET_DIR = path.join(ASSET_DIR, 'exported-assets');
const MOD_SPRITE_DIR = path.join(ASSET_DIR, 'exported-sprites');

function normalizeBase(dirPath) {
  let resolved = path.resolve(dirPath);
  if (!resolved.endsWith(path.sep)) {
    resolved += path.sep;
  }
  return resolved.replace(/\\/g, '/');
}

function ensureDomStubs() {
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = {};
  }
  if (typeof globalThis.document === 'undefined') {
    const body = {
      appendChild() {},
      removeChild() {},
      contains() { return false; }
    };
    globalThis.document = {
      body,
      createElement(tag) {
        if (tag === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext() {
              return {};
            }
          };
        }
        return {
          style: {},
          getContext() {
            return {};
          }
        };
      },
      getElementById() { return null; }
    };
  }
  if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { userAgent: 'node', language: 'en-US' };
  }
  if (typeof globalThis.window.addEventListener !== 'function') {
    globalThis.window.addEventListener = () => {};
  }
  if (typeof globalThis.window.removeEventListener !== 'function') {
    globalThis.window.removeEventListener = () => {};
  }
  if (!globalThis.window.document) {
    globalThis.window.document = globalThis.document;
  }
  if (typeof globalThis.PAL_CLASSIC === 'undefined') {
    globalThis.PAL_CLASSIC = false;
  }
  if (typeof globalThis.sprintf !== 'function') {
    globalThis.sprintf = util.format;
  }
  const typedArrays = [
    'ArrayBuffer',
    'Uint8Array',
    'Uint16Array',
    'Uint32Array',
    'Int8Array',
    'Int16Array',
    'Int32Array',
    'Float32Array',
    'Float64Array',
    'Uint8ClampedArray',
    'DataView'
  ];
  typedArrays.forEach((name) => {
    if (typeof globalThis[name] === 'function' && !globalThis.window[name]) {
      globalThis.window[name] = globalThis[name];
    }
  });
}

class FileXMLHttpRequest {
  constructor() {
    this.method = 'GET';
    this.url = '';
    this.responseType = '';
    this.status = 0;
    this.response = null;
    this.async = true;
  }

  open(method, url) {
    this.method = method;
    this.url = url;
  }

  overrideMimeType() {}

  send() {
    const targetPath = resolvePath(this.url);
    fs.readFile(targetPath, (err, buffer) => {
      if (err) {
        this.status = err.code === 'ENOENT' ? 404 : 500;
        if (this.status === 404 && typeof this.onload === 'function') {
          this.response = null;
          this.onload({ target: this });
        } else if (typeof this.onerror === 'function') {
          this.onerror(err);
        }
        return;
      }
      this.status = 200;
      if (this.responseType === 'arraybuffer') {
        const bufferSlice = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        this.response = bufferSlice;
      } else {
        this.response = buffer.toString('binary');
      }
      if (typeof this.onprogress === 'function') {
        this.onprogress({ lengthComputable: true, loaded: buffer.byteLength, total: buffer.byteLength });
      }
      if (typeof this.onload === 'function') {
        this.onload({ target: this });
      }
    });
  }
}

function resolvePath(target) {
  if (!target) {
    return path.join(ASSET_DIR, 'missing');
  }
  if (target.startsWith('file://')) {
    return fileURLToPath(target);
  }
  if (target.startsWith('http://') || target.startsWith('https://')) {
    throw new Error('HTTP(S) fetch not supported in export script: ' + target);
  }
  if (path.isAbsolute(target)) {
    return target;
  }
  return path.resolve(ROOT, target);
}

function installEnvironment() {
  ensureDomStubs();
  globalThis.XMLHttpRequest = FileXMLHttpRequest;
  const config = {
    assetBaseUrl: normalizeBase(ASSET_DIR),
    enableModAssets: true,
    modAssetBaseUrl: normalizeBase(MOD_ASSET_DIR),
    modSpriteBaseUrl: normalizeBase(MOD_SPRITE_DIR)
  };
  globalThis.window.PAL_CONFIG = Object.assign({}, config, globalThis.window.PAL_CONFIG || {});
  globalThis.PAL_CONFIG = globalThis.window.PAL_CONFIG;
}

async function ensureGameData(worldService, applyGeneratedGameData) {
  const payloadPath = path.join(ASSET_DIR, 'game-data.json');
  const raw = await readFile(payloadPath, 'utf8');
  const payload = JSON.parse(raw);
  if (!applyGeneratedGameData(payload, worldService)) {
    throw new Error('Failed to apply game-data.json payload');
  }
}

async function main() {
  installEnvironment();
  await import('../src/js/pal/common.js');
  globalThis.PAL_CLASSIC = false;
  await import('../src/js/pal/binary-helper.js');
  await import('../src/js/pal/pal-global.js');
  const [{ applyGeneratedGameData }, { default: worldService }, { default: stateService }, { buildStoryGraphForScene }] = await Promise.all([
    import('../src/services/generated-game-data.js'),
    import('../src/services/world-service.js'),
    import('../src/services/state-service.js'),
    import('../src/tools/storygraph-export.js')
  ]);

  await ensureGameData(worldService, applyGeneratedGameData);
  worldService.init();

  const scenes = stateService.getGameData('scene') || [];
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('No scenes available in game data');
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  const manifestEntries = [];
  for (let sceneId = 1; sceneId <= scenes.length; sceneId++) {
    const sceneEntry = scenes[sceneId - 1];
    if (!sceneEntry) {
      continue;
    }
    try {
      const graph = await buildStoryGraphForScene(sceneId);
      const filename = `scene-${sceneId}.json`;
      const filePath = path.join(OUTPUT_DIR, filename);
      await writeFile(filePath, JSON.stringify(graph, null, 2));
      console.log(`[storygraph] exported scene ${sceneId} -> ${filePath}`);
      manifestEntries.push({
        sceneId,
        filename,
        totalEvents: graph?.metadata?.totalEvents ?? null,
        hasNarrative: Boolean(graph?.metadata?.narrative?.dialogues?.length)
      });
    } catch (err) {
      console.warn(`[storygraph] failed scene ${sceneId}: ${err.message}`);
    }
  }

  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  const manifest = {
    generatedAt: new Date().toISOString(),
    sceneCount: scenes.length,
    exportedCount: manifestEntries.length,
    outputDir: OUTPUT_DIR,
    entries: manifestEntries
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`[storygraph] manifest -> ${manifestPath}`);
}

main().catch((err) => {
  console.error('[storygraph] export failed', err);
  process.exitCode = 1;
});
