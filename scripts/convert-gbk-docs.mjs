#!/usr/bin/env node
import { readdir, stat, readFile, writeFile } from 'fs/promises';
import path from 'path';
import iconv from 'iconv-lite';

const targetDir = process.argv[2] || '../docs';
const absoluteRoot = path.resolve(process.cwd(), targetDir);
let converted = 0;
let skipped = 0;

function isUtf8(buffer) {
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    decoder.decode(buffer);
    return true;
  } catch (err) {
    return false;
  }
}

async function ensureDirectory(dirPath) {
  try {
    const info = await stat(dirPath);
    if (!info.isDirectory()) {
      throw new Error(`${dirPath} is not a directory`);
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Directory not found: ${dirPath}`);
    }
    throw err;
  }
}

async function convertFile(filePath) {
  const buffer = await readFile(filePath);
  if (buffer.length === 0) {
    return false;
  }
  if (isUtf8(buffer)) {
    return false;
  }
  const content = iconv.decode(buffer, 'gbk');
  await writeFile(filePath, content, 'utf8');
  return true;
}

async function walk(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const lower = entry.name.toLowerCase();
    if (lower.endsWith('.txt') || lower.endsWith('.md')) {
      const changed = await convertFile(fullPath);
      if (changed) {
        converted += 1;
        process.stdout.write(`[gbk->utf8] converted ${path.relative(absoluteRoot, fullPath)}\n`);
      } else {
        skipped += 1;
      }
    }
  }
}

async function main() {
  await ensureDirectory(absoluteRoot);
  await walk(absoluteRoot);
  process.stdout.write(`[gbk->utf8] done. converted=${converted}, skipped=${skipped}\n`);
}

main().catch((err) => {
  console.error('[gbk->utf8] failed', err);
  process.exit(1);
});
