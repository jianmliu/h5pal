import fs from 'fs';
import path from 'path';

const ROOT = new URL('..', import.meta.url).pathname;
const ASSET_ROOT = path.join(ROOT, 'pal-assets');
const OUTPUT_ROOT = path.join(ASSET_ROOT, 'exported-assets');
const MKF_FILES = ['BALL.MKF', 'FBP.MKF', 'RGM.MKF', 'SSS.MKF'];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readMKF(filePath) {
  const buffer = fs.readFileSync(filePath);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const count = view.getUint16(0, true);
  const offsets = [];
  for (let i = 0; i <= count; i++) {
    offsets.push(view.getUint32(2 + i * 4, true));
  }
  return {
    buffer,
    count,
    getChunk(index) {
      if (index < 0 || index >= count) {
        return null;
      }
      const start = offsets[index];
      const end = offsets[index + 1];
      return buffer.subarray(start, end);
    }
  };
}

function decodeRLE(chunk) {
  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  const width = view.getUint16(0, true);
  const height = view.getUint16(2, true);
  const pixelOffset = view.getUint32(4, true);
  const output = new Uint8ClampedArray(width * height * 4);
  let dst = 0;
  let src = pixelOffset;
  while (src < chunk.length) {
    const opcode = chunk[src++];
    if (opcode === 0) {
      const count = chunk[src++];
      for (let i = 0; i < count; i++) {
        output[dst++] = 0;
        output[dst++] = 0;
        output[dst++] = 0;
        output[dst++] = 0;
      }
    } else {
      const count = opcode;
      for (let i = 0; i < count; i++) {
        const color = chunk[src++];
        output[dst++] = color;
        output[dst++] = color;
        output[dst++] = color;
        output[dst++] = 255;
      }
    }
  }
  return { width, height, data: output };
}

function writePNG({ width, height, data }, targetPath) {
  const { PNG } = require('pngjs');
  const png = new PNG({ width, height });
  data.copy(png.data);
  png.pack().pipe(fs.createWriteStream(targetPath));
}

(async function main() {
  ensureDir(OUTPUT_ROOT);
  for (const filename of MKF_FILES) {
    const sourcePath = path.join(ASSET_ROOT, filename);
    if (!fs.existsSync(sourcePath)) {
      console.warn(`[export] missing ${filename}`);
      continue;
    }
    const mkf = readMKF(sourcePath);
    const outputDir = path.join(OUTPUT_ROOT, path.basename(filename, '.MKF'));
    ensureDir(outputDir);
    for (let i = 0; i < mkf.count; i++) {
      const chunk = mkf.getChunk(i);
      if (!chunk) {
        continue;
      }
      try {
        const image = decodeRLE(chunk);
        const targetPath = path.join(outputDir, `${String(i).padStart(4, '0')}.png`);
        writePNG(image, targetPath);
      } catch (err) {
        console.warn(`[export] failed chunk ${i} in ${filename}:`, err.message);
      }
    }
  }
})();
