import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(__dirname, '..');

function pathExists(targetPath) {
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

export function resolveContractsDir() {
  const envDir = process.env.MUD_CONTRACTS_DIR;
  const candidates = [
    envDir,
    path.resolve(projectRoot, 'onchain/contracts'),
    path.resolve(projectRoot, 'onchain'),
    path.resolve(projectRoot, '../mud/templates/vanilla/packages/contracts')
  ];

  for (const candidate of candidates) {
    if (candidate && pathExists(candidate)) {
      return candidate;
    }
  }

  const hint = envDir ? `MUD_CONTRACTS_DIR (${envDir})` : 'MUD_CONTRACTS_DIR';
  throw new Error(
    `[mud-utils] Unable to locate a contracts project. Please set ${hint} to your Foundry/MUD contracts folder.`
  );
}

export function buildCliEnv(extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  const binPath = path.resolve(projectRoot, 'node_modules', '.bin');
  env.PATH = env.PATH ? `${binPath}:${env.PATH}` : binPath;
  return env;
}

export function runMud(args, { cwd, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const cliEnv = buildCliEnv(env);
    const command = 'mud';
    const child = spawn(command, args, {
      cwd: cwd || projectRoot,
      env: cliEnv,
      stdio: 'inherit'
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`[mud-utils] ${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}
