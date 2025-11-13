#!/usr/bin/env node
import 'dotenv/config';
import { resolveContractsDir, runMud } from './mud-utils.js';

async function main() {
  const contractsDir = resolveContractsDir();
  const extraArgs = process.argv.slice(2);
  const hasProfile = extraArgs.some((arg) => arg.startsWith('--profile'));
  const defaultProfile = process.env.MUD_PROFILE || 'local';
  const args = ['deploy'];

  if (!hasProfile && defaultProfile) {
    args.push(`--profile=${defaultProfile}`);
  }

  args.push(...extraArgs);

  console.log(`[mud:deploy] Contracts dir: ${contractsDir}`);
  console.log(`[mud:deploy] Running: mud ${args.join(' ')}`);
  await runMud(args, { cwd: contractsDir });
}

main().catch((err) => {
  console.error('[mud:deploy] failed', err);
  process.exit(1);
});
