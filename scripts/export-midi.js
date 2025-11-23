#!/usr/bin/env node
import { promises as fsp } from 'fs';
import fs from 'fs';
import path from 'path';

const MKF_PATH = path.resolve('pal-assets/MIDI.MKF');
const OUTPUT_DIR = path.resolve('pal-assets/MIDI');

function readMKF(filePath) {
  const buffer = fs.readFileSync(filePath);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const tableSize = view.getUint32(0, true);
  if (tableSize % 4 !== 0) {
    throw new Error(`[export-midi] Invalid MKF header size: ${tableSize}`);
  }
  const entryCount = tableSize / 4;
  const count = entryCount - 1;
  const offsets = [];
  for (let i = 0; i < entryCount; i++) {
    offsets.push(view.getUint32(i * 4, true));
  }
  const lastOffset = offsets[offsets.length - 1];
  if (lastOffset !== buffer.byteLength) {
    throw new Error(`[export-midi] Unexpected sentinel offset: ${lastOffset}, file length: ${buffer.byteLength}`);
  }
  return { buffer, count, offsets };
}

async function main() {
  const { buffer, count, offsets } = readMKF(MKF_PATH);
  await fsp.mkdir(OUTPUT_DIR, { recursive: true });
  let exportIndex = 1;
  for (let i = 0; i < count; i++) {
    const start = offsets[i];
    const end = offsets[i + 1];
    if (start >= end) continue;
    const chunk = buffer.subarray(start, end);
    const filename = path.join(OUTPUT_DIR, `${exportIndex}.mid`);
    exportIndex += 1;
    console.log(`[export-midi] ${filename}`);
    await fsp.writeFile(filename, chunk);
  }
}

main().catch((err) => {
  console.error('[export-midi] failed', err);
  process.exit(1);
});
