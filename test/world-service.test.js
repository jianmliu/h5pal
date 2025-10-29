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
    globalThis.Direction = {
      South: 0,
      West: 1,
      North: 2,
      East: 3,
      Unknown: 4
    };

    globalThis.Global = {
      viewport: PAL_XY(10, 20),
      partyOffset: PAL_XY(160, 112),
      party: [
        { playerRole: 0, x: 10, y: 20, frame: 0 },
        { playerRole: 1, x: 12, y: 18, frame: 0 }
      ],
      trail: [createTrailEntry(), createTrailEntry(), createTrailEntry(), createTrailEntry(), createTrailEntry()],
      numScene: 1,
      maxPartyMemberIndex: 1,
      partyDirection: 0,
      equipmentEffect: [{ spriteNumInBattle: [0, 101] }]
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
      ],
      object: [
        { item: { flags: 0, scriptOnUse: 123 } },
        { item: { flags: 0, scriptOnUse: 456 } }
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
    worldService.setEventObjectTable(GameData.eventObject);
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

  it('exposes event object ranges, direction helpers, and object accessors', () => {
    worldService.init();
    const range = worldService.getSceneEventObjectRange();
    expect(range.start).toBe(0);
    expect(range.end).toBe(2);
    const sceneObjects = worldService.getEventObjectsInCurrentScene();
    expect(sceneObjects).toHaveLength(range.count);

    expect(worldService.getPartyDirection()).toBe(0);
    worldService.setPartyDirection(1);
    expect(worldService.getPartyDirection()).toBe(1);
    expect(Global.partyDirection).toBe(1);

    const objectEntry = worldService.getObjectEntry(0);
    expect(objectEntry.item.scriptOnUse).toBe(123);
    worldService.mutateObjectEntry(0, (entry) => {
      entry.item.scriptOnUse = 321;
      return entry;
    });
    expect(worldService.getObjectEntry(0).item.scriptOnUse).toBe(321);
  });

  it('replaces core tables through helper setters', () => {
    worldService.init();
    const updatedScene = { eventObjectIndex: 0, mapNum: 1, scriptOnEnter: 99 };
    const nextScenes = [updatedScene, { eventObjectIndex: 2, mapNum: 1, scriptOnEnter: 0 }];
    worldService.setSceneTable(nextScenes);
    worldService.syncScene();
    const sceneComponent = worldService.getSceneComponent();
    expect(sceneComponent.sceneRef).toBe(updatedScene);
    expect(worldService.getSceneTable()).toBe(nextScenes);

    const scriptEntries = [{ opcode: 1 }, { opcode: 2 }];
    worldService.setScriptEntries(scriptEntries);
    expect(worldService.getScriptEntry(1)).toBe(scriptEntries[1]);
    const objects = [{ enemy: { enemyID: 1 } }];
    worldService.setObjectTable(objects);
    expect(worldService.getObjectTable()).toBe(objects);

    const eventObjects = [
      { state: 10, triggerMode: 0, spriteNum: 1 },
      { state: 20, triggerMode: 0, spriteNum: 2 }
    ];
    worldService.setEventObjectTable(eventObjects);
    worldService.syncEventObjects();
    expect(worldService.getEventObjectComponent(0).stateRef).toBe(eventObjects[0]);
    expect(worldService.getEventObjectTable()).toBe(eventObjects);

    expect(worldService.getEquipmentEffects()).toBe(globalThis.Global.equipmentEffect);

    worldService.setBattleSpeed(3);
    expect(worldService.getBattleSpeed()).toBe(3);
  });
});
