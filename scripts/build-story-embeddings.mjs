#!/usr/bin/env node
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const CWD = process.cwd();
const [inputArg, outputArg] = process.argv.slice(2);
const storyPath = path.resolve(CWD, inputArg || 'dist/storygraph.json');
const outputPath = path.resolve(CWD, outputArg || 'dist/storygraph-embeddings.json');
const endpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
const model = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

async function embedText(text) {
  const payload = { model, prompt: text };
  const res = await fetch(`${endpoint}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new Error(`[embeddings] request failed ${res.status}: ${message}`);
  }
  const data = await res.json();
  if (!data || !Array.isArray(data.embedding)) {
    throw new Error('[embeddings] unexpected response payload');
  }
  return data.embedding;
}

function buildChunkText(node) {
  const parts = [];
  if (node.label) {
    parts.push(String(node.label));
  }
  const metadata = node.metadata || {};
  if (metadata.description) {
    parts.push(String(metadata.description));
  }
  if (metadata.dialogue) {
    parts.push(String(metadata.dialogue));
  }
  if (metadata.narrative) {
    const { dialogues = [], choices = [] } = metadata.narrative;
    dialogues.forEach((entry) => {
      if (entry && entry.text) {
        parts.push(entry.text);
      }
    });
    choices.forEach((entry) => {
      if (entry && entry.description) {
        parts.push(entry.description);
      }
    });
  }
  if (Array.isArray(node.dialogues)) {
    node.dialogues.forEach((line) => {
      if (line) {
        parts.push(String(line));
      }
    });
  }
  return parts.map((part) => part.trim()).filter(Boolean).join('\n');
}

async function main() {
  const raw = await readFile(storyPath, 'utf8');
  const source = JSON.parse(raw);
  const nodes = Array.isArray(source) ? source : source.nodes || [];
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error(`[embeddings] no nodes found in ${storyPath}`);
  }
  const chunks = [];
  for (const node of nodes) {
    const text = buildChunkText(node);
    if (!text) {
      continue;
    }
    process.stdout.write(`[embeddings] embedding ${node.id || chunks.length}...\n`);
    const embedding = await embedText(text);
    chunks.push({
      id: node.id,
      label: node.label || null,
      sceneId: node.metadata?.sceneId ?? null,
      scriptId: node.metadata?.scriptId ?? null,
      text,
      embedding
    });
  }
  const output = {
    model,
    endpoint,
    generatedAt: new Date().toISOString(),
    chunkCount: chunks.length,
    chunks
  };
  await writeFile(outputPath, JSON.stringify(output, null, 2));
  process.stdout.write(`[embeddings] wrote ${chunks.length} chunks -> ${outputPath}\n`);
}

main().catch((err) => {
  console.error('[embeddings] failed', err);
  process.exitCode = 1;
});
