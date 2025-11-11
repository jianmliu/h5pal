import config from '../js/pal/config.js';
import { runEmbedding } from './qwen-client.js';

const DEFAULT_TOP_K = 3;
const DEFAULT_MIN_SCORE = 0.32;

let knowledgePromise = null;

export function clearKnowledgeCache() {
  knowledgePromise = null;
}

export async function loadKnowledgeBase(options = {}) {
  if (options.forceReload) {
    knowledgePromise = null;
  }
  if (!knowledgePromise) {
    knowledgePromise = resolveKnowledgeBase(options.sourcePath);
  }
  return knowledgePromise;
}

async function resolveKnowledgeBase(sourceOverride) {
  if (typeof fetch !== 'function') {
    return null;
  }
  const candidates = buildSourceCandidates(sourceOverride);
  for (let i = 0; i < candidates.length; i++) {
    const url = candidates[i];
    if (!url) {
      continue;
    }
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        continue;
      }
      const payload = await response.json();
      const store = normaliseStore(payload, url);
      if (store && store.chunks.length > 0) {
        return store;
      }
    } catch (err) {
      // Ignore and try next candidate
    }
  }
  return null;
}

function buildSourceCandidates(overridePath) {
  const list = [];
  const seen = new Set();
  [overridePath, config.embeddingSource, 'storygraph-embeddings.json', 'pal-assets/storygraph-embeddings.json', 'exported-storygraphs/storygraph-embeddings.json', './pal-assets/storygraph-embeddings.json', './pal-assets/exported-storygraphs/storygraph-embeddings.json', 'pal-assets/exported-storygraphs/storygraph-embeddings.json', 'dist/storygraph-embeddings.json']
    .forEach((entry) => {
      const normalised = normaliseSource(entry);
      if (normalised && !seen.has(normalised)) {
        seen.add(normalised);
        list.push(normalised);
      }
    });
  return list;
}

function normaliseSource(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^https?:/i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('.') || trimmed.startsWith('..') || trimmed.startsWith('/')) {
    return trimmed;
  }
  if (typeof config.resolveAssetPath === 'function') {
    return config.resolveAssetPath(trimmed.replace(/^\.\//, ''));
  }
  return trimmed;
}

function normaliseStore(payload, sourceUrl) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const chunks = Array.isArray(payload.chunks) ? payload.chunks : [];
  const normalisedChunks = chunks.map(normaliseChunk).filter(Boolean);
  return {
    source: sourceUrl,
    model: payload.model || null,
    generatedAt: payload.generatedAt || null,
    chunks: normalisedChunks
  };
}

function normaliseChunk(chunk, index) {
  if (!chunk || typeof chunk !== 'object') {
    return null;
  }
  const rawEmbedding = Array.isArray(chunk.embedding) ? chunk.embedding : (Array.isArray(chunk.vector) ? chunk.vector : null);
  if (!rawEmbedding || rawEmbedding.length === 0) {
    return null;
  }
  const vector = normaliseVector(rawEmbedding);
  if (!vector) {
    return null;
  }
  const text = typeof chunk.text === 'string' ? chunk.text.trim() : '';
  return {
    id: chunk.id || `chunk-${index}`,
    text,
    source: chunk.source || chunk.id || null,
    kind: chunk.kind || 'unknown',
    context: chunk.context || chunk.contextSummary || null,
    metadata: chunk.metadata || chunk.extra || null,
    sceneId: chunk.sceneId ?? null,
    nodeId: chunk.nodeId ?? null,
    vector
  };
}

function normaliseVector(values) {
  const vector = new Float32Array(values.length);
  let sumSquares = 0;
  for (let i = 0; i < values.length; i++) {
    const val = Number(values[i]);
    const safe = Number.isFinite(val) ? val : 0;
    vector[i] = safe;
    sumSquares += safe * safe;
  }
  const magnitude = Math.sqrt(sumSquares);
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    return null;
  }
  for (let i = 0; i < vector.length; i++) {
    vector[i] = vector[i] / magnitude;
  }
  return vector;
}

function normaliseQueryVector(values) {
  if (!Array.isArray(values)) {
    return null;
  }
  return normaliseVector(values);
}

export async function retrieveKnowledge({
  sceneQuery,
  dialogQuery,
  topK = DEFAULT_TOP_K,
  minScore = DEFAULT_MIN_SCORE,
  embeddingModel,
  signal
} = {}) {
  const base = await loadKnowledgeBase();
  if (!base || !Array.isArray(base.chunks) || base.chunks.length === 0) {
    return [];
  }
  const scenarios = [];
  if (sceneQuery && typeof sceneQuery === 'string') {
    scenarios.push(sceneQuery);
  }
  if (dialogQuery && typeof dialogQuery === 'string') {
    scenarios.push(dialogQuery);
  }
  if (scenarios.length === 0) {
    return [];
  }
  for (let attempt = 0; attempt < scenarios.length; attempt++) {
    const query = scenarios[attempt];
    try {
      const embedding = await runEmbedding({ text: query, model: embeddingModel, signal });
      const queryVector = normaliseQueryVector(embedding);
      if (!queryVector) {
        continue;
      }
      const scored = base.chunks.map((chunk) => {
        const score = cosineSimilarity(queryVector, chunk.vector);
        return { chunk, score };
      }).filter(({ score }) => Number.isFinite(score) && score >= minScore);
      if (!scored.length) {
        continue;
      }
      scored.sort((a, b) => b.score - a.score);
      const limited = scored.slice(0, topK);
      return limited.map(({ chunk, score }) => ({
        id: chunk.id,
        text: chunk.text,
        source: chunk.source,
        kind: chunk.kind,
        sceneId: chunk.sceneId,
        nodeId: chunk.nodeId,
        context: chunk.context,
        metadata: chunk.metadata,
        score,
        queryType: attempt === 0 && sceneQuery ? 'scene' : 'dialog'
      }));
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[knowledge] query embedding failed', err);
      }
    }
  }
  return [];
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}
