import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import worldService from '../src/services/world-service.js';
import stateService from '../src/services/state-service.js';
import reactiveContext from '../src/state/reactive-context.js';
import { autoBattleSignal, autoBattleStream } from '../src/state/slices/auto-battle.js';
import { frameCountSignal, frameCountStream } from '../src/state/slices/frame-count.js';
import {
  menuSelectionSignals,
  audioToggleSignals
} from '../src/state/slices/menu-selections.js';
import { inventorySignals } from '../src/state/slices/inventory.js';
import { sceneEventSignals } from '../src/state/slices/scene-events.js';
import { audioResourceSignals } from '../src/state/slices/audio-resources.js';
import { gameFlagSignals } from '../src/state/slices/game-flags.js';
import { scriptObjectSignals } from '../src/state/slices/script-objects.js';
import { battleFormationSignals } from '../src/state/slices/battle-formation.js';
import {
  partyTrailSignals,
  partyStream,
  trailStream,
  followerCountStream,
  getPartyValue as getPartySliceValue,
  getTrailValue as getTrailSliceValue,
  getFollowerCountValue as getFollowerCountSliceValue
} from '../src/state/slices/party-trail.js';

function createTrailEntry() {
  return { x: 0, y: 0, direction: 0 };
}

describe('world service', () => {
  beforeEach(() => {
    reactiveContext.dispose();
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
      numFollower: 0,
      equipmentEffect: [{ spriteNumInBattle: [0, 101] }],
      autoBattle: false,
      frameNum: 0,
      inventory: [
        { item: 10, amount: 2, amountInUse: 0 }
      ],
      cash: 88,
      objectDesc: [{ id: 1, text: 'Default item' }],
      lastUnequippedItem: 0,
      curMainMenuItem: 1,
      curSystemMenuItem: 2,
      curInvMenuItem: 3,
      noMusic: false,
      noSound: true,
      musicNum: 5,
      numBattleMusic: 6,
      numBattleField: 7,
      screenWave: 8,
      waveProgression: 9,
      needToFadeIn: true,
      numPalette: 10,
      nightPalette: false,
      layer: 3,
      collectValue: 4,
      chaseRange: 6,
      chaseSpeedChangeCycles: 2,
      battleSpeed: 2
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
      ],
      scriptEntry: [
        { opcode: 1, operand: [0, 0, 0] },
        { opcode: 2, operand: [1, 0, 0] }
      ],
      enemyTeam: [
        { enemy: [1, 2, 3] },
        { enemy: [4, 5, 6] }
      ],
      enemyPos: {
        pos: [
          [
            [{ x: 100, y: 120 }, { x: 140, y: 160 }],
            [{ x: 200, y: 220 }, { x: 240, y: 260 }]
          ]
        ]
      },
      battleField: [
        { backgroundId: 1 },
        { backgroundId: 2 }
      ],
      playerRoles: {
        HP: [30, 40, 50],
        maxHP: [60, 70, 80],
        MP: [20, 30, 40],
        maxMP: [40, 50, 60],
        attackStrength: [10, 12, 14],
        magicStrength: [8, 9, 10],
        defense: [5, 6, 7],
        dexterity: [4, 5, 6],
        fleeRate: [3, 4, 5],
        spriteNumInBattle: [0, 0, 0],
        equipment: [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0]
        ]
      }
    };

    worldService.dispose();
  });

  afterEach(() => {
    worldService.dispose();
    reactiveContext.dispose();
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
    worldService.setViewport(nextViewport);
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

  it('publishes party, trail, and follower state via reactive slices', () => {
    worldService.init();
    const { party, trail, followerCount } = partyTrailSignals();

    expect(Array.isArray(party.value)).toBe(true);
    expect(party.value[0].playerRole).toBe(Global.party[0].playerRole);
    expect(Array.isArray(trail.value)).toBe(true);
    expect(trail.value.length).toBe(Global.trail.length);
    expect(followerCount.value).toBe(0);

    const partyEmissions = [];
    const partySubscription = partyStream().subscribe((value) => {
      partyEmissions.push(value.map((member) => (member ? member.playerRole : null)));
    });

    worldService.mutatePartyMember(0, (member) => {
      member.playerRole = 5;
      return member;
    });
    expect(partyEmissions[partyEmissions.length - 1][0]).toBe(5);

    const trailEmissions = [];
    const trailSubscription = trailStream().subscribe((value) => {
      const first = value[0];
      trailEmissions.push(first ? first.x : null);
    });

    worldService.mutateTrail((currentTrail) => {
      if (Array.isArray(currentTrail) && currentTrail[0]) {
        currentTrail[0].x = 320;
      }
      return currentTrail;
    });
    expect(trailEmissions[trailEmissions.length - 1]).toBe(320);

    const followerEmissions = [];
    const followerSubscription = followerCountStream().subscribe((value) => {
      followerEmissions.push(value);
    });

    worldService.setFollowerCount(3);
    expect(followerEmissions[followerEmissions.length - 1]).toBe(3);

    stateService.setGlobal('numFollower', 1);
    expect(getFollowerCountSliceValue()).toBe(1);

    const nextParty = [
      { playerRole: 7, x: 0, y: 0, frame: 0 },
      { playerRole: 8, x: 0, y: 0, frame: 0 }
    ];
    stateService.setGlobal('party', nextParty);
    const resolvedParty = getPartySliceValue();
    expect(resolvedParty[0].playerRole).toBe(7);
    expect(resolvedParty[1].playerRole).toBe(8);

    const nextTrail = [
      { x: 11, y: 22, direction: 1 },
      { x: 33, y: 44, direction: 2 }
    ];
    stateService.setGlobal('trail', nextTrail);
    const resolvedTrail = getTrailSliceValue();
    expect(resolvedTrail[0].x).toBe(11);
    expect(resolvedTrail[1].direction).toBe(2);

    partySubscription.unsubscribe();
    trailSubscription.unsubscribe();
    followerSubscription.unsubscribe();
  });

  it('emits scene id, event objects, and collision state updates', () => {
    worldService.init();
    const { sceneId, eventObjects, collisionState } = sceneEventSignals();

    expect(sceneId.value).toBe(Global.numScene);
    expect(Array.isArray(eventObjects.value)).toBe(true);
    expect(eventObjects.value.length).toBeGreaterThan(0);
    expect(collisionState.value).toBeNull();

    worldService.setSceneId(2);
    expect(sceneId.value).toBe(2);

    worldService.setSceneId(1);
    expect(sceneId.value).toBe(1);

    expect(eventObjects.value.length).toBeGreaterThan(0);
    worldService.mutateEventObject(0, (entry) => {
      entry.state = 77;
      return entry;
    });
    expect(eventObjects.value[0].state.state).toBe(77);
    expect(collisionState.value).toBeNull();

    const fakeCollision = {
      mapId: 2,
      isBlocked: () => false
    };
    worldService.setCollisionState({ state: fakeCollision });
    expect(collisionState.value).toBe(fakeCollision);
  });

  it('synchronises autoBattle with reactive adapters', () => {
    worldService.init();
    const observed = [];
    const subscription = autoBattleStream().subscribe((value) => observed.push(value));
    expect(autoBattleSignal().value).toBe(false);
    worldService.setAutoBattle(true);
    expect(worldService.getAutoBattle()).toBe(true);
    expect(autoBattleSignal().value).toBe(true);
    worldService.setAutoBattle(false);
    expect(worldService.getAutoBattle()).toBe(false);
    expect(autoBattleSignal().value).toBe(false);
    expect(observed).toEqual([false, true, false]);
    subscription.unsubscribe();
  });

  it('updates frame count signal when mutated', () => {
    worldService.init();
    const updates = [];
    const subscription = frameCountStream().subscribe((value) => updates.push(value));
    expect(frameCountSignal().value).toBe(0);
    worldService.setFrameCount(12);
    expect(worldService.getFrameCount()).toBe(12);
    expect(frameCountSignal().value).toBe(12);
    worldService.incrementFrameCount(3);
    expect(worldService.getFrameCount()).toBe(15);
    expect(frameCountSignal().value).toBe(15);
    expect(updates).toEqual([0, 12, 15]);
    subscription.unsubscribe();
  });

  it('keeps menu index signals aligned with worldService mutations', () => {
    worldService.init();
    const { main, system, inventory } = menuSelectionSignals();
    expect(main.value).toBe(1);
    expect(system.value).toBe(2);
    expect(inventory.value).toBe(3);

    worldService.setMainMenuIndex(4);
    worldService.setSystemMenuIndex(5);
    worldService.setInventoryMenuIndex(6);

    expect(main.value).toBe(4);
    expect(system.value).toBe(5);
    expect(inventory.value).toBe(6);

    stateService.setGlobal('curMainMenuItem', 7);
    stateService.setGlobal('curSystemMenuItem', 8);
    stateService.setGlobal('curInvMenuItem', 9);

    expect(main.value).toBe(7);
    expect(system.value).toBe(8);
    expect(inventory.value).toBe(9);
  });

  it('mirrors audio toggle flags through reactive signals', () => {
    worldService.init();
    const { noMusic, noSound } = audioToggleSignals();
    expect(noMusic.value).toBe(false);
    expect(noSound.value).toBe(true);

    worldService.setNoMusicFlag(true);
    worldService.setNoSoundFlag(false);
    expect(noMusic.value).toBe(true);
    expect(noSound.value).toBe(false);

    stateService.setGlobal('noMusic', false);
    stateService.setGlobal('noSound', true);
    expect(noMusic.value).toBe(false);
    expect(noSound.value).toBe(true);
  });

  it('emits player HP/MP change events', () => {
    worldService.init();
    const events = [];
    const subscription = reactiveContext.rootEvent$.subscribe((event) => {
      if (!event) return;
      if (event.type === 'world/player/hpChanged' || event.type === 'world/player/mpChanged') {
        events.push(event);
      }
    });

    const initialHp = worldService.getPlayerHP(0) || 0;
    const initialMp = worldService.getPlayerMP(0) || 0;

    worldService.setPlayerHP(0, initialHp + 10);
    worldService.setPlayerMP(0, initialMp + 8);
    worldService.adjustPlayerHP(0, 5);
    worldService.adjustPlayerMP(0, -3);

    const hpEvents = events.filter((event) => event.type === 'world/player/hpChanged');
    const mpEvents = events.filter((event) => event.type === 'world/player/mpChanged');
    expect(hpEvents.length).toBeGreaterThanOrEqual(2);
    expect(mpEvents.length).toBeGreaterThanOrEqual(2);
    expect(hpEvents.at(-1).value).toBe(initialHp + 15);
    expect(mpEvents.at(-1).value).toBe(initialMp + 5);

    subscription.unsubscribe();
  });

  it('keeps audio/resource signals synchronized', () => {
    worldService.init();
    const {
      musicTrack,
      battleMusicTrack,
      battleFieldId,
      screenWave,
      waveProgression,
      paletteId,
      needToFadeIn,
      nightPalette,
      layer
    } = audioResourceSignals();

    expect(musicTrack.value).toBe(Global.musicNum);
    expect(battleMusicTrack.value).toBe(Global.numBattleMusic);
    expect(battleFieldId.value).toBe(Global.numBattleField);
    expect(screenWave.value).toBe(Global.screenWave);
    expect(waveProgression.value).toBe(Global.waveProgression);
    expect(paletteId.value).toBe(Global.numPalette);
    expect(needToFadeIn.value).toBe(true);
    expect(nightPalette.value).toBe(false);
    expect(layer.value).toBe(Global.layer);

    worldService.setMusicTrack(11);
    expect(musicTrack.value).toBe(11);

    worldService.setBattleMusicTrack(4);
    expect(battleMusicTrack.value).toBe(4);

    worldService.setBattleFieldId(8);
    expect(battleFieldId.value).toBe(8);

    worldService.setScreenWave(12);
    expect(screenWave.value).toBe(12);
    worldService.adjustScreenWave(5);
    expect(screenWave.value).toBe(17);

    worldService.setWaveProgression(21);
    expect(waveProgression.value).toBe(21);

    worldService.setNeedToFadeIn(false);
    expect(needToFadeIn.value).toBe(false);

    worldService.setNightPaletteFlag(true);
    expect(nightPalette.value).toBe(true);

    worldService.setPaletteId(15);
    expect(paletteId.value).toBe(15);

    worldService.setLayer(9);
    expect(layer.value).toBe(9);
  });

  it('keeps game flag signals synchronized', () => {
    worldService.init();
    const {
      collect,
      chaseRange,
      chaseSpeedChangeCycles,
      battleSpeed
    } = gameFlagSignals();

    expect(collect.value).toBe(Global.collectValue);
    expect(chaseRange.value).toBe(Global.chaseRange);
    expect(chaseSpeedChangeCycles.value).toBe(Global.chaseSpeedChangeCycles);
    expect(battleSpeed.value).toBe(Global.battleSpeed);

    worldService.setCollectValue(12);
    expect(collect.value).toBe(12);
    worldService.adjustCollectValue(-2);
    expect(collect.value).toBe(10);

    worldService.setChaseRange(14);
    expect(chaseRange.value).toBe(14);
    worldService.adjustChaseRange(3);
    expect(chaseRange.value).toBe(17);

    worldService.setChaseSpeedChangeCycles(5);
    expect(chaseSpeedChangeCycles.value).toBe(5);
    worldService.adjustChaseSpeedChangeCycles(2);
    expect(chaseSpeedChangeCycles.value).toBe(7);

    worldService.setBattleSpeed(4);
    expect(battleSpeed.value).toBe(4);
  });



  it('synchronises script entries and object stores', () => {
    worldService.init();
    const { scriptEntries, objectTable, objectDesc } = scriptObjectSignals();

    expect(Array.isArray(scriptEntries.value)).toBe(true);
    expect(scriptEntries.value.length).toBe(2);
    expect(objectTable.value).toEqual(globalThis.GameData.object);
    expect(objectDesc.value).toEqual(Global.objectDesc);

    const newEntries = [{ opcode: 3 }, { opcode: 4 }];
    worldService.setScriptEntries(newEntries);
    expect(scriptEntries.value).toBe(newEntries);

    worldService.mutateObjectEntry(0, (entry) => {
      entry.item.scriptOnUse = 999;
      return entry;
    });
    expect(objectTable.value[0].item.scriptOnUse).toBe(999);

    const newDesc = [{ id: 1, text: 'Updated' }];
    worldService.setObjectDescTable(newDesc);
    expect(objectDesc.value).toBe(newDesc);
  });


  it('exposes battle formation tables via signals', () => {
    worldService.init();
    const { enemyTeam, enemyPositions, battleFields } = battleFormationSignals();

    expect(enemyTeam.value).toEqual(globalThis.GameData.enemyTeam);
    expect(enemyPositions.value).toEqual(globalThis.GameData.enemyPos);
    expect(battleFields.value).toEqual(globalThis.GameData.battleField);

    const updatedTeam = [{ enemy: [7, 8, 9] }];
    worldService.setEnemyTeamTable(updatedTeam);
    expect(enemyTeam.value).toBe(updatedTeam);

    const updatedPositions = { pos: [[[{ x: 10, y: 20 }]] ] };
    worldService.setEnemyPositionTable(updatedPositions);
    expect(enemyPositions.value).toBe(updatedPositions);

    const updatedBattleFields = [{ backgroundId: 3 }];
    worldService.setBattleFieldTable(updatedBattleFields);
    expect(battleFields.value).toBe(updatedBattleFields);
  });


  it('synchronises inventory and cash signals', () => {
    worldService.init();
    const { items, cash, lastUnequipped } = inventorySignals();
    expect(items.value).toEqual(Global.inventory);
    expect(cash.value).toBe(88);
    expect(lastUnequipped.value).toBe(0);

    worldService.mutateInventory((current) => {
      current.push({ item: 20, amount: 1, amountInUse: 0 });
      return current;
    });
    expect(items.value).toHaveLength(Global.inventory.length);
    expect(items.value[items.value.length - 1]).toEqual({ item: 20, amount: 1, amountInUse: 0 });

    worldService.setCash(150);
    expect(cash.value).toBe(150);

    worldService.setLastUnequippedItem(42);
    expect(lastUnequipped.value).toBe(42);

    stateService.setGlobal('cash', 25);
    expect(cash.value).toBe(25);

    stateService.setGlobal('inventory', [{ item: 5, amount: 3, amountInUse: 0 }]);
    expect(items.value).toEqual([{ item: 5, amount: 3, amountInUse: 0 }]);

    stateService.setGlobal('lastUnequippedItem', 7);
    expect(lastUnequipped.value).toBe(7);
  });

  it('emits hp/mp change events via player-state slice', () => {
    worldService.init();
    const captured = [];
    const subscription = reactiveContext.rootEvent$.subscribe((event) => {
      if (!event || typeof event !== 'object') {
        return;
      }
      if (event.type === 'world/player/hpChanged' || event.type === 'world/player/mpChanged') {
        captured.push(event);
      }
    });

    worldService.setPlayerHP(0, 28);
    worldService.adjustPlayerMP(1, -5);

    expect(captured).toEqual([
      expect.objectContaining({
        type: 'world/player/hpChanged',
        roleId: 0,
        previous: 30,
        value: 28
      }),
      expect.objectContaining({
        type: 'world/player/mpChanged',
        roleId: 1,
        previous: 30,
        value: 25
      })
    ]);

    subscription.unsubscribe();
  });

});
