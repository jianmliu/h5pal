import { worldService } from '../services/index.js';
import resourceService from '../services/resource-service.js';
import scriptObjectAdapter from '../services/script-object-adapter.js';
import { getSceneIdValue as getCurrentSceneId } from '../services/scene-state-adapter.js';

const big5Decoder = (() => {
  if (typeof TextDecoder === 'undefined') {
    return null;
  }
  try {
    return new TextDecoder('big5');
  } catch (err) {
    try {
      return new TextDecoder('big5-hkscs');
    } catch (err2) {
      return new TextDecoder();
    }
  }
})();

let textResourcesPromise = null;
const scriptNarrativeCache = new Map();

function ensureSceneReady(sceneId) {
  if (!Number.isFinite(sceneId) || sceneId <= 0) {
    throw new TypeError('[storygraph] sceneId must be a positive number');
  }
  const previous = typeof getCurrentSceneId === 'function' ? getCurrentSceneId() : null;
  if (previous === sceneId) {
    return () => {};
  }
  worldService.setSceneId(sceneId);
  return () => {
    if (Number.isFinite(previous) && previous > 0) {
      worldService.setSceneId(previous);
    }
  };
}

function addScriptNode(nodes, cache, scriptId, label) {
  if (!Number.isFinite(scriptId) || scriptId <= 0) {
    return null;
  }
  if (cache.has(scriptId)) {
    const existing = cache.get(scriptId);
    if (label && existing.metadata) {
      existing.metadata.labels = existing.metadata.labels || [];
      if (!existing.metadata.labels.includes(label)) {
        existing.metadata.labels.push(label);
      }
    }
    return existing;
  }
  const nodeId = `script-${scriptId}`;
  const node = {
    id: nodeId,
    type: 'script',
    label: `Script ${scriptId}`,
    metadata: {
      scriptId,
      labels: label ? [label] : []
    }
  };
  nodes.push(node);
  cache.set(scriptId, node);
  return node;
}

async function ensureTextResources() {
  if (textResourcesPromise) {
    return textResourcesPromise;
  }
  textResourcesPromise = (async () => {
    const [msgBuffer] = await resourceService.loadFiles('m.msg');
    await resourceService.loadMKF('SSS');
    const sss = resourceService.getMKF('SSS');
    const offsetChunk = sss.readChunk(3);
    const msgOffset = new Uint32Array(
      offsetChunk.buffer,
      offsetChunk.byteOffset,
      offsetChunk.byteLength / 4
    );
    return {
      msgBuf: new Uint8Array(msgBuffer),
      msgOffset
    };
  })();
  return textResourcesPromise;
}

async function decodeMessage(msgId) {
  if (!Number.isFinite(msgId) || msgId < 0) {
    return '';
  }
  const resources = await ensureTextResources();
  if (!resources || msgId >= resources.msgOffset.length - 1) {
    return '';
  }
  const start = resources.msgOffset[msgId];
  const end = resources.msgOffset[msgId + 1];
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return '';
  }
  const slice = resources.msgBuf.subarray(start, end);
  if (big5Decoder) {
    try {
      return big5Decoder.decode(slice).trim();
    } catch (err) {
      // fall through
    }
  }
  let result = '';
  for (let i = 0; i < slice.length; i++) {
    result += String.fromCharCode(slice[i]);
  }
  return result.trim();
}

async function collectScriptNarrative(scriptId, options = {}) {
  if (!Number.isFinite(scriptId) || scriptId <= 0) {
    return null;
  }
  if (scriptNarrativeCache.has(scriptId)) {
    return scriptNarrativeCache.get(scriptId);
  }
  const maxSteps = options.maxSteps || 80;
  const summary = {
    scriptId,
    dialogues: [],
    choices: []
  };
  let pointer = scriptId;
  const visited = new Set();
  for (let step = 0; step < maxSteps; step++) {
    if (!Number.isFinite(pointer) || pointer < 0 || visited.has(pointer)) {
      break;
    }
    visited.add(pointer);
    const entry = scriptObjectAdapter.getScriptEntry(pointer);
    if (!entry) {
      break;
    }
    const op = entry.operation >>> 0;
    const operands = Array.isArray(entry.operand) ? entry.operand : [];
    if (op === 0xFFFF) {
      const msgId = Number(operands[0]);
      const text = await decodeMessage(msgId);
      if (text) {
        summary.dialogues.push({ msgId, text });
      }
    } else if (op === 0x000A) {
      summary.choices.push({
        type: 'confirm',
        nextIfNo: Number(operands[0]) || null,
        description: 'Yes/No prompt'
      });
    }
    if (op === 0x0000) {
      break;
    }
    pointer += 1;
  }
  scriptNarrativeCache.set(scriptId, summary);
  return summary;
}

