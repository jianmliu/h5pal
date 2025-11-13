#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveContractsDir, runMud, projectRoot } from './mud-utils.js';

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyAbiIfRequested(contractsDir) {
  const abiSource = process.env.MUD_WORLD_ABI;
  if (!abiSource) {
    console.log('[mud:codegen] MUD_WORLD_ABI not set, skipping ABI copy');
    return;
  }

  const resolvedSource = path.isAbsolute(abiSource)
    ? abiSource
    : path.resolve(contractsDir, abiSource);

  if (!(await fileExists(resolvedSource))) {
    throw new Error(`[mud:codegen] Unable to locate ABI at ${resolvedSource}`);
  }

  const targetPath = path.resolve(projectRoot, 'src/mud/worldAbi.json');
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(resolvedSource, targetPath);
  console.log(`[mud:codegen] Copied ABI to ${path.relative(projectRoot, targetPath)}`);
}

async function main() {
  const contractsDir = resolveContractsDir();
  const mudArgs = ['build', ...process.argv.slice(2)];

  console.log(`[mud:codegen] Contracts dir: ${contractsDir}`);
  console.log(`[mud:codegen] Running: mud ${mudArgs.join(' ')}`);
  await runMud(mudArgs, { cwd: contractsDir });
  await copyAbiIfRequested(contractsDir);
}

main().catch((err) => {
  console.error('[mud:codegen] failed', err);
  process.exit(1);
});
