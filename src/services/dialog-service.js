import reactiveContext from '../state/reactive-context.js';

const MAX_HISTORY = 20;

const currentLineSignal = reactiveContext.ensureSignal('dialog.currentLine', null);
const historySignal = reactiveContext.ensureSignal('dialog.history', []);
const statusSignal = reactiveContext.ensureSignal('dialog.status', {
  active: false,
  awaitingInput: false,
  needsAdvance: false,
  lastUpdated: null
});
const choiceSignal = reactiveContext.ensureSignal('dialog.choice', null);
const injectedLines = [];

function clearInjectedLines(predicate) {
  if (!injectedLines.length) {
    return;
  }
  if (typeof predicate !== 'function') {
    injectedLines.length = 0;
    return;
  }
  for (let i = injectedLines.length - 1; i >= 0; i--) {
    const entry = injectedLines[i];
    let shouldRemove = false;
    try {
      shouldRemove = predicate(entry) === true;
    } catch (err) {
      shouldRemove = true;
    }
    if (shouldRemove) {
      injectedLines.splice(i, 1);
    }
  }
}

let pendingMetadata = null;
let choiceCounter = 0;

function now() {
  return Date.now();
}

function normalizeLine(payload = {}) {
  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  return {
    text,
    msgId: Number.isFinite(payload.msgId) ? Math.trunc(payload.msgId) : null,
    position: payload.position || null,
    line: Number.isFinite(payload.line) ? Math.trunc(payload.line) : null,
    timestamp: payload.timestamp || now(),
    scriptEntry: Number.isFinite(payload.scriptEntry) ? Math.trunc(payload.scriptEntry) : null,
    eventObjectId: Number.isFinite(payload.eventObjectId) ? Math.trunc(payload.eventObjectId) : null,
    source: payload.source || null,
    metadata: payload.metadata || null
  };
}

function pushHistory(entry) {
  if (!entry || !entry.text) {
    return;
  }
  const history = Array.isArray(historySignal.value) ? historySignal.value.slice(-MAX_HISTORY + 1) : [];
  history.push(entry);
  historySignal.value = history;
}

function consumePendingMetadata() {
  const metadata = pendingMetadata;
  pendingMetadata = null;
  return metadata || null;
}

function clampIndex(index, length) {
  if (!Number.isFinite(index)) {
    return null;
  }
  const clamped = Math.max(0, Math.min(length - 1, Math.trunc(index)));
  return Number.isFinite(clamped) ? clamped : null;
}

function getOptions(choice) {
  if (!choice) {
    return [];
  }
  return Array.isArray(choice.options) ? choice.options : [];
}

function deriveSelectionIndex(choice, resolvedValue, fallbackIndex) {
  const options = getOptions(choice);
  if (options.length === 0) {
    return null;
  }
  if (fallbackIndex != null) {
    return clampIndex(fallbackIndex, options.length);
  }
  if (resolvedValue !== undefined) {
    const match = options.findIndex((entry) => entry && entry.value === resolvedValue);
    if (match >= 0) {
      return match;
    }
  }
  return null;
}

function deriveSelectionLabel(choice, index, resolvedValue, explicitLabel) {
  if (explicitLabel) {
    return explicitLabel;
  }
  const options = getOptions(choice);
  if (index != null && options[index] && typeof options[index].label === 'string') {
    return options[index].label.trim();
  }
  if (typeof resolvedValue === 'string') {
    return resolvedValue;
  }
  if (typeof resolvedValue === 'boolean') {
    return resolvedValue ? 'YES' : 'NO';
  }
  if (typeof resolvedValue === 'number') {
    return `Option ${resolvedValue}`;
  }
  return null;
}

function updateStatus(patch = {}, tag = '') {
  const previous = statusSignal.value || {};
  const next = Object.assign({}, previous, patch, { lastUpdated: now() });
  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug('[dialog][status]', tag || 'update', next);
  }
  statusSignal.value = next;
  return next;
}

function publishLine(payload = {}) {
  const metadata = consumePendingMetadata();
  const entry = normalizeLine(Object.assign({}, metadata || {}, payload));
  currentLineSignal.value = entry;
  pushHistory(entry);
  choiceSignal.value = null;
  updateStatus({
    active: true,
    awaitingInput: payload.awaitingInput === true,
    needsAdvance: true,
    position: entry.position ?? (metadata && metadata.position) ?? statusSignal.value?.position ?? null,
    lastMsgId: entry.msgId
  });
  return entry;
}