export async function buildStoryGraphForScene(sceneId = 2) {
  const restoreScene = ensureSceneReady(sceneId);
  const sceneNodeId = `scene-${sceneId}`;
  try {
    const sceneEntry = worldService.getSceneEntry(sceneId) || {};
    const nodes = [
      {
        id: sceneNodeId,
        type: 'scene',
        label: `Scene ${sceneId}`,
        metadata: sceneEntry
      }
    ];
    const edges = [];
    const scriptCache = new Map();
    const events = worldService.getEventObjectsInCurrentScene() || [];

    const sceneScriptRefs = [
      ['scriptOnEnter', 'enter'],
      ['scriptOnTeleport', 'teleport']
    ];

    for (const [field, label] of sceneScriptRefs) {
      const scriptId = Number(sceneEntry[field]);
      const scriptNode = addScriptNode(nodes, scriptCache, scriptId, label);
      if (scriptNode) {
        edges.push({ source: sceneNodeId, target: scriptNode.id, type: 'scene-script', label });
        const summary = await collectScriptNarrative(scriptId);
        if (summary && (summary.dialogues.length || summary.choices.length)) {
          scriptNode.metadata = scriptNode.metadata || {};
          scriptNode.metadata.narrative = summary;
        }
      }
    }

    for (const event of events) {
      const eventNodeId = `scene-${sceneId}-event-${event.id}`;
      const eventMetadata = event.state ? { ...event.state } : {};
      nodes.push({
        id: eventNodeId,
        type: 'event',
        label: `Event ${event.id}`,
        metadata: eventMetadata
      });
      edges.push({ source: sceneNodeId, target: eventNodeId, type: 'contains' });

      const scriptFields = [
        ['triggerScript', 'trigger'],
        ['autoScript', 'auto']
      ];
      const aggregatedNarrative = { dialogues: [], choices: [] };

      for (const [field, label] of scriptFields) {
        const scriptId = Number(event.state ? event.state[field] : null);
        const scriptNode = addScriptNode(nodes, scriptCache, scriptId, label);
        if (!scriptNode) {
          continue;
        }
        edges.push({ source: eventNodeId, target: scriptNode.id, type: 'script', label });
        const summary = await collectScriptNarrative(scriptId);
        if (summary && (summary.dialogues.length || summary.choices.length)) {
          scriptNode.metadata = scriptNode.metadata || {};
          scriptNode.metadata.narrative = summary;
          aggregatedNarrative.dialogues.push(...summary.dialogues);
          aggregatedNarrative.choices.push(...summary.choices);
        }
      }

      if (aggregatedNarrative.dialogues.length || aggregatedNarrative.choices.length) {
        eventMetadata.narrative = aggregatedNarrative;
      }
    }

    const graph = {
      sceneId,
      nodes,
      edges,
      metadata: {
        generatedAt: new Date().toISOString(),
        totalEvents: events.length
      }
    };
    return graph;
  } finally {
    restoreScene();
  }
}

function triggerDownload(graph, filename) {
  if (typeof document === 'undefined') {
    return;
  }
  const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportSceneStoryGraph(sceneId = 2, options = {}) {
  const graph = await buildStoryGraphForScene(sceneId);
  if (options.download !== false) {
    const filename = options.filename || `scene-${sceneId}-storygraph.json`;
    triggerDownload(graph, filename);
  }
  return graph;
}

if (typeof window !== 'undefined') {
  window.storygraph = window.storygraph || {};
  window.storygraph.exportScene = (...args) => exportSceneStoryGraph(...args);
}
