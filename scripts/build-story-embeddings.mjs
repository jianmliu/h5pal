#!/usr/bin/env node
import { readFile, writeFile, readdir, stat } from 'fs/promises';
import path from 'path';
import mammoth from 'mammoth';

const CWD = process.cwd();
const rawArgs = process.argv.slice(2);
const inputArg = rawArgs[0];
const outputOverride = rawArgs[1] || process.env.STORY_EMBED_OUTPUT;
const sourceTokens = (process.env.STORY_EMBED_SOURCES || 'graph,docs')
  .split(',')
  .map((token) => token.trim().toLowerCase())
  .filter(Boolean);
const enableGraphs = sourceTokens.includes('graph');
const enableDocs = sourceTokens.includes('docs');
if (!enableGraphs && !enableDocs) {
  throw new Error('[embeddings] STORY_EMBED_SOURCES must include "graph" and/or "docs"');
}

const inputCandidates = enableGraphs ? [inputArg].filter(Boolean) : [];
if (enableGraphs && inputCandidates.length === 0) {
  inputCandidates.push(
    'pal-assets/exported-storygraphs',
    '../ultimate/pal-assets/exported-storygraphs',
    'dist/storygraph',
    'dist/storygraph.json'
  );
}
const outputPath = path.resolve(CWD, outputOverride || 'dist/storygraph-embeddings.json');
const endpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
const model = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
const MAX_FILES = Number(process.env.STORY_EMBED_MAX_FILES) || 512;
const DOC_SOURCE_DIRS = (process.env.STORY_EMBED_DOC_DIRS || '../docs')
  .split(',')
  .map((dir) => dir.trim())
  .filter(Boolean);
const DOC_CHUNK_SIZE = Number(process.env.STORY_EMBED_DOC_CHARS) || 1800;
const DOC_CHUNK_OVERLAP = Number(process.env.STORY_EMBED_DOC_OVERLAP) || 200;
const DOC_EXTENSIONS = new Set(['.txt', '.md', '.doc', '.docx']);

function safeNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function inferSceneId(hint, fallback) {
  if (Number.isFinite(hint)) {
    return hint;
  }
  const match = typeof fallback === 'string'
    ? fallback.match(/scene[-_](\d+)/i)
    : null;
  if (match) {
    return Number.parseInt(match[1], 10);
  }
  return null;
}

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

function formatContextSummary(context) {
  if (!context || typeof context !== 'object') {
    return '';
  }
  const segments = [];
  const sceneId = safeNumber(context.sceneId);
  if (sceneId != null) {
    segments.push(`Scene ${sceneId}`);
  }
  const eventId = safeNumber(context.eventId);
  if (eventId != null) {
    segments.push(`Event ${eventId}`);
  }
  if (safeNumber(context.viewport) != null) {
    segments.push(`Viewport ${context.viewport}`);
  }
  if (safeNumber(context.followers) != null) {
    segments.push(`Followers ${context.followers}`);
  }
  const leader = context.leader || {};
  if (safeNumber(leader.x) != null && safeNumber(leader.y) != null) {
    segments.push(`Leader (${leader.x}, ${leader.y})`);
  }
  const event = context.event || {};
  if (event.position && safeNumber(event.position.x) != null && safeNumber(event.position.y) != null) {
    segments.push(`EventPos (${event.position.x}, ${event.position.y})`);
  }
  if (event.offsets && safeNumber(event.offsets.dx) != null && safeNumber(event.offsets.dy) != null) {
    segments.push(`EventOffset (dx: ${event.offsets.dx}, dy: ${event.offsets.dy})`);
  }
  const flags = context.flags || {};
  const flagParts = Object.entries(flags)
    .filter(([, value]) => value != null)
    .map(([key, value]) => `${key}:${value}`);
  if (flagParts.length) {
    segments.push(`Flags(${flagParts.join(', ')})`);
  }
  return segments.join(' | ');
}

function narrativePayloads(narrative, scope) {
  if (!narrative || typeof narrative !== 'object') {
    return [];
  }
  const contextSummary = formatContextSummary(scope.context);
  const payloads = [];
  const dialogues = Array.isArray(narrative.dialogues) ? narrative.dialogues : [];
  dialogues.forEach((entry, index) => {
    if (!entry || !entry.text) {
      return;
    }
    const lines = [];
    if (entry.speaker) {
      lines.push(`${entry.speaker}: ${entry.text}`.trim());
    } else {
      lines.push(entry.text.trim());
    }
    if (entry.path) {
      lines.push(`Path ${entry.path}`);
    }
    if (entry.pointer != null) {
      lines.push(`Pointer ${entry.pointer}`);
    }
    if (entry.msgId != null) {
      lines.push(`Message ${entry.msgId}`);
    }
    if (contextSummary) {
      lines.push(`Context ${contextSummary}`);
    }
    payloads.push({
      kind: 'dialogue',
      text: lines.filter(Boolean).join('\n'),
      extra: {
        index,
        msgId: entry.msgId ?? null,
        pointer: entry.pointer ?? null,
        path: entry.path ?? null
      }
    });
  });
  const choices = Array.isArray(narrative.choices) ? narrative.choices : [];
  choices.forEach((choice, index) => {
    if (!choice || (!choice.description && !choice.type)) {
      return;
    }
    const lines = [];
    lines.push(`Choice: ${choice.description || choice.type}`);
    if (choice.nextIfNo != null) {
      lines.push(`NextIfNo -> ${choice.nextIfNo}`);
    }
    if (choice.path) {
      lines.push(`Path ${choice.path}`);
    }
    if (contextSummary) {
      lines.push(`Context ${contextSummary}`);
    }
    payloads.push({
      kind: 'choice',
      text: lines.filter(Boolean).join('\n'),
      extra: {
        index,
        type: choice.type || null,
        nextIfNo: choice.nextIfNo ?? null,
        path: choice.path ?? null
      }
    });
  });
  return payloads;
}

