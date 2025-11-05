import worldService from './world-service.js';
import stateService from './state-service.js';
import { getSceneTableValue } from '../state/slices/scene-table.js';

function resolveSceneId(sceneId) {
  if (typeof sceneId === 'number' && sceneId > 0) {
    return sceneId;
  }
  if (worldService && typeof worldService.getSceneId === 'function') {
    const current = worldService.getSceneId();
    if (typeof current === 'number' && current > 0) {
      return current;
    }
  }
  return 0;
}

export function getSceneEntry(sceneId) {
  const resolvedId = resolveSceneId(sceneId);
  if (resolvedId <= 0) {
    return null;
  }
  const table = getSceneTableValue([]);
  if (Array.isArray(table) && table.length > 0) {
    const index = resolvedId - 1;
    if (index >= 0 && index < table.length) {
      const entry = table[index];
      if (entry) {
        return entry;
      }
    }
  }
  if (worldService && typeof worldService.getSceneEntry === 'function') {
    return worldService.getSceneEntry(resolvedId);
  }
  return null;
}

function coerceRangeValue(value, fallback) {
  if (Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return Number.isFinite(fallback) ? Math.trunc(fallback) : 0;
}

export function getSceneEventObjectRange(sceneId) {
  const resolvedId = resolveSceneId(sceneId);
  if (resolvedId <= 0) {
    return {
      start: 0,
      end: 0,
      count: 0
    };
  }

  const table = getSceneTableValue([]);
  let start = null;
  let end = null;
  if (Array.isArray(table) && table.length > 0) {
    const index = resolvedId - 1;
    const current = table[index];
    if (current && typeof current.eventObjectIndex === 'number') {
      start = Math.trunc(current.eventObjectIndex);
    }
    const next = table[index + 1];
    if (next && typeof next.eventObjectIndex === 'number') {
      end = Math.trunc(next.eventObjectIndex);
    }
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    if (worldService && typeof worldService.getSceneEventObjectRange === 'function') {
      const fallback = worldService.getSceneEventObjectRange(resolvedId);
      if (!Number.isFinite(start) && fallback && Number.isFinite(fallback.start)) {
        start = Math.trunc(fallback.start);
      }
      if (!Number.isFinite(end) && fallback && Number.isFinite(fallback.end)) {
        end = Math.trunc(fallback.end);
      }
    }
  }

  if (!Number.isFinite(end)) {
    const eventTable = stateService.getGameData('eventObject');
    const total = Array.isArray(eventTable)
      ? eventTable.length
      : (eventTable && typeof eventTable.length === 'number' ? eventTable.length : 0);
    end = Number.isFinite(total) ? total : null;
  }

  if (!Number.isFinite(start)) {
    start = 0;
  }
  if (!Number.isFinite(end)) {
    end = start;
  }
  const count = Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(0, end - start)
    : 0;

  return {
    start: coerceRangeValue(start, 0),
    end: coerceRangeValue(end, 0),
    count: coerceRangeValue(count, 0)
  };
}

export function getSceneTable() {
  const table = getSceneTableValue([]);
  if (Array.isArray(table) && table.length > 0) {
    return table;
  }
  if (worldService && typeof worldService.getSceneTable === 'function') {
    const fallback = worldService.getSceneTable();
    return Array.isArray(fallback) ? fallback : [];
  }
  return [];
}

export default {
  getSceneEntry,
  getSceneEventObjectRange,
  getSceneTable
};
