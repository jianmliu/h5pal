import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.PAL_CLASSIC === 'undefined') {
  globalThis.PAL_CLASSIC = false;
}

let ensureStructsPromise = null;
async function ensureStructs() {
  if (globalThis.SaveData) {
    return;
  }
  if (!ensureStructsPromise) {
    ensureStructsPromise = (async () => {
      const binaryHelperUrl = new URL('../src/js/pal/binary-helper.js', import.meta.url);
      const palGlobalUrl = new URL('../src/js/pal/pal-global.js', import.meta.url);
      await import(binaryHelperUrl);
      await import(palGlobalUrl);
      const SaveDataOriginal = globalThis.SaveData;
      if (SaveDataOriginal) {
        if (!Object.getOwnPropertyDescriptor(SaveDataOriginal.prototype, 'uint8Array')?.get) {
          Object.defineProperty(SaveDataOriginal.prototype, 'uint8Array', {
            configurable: true,
            enumerable: true,
            get() {
              if (!this._uint8Array) {
                const len = Math.max(Number(SaveDataOriginal.size) || Number(SaveDataOriginal.byteLength) || 0, 2);
                this._uint8Array = new Uint8Array(len);
              }
              return this._uint8Array;
            },
            set(value) {
              this._uint8Array = value;
            }
          });
        }
        const accessor = {
          configurable: true,
          enumerable: true,
          get() {
            const view = new DataView(this.uint8Array.buffer, this.uint8Array.byteOffset, this.uint8Array.byteLength);
            return view.getUint16(0, true);
          },
          set(value) {
            const view = new DataView(this.uint8Array.buffer, this.uint8Array.byteOffset, this.uint8Array.byteLength);
            const v = Math.trunc(value) & 0xFFFF;
            view.setUint16(0, v, true);
            if (v > 0) {
              globalThis.__lastSavedTimes = v;
            }
          }
        };
        Object.defineProperty(SaveDataOriginal.prototype, 'savedTimes', accessor);
        const PatchedSaveData = function(...args) {
          const inst = new SaveDataOriginal(...args);
          if (Object.prototype.hasOwnProperty.call(inst, 'savedTimes')) {
            const val = Number(inst.savedTimes) || 0;
            delete inst.savedTimes;
            Object.defineProperty(inst, 'savedTimes', accessor);
            if (val) inst.savedTimes = val;
          }
          return inst;
        };
        PatchedSaveData.size = SaveDataOriginal.size;
        PatchedSaveData.byteLength = SaveDataOriginal.byteLength;
        PatchedSaveData.prototype = SaveDataOriginal.prototype;
        globalThis.SaveData = PatchedSaveData;
      }
    })();
  }
  await ensureStructsPromise;
}

function clampSlot(value) {
  if (!Number.isFinite(value)) return null;
  const slot = Math.trunc(value);
  return slot >= 1 && slot <= 5 ? slot : null;
}

function buildPayload(saveData, buffer, options = {}) {
  const viewBuffer = buffer ?? saveData?.uint8Array ?? new Uint8Array(0);
  const view = new DataView(viewBuffer.buffer, viewBuffer.byteOffset, viewBuffer.byteLength);
  const savedTimes = Number.isFinite(options.savedTimes)
    ? Math.trunc(options.savedTimes) & 0xFFFF
    : view.getUint16(0, true);
  const timestamp = Number.isFinite(options.timestamp) ? Math.trunc(options.timestamp) : Date.now();
  const bytes = Array.from(viewBuffer);
  return {
    version: 1,
    savedTimes,
    timestamp,
    bytes
  };
}

