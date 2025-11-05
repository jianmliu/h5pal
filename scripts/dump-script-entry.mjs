#!/usr/bin/env node

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function usage() {
  console.log('Usage: node scripts/dump-script-entry.mjs <entryId> [entries...]');
}

function decodeBase64(entry) {
  if (!entry || typeof entry !== 'object' || entry.encoding !== 'base64') {
    return null;
  }
  const buffer = Buffer.from(entry.data || '', 'base64');
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

async function loadGameData() {
  const filePath = path.resolve(projectRoot, 'pal-assets', 'game-data.json');
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const ids = process.argv.slice(2).map((arg) => Number(arg));
  if (!ids.length || ids.some((value) => !Number.isFinite(value))) {
    usage();
    process.exit(ids.length ? 1 : 0);
  }

  const payload = await loadGameData();
  const scriptEntryChunk = payload?.files?.SSS?.scriptEntry;
  if (!scriptEntryChunk) {
    console.error('scriptEntry chunk is missing from game-data.json');
    process.exit(1);
  }

  const binaryHelperUrl = new URL('../src/js/pal/binary-helper.js', import.meta.url);
  const palGlobalUrl = new URL('../src/js/pal/pal-global.js', import.meta.url);

  globalThis.window = globalThis;
  globalThis.document = {};
  globalThis.navigator = { userAgent: 'node' };
  globalThis.PAL_CLASSIC = false;
  globalThis.PAL_HAS_MMUSIC = false;

  await import(binaryHelperUrl);
  await import(palGlobalUrl);

  const bytes = decodeBase64(scriptEntryChunk);
  if (!(bytes instanceof Uint8Array)) {
    console.error('Failed to decode scriptEntry chunk');
    process.exit(1);
  }

  const entries = readTypedArray(globalThis.ScriptEntry, bytes);

  const results = ids.map((id) => {
    const entry = entries[id];
    if (!entry) {
      return { id, missing: true };
    }
    return { id, operation: entry.operation, operand: Array.from(entry.operand || []) };
  });

  console.log(JSON.stringify({ entries: results }, null, 2));
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});

