import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getEnemyTeamEntry,
  getEnemyFormationPosition,
  getBattleFieldEntry,
  getBattleFieldId,
  isAutoBattleEnabled
} from '../src/services/battle-state-adapter.js';
import worldService from '../src/services/world-service.js';
import reactiveContext from '../src/state/reactive-context.js';
import stateService from '../src/services/state-service.js';

function createTrailEntry() {
  return { x: 0, y: 0, direction: 0 };
}

function createFormationData() {
  return {
    enemyTeam: [
      { enemy: [1, 2, 3] }
    ],
    enemyPos: {
      pos: [
        [{ x: 100, y: 150 }, { x: 120, y: 170 }]
      ]
    },
    battleField: [
      { backgroundId: 7 }
    ]
  };
}

describe('battle-state-adapter', () => {
  beforeEach(() => {
    reactiveContext.dispose();
    worldService.dispose();

    const { enemyTeam, enemyPos, battleField } = createFormationData();

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
      partyOffset: PAL_XY(0, 0),
      party: [
        { playerRole: 0, x: 0, y: 0, frame: 0 }
      ],
      trail: [
        createTrailEntry(),
        createTrailEntry(),
        createTrailEntry(),
        createTrailEntry()
      ],
      numFollower: 0,
      maxPartyMemberIndex: 0,
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
      musicNum: 3,
      numBattleMusic: 4,
      numBattleField: 0,
      screenWave: 0,
      waveProgression: 0,
      needToFadeIn: false,
      numPalette: 0,
      nightPalette: false,
      layer: 0
    };

    globalThis.GameData = {
      eventObject: [
        { state: 1, triggerMode: 0, spriteNum: 0 }
      ],
      scene: [
        { eventObjectIndex: 0, mapNum: 0, scriptOnEnter: 0 }
      ],
      map: [
        { metadata: { name: 'map0' } }
      ],
      object: [],
      enemyTeam,
      enemyPos,
      battleField
    };
  });

  afterEach(() => {
    worldService.dispose();
    reactiveContext.dispose();
    stateService.updateGlobal({});
  });

  it('provides battle formation data and survives reactive resets', () => {
    worldService.init();

    expect(getEnemyTeamEntry(0).enemy).toEqual([1, 2, 3]);
    expect(getEnemyFormationPosition(0, 1)).toEqual({ x: 120, y: 170 });
    expect(getBattleFieldEntry(0)).toEqual({ backgroundId: 7 });
    expect(getBattleFieldId()).toBe(0);
    expect(isAutoBattleEnabled()).toBe(false);

    reactiveContext.dispose();
    worldService.dispose();
    worldService.init();

    expect(getEnemyTeamEntry(0).enemy).toEqual([1, 2, 3]);
    expect(getEnemyFormationPosition(0, 0)).toEqual({ x: 100, y: 150 });
    expect(getBattleFieldEntry(0)).toEqual({ backgroundId: 7 });
    expect(getBattleFieldId()).toBe(0);
    expect(isAutoBattleEnabled()).toBe(false);
  });
});