export async function rpgBufferToPayload(buffer, options = {}) {
  await ensureStructs();
  const SaveData = globalThis.SaveData;
  let uint8;
  if (!buffer) {
    uint8 = new Uint8Array(SaveData?.size || 0);
  } else
  if (buffer instanceof Uint8Array) {
    uint8 = buffer;
  } else if (buffer instanceof ArrayBuffer) {
    uint8 = new Uint8Array(buffer);
  } else if (Array.isArray(buffer)) {
    uint8 = new Uint8Array(buffer);
  } else {
    throw new Error('Unsupported buffer type');
  }
  const structSize = Number(SaveData?.size) || uint8.byteLength;
  if (uint8.byteLength < structSize) {
    const padded = new Uint8Array(structSize);
    padded.set(uint8);
    uint8 = padded;
  } else if (uint8.byteLength > structSize) {
    uint8 = uint8.subarray(0, structSize);
  }

  const view = uint8.subarray(0, structSize);
  const dv = new DataView(view.buffer, view.byteOffset, view.byteLength);
  const incomingSaved = dv.getUint16(0, true) & 0xFFFF;
  const providedSaved = Number.isFinite(options.savedTimes) ? Math.trunc(options.savedTimes) & 0xFFFF : undefined;
  const resolvedSaved = providedSaved ?? incomingSaved ?? 0;

  dv.setUint16(0, resolvedSaved, true);

  const save = new SaveData(view);
  save.savedTimes = resolvedSaved;

  return buildPayload(save, save.uint8Array, { ...options, savedTimes: resolvedSaved });
}

function parseArgs(argv) {
  const options = {
    input: null,
    output: null,
    slot: null,
    savedTimes: undefined,
    timestamp: undefined,
    pretty: false,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '-i':
      case '--input':
        options.input = argv[++i];
        break;
      case '-o':
      case '--output':
        options.output = argv[++i];
        break;
      case '-s':
      case '--slot':
        options.slot = clampSlot(Number(argv[++i]));
        break;
      case '--saved-times':
        options.savedTimes = Number(argv[++i]);
        break;
      case '--timestamp':
        options.timestamp = Number(argv[++i]);
        break;
      case '--pretty':
        options.pretty = true;
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        if (!options.input) {
          options.input = arg;
        }
        break;
    }
  }

  return options;
}

function printUsage() {
  console.log(`Usage: node h5pal/scripts/import-rpg-save.mjs --input <SAVEDATA01.RPG> [options]\n\nOptions:\n  -i, --input <file>        Path to original RPG save file (required)\n  -o, --output <file>       Write converted JSON payload to file\n  -s, --slot <1-5>          Generate a localStorage snippet for the slot\n      --saved-times <num>   Override savedTimes counter\n      --timestamp <num>     Override timestamp (ms since epoch)\n      --pretty              Pretty-print JSON output\n  -h, --help                Show this help\n`);
}

async function runCli() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.input) {
    printUsage();
    if (!options.input) {
      process.exit(options.help ? 0 : 1);
    }
    return;
  }

  const inputPath = path.resolve(options.input);
  let buffer;
  try {
    buffer = await readFile(inputPath);
  } catch (err) {
    console.error('Failed to read input file:', err.message);
    process.exit(1);
  }

  let payload;
  try {
    payload = await rpgBufferToPayload(buffer, {
      savedTimes: options.savedTimes,
      timestamp: options.timestamp
    });
  } catch (err) {
    console.error('Failed to convert save file:', err.message);
    process.exit(1);
  }

  const json = JSON.stringify(payload, null, options.pretty ? 2 : 0);

  if (options.output) {
    const outputPath = path.resolve(options.output);
    await writeFile(outputPath, json, 'utf8');
    console.log(`Converted payload written to ${outputPath}`);
  } else if (!options.slot) {
    console.log(json);
  }

  if (options.slot) {
    const slotKey = options.slot;
    const snippet = `localStorage.setItem('PAL-SAVE-${slotKey}', ${JSON.stringify(JSON.stringify(payload))});`;
    console.log('\nPaste the following into the browser console to import the save:');
    console.log(snippet);
  }
}

const isCli = fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  runCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
