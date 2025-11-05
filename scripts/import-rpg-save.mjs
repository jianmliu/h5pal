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
    })();
  }
  await ensureStructsPromise;
}

function clampSlot(value) {
  if (!Number.isFinite(value)) return null;
  const slot = Math.trunc(value);
  return slot >= 1 && slot <= 5 ? slot : null;
}

function buildPayload(saveData, options = {}) {
  const savedTimes = Number.isFinite(options.savedTimes)
    ? Math.trunc(options.savedTimes) & 0xFFFF
    : Number(saveData.savedTimes || 0) & 0xFFFF;
  const timestamp = Number.isFinite(options.timestamp)
    ? Math.trunc(options.timestamp)
    : Date.now();
  const bytes = Array.from(saveData.uint8Array);
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
  if (!buffer) {
    throw new Error('Missing save buffer');
  }
  let uint8;
  if (buffer instanceof Uint8Array) {
    uint8 = buffer;
  } else if (buffer instanceof ArrayBuffer) {
    uint8 = new Uint8Array(buffer);
  } else if (Array.isArray(buffer)) {
    uint8 = new Uint8Array(buffer);
  } else {
    throw new Error('Unsupported buffer type');
  }
  if (uint8.byteLength < SaveData.size) {
    const padded = new Uint8Array(SaveData.size);
    padded.set(uint8);
    uint8 = padded;
  } else if (uint8.byteLength > SaveData.size) {
    uint8 = uint8.subarray(0, SaveData.size);
  }

  const view = uint8.subarray(0, SaveData.size);
  const save = new SaveData(view);
  return buildPayload(save, options);
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
