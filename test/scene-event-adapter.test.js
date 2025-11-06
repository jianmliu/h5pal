import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import sceneEventAdapter from '../src/services/scene-event-adapter.js';
import worldService from '../src/services/world-service.js';
import reactiveContext from '../src/state/reactive-context.js';
import stateService from '../src/services/state-service.js';
import {
  getEventObjectsValue as getEventObjectsSliceValue,
  updateEventObjectsValue as updateEventObjectsSlice
} from '../src/state/slices/scene-events.js';

describe('sceneEventAdapter', () => {
  beforeEach(() => {
    reactiveContext.dispose();
    worldService.dispose();
    sceneEventAdapter.dispose();

    globalThis.Global = {
      viewport: 0,
      partyOffset: 0,
      party: [{ playerRole: 0 }],
      trail: [],
      maxPartyMemberIndex: 0,
      numFollower: 0,
      partyDirection: 0,
      autoBattle: false,
      frameNum: 0,
      inventory: [],
      cash: 0,
      lastUnequippedItem: 0,
      curMainMenuItem: 0,
      curSystemMenuItem: 0,
      curInvMenuItem: 0,
      noMusic: false,
      noSound: false,
      musicNum: 0,
      numBattleMusic: 0,
      numBattleField: 0,
      screenWave: 0,
      waveProgression: 0,
      needToFadeIn: false,
      numPalette: 0,
      nightPalette: false,
      layer: 0,
      numScene: 1
    };

    globalThis.GameData = {
      eventObject: [
        { state: 1, triggerMode: 0, triggerScript: 123, autoScript: 0, x: 10, y: 20, layer: 0, direction: 0, currentFrameNum: 0, vanishTime: 0 },
        { state: 2, triggerMode: 0, triggerScript: 456, autoScript: 789, x: 30, y: 40, layer: 0, direction: 1, currentFrameNum: 0, vanishTime: 0 }
      ],
      scene: [
        { eventObjectIndex: 0, mapNum: 0, scriptOnEnter: 0 },
        { eventObjectIndex: 1, mapNum: 1, scriptOnEnter: 0 }
      ],
      map: [
        { metadata: { name: 'map0' } },
        { metadata: { name: 'map1' } }
      ]
    };

    worldService.init();
    worldService.syncEventObjects();

  });

  afterEach(() => {
    sceneEventAdapter.dispose();
    worldService.dispose();
    reactiveContext.dispose();
    stateService.updateGlobal({});
  });

  it('publishes scene id, event objects, and collision state updates', () => {
    const events = [];
    const unsubscribe = sceneEventAdapter.subscribe((event) => events.push(event));

    expect(events[0].type).toBe('snapshot');
    expect(sceneEventAdapter.getSceneId()).toBe(1);
    expect(sceneEventAdapter.getEventObjects().length).toBeGreaterThan(0);
    expect(sceneEventAdapter.getEventObjectEntryById(1).state).toBeDefined();
    expect(sceneEventAdapter.getEventObjectStateById(1)).toEqual(
      expect.objectContaining({ state: 1 })
    );

    worldService.setSceneId(2);
    worldService.setEventObjectTable([
      { state: 3, triggerMode: 0, autoScript: 0, x: 5, y: 5, layer: 0, direction: 0, currentFrameNum: 1, vanishTime: 0 },
      { state: 4, triggerMode: 0, autoScript: 0, x: 6, y: 6, layer: 0, direction: 1, currentFrameNum: 0, vanishTime: 0 }
    ]);

    const sceneIdEvent = events.find((event) => event.type === 'sceneId');
    const eventObjectsEvent = events.find((event) => event.type === 'eventObjects');
    expect(sceneIdEvent).toBeTruthy();
    if (eventObjectsEvent) {
      expect(typeof eventObjectsEvent.version).toBe('number');
    } else {
      expect(sceneEventAdapter.getEventObjectsVersion()).toBeGreaterThan(0);
    }
    expect(sceneEventAdapter.getSceneId()).toBe(2);
    expect(sceneEventAdapter.getEventObjects().length).toBe(1);
    expect(sceneEventAdapter.getEventObjectsVersion()).toBeGreaterThan(0);

    unsubscribe();
  });

  it('falls back to global event data when entry is outside current scene range', () => {
    // First scene only covers index 0. Entry with id 2 belongs to next scene and
    // should be resolved via the worldService fallback.
    const arrayLike = { length: globalThis.GameData.eventObject.length };
    for (let i = 0; i < arrayLike.length; i++) {
      arrayLike[i] = globalThis.GameData.eventObject[i];
    }
    stateService.setGameData('eventObject', arrayLike);
    const entry = sceneEventAdapter.getEventObjectEntryById(2);
    expect(entry).toBeTruthy();
    expect(entry && entry.id).toBe(2);
    expect(entry && entry.state && entry.state.triggerScript).toBe(456);
  });

  it('returns filtered snapshot clones and ignores external mutations', () => {
    const snapshot = sceneEventAdapter.getEventObjects();
    const initialLength = snapshot.length;
    const initialVersion = sceneEventAdapter.getEventObjectsVersion();

    expect(initialLength).toBeGreaterThan(0);

    snapshot.push({ id: 999, index: 999, state: {} });
    snapshot[0].id = 4242;

    const freshSnapshot = sceneEventAdapter.getEventObjects();
    expect(freshSnapshot.length).toBe(initialLength);
    expect(freshSnapshot[0].id).not.toBe(4242);
    expect(sceneEventAdapter.getEventObjectsVersion()).toBe(initialVersion);
  });

  it('does not bump version on structurally identical slice updates', () => {
    const beforeVersion = sceneEventAdapter.getEventObjectsVersion();
    const currentSlice = getEventObjectsSliceValue();

    updateEventObjectsSlice(currentSlice, { source: 'test' });

    expect(sceneEventAdapter.getEventObjectsVersion()).toBe(beforeVersion);
  });

  it('filters null entries and bumps version when event table changes', () => {
    const originalTable = [...globalThis.GameData.eventObject];
    const beforeVersion = sceneEventAdapter.getEventObjectsVersion();

    const mutatedTable = [...globalThis.GameData.eventObject];
    mutatedTable[0] = null;
    worldService.setEventObjectTable(mutatedTable);

    const snapshot = sceneEventAdapter.getEventObjects();
    expect(snapshot.every((entry) => entry && entry.state)).toBe(true);
    expect(snapshot.find((entry) => entry && entry.id === 1)).toBeUndefined();
    expect(sceneEventAdapter.getEventObjectsVersion()).toBeGreaterThan(beforeVersion);

    worldService.setEventObjectTable(originalTable);
  });

  it('reinitialises cleanly after dispose and reflects latest data', () => {
    const firstSnapshot = sceneEventAdapter.getEventObjects();
    expect(firstSnapshot.length).toBeGreaterThan(0);

    sceneEventAdapter.dispose();
    expect(sceneEventAdapter.getListenerCount()).toBe(0);

    worldService.setEventObjectTable([
      { state: 10, triggerMode: 0, autoScript: 0, x: 5, y: 5, layer: 0, direction: 0, currentFrameNum: 0, vanishTime: 0 },
      null
    ]);

    const versionAfterDispose = sceneEventAdapter.getEventObjectsVersion();
    expect(versionAfterDispose).toBeGreaterThan(0);

    const secondSnapshot = sceneEventAdapter.getEventObjects();
    expect(secondSnapshot.length).toBe(1);
    expect(secondSnapshot[0]).toEqual({
      id: 1,
      index: 0,
      state: expect.objectContaining({ state: 10 })
    });
    expect(secondSnapshot).not.toBe(firstSnapshot);
  });
});
