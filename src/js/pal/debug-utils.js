import scriptObjectAdapter from '../../services/script-object-adapter.js';
import sceneEventAdapter from '../../services/scene-event-adapter.js';
import worldService from '../../services/world-service.js';

function formatScriptEntry(entryId) {
  if (!Number.isFinite(entryId)) {
    return null;
  }
  const entry = scriptObjectAdapter.getScriptEntry(entryId);
  if (!entry) {
    return null;
  }
  const operands = Array.isArray(entry.operand) ? entry.operand.slice() : [];
  return {
    id: entryId,
    operation: entry.operation,
    operand: operands
  };
}

function inspectEventObject(eventId) {
  if (!Number.isFinite(eventId)) {
    return null;
  }
  const entry = sceneEventAdapter.getEventObjectEntryById(Math.trunc(eventId));
  if (!entry) {
    return { id: eventId, missing: true };
  }
  const state = entry.state || null;
  const triggerScript = state ? state.triggerScript : null;
  const autoScript = state ? state.autoScript : null;
  return {
    id: entry.id,
    index: entry.index,
    state,
    triggerScript,
    autoScript,
    triggerEntry: formatScriptEntry(triggerScript),
    autoEntry: formatScriptEntry(autoScript)
  };
}

function listTriggerScripts(ids) {
  const targets = Array.isArray(ids) ? ids : [ids];
  return targets.map((id) => inspectEventObject(id));
}

function dumpSceneEventObjects(limit = 10) {
  const entries = sceneEventAdapter.getEventObjects() || [];
  const slice = Number.isFinite(limit) ? entries.slice(0, Math.max(0, limit)) : entries;
  return slice.map((entry) => inspectEventObject(entry && entry.id));
}

function traceBattleLoop(iterations = 1) {
  const limit = Number.isFinite(iterations) ? Math.max(1, iterations) : 1;
  const history = [];
  for (let i = 0; i < limit; i++) {
    const state = typeof worldService.getBattleState === 'function' ? worldService.getBattleState() : null;
    const playerActions = state && Array.isArray(state.player)
      ? state.player.map((player) => player && player.action)
      : null;
    const queue = state && Array.isArray(state.queue)
      ? state.queue.map((entry) => entry && entry.action)
      : null;
    history.push({ index: i, playerActions, queue, state });
  }
  return history;
}

function resolveScriptSequence(startEntry, depth = 10) {
  const results = [];
  let current = Number.isFinite(startEntry) ? startEntry : null;
  for (let i = 0; i < depth && Number.isFinite(current) && current > 0; i++) {
    const entry = formatScriptEntry(current);
    if (!entry) {
      results.push({ id: current, missing: true });
      break;
    }
    results.push(entry);
    // Simple heuristic: treat operand[0] as the next jump target if operation is 0x0003 (unconditional jump)
    if (entry.operation === 0x0003 && Number.isFinite(entry.operand[0]) && entry.operand[0] > 0) {
      current = entry.operand[0];
    } else {
      current += 1;
    }
  }
  return results;
}

export {
  formatScriptEntry,
  inspectEventObject,
  listTriggerScripts,
  dumpSceneEventObjects,
  traceBattleLoop,
  resolveScriptSequence
};

export default {
  formatScriptEntry,
  inspectEventObject,
  listTriggerScripts,
  dumpSceneEventObjects,
  traceBattleLoop,
  resolveScriptSequence
};
