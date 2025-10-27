import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import worldService from '../src/services/world-service.js';
import stateService from '../src/services/state-service.js';

function createTrailEntry() {
  return { x: 0, y: 0, direction: 0 };
}

describe('world service', () => {
  beforeEach(() => {
    globalThis.PAL_X = (pos) => pos & 0xFFFF;
    globalThis.PAL_Y = (pos) => (pos >>> 16) & 0xFFFF;
    globalThis.PAL_XY = (x, y) => ((y & 0xFFFF) << 16) | (x & 0xFFFF);

    globalThis.Global = {
      viewport: PAL_XY(10, 20),
      partyOffset: PAL_XY(160, 112),
      party: [
        { playerRole: 0, x: 10, y: 20, frame: 0 },
        { playerRole: 1, x: 12, y: 18, frame: 0 }
      ],
      trail: [createTrailEntry(), createTrailEntry(), createTrailEntry(), createTrailEntry(), createTrailEntry()],
      numScene: 1,
      maxPartyMemberIndex: 1
    };

    globalThis.GameData = {
      eventObject: [
        { state: 1, triggerMode: 0, spriteNum: 0 },
        { state: 2, triggerMode: 0, spriteNum: 0 }
      ],
      scene: [
        { eventObjectIndex: 0, mapNum: 0, scriptOnEnter: 0 },
        { eventObjectIndex: 2, mapNum: 1, scriptOnEnter: 0 }
      ],
      map: [
        { metadata: { name: 'map0' } },
        { metadata: { name: 'map1' } }
      ]
    };

    worldService.dispose();
  });

  afterEach(() => {
    worldService.dispose();
  });

  it('initialises viewport and party structures', () => {
    worldService.init();
    const viewport = worldService.getViewportComponent();
    expect(viewport.value).toBe(Global.viewport);
    expect(viewport.partyOffset).toBe(Global.partyOffset);

    const partyMember = worldService.getPartyComponent(0);
    expect(partyMember).toBeDefined();
    expect(partyMember.stateRef).toBe(Global.party[0]);

    const trailComponent = worldService.getTrailComponent();
    expect(trailComponent.stateRef).toBe(Global.trail);
  });

  it('tracks viewport mutations', () => {
    worldService.init();
    const nextViewport = PAL_XY(200, 300);
    stateService.setGlobal('viewport', nextViewport);
    worldService.syncViewport();
    const viewport = worldService.getViewportComponent();
    expect(viewport.value).toBe(nextViewport);
    expect(worldService.getViewport()).toBe(nextViewport);
  });

  it('exposes scene metadata and map references', () => {
    worldService.init();
    const sceneComponent = worldService.getSceneComponent();
    expect(sceneComponent.sceneRef).toBe(GameData.scene[0]);
    expect(sceneComponent.mapRef).toBe(GameData.map[0]);

    Global.numScene = 2;
    stateService.setGlobal('numScene', 2);
    worldService.syncScene();
    const updatedComponent = worldService.getSceneComponent();
    expect(updatedComponent.sceneRef).toBe(GameData.scene[1]);
    expect(updatedComponent.mapRef).toBe(GameData.map[1]);
  });

  it('provides access to event objects and syncs scene id', () => {
    worldService.init();
    const eventComponent = worldService.getEventObjectComponent(1);
    expect(eventComponent.sceneId).toBe(Global.numScene);
    expect(eventComponent.stateRef).toBe(GameData.eventObject[1]);

    GameData.eventObject.push({ state: 3, triggerMode: 0, spriteNum: 0 });
    stateService.setGameData('eventObject', GameData.eventObject);
    worldService.syncEventObjects();
    const nextComponent = worldService.getEventObjectComponent(2);
    expect(nextComponent.stateRef).toBe(GameData.eventObject[2]);
  });

  it('mutates party offset and propagates', () => {
    worldService.init();
    const previous = worldService.getViewportComponent().partyOffset;
    worldService.mutatePartyOffset((value) => PAL_XY(PAL_X(value) + 16, PAL_Y(value) + 8));
    const updated = worldService.getViewportComponent().partyOffset;
    expect(updated).not.toBe(previous);
    expect(updated).toBe(Global.partyOffset);
  });
});
