import { rollup } from 'rollup';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distLibDir = path.resolve(projectRoot, 'dist/lib/mud');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function bundleEntry({ input, output, amdId }) {
  const bundle = await rollup({
    input,
    context: 'globalThis',
    plugins: [
      resolve({ browser: true, preferBuiltins: false }),
      commonjs(),
      json()
    ],
    onwarn(warning, warn) {
      if (warning.code === 'CIRCULAR_DEPENDENCY') {
        console.warn('[mud-vendor] circular dependency:', warning.importer);
        return;
      }
      warn(warning);
    }
  });

  await bundle.write({
    file: output,
    format: 'amd',
    sourcemap: true,
    inlineDynamicImports: true,
    amd: amdId ? { id: amdId } : undefined
  });
}

export default async function buildMudVendor() {
  await ensureDir(distLibDir);
  const entries = [
    {
      input: path.resolve(projectRoot, 'scripts/mud-vendor/recs-entry.js'),
      output: path.resolve(distLibDir, 'pal-mud-recs.js'),
      amdId: '@latticexyz/recs'
    },
    {
      input: path.resolve(projectRoot, 'scripts/mud-vendor/store-sync-entry.js'),
      output: path.resolve(distLibDir, 'pal-mud-store-sync.js'),
      amdId: '@latticexyz/store-sync'
    },
    {
      input: path.resolve(projectRoot, 'scripts/mud-vendor/viem-entry.js'),
      output: path.resolve(distLibDir, 'pal-mud-viem.js'),
      amdId: 'viem'
    }
  ];

  for (const entry of entries) {
    await bundleEntry(entry);
  }
}
