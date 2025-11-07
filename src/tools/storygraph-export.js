import { worldService } from '../services/index.js';
import { getSceneIdValue as getCurrentSceneId } from '../services/scene-state-adapter.js';

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
    return cache.get(scriptId);
  }
  const nodeId = `script-${scriptId}`;
  nodes.push({
    id: nodeId,
    type: 'script',
    label: `Script ${scriptId}`,
    metadata: { scriptId, label }
  });
  cache.set(scriptId, nodeId);
  return nodeId;
}

export function buildStoryGraphForScene(sceneId = 2) {
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

    [
      ['scriptOnEnter', 'enter'],
      ['scriptOnTeleport', 'teleport']
    ].forEach(([field, label]) => {
      const scriptNodeId = addScriptNode(nodes, scriptCache, Number(sceneEntry[field]), label);
      if (scriptNodeId) {
        edges.push({ source: sceneNodeId, target: scriptNodeId, type: 'scene-script', label });
      }
    });

    events.forEach((event) => {
      const eventNodeId = `scene-${sceneId}-event-${event.id}`;
      nodes.push({
        id: eventNodeId,
        type: 'event',
        label: `Event ${event.id}`,
        metadata: event.state || {}
      });
      edges.push({ source: sceneNodeId, target: eventNodeId, type: 'contains' });

      [
        ['triggerScript', 'trigger'],
        ['autoScript', 'auto']
      ].forEach(([field, label]) => {
        const scriptId = Number(event.state ? event.state[field] : null);
        const scriptNodeId = addScriptNode(nodes, scriptCache, scriptId, label);
        if (scriptNodeId) {
          edges.push({ source: eventNodeId, target: scriptNodeId, type: 'script', label });
        }
      });
    });

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

export function exportSceneStoryGraph(sceneId = 2, options = {}) {
  const graph = buildStoryGraphForScene(sceneId);
  if (options.download !== false && typeof document !== 'undefined') {
    const filename = options.filename || `scene-${sceneId}-storygraph.json`;
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
  return graph;
}

if (typeof window !== 'undefined') {
  window.storygraph = window.storygraph || {};
  window.storygraph.exportScene = exportSceneStoryGraph;
}
