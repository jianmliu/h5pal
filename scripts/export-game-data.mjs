#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'fs/promises';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const DEFAULT_ASSET_DIR = resolve(projectRoot, 'pal-assets');
const DEFAULT_OUTPUT_PATH = resolve(projectRoot, 'pal-assets', 'game-data.json');

class MKFReader {
  constructor(uint8Array) {
    this.buffer = uint8Array;
    this.view = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
    this.chunkCount = this._getChunkCount();
  }

  _getChunkCount() {
    if (this.buffer.byteLength < 8) {
      return 0;
    }
    const tableSize = this.view.getUint32(0, true);
    if (tableSize < 8) {
      return 0;
    }
    return Math.max(0, (tableSize >>> 2) - 1);
  }

  readChunk(index) {
    if (index < 0 || index >= this.chunkCount) {
      return new Uint8Array(0);
    }
    const tableOffset = index * 4;
    const nextOffset = (index + 1) * 4;
    if ((nextOffset + 4) > this.buffer.byteLength) {
      return new Uint8Array(0);
    }
    const start = this.view.getUint32(tableOffset, true);
    const end = this.view.getUint32(nextOffset, true);
    if (end <= start || end > this.buffer.length) {
      return new Uint8Array(0);
    }
    return this.buffer.subarray(start, end);
  }
}

const EXPORT_CONFIG = {
  SSS: {
    eventObject: 0,
    scene: 1,
    object: 2,
    scriptEntry: 4
  },
  DATA: {
    store: 0,
    enemy: 1,
    enemyTeam: 2,
    playerRoles: 3,
    magic: 4,
    battleField: 5,
    levelUpMagic: 6,
    battleEffectIndex: 11,
    enemyPos: 13,
    levelUpExp: 14
  }
};

function parseArgs(argv) {
  const args = { assets: DEFAULT_ASSET_DIR, output: DEFAULT_OUTPUT_PATH, pretty: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--assets' && argv[i + 1]) {
      args.assets = resolve(argv[++i]);
    } else if ((arg === '--output' || arg === '-o') && argv[i + 1]) {
      args.output = resolve(argv[++i]);
    } else if (arg === '--pretty') {
      args.pretty = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }
  return args;
}

function toBase64(view) {
  return Buffer.from(view).toString('base64');
}

async function ensureDirectory(filePath) {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
}

async function loadMKF(assetDir, name, cache) {
  if (cache.has(name)) {
    return cache.get(name);
  }
  const filePath = join(assetDir, `${name}.MKF`);
  const buffer = await readFile(filePath);
  const mkf = new MKFReader(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  cache.set(name, mkf);
  return mkf;
}

export async function exportGameData(options = {}) {
  const assetDir = options.assets ? resolve(options.assets) : DEFAULT_ASSET_DIR;
  const outputPath = options.output ? resolve(options.output) : DEFAULT_OUTPUT_PATH;
  const pretty = Boolean(options.pretty);

  const mkfCache = new Map();
  const files = {};

  for (const [mkfName, entries] of Object.entries(EXPORT_CONFIG)) {
    const mkf = await loadMKF(assetDir, mkfName, mkfCache);
    const fileResult = {};
    for (const [label, chunkIndex] of Object.entries(entries)) {
      const chunk = mkf.readChunk(chunkIndex);
      if (!chunk || chunk.length === 0) {
        fileResult[label] = {
          chunk: chunkIndex,
          encoding: 'base64',
          length: chunk ? chunk.length : 0,
          data: ''
        };
        continue;
      }
      fileResult[label] = {
        chunk: chunkIndex,
        encoding: 'base64',
        length: chunk.length,
        data: toBase64(chunk)
      };
    }
    files[mkfName] = fileResult;
  }

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    assets: {
      directory: assetDir
    },
    files
  };

  await ensureDirectory(outputPath);
  await writeFile(
    outputPath,
    JSON.stringify(payload, null, pretty ? 2 : 0),
    'utf8'
  );

  return { outputPath, files: Object.keys(files).length };
}

async function runCLI() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    const message = [
      'Usage: node scripts/export-game-data.mjs [options]',
      '',
      'Options:',
      '  --assets <dir>   Path to PAL asset directory (default: pal-assets)',
      '  --output <file>  Output JSON path (default: pal-assets/game-data.json)',
      '  --pretty         Pretty-print the generated JSON',
      '  -h, --help       Show this help message'
    ].join('\n');
    console.log(message);
    return 0;
  }

  try {
    const result = await exportGameData({ assets: args.assets, output: args.output, pretty: args.pretty });
    console.log(`Exported game data to ${result.outputPath}`);
    return 0;
  } catch (err) {
    console.error('Failed to export game data:', err);
    return 1;
  }
}

if (resolve(process.argv[1] || '') === __filename) {
  runCLI()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error('Failed to export game data:', error);
      process.exit(1);
    });
}