function clearDialog(reason = 'unknown') {
  currentLineSignal.value = null;
  updateStatus({
    active: false,
    awaitingInput: false,
    needsAdvance: false,
    reason
  }, 'clearDialog');
  if (reason === 'endDialog' || reason === 'clearDialog') {
    clearInjectedLines();
  }
}

function setPendingLineMetadata(metadata) {
  if (!metadata) {
    pendingMetadata = null;
    return;
  }
  pendingMetadata = Object.assign({}, metadata);
}

function setAwaitingInput(isAwaiting, context = {}) {
  updateStatus({
    awaitingInput: !!isAwaiting,
    active: isAwaiting ? true : statusSignal.value?.active,
    needsAdvance: isAwaiting ? true : statusSignal.value?.needsAdvance,
    position: context.position ?? statusSignal.value?.position ?? null
  }, isAwaiting ? 'awaiting:true' : 'awaiting:false');
}

function publishChoice(choice) {
  if (!choice) {
    choiceSignal.value = null;
    return null;
  }
  const options = getOptions(choice);
  const payload = Object.assign({}, choice, {
    id: ++choiceCounter,
    timestamp: now(),
    options
  });
  if (payload.selectedIndex != null) {
    payload.selectedIndex = clampIndex(payload.selectedIndex, options.length || 1) ?? 0;
  }
  choiceSignal.value = payload;
  updateStatus({
    active: true,
    awaitingInput: true,
    needsAdvance: true
  });
  return payload;
}

function resolveChoice(result, options = {}) {
  const current = choiceSignal.value;
  if (!current) {
    return null;
  }
  const selectionIndex =
    clampIndex(options.selectedIndex, getOptions(current).length || 1) ??
    deriveSelectionIndex(current, result, current.selectedIndex);
  const resolvedLabel = deriveSelectionLabel(current, selectionIndex, result, options.label);
  const resolved = Object.assign({}, current, {
    resolved: result,
    resolvedAt: now(),
    selectedIndex: selectionIndex,
    resolvedLabel,
    resolvedSelection: {
      index: selectionIndex,
      label: resolvedLabel,
      value: result
    }
  });
  choiceSignal.value = resolved;
  updateStatus({
    awaitingInput: false,
    needsAdvance: true
  });
  return resolved;
}

function queueInjectedLine(entry = {}) {
  const buffer = entry.buffer instanceof Uint8Array ? entry.buffer : null;
  if (!buffer || buffer.length === 0) {
    return;
  }
  const ttlMs = Number.isFinite(entry.ttlMs) ? Math.max(0, entry.ttlMs) : 0;
  injectedLines.push({
    buffer,
    metadata: entry.metadata || null,
    position: Number.isFinite(entry.position) ? entry.position : null,
    skipOriginal: entry.skipOriginal === true,
    targetEventId: Number.isFinite(entry.targetEventId) ? entry.targetEventId : null,
    targetSceneId: Number.isFinite(entry.targetSceneId) ? entry.targetSceneId : null,
    expiresAt: ttlMs > 0 ? Date.now() + ttlMs : null
  });
}

function consumeInjectedLine(defaultBuffer, context = {}) {
  const now = Date.now();
  for (let i = 0; i < injectedLines.length; i++) {
    const entry = injectedLines[i];
    if (entry.expiresAt && entry.expiresAt < now) {
      injectedLines.splice(i, 1);
      i--;
      continue;
    }
    if (entry.targetEventId && context.eventObjectId && entry.targetEventId !== context.eventObjectId) {
      continue;
    }
    if (entry.targetSceneId && context.sceneId && entry.targetSceneId !== context.sceneId) {
      continue;
    }
    injectedLines.splice(i, 1);
    if (!(entry.buffer instanceof Uint8Array)) {
      return null;
    }
    return Object.assign({}, entry, {
      originalBuffer: defaultBuffer
    });
  }
  return null;
}

const dialogService = {
  publishLine,
  clearDialog,
  setPendingLineMetadata,
  consumePendingMetadata,
  setAwaitingInput,
  publishChoice,
  resolveChoice,
  queueInjectedLine,
  consumeInjectedLine,
  clearInjectedLines,
  getCurrentLine() {
    return currentLineSignal.value;
  },
  getHistory() {
    return historySignal.value || [];
  },
  getStatus() {
    return statusSignal.value || { active: false, awaitingInput: false };
  },
  getChoice() {
    return choiceSignal.value;
  },
  signals: {
    currentLine: currentLineSignal,
    history: historySignal,
    status: statusSignal,
    choice: choiceSignal
  }
};

export default dialogService;
