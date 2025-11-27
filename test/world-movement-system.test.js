import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import worldService from '../src/services/world-service.ts';
import stateService from '../src/services/state-service.ts';
import Map from '../src/js/pal/map.js';

const originalMapFromFile = Map.fromFile;

function createEventObject(overrides = {}) {
  return Object.assign({
    x: 0,
    y: 0,
    direction: global.Direction.South,
    state: 0,
    vanishTime: 0,
    spriteFrames: 3,
    spriteFramesAuto: 0,
    autoScript: 0,
    triggerScript: 0,
    triggerMode: 0,
    currentFrameNum: 0,
    layer: 0
  }, overrides);
}

function resetGlobals() {
  global.Direction = {
    South: 0,
    West: 1,
    North: 2,
    East: 3,
    Unknown: 4
  };
  global.PAL_X = function(pos) {
    return pos & 0xFFFF;
  };
  global.PAL_Y = function(pos) {
    return (pos >> 16) & 0xFFFF;
  };
  global.PAL_XY = function(x, y) {
    return ((y & 0xFFFF) << 16) | (x & 0xFFFF);
  };
  global.ObjectState = { Blocker: 2 };
  global.Files = {
    MAP: {
      decompressChunk: vi.fn()
    },
    GOP: {
      readChunk: vi.fn()
    }
  };
  global.Global = {
    viewport: 0,
    partyOffset: 0,
    party: [],
    trail: [],
    numScene: 1,
    playerStatus: [],
    enteringScene: false,
    gameStart: false,
    inBattle: false
  };
  global.GameData = {
    scene: [
      {
        mapNum: 0,
        eventObjectIndex: 0,
        scriptOnEnter: 0
      }
    ],
    map: [
      {
        width: 64,
        height: 128
      }
    ],
    eventObject: [
      createEventObject({ x: 64, y: 32 })
    ],
    enemy: [],
    object: [{ enemy: { enemyID: 0 } }]
  };
}

describe('world movement systems', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    worldService.dispose();
    Map.fromFile = originalMapFromFile;
    delete global.Global;
    delete global.GameData;
    delete global.Files;
    resetGlobals();
    stateService.updateGlobal({
      viewport: global.Global.viewport,
      partyOffset: global.Global.partyOffset,
      party: global.Global.party,
      trail: global.Global.trail,
      numScene: global.Global.numScene
    });
    stateService.updateGameData({
      scene: global.GameData.scene,
      map: global.GameData.map,
      eventObject: global.GameData.eventObject
    });
    worldService.init();
  });

  afterEach(() => {
    worldService.dispose();
    Map.fromFile = originalMapFromFile;
    delete global.Global;
    delete global.GameData;
    delete global.Files;
    delete global.Direction;
    delete global.ObjectState;
    delete global.PAL_X;
    delete global.PAL_Y;
    delete global.PAL_XY;
  });

  it('processes queued movement when destination is not blocked', () => {
    const initialX = global.GameData.eventObject[0].x;
    const initialY = global.GameData.eventObject[0].y;

    worldService.enqueueMoveRequest({
      eventObjectId: 1,
      dx: 2,
      dy: 1,
      direction: global.Direction.East,
      speed: 1,
      origin: 'test'
    });
    worldService.setCollisionState({
      mapId: 0,
      state: {
        mapId: 0,
        isBlocked: () => false
      }
    });

    worldService.runSystems('movement');

    expect(global.GameData.eventObject[0].x).toBe(initialX + 2);
    expect(global.GameData.eventObject[0].y).toBe(initialY + 1);
    const intent = worldService.getMoveIntent(0);
    expect(intent).toBeTruthy();
    expect(intent.direction).toBe(global.Direction.East);
    expect(intent.origin).toBe('test');
  });

  it('skips movement when collision state reports blocked', () => {
    const initialX = global.GameData.eventObject[0].x;
    const initialY = global.GameData.eventObject[0].y;

    worldService.enqueueMoveRequest({
      eventObjectId: 1,
      dx: 2,
      dy: 1,
      direction: global.Direction.North,
      speed: 1,
      origin: 'blocked-test'
    });
    worldService.setCollisionState({
      mapId: 0,
      state: {
        mapId: 0,
        isBlocked: () => true
      }
    });

    worldService.runSystems('movement');

    expect(global.GameData.eventObject[0].x).toBe(initialX);
    expect(global.GameData.eventObject[0].y).toBe(initialY);
    expect(worldService.getMoveIntent(0)).toBeUndefined();
  });

  it('builds collision state from map data', () => {
    const stubbedMap = {
      isTileBlocked: vi.fn(() => true)
    };
    Map.fromFile = vi.fn(() => stubbedMap);

    worldService.runSystems('collision', { mapCache: {} });
    const collisionState = worldService.getCollisionState();
    expect(collisionState).toBeTruthy();
    expect(typeof collisionState.isBlocked).toBe('function');
    expect(collisionState.isBlocked({ x: 0, y: 0 })).toBe(true);
    expect(Map.fromFile).toHaveBeenCalled();
    expect(stubbedMap.isTileBlocked).toHaveBeenCalled();
  });
});
