import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sceneDataAdapter, {
  getSceneEntry as getSceneEntryViaNamed,
  getSceneEventObjectRange
} from '../src/services/scene-data-adapter.js';
import worldService from '../src/services/world-service.js';
import reactiveContext from '../src/state/reactive-context.js';
import stateService from '../src/services/state-service.js';
import {
  updateSceneTableValue,
  resetSceneTableSlice
} from '../src/state/slices/scene-table.js';

describe('scene-data-adapter', () => {
  beforeEach(() => {
    reactiveContext.dispose();
    worldService.dispose();
    resetSceneTableSlice();
    vi.restoreAllMocks();

    globalThis.Global = {
      numScene: 1
    };

    globalThis.GameData = {
      scene: [
        { eventObjectIndex: 0 },
        { eventObjectIndex: 3 },
        { eventObjectIndex: 6 }
      ]
    };
  });

  afterEach(() => {
    resetSceneTableSlice();
    vi.restoreAllMocks();
    worldService.dispose();
    reactiveContext.dispose();
    stateService.updateGlobal({});
    stateService.updateGameData({});
    globalThis.Global = {};
    globalThis.GameData = {};
  });

  it('prefers entries from the scene-table slice', () => {
    const sliceEntry = { eventObjectIndex: 12, mapNum: 42, scriptOnEnter: 99 };
    const fallbackEntry = { eventObjectIndex: 1, mapNum: 1 };

    updateSceneTableValue([sliceEntry, fallbackEntry], { emitEvent: false });

    const spy = vi.spyOn(worldService, 'getSceneEntry');
    const result = sceneDataAdapter.getSceneEntry(1);

    expect(result).toBe(sliceEntry);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('falls back to worldService when slice data is missing', () => {
    resetSceneTableSlice();
    const fallbackEntry = { eventObjectIndex: 7, mapNum: 7 };
    const spy = vi.spyOn(worldService, 'getSceneEntry').mockReturnValue(fallbackEntry);

    const result = sceneDataAdapter.getSceneEntry(2);

    expect(result).toBe(fallbackEntry);
    expect(spy).toHaveBeenCalledWith(2);
  });

  it('computes event object range from contiguous slice entries', () => {
    updateSceneTableValue(
      [
        { eventObjectIndex: 5 },
        { eventObjectIndex: 11 },
        { eventObjectIndex: 20 }
      ],
      { emitEvent: false }
    );

    const range = getSceneEventObjectRange(1);
    expect(range).toEqual({ start: 5, end: 11, count: 6 });
  });

  it('derives range end from game data when slice lacks a successor entry', () => {
    updateSceneTableValue(
      [
        { eventObjectIndex: 10 },
        { eventObjectIndex: 25 }
      ],
      { emitEvent: false }
    );
    const eventTable = new Array(40).fill(null);
    stateService.setGameData('eventObject', eventTable);
    const spy = vi.spyOn(worldService, 'getSceneEventObjectRange').mockReturnValue(null);

    const range = getSceneEventObjectRange(2);
    expect(range).toEqual({ start: 25, end: 40, count: 15 });
    expect(spy).toHaveBeenCalledWith(2);
  });

  it('falls back to worldService range when slice data is absent', () => {
    resetSceneTableSlice();
    const spy = vi
      .spyOn(worldService, 'getSceneEventObjectRange')
      .mockReturnValue({ start: 3, end: 8, count: 5 });

    const range = getSceneEventObjectRange(3);
    expect(range).toEqual({ start: 3, end: 8, count: 5 });
    expect(spy).toHaveBeenCalledWith(3);
  });

  it('resolves sceneId via worldService when not provided', () => {
    updateSceneTableValue([{ eventObjectIndex: 1 }], { emitEvent: false });
    vi.spyOn(worldService, 'getSceneId').mockReturnValue(1);

    const entry = getSceneEntryViaNamed();
    expect(entry).toEqual({ eventObjectIndex: 1 });
  });
});