function buildNodeSummaryText(node, scope) {
  const metadata = node.metadata || {};
  const parts = [];
  if (node.label) {
    parts.push(String(node.label));
  }
  if (metadata.description) {
    parts.push(String(metadata.description));
  }
  if (Array.isArray(metadata.labels) && metadata.labels.length) {
    parts.push(`Labels: ${metadata.labels.join(', ')}`);
  }
  if (metadata.scriptId) {
    parts.push(`Script ${metadata.scriptId}`);
  }
  const contextSummary = formatContextSummary(scope.context || metadata.context);
  if (contextSummary) {
    parts.push(`Context ${contextSummary}`);
  }
  return parts.map((part) => part.trim()).filter(Boolean).join('\n');
}

function collectNodeChunks(node, scope) {
  const chunks = [];
  const summaryText = buildNodeSummaryText(node, scope);
  if (summaryText) {
    chunks.push({
      kind: 'summary',
      text: summaryText,
      extra: null,
      contextSummary: formatContextSummary(scope.context || node.metadata?.context)
    });
  }
  const narrative = node.metadata?.narrative;
  narrativePayloads(narrative, scope).forEach((payload) => {
    chunks.push({
      ...payload,
      contextSummary: formatContextSummary(scope.context || node.metadata?.context)
    });
  });
  return chunks;
}

function createScope(graph, node, sourcePath, inferredSceneId) {
  const metadata = node.metadata || {};
  const context = metadata.context || graph.metadata?.context || null;
  const sceneId = inferSceneId(graph.sceneId ?? context?.sceneId, sourcePath) ?? inferredSceneId ?? null;
  const eventId = metadata.eventId
    ?? metadata.id
    ?? context?.eventId
    ?? (node.type === 'event' ? Number(node.id?.split('-').pop()) : null);
  return {
    source: sourcePath,
    nodeId: node.id || null,
    type: node.type || 'node',
    sceneId,
    eventId: safeNumber(eventId),
    scriptId: metadata.scriptId ?? null,
    context
  };
}

function collectGraphChunks(graph, sourcePath) {
  const nodes = Array.isArray(graph?.nodes)
    ? graph.nodes
    : (Array.isArray(graph) ? graph : []);
  if (!nodes.length) {
    return [];
  }
  const inferredSceneId = inferSceneId(graph.sceneId, sourcePath);
  const results = [];
  nodes.forEach((node, nodeIndex) => {
    const scope = createScope(graph, node, sourcePath, inferredSceneId);
    const payloads = collectNodeChunks(node, scope);
    payloads.forEach((payload, payloadIndex) => {
      const chunkIdParts = [
        scope.sceneId != null ? `scene${scope.sceneId}` : null,
        scope.eventId != null ? `event${scope.eventId}` : null,
        scope.scriptId != null ? `script${scope.scriptId}` : null,
        scope.nodeId || `node${nodeIndex}`,
        payload.kind,
        payloadIndex
      ].filter(Boolean);
      results.push({
        id: chunkIdParts.join('::') || null,
        sceneId: scope.sceneId ?? null,
        eventId: scope.eventId ?? null,
        scriptId: scope.scriptId ?? null,
        nodeId: scope.nodeId ?? null,
        source: sourcePath,
        kind: payload.kind,
        text: payload.text,
        contextSummary: payload.contextSummary || null,
        extra: payload.extra || null
      });
    });
  });
  return results;
}

async function readDocumentFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.txt' || ext === '.md') {
    return readFile(filePath, 'utf8');
  }
  if (ext === '.docx') {
    const buffer = await readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return (result && result.value) ? result.value : '';
  }
  if (ext === '.doc') {
    console.warn(`[embeddings] legacy .doc files are not supported (${filePath}); convert to .docx first.`);
    return '';
  }
  console.warn(`[embeddings] skipping unsupported document format ${filePath}`);
  return '';
}

