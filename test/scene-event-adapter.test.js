import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import sceneEventAdapter from '../src/services/scene-event-adapter.js';
import worldService from '../src/services/world-service.js';
import reactiveContext from '../src/state/reactive-context.js';
import stateService from '../src/services/state-service.js';

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
        { state: 1, triggerMode: 0, autoScript: 0, x: 10, y: 20, layer: 0, direction: 0, currentFrameNum: 0, vanishTime: 0 }
      ],
      scene: [
        { eventObjectIndex: 0, mapNum: 0, scriptOnEnter: 0 }
      ],
      map: [
        { metadata: { name: 'map0' } }
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
      { state: 2, triggerMode: 0, autoScript: 0, x: 5, y: 5, layer: 0, direction: 0, currentFrameNum: 1, vanishTime: 0 }
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
});
