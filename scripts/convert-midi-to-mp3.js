#!/usr/bin/env node
import { promises as fsp } from 'fs';
import path from 'path';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const MIDI_DIR = path.resolve('pal-assets/MIDI');
const MP3_DIR = path.resolve('pal-assets/MP3');

async function commandExists(cmd) {
  try {
    await execFileAsync('which', [cmd]);
    return true;
  } catch {
    return false;
  }
}

async function ensureDependencies() {
  const missing = [];
  for (const cmd of ['timidity', 'ffmpeg']) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await commandExists(cmd))) missing.push(cmd);
  }
  if (missing.length) {
    throw new Error(`Missing required command(s): ${missing.join(', ')}. Please install them (e.g. via "brew install timidity ffmpeg").`);
  }
}

async function listMidiFiles() {
  const entries = await fsp.readdir(MIDI_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mid'))
    .map((entry) => path.join(MIDI_DIR, entry.name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function shouldSkipConversion(midiFile, mp3File) {
  try {
    const [midiStat, mp3Stat] = await Promise.all([fsp.stat(midiFile), fsp.stat(mp3File)]);
    return mp3Stat.mtimeMs >= midiStat.mtimeMs;
  } catch {
    return false;
  }
}

function convertMidi(midiFile, mp3File) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const done = (err) => {
      if (finished) return;
      finished = true;
      if (err) reject(err);
      else resolve();
    };

    const timidity = spawn('timidity', [midiFile, '-Ow', '-o', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const ffmpeg = spawn(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-qscale:a', '4', mp3File],
      { stdio: ['pipe', 'inherit', 'inherit'] },
    );

    const handleError = (err) => {
      timidity.kill('SIGTERM');
      ffmpeg.kill('SIGTERM');
      done(err);
    };

    timidity.on('error', handleError);
    ffmpeg.on('error', handleError);

    timidity.stdout.pipe(ffmpeg.stdin);

    timidity.on('close', (code) => {
      if (code !== 0) handleError(new Error(`timidity exited with code ${code} for ${path.basename(midiFile)}`));
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) done();
      else handleError(new Error(`ffmpeg exited with code ${code} for ${path.basename(midiFile)}`));
    });
  });
}

async function main() {
  await ensureDependencies();
  await fsp.mkdir(MP3_DIR, { recursive: true });

  const midiFiles = await listMidiFiles();
  if (midiFiles.length === 0) {
    console.warn('[midi->mp3] No MIDI files found. Run "npm run export:midi" first.');
    return;
  }

  for (const midiFile of midiFiles) {
    const mp3File = path.join(MP3_DIR, `${path.basename(midiFile, path.extname(midiFile))}.mp3`);
    // eslint-disable-next-line no-await-in-loop
    const shouldSkip = await shouldSkipConversion(midiFile, mp3File);
    if (shouldSkip) continue;
    console.log(`[midi->mp3] ${path.basename(midiFile)} -> ${path.relative(process.cwd(), mp3File)}`);
    // eslint-disable-next-line no-await-in-loop
    await convertMidi(midiFile, mp3File);
  }
}

main().catch((err) => {
  console.error('[midi->mp3] failed', err.message);
  process.exit(1);
});