function chunkDocumentText(text, size = DOC_CHUNK_SIZE, overlap = DOC_CHUNK_OVERLAP) {
  const clean = (text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) {
    return [];
  }
  const chunks = [];
  const maxSize = Math.max(256, size);
  const overlapSize = Math.max(0, Math.min(overlap, maxSize - 1));
  let start = 0;
  const length = clean.length;
  while (start < length) {
    let end = Math.min(length, start + maxSize);
    let slice = clean.slice(start, end);
    if (end < length) {
      const lastBreak = slice.lastIndexOf('\n\n');
      if (lastBreak > maxSize * 0.4) {
        slice = slice.slice(0, lastBreak);
        end = start + lastBreak;
      }
    }
    slice = slice.trim();
    if (slice) {
      chunks.push(slice);
    }
    if (end >= length) {
      break;
    }
    const nextStart = Math.max(end - overlapSize, start + 1);
    start = nextStart;
  }
  return chunks;
}

async function collectDocumentChunks() {
  if (!enableDocs) {
    return [];
  }
  if (!DOC_SOURCE_DIRS.length) {
    return [];
  }
  const specs = [];
  for (const dir of DOC_SOURCE_DIRS) {
    const absDir = path.resolve(CWD, dir);
    const info = await stat(absDir).catch(() => null);
    if (!info || !info.isDirectory()) {
      continue;
    }
    const entries = (await readdir(absDir)).sort();
    for (const entry of entries) {
      const fullPath = path.join(absDir, entry);
      const fileInfo = await stat(fullPath).catch(() => null);
      if (!fileInfo || !fileInfo.isFile()) {
        continue;
      }
      const ext = path.extname(entry).toLowerCase();
      if (!DOC_EXTENSIONS.has(ext)) {
        continue;
      }
      const text = await readDocumentFile(fullPath).catch((err) => {
        console.warn(`[embeddings] failed to read ${fullPath}: ${err.message}`);
        return '';
      });
      if (!text) {
        continue;
      }
      const chunks = chunkDocumentText(text);
      if (!chunks.length) {
        continue;
      }
      const title = path.basename(entry, ext) || entry;
      chunks.forEach((chunk, index) => {
        const id = `doc::${title}::${String(index + 1).padStart(3, '0')}`;
        specs.push({
          id,
          kind: 'document',
          source: fullPath,
          text: chunk,
          contextSummary: `Doc ${title} chunk ${index + 1}/${chunks.length}`,
          extra: {
            title,
            chunkIndex: index + 1,
            totalChunks: chunks.length
          }
        });
      });
    }
  }
  return specs;
}

async function loadGraphsFromPath(targetPath) {
  const info = await stat(targetPath).catch(() => null);
  if (!info) {
    return [];
  }
  if (info.isDirectory()) {
    const entries = (await readdir(targetPath))
      .filter((file) => file.toLowerCase().endsWith('.json'))
      .slice(0, MAX_FILES);
    const graphs = [];
    for (const file of entries) {
      const fullPath = path.join(targetPath, file);
      const raw = await readFile(fullPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((item, index) => {
          graphs.push({ graph: item, source: fullPath, index });
        });
      } else {
        graphs.push({ graph: parsed, source: fullPath });
      }
    }
    return graphs;
  }
  const raw = await readFile(targetPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    return parsed.map((item, index) => ({ graph: item, source: targetPath, index }));
  }
  return [{ graph: parsed, source: targetPath }];
}

async function resolveGraphs() {
  if (!enableGraphs) {
    return [];
  }
  for (const candidate of inputCandidates) {
    const resolved = path.resolve(CWD, candidate);
    const graphs = await loadGraphsFromPath(resolved);
    if (graphs.length) {
      return graphs;
    }
  }
  console.warn(`[embeddings] no storygraph sources found (tried ${inputCandidates.join(', ')})`);
  return [];
}

async function main() {
  const sources = await resolveGraphs();
  const graphSpecs = enableGraphs
    ? sources.flatMap(({ graph, source }) => collectGraphChunks(graph, source))
    : [];
  const docSpecs = await collectDocumentChunks();
  const chunkSpecs = [...graphSpecs, ...docSpecs];
  if (!chunkSpecs.length) {
    const enabledList = sourceTokens.length ? sourceTokens.join(',') : 'none';
    throw new Error(`[embeddings] no textual content found (enabled sources: ${enabledList})`);
  }
  const chunks = [];
  let counter = 0;
  for (const spec of chunkSpecs) {
    if (!spec.text) {
      continue;
    }
    counter += 1;
    const displayId = spec.id || `chunk-${counter}`;
    process.stdout.write(`[embeddings] embedding ${displayId}...\n`);
    const embedding = await embedText(spec.text);
    chunks.push({
      id: displayId,
      kind: spec.kind,
      source: path.relative(CWD, spec.source),
      sceneId: spec.sceneId,
      eventId: spec.eventId,
      scriptId: spec.scriptId,
      nodeId: spec.nodeId,
      context: spec.contextSummary,
      metadata: spec.extra,
      text: spec.text,
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
