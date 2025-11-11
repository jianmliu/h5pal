#!/usr/bin/env node
import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import path from 'path';

const RAW_ROOT = path.resolve(process.cwd(), '../docs/raw');
const OUTPUT_ROOT = path.resolve(process.cwd(), '../docs');

const tasks = [
  {
    file: '《仙剑奇侠传》攻略提示.txt',
    outputDir: 'guides/仙剑奇侠传',
    fallbackPrefix: '篇章',
    pattern: /^〔[0-9０-９]+〕/u
  },
  {
    file: '《仙剑奇侠传一98柔情版》剧情对话-NPC对话.txt',
    outputDir: 'dialogue/仙剑奇侠传一98柔情版/NPC',
    fallbackPrefix: 'NPC',
    pattern: /^\s*[\p{Script=Han}A-Za-z0-9（）「」『』《》\-]+(镇|城|村|岛|山|谷|河|洞|府|馆|阁|庄|堡|殿|宫|巷|井|塔|埠)\s*$/u
  },
  {
    file: '《仙剑奇侠传一98柔情版》剧情对话-主线剧情.txt',
    outputDir: 'dialogue/仙剑奇侠传一98柔情版/主线',
    fallbackPrefix: '主线',
    pattern: /^第[\p{Script=Han}0-9０-９]+章/u
  },
  {
    file: '《仙剑奇侠传一98柔情版》剧情对话-支线剧情.txt',
    outputDir: 'dialogue/仙剑奇侠传一98柔情版/支线',
    fallbackPrefix: '支线',
    pattern: /^(\s*▶|.*支线)/u
  },
  {
    file: '《新仙剑奇侠传》剧情对话-NPC对话.txt',
    outputDir: 'dialogue/新仙剑奇侠传/NPC',
    fallbackPrefix: 'NPC',
    pattern: /^\s*[\p{Script=Han}A-Za-z0-9（）「」『』《》\-]+(镇|城|村|岛|山|谷|河|洞|府|馆|阁|庄|堡|殿|宫|巷|井|塔|埠)\s*$/u
  },
  {
    file: '《新仙剑奇侠传》剧情对话-主线剧情.txt',
    outputDir: 'dialogue/新仙剑奇侠传/主线',
    fallbackPrefix: '主线',
    pattern: /^第[\p{Script=Han}0-9０-９]+章/u
  },
  {
    file: '《新仙剑奇侠传》剧情对话-支线剧情.txt',
    outputDir: 'dialogue/新仙剑奇侠传/支线',
    fallbackPrefix: '支线',
    pattern: /^(\s*▶|.*支线)/u
  }
];

function splitText(content, pattern, fallbackPrefix = 'segment') {
  const lines = content.split(/\r?\n/);
  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i].trim())) {
      headings.push({ index: i, title: lines[i].trim() });
    }
  }
  const chunks = [];
  if (headings.length === 0) {
    const trimmed = content.trim();
    return trimmed ? [{ title: fallbackPrefix, body: trimmed }] : [];
  }
  if (headings[0].index > 0) {
    const preface = lines.slice(0, headings[0].index).join('\n').trim();
    if (preface) {
      chunks.push({ title: '前言', body: preface });
    }
  }
  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].index;
    const end = i + 1 < headings.length ? headings[i + 1].index : lines.length;
    const body = lines.slice(start, end).join('\n').trim();
    if (body) {
      chunks.push({ title: headings[i].title || `${fallbackPrefix}${i + 1}`, body });
    }
  }
  return chunks;
}

function sanitizeTitle(title, fallback) {
  const cleaned = (title || fallback || 'segment')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-');
  return cleaned.slice(0, 60) || fallback || 'segment';
}

async function cleanDir(dirPath) {
  await rm(dirPath, { recursive: true, force: true });
  await mkdir(dirPath, { recursive: true });
}

async function processTask(task) {
  const sourcePath = path.join(RAW_ROOT, task.file);
  const content = await readFile(sourcePath, 'utf8');
  const sections = splitText(content, task.pattern, task.fallbackPrefix);
  if (!sections.length) {
    console.warn(`[split-docs] ${task.file} 未检测到分段，保持原状`);
    return;
  }
  const targetDir = path.join(OUTPUT_ROOT, task.outputDir);
  await cleanDir(targetDir);
  const writes = sections.map((section, idx) => {
    const index = String(idx + 1).padStart(2, '0');
    const fileName = `${index}-${sanitizeTitle(section.title, `${task.fallbackPrefix}${index}`)}.txt`;
    const targetPath = path.join(targetDir, fileName);
    console.log(`[split-docs] 写入 ${path.relative(OUTPUT_ROOT, targetPath)}`);
    return writeFile(targetPath, section.body + '\n', 'utf8');
  });
  await Promise.all(writes);
}

(async () => {
  for (const task of tasks) {
    try {
      await processTask(task);
    } catch (err) {
      console.error(`[split-docs] 处理 ${task.file} 失败`, err.message);
    }
  }
})();
