const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const ASSET_DIR = path.join(ROOT, 'pal-assets');
const SPRITE_OUTPUT_DIR = path.join(ASSET_DIR, 'exported-sprites');
const ASSET_OUTPUT_DIR = path.join(ASSET_DIR, 'exported-assets');
fs.mkdirSync(ASSET_OUTPUT_DIR, { recursive: true });

const SPRITE_MKFS = ['BALL.MKF', 'RGM.MKF'];
const BACKGROUND_MKF = 'FBP.MKF';
const AUDIO_MKFS = [
  { file: 'VOC.MKF', extension: 'voc', folder: 'audio/voc', manifestKey: 'voc' },
  { file: 'MIDI.MKF', extension: 'mid', folder: 'audio/midi', manifestKey: 'midi' },
  { file: 'MUS.MKF', extension: 'mus', folder: 'audio/mus', manifestKey: 'mus' }
];

const manifest = {
  version: 1,
  generatedAt: null,
  backgrounds: {},
  audio: {
    voc: {},
    midi: {},
    mus: {}
  }
};

const WORD = value => {
  let v = value & 0xffff;
  if (v < 0) {
    v += 0x10000;
  }
  return v;
};

function loadFileBytes(filePath) {
  const buf = fs.readFileSync(filePath);
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

function toPublicPath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function readMKF(filePath) {
  const buffer = loadFileBytes(filePath);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const firstOffset = view.getUint32(0, true);
  const chunkCount = Math.max(0, Math.floor((firstOffset - 4) / 4));
  const offsets = new Array(chunkCount + 1);
  for (let i = 0; i < offsets.length; i++) {
    offsets[i] = view.getUint32(i * 4, true);
  }

  return {
    chunkCount,
    getChunk(index) {
      if (index < 0 || index >= chunkCount) {
        return null;
      }
      const start = offsets[index];
      const end = offsets[index + 1];
      if (end <= start) {
        return null;
      }
      return new Uint8Array(buffer.buffer, buffer.byteOffset + start, end - start);
    }
  };
}

function loadPalette() {
  const patPath = path.join(ASSET_DIR, 'PAT.MKF');
  if (!fs.existsSync(patPath)) {
    throw new Error('PAT.MKF missing — cannot decode palette colors');
  }
  const mkf = readMKF(patPath);
  const chunk = mkf.getChunk(0);
  if (!chunk || chunk.length < 256 * 3 * 2) {
    throw new Error('Invalid palette chunk');
  }
  const palette = new Array(256);
  for (let i = 0; i < 256; i++) {
    const r = chunk[i * 3] << 2;
    const g = chunk[i * 3 + 1] << 2;
    const b = chunk[i * 3 + 2] << 2;
    palette[i] = [r, g, b];
  }
  palette[0] = [0, 0, 0];
  return palette;
}

function readFrameCount(view) {
  if (view.byteLength < 2) return 0;
  const tableCount = view.getUint16(0, true);
  if (!Number.isFinite(tableCount) || tableCount <= 1) {
    return 0;
  }
  return tableCount - 1;
}

function getFrameOffset(view, frameIndex, chunkLength) {
  const tableOffset = frameIndex << 1;
  if (tableOffset < 0 || tableOffset + 2 > chunkLength) {
    return -1;
  }
  const offsetWord = view.getUint16(tableOffset, true);
  const offset = WORD(offsetWord << 1);
  if (!Number.isFinite(offset) || offset < 0 || offset >= chunkLength) {
    return -1;
  }
  return offset;
}

function decodeRLEFrame(frameOffset, chunk) {
  let buffer = new Uint8Array(chunk.buffer, chunk.byteOffset + frameOffset, chunk.length - frameOffset);
  if (buffer.length < 4) {
    return null;
  }
  if (buffer[0] === 0x02 && buffer[1] === 0x00 && buffer[2] === 0x00 && buffer[3] === 0x00) {
    buffer = buffer.subarray(4);
    if (buffer.length < 4) {
      return null;
    }
  }
  const width = buffer[0] | (buffer[1] << 8);
  const height = buffer[2] | (buffer[3] << 8);
  if (!width || !height) {
    return null;
  }
  const totalPixels = width * height;
  const pixels = new Uint8Array(totalPixels);
  let dst = 0;
  let src = 4;
  while (dst < totalPixels && src < buffer.length) {
    const T = buffer[src++];
    if ((T & 0x80) && T <= 0x80 + width) {
      dst += (T - 0x80);
    } else {
      for (let j = 0; j < T && dst < totalPixels && src < buffer.length; j++, dst++) {
        pixels[dst] = buffer[src++];
      }
    }
  }
  return { width, height, pixels };
}

function decodeSprite(chunk) {
  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  const frameCount = readFrameCount(view);
  const frames = [];
  if (!frameCount) {
    return frames;
  }
  for (let i = 0; i < frameCount; i++) {
    const offset = getFrameOffset(view, i, chunk.length);
    if (offset < 0) {
      frames.push(null);
      continue;
    }
    const frame = decodeRLEFrame(offset, chunk);
    frames.push(frame);
  }
  return frames;
}

function writePNG(image, target) {
  const png = new PNG({ width: image.width, height: image.height });
  png.data.set(image.data);
  png.pack().pipe(fs.createWriteStream(target));
}

function exportSprites(palette) {
  fs.mkdirSync(SPRITE_OUTPUT_DIR, { recursive: true });
  for (const filename of SPRITE_MKFS) {
    const sourcePath = path.join(ASSET_DIR, filename);
    if (!fs.existsSync(sourcePath)) {
      console.warn(`[export] missing ${filename}`);
      continue;
    }
    const mkf = readMKF(sourcePath);
    const folder = path.join(SPRITE_OUTPUT_DIR, path.basename(filename, '.MKF').toLowerCase());
    fs.mkdirSync(folder, { recursive: true });
    for (let i = 0; i < mkf.chunkCount; i++) {
      const chunk = mkf.getChunk(i);
      if (!chunk) continue;
      try {
        const frames = decodeSprite(chunk);
        frames.forEach((frame, idx) => {
          if (!frame) {
            return;
          }
          const rgba = new Uint8Array(frame.width * frame.height * 4);
          for (let px = 0; px < frame.pixels.length; px++) {
            const paletteIndex = frame.pixels[px];
            const [r, g, b] = palette[paletteIndex] || [0, 0, 0];
            const base = px * 4;
            rgba[base] = r;
            rgba[base + 1] = g;
            rgba[base + 2] = b;
            rgba[base + 3] = paletteIndex === 0 ? 0 : 255;
          }
          const targetPath = path.join(
            folder,
            `${String(i).padStart(4, '0')}-${idx}.png`
          );
          writePNG({ width: frame.width, height: frame.height, data: rgba }, targetPath);
        });
      } catch (err) {
        console.warn(`[export] skipped ${filename} chunk ${i}: ${err.message}`);
      }
    }
  }
}

function read2Bytes(buf, offset) {
  return (buf[offset] | (buf[offset + 1] << 8)) & 0xffff;
}

function read4Bytes(buf, offset) {
  return (buf[offset] |
    (buf[offset + 1] << 8) |
    (buf[offset + 2] << 16) |
    (buf[offset + 3] << 24)) >>> 0;
}

function readString(buf, offset, len) {
  let out = '';
  for (let i = 0; i < len; i++) {
    const code = buf[offset + i];
    if (!code) continue;
    out += String.fromCharCode(code);
  }
  return out;
}

const utils = {
  startTiming() {},
  endTiming() {},
  initArray(Type, len) {
    const arr = new Array(len);
    for (let i = 0; i < len; i++) {
      arr[i] = new Type();
    }
    return arr;
  }
};

function TreeNode() {
  this.value = 0;
  this.leaf = 0;
  this.left = -1;
  this.right = -1;
}

function YJ1FileHeader(buf) {
  if (!buf) return;
  this.buffer = buf;
  this.Signature = readString(buf, 0, 4);
  this.UncompressedLength = read4Bytes(buf, 4);
  this.CompressedLength = read4Bytes(buf, 8);
  this.BlockCount = read2Bytes(buf, 12);
  this.Unknown = buf[14];
  this.HuffmanTreeLength = buf[15];
}

function YJ1BlockHeader(buf) {
  if (!buf) return;
  this.buffer = buf;
  this.UncompressedLength = read2Bytes(buf, 0);
  this.CompressedLength = read2Bytes(buf, 2);
  if (!this.CompressedLength) {
    this.LZSSRepeatTable = new Uint16Array(4);
    this.LZSSOffsetCodeLengthTable = new Uint8Array(4);
    this.LZSSRepeatCodeLengthTable = new Uint8Array(3);
    this.CodeCountCodeLengthTable = new Uint8Array(3);
    this.CodeCountTable = new Uint8Array(2);
    return;
  }
  const offset = buf.byteOffset;
  this.LZSSRepeatTable = new Uint16Array(buf.buffer, offset + 4, 4);
  this.LZSSOffsetCodeLengthTable = new Uint8Array(buf.buffer, offset + 12, 4);
  this.LZSSRepeatCodeLengthTable = new Uint8Array(buf.buffer, offset + 16, 3);
  this.CodeCountCodeLengthTable = new Uint8Array(buf.buffer, offset + 19, 3);
  this.CodeCountTable = new Uint8Array(buf.buffer, offset + 22, 2);
}

let bitptr = 0;

function getBits(src, count) {
  const tempOffset = (bitptr >> 4) << 1;
  const bptr = bitptr & 0xf;
  let ret;
  bitptr += count;
  if (count > 16 - bptr) {
    const mask = 0xffff >> bptr;
    count = count + bptr - 16;
    ret = (((src[tempOffset + 0] | (src[tempOffset + 1] << 8)) & mask) << count) |
      ((src[tempOffset + 2] | (src[tempOffset + 3] << 8)) >> (16 - count));
  } else {
    ret = ((((src[tempOffset + 0] | (src[tempOffset + 1] << 8)) << bptr) & 0xffff) >> (16 - count));
  }
  return ret;
}

function getLoop(src, header) {
  if (getBits(src, 1)) {
    return header.CodeCountTable[0];
  }
  const temp = getBits(src, 2);
  if (temp) {
    return getBits(src, header.CodeCountCodeLengthTable[temp - 1]);
  }
  return header.CodeCountTable[1];
}

function getCount(src, header) {
  const temp = getBits(src, 2);
  if (temp) {
    if (getBits(src, 1)) {
      return getBits(src, header.LZSSRepeatCodeLengthTable[temp - 1]);
    }
    return header.LZSSRepeatTable[temp];
  }
  return header.LZSSRepeatTable[0];
}

function decompressYJ1(source) {
  const hdr = new YJ1FileHeader(source);
  if (!hdr || hdr.Signature !== 'YJ_1') {
    return new Uint8Array(0);
  }
  const destination = new Uint8Array(hdr.UncompressedLength);
  let dest = destination;
  let src = source;
  let root;
  let node;

  do {
    const treeLen = hdr.HuffmanTreeLength * 2;
    const flag = src.subarray(16 + treeLen);
    bitptr = 0;
    root = utils.initArray(TreeNode, treeLen + 1);
    root[0].leaf = 0;
    root[0].value = 0;
    root[0].left = 1;
    root[0].right = 2;
    for (let i = 1; i <= treeLen; i++) {
      root[i].leaf = !getBits(flag, 1);
      root[i].value = src[15 + i];
      if (root[i].leaf) {
        root[i].left = -1;
        root[i].right = -1;
      } else {
        root[i].left = (root[i].value << 1) + 1;
        root[i].right = root[i].left + 1;
      }
    }
    const skip = ((treeLen & 0xf) ? (treeLen >> 4) + 1 : (treeLen >> 4)) << 1;
    src = src.subarray(16 + treeLen + skip);
  } while (0);

  for (let i = 0; i < hdr.BlockCount; i++) {
    const header = new YJ1BlockHeader(src);
    src = src.subarray(4);
    if (!header.CompressedLength) {
      let remain = header.UncompressedLength;
      while (remain-- && src.length) {
        dest[0] = src[0];
        dest = dest.subarray(1);
        src = src.subarray(1);
      }
      continue;
    }
    src = src.subarray(20);
    bitptr = 0;
    while (true) {
      let loop = getLoop(src, header);
      if (loop === 0) {
        break;
      }
      while (loop--) {
        node = 0;
        while (!root[node].leaf) {
          node = getBits(src, 1) ? root[node].right : root[node].left;
        }
        dest[0] = root[node].value;
        dest = dest.subarray(1);
      }
      loop = getLoop(src, header);
      if (loop === 0) {
        break;
      }
      while (loop--) {
        let count = getCount(src, header);
        let pos = getBits(src, 2);
        pos = getBits(src, header.LZSSOffsetCodeLengthTable[pos]);
        while (count--) {
          dest[0] = destination[dest.byteOffset - pos];
          dest = dest.subarray(1);
        }
      }
    }
    src = header.buffer.subarray(header.CompressedLength);
  }
  return destination;
}

function maybeDecompress(chunk) {
  if (!chunk || chunk.length < 4) {
    return chunk;
  }
  if (chunk[0] === 0x59 && chunk[1] === 0x4a && chunk[2] === 0x5f && chunk[3] === 0x31) {
    const decompressed = decompressYJ1(chunk);
    return decompressed.length ? decompressed : chunk;
  }
  return chunk;
}

function exportBackgrounds(palette) {
  const sourcePath = path.join(ASSET_DIR, BACKGROUND_MKF);
  if (!fs.existsSync(sourcePath)) {
    console.warn(`[export] missing ${BACKGROUND_MKF}`);
    return;
  }
  const mkf = readMKF(sourcePath);
  const folder = path.join(ASSET_OUTPUT_DIR, 'fbp');
  fs.mkdirSync(folder, { recursive: true });
  for (let i = 0; i < mkf.chunkCount; i++) {
    const chunk = mkf.getChunk(i);
    if (!chunk) continue;
    try {
      const raw = maybeDecompress(chunk);
      if (!raw || !raw.length) continue;
      const width = 320;
      if (raw.length % width !== 0) {
        console.warn(`[export] skipped FBP chunk ${i}: unexpected length ${raw.length}`);
        continue;
      }
      const height = raw.length / width;
      const rgba = new Uint8Array(raw.length * 4);
      for (let px = 0; px < raw.length; px++) {
        const paletteIndex = raw[px];
        const [r, g, b] = palette[paletteIndex] || [0, 0, 0];
        const base = px * 4;
        rgba[base] = r;
        rgba[base + 1] = g;
        rgba[base + 2] = b;
        rgba[base + 3] = paletteIndex === 0 ? 0 : 255;
      }
      const targetPath = path.join(folder, `${String(i).padStart(4, '0')}.png`);
      writePNG({ width, height, data: rgba }, targetPath);
      manifest.backgrounds[String(i)] = {
        path: toPublicPath(targetPath),
        width,
        height
      };
    } catch (err) {
      console.warn(`[export] skipped FBP chunk ${i}: ${err.message}`);
    }
  }
}

function exportAudioAssets() {
  fs.mkdirSync(ASSET_OUTPUT_DIR, { recursive: true });
  for (const config of AUDIO_MKFS) {
    const sourcePath = path.join(ASSET_DIR, config.file);
    if (!fs.existsSync(sourcePath)) {
      console.warn(`[export] missing ${config.file}`);
      continue;
    }
    const mkf = readMKF(sourcePath);
    const folder = path.join(ASSET_OUTPUT_DIR, config.folder);
    fs.mkdirSync(folder, { recursive: true });
    for (let i = 0; i < mkf.chunkCount; i++) {
      const chunk = mkf.getChunk(i);
      if (!chunk || !chunk.length) continue;
      const targetPath = path.join(
        folder,
        `${String(i).padStart(4, '0')}.${config.extension}`
      );
      fs.writeFileSync(targetPath, Buffer.from(chunk));
      if (manifest.audio[config.manifestKey]) {
        manifest.audio[config.manifestKey][String(i)] = toPublicPath(targetPath);
      }
    }
  }
}

function main() {
  let palette;
  try {
    palette = loadPalette();
  } catch (err) {
    console.error(`[export] ${err.message}`);
    process.exitCode = 1;
    return;
  }
  exportSprites(palette);
  exportBackgrounds(palette);
  exportAudioAssets();
  manifest.generatedAt = new Date().toISOString();
  const manifestPath = path.join(ASSET_OUTPUT_DIR, 'mod-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('[export] done');
}

main();
