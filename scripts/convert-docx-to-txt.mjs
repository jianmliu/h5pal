#!/usr/bin/env node
import { readdir, stat, readFile, writeFile } from 'fs/promises';
import path from 'path';
import mammoth from 'mammoth';

const targetDir = process.argv[2] || '../docs';
const absoluteRoot = path.resolve(process.cwd(), targetDir);
let converted = 0;
let skipped = 0;
let failed = 0;

async function ensureDirectory(dirPath) {
  try {
    const metadata = await stat(dirPath);
    if (!metadata.isDirectory()) {
      throw new Error(`${dirPath} is not a directory`);
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Directory not found: ${dirPath}`);
    }
    throw err;
  }
}

async function convertDocxFile(filePath) {
  try {
    const buffer = await readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    const text = (result.value || '').trim();
    const outputPath = filePath.replace(/\.docx?$/i, '.txt');
    await writeFile(outputPath, text, 'utf8');
    converted += 1;
    process.stdout.write(`[docx2txt] converted ${path.relative(absoluteRoot, filePath)} -> ${path.basename(outputPath)}\n`);
  } catch (err) {
    failed += 1;
    console.error(`[docx2txt] failed ${filePath}:`, err.message);
  }
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
    if (/\.docx?$/i.test(entry.name)) {
      await convertDocxFile(fullPath);
    } else {
      skipped += 1;
    }
  }
}

async function main() {
  await ensureDirectory(absoluteRoot);
  await walk(absoluteRoot);
  process.stdout.write(`[docx2txt] done. converted=${converted}, skipped=${skipped}, failed=${failed}\n`);
}

main().catch((err) => {
  console.error('[docx2txt] fatal', err);
  process.exit(1);
});
