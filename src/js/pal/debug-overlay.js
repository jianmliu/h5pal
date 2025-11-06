import sceneEventAdapter from '../../services/scene-event-adapter.js';

const OVERLAY_ID = 'pal-debug-overlay';

function createOverlayElement() {
  const container = document.createElement('div');
  container.id = OVERLAY_ID;
  container.style.position = 'fixed';
  container.style.top = '8px';
  container.style.right = '8px';
  container.style.zIndex = '2147483647';
  container.style.fontFamily = 'monospace';
  container.style.fontSize = '11px';
  container.style.color = '#0f0';
  container.style.background = 'rgba(0, 0, 0, 0.6)';
  container.style.padding = '6px 8px';
  container.style.border = '1px solid rgba(0, 255, 0, 0.4)';
  container.style.borderRadius = '4px';
  container.style.maxWidth = '240px';
  container.style.maxHeight = '180px';
  container.style.overflow = 'hidden';
  container.style.pointerEvents = 'none';
  container.style.whiteSpace = 'pre';
  return container;
}

let overlayElement = null;
let frameHandle = null;
let lastUpdate = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
let frameCount = 0;

function ensureOverlay() {
  if (overlayElement && document.body && document.body.contains(overlayElement)) {
    return overlayElement;
  }
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) {
    overlayElement = existing;
    return overlayElement;
  }
  if (!document.body) {
    return null;
  }
  overlayElement = createOverlayElement();
  document.body.appendChild(overlayElement);
  return overlayElement;
}

function updateOverlay(content) {
  const el = ensureOverlay();
  if (!el) {
    return;
  }
  el.textContent = content || '';
}

function computeFPS() {
  const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  frameCount += 1;
  const elapsed = now - lastUpdate;
  if (elapsed >= 500) {
    const fps = (frameCount / elapsed) * 1000;
    frameCount = 0;
    lastUpdate = now;
    return fps;
  }
  return null;
}

function scheduleLoop(renderFn) {
  const callback = () => {
    const fps = computeFPS();
    const payload = renderFn({ fps });
    if (payload && typeof payload === 'string') {
      updateOverlay(payload);
    }
    frameHandle = requestAnimationFrame(callback);
  };
  frameHandle = requestAnimationFrame(callback);
}

function cancelLoop() {
  if (typeof cancelAnimationFrame === 'function' && frameHandle) {
    cancelAnimationFrame(frameHandle);
  }
  frameHandle = null;
}

function formatLine(label, value) {
  return `${label}: ${value}`;
}

function gatherSceneStats() {
  const viewport = window.debugUtils ? window.debugUtils.getViewportSnapshot?.() : null;
  const adapters = window.services && window.services.adapters;
  const sceneId = adapters && adapters.sceneData ? adapters.sceneData.getSceneIdValue?.() : null;
  const eventCount = adapters && adapters.sceneEvents ? adapters.sceneEvents.getEventObjects?.()?.length : null;
  let eventVersion = null;
  try {
    eventVersion = sceneEventAdapter.getEventObjectsVersion();
  } catch (err) {
    eventVersion = null;
  }
  return { viewport, sceneId, eventCount, eventVersion };
}

function gatherBattleStats() {
  const battleState = typeof window.BATTLE === 'function' ? window.BATTLE() : null;
  if (!battleState) {
    return null;
  }
  return {
    playerActions: battleState.player ? battleState.player.map((p) => p && p.action && p.action.actionType) : null,
    enemyCount: battleState.enemy ? battleState.enemy.filter(Boolean).length : 0,
    actionQueue: battleState.actionQueue ? battleState.actionQueue.length : 0
  };
}

function gatherSpriteStats() {
  if (!window.debugUtils || typeof window.debugUtils.getSpriteStats !== 'function') {
    return null;
  }
  return window.debugUtils.getSpriteStats({ limit: 3 });
}

function gatherRLEStats() {
  if (!window.debugUtils || typeof window.debugUtils.getRLEStats !== 'function') {
    return null;
  }
  return window.debugUtils.getRLEStats();
}

function renderSummary(scope, context) {
  const lines = [];
  if (context.fps != null) {
    lines.push(formatLine('FPS', context.fps.toFixed(1)));
  }
  if (!scope || scope === 'scene') {
    const sceneStats = gatherSceneStats();
    if (sceneStats) {
      lines.push(formatLine('Scene', sceneStats.sceneId != null ? sceneStats.sceneId : '-'));
      if (sceneStats.viewport != null) {
        lines.push(formatLine('Viewport', `0x${sceneStats.viewport.toString(16)}`));
      }
      if (sceneStats.eventCount != null) {
        const suffix = sceneStats.eventVersion != null ? ` v${sceneStats.eventVersion}` : '';
        lines.push(formatLine('Events', `${sceneStats.eventCount}${suffix}`));
      }
    }
    const spriteStats = gatherSpriteStats();
    if (spriteStats) {
      lines.push(formatLine('Sprites', `${spriteStats.cacheSize}/${spriteStats.stats.created}`));
      spriteStats.cache.forEach((entry) => {
        lines.push(`  #${entry.spriteNum}: ${entry.frameCount}f`);
      });
    }
  }
  if (!scope || scope === 'battle') {
    const battleStats = gatherBattleStats();
    if (battleStats) {
      lines.push('Battle: active');
      lines.push(formatLine('Enemies', battleStats.enemyCount));
      if (battleStats.actionQueue != null) {
        lines.push(formatLine('Queue', battleStats.actionQueue));
      }
    }
  }
  const rleStats = gatherRLEStats();
  if (rleStats) {
    lines.push(formatLine('RLE calls', rleStats.calls));
    lines.push(formatLine('RLE reused', rleStats.reused));
  }
  return lines.join('\n');
}

function startOverlay(scope) {
  ensureOverlay();
  cancelLoop();
  scheduleLoop((context) => renderSummary(scope, context));
}

function stopOverlay() {
  cancelLoop();
  if (overlayElement && overlayElement.parentNode) {
    overlayElement.parentNode.removeChild(overlayElement);
  }
  overlayElement = null;
  frameCount = 0;
}

function toggleOverlay(scope) {
  if (overlayElement) {
    stopOverlay();
  } else {
    startOverlay(scope);
  }
}

export {
  startOverlay,
  stopOverlay,
  toggleOverlay
};

export default {
  startOverlay,
  stopOverlay,
  toggleOverlay
};
