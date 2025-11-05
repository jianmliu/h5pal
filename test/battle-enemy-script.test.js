import { beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.global = globalThis;

let lastEnemyMutated = null;

function createEnemyStub() {
  return {
    reset() {
      this.objectID = 0;
      this.e = null;
      this.scriptOnTurnStart = 0;
      this.scriptOnBattleEnd = 0;
      this.scriptOnReady = 0;
      this.state = 0;
      this.timeMeter = 0;
      this.colorShift = 0;
      return this;
    }
  };
}

const battleServiceMock = {
  bindModule: vi.fn(),
  getState: vi.fn(() => null),
  replaceState: vi.fn(),
  setSystemManager: vi.fn(),
  setEnemy: vi.fn((index, updater) => {
    const enemy = createEnemyStub();
    enemy.reset();
    const result = updater(enemy);
    lastEnemyMutated = result || enemy;
    return lastEnemyMutated;
  })
};

const sceneEventAdapterMock = {
  getEventObjectIdForRelativeIndex: vi.fn((index) => 229 + index),
  getEventObjectEntryById: vi.fn(() => ({
    id: 229,
    state: {
      triggerScript: 8444,
      autoScript: 17
    }
  }))
};

const scriptObjectAdapterMock = {
  getObjectEntry: vi.fn(),
  getScriptEntry: vi.fn()
};

vi.mock('../src/js/pal/utils.js', () => ({
  default: {
    initArray: () => [],
    arrClone: (value) => (Array.isArray(value) ? value.slice() : value),
    objClone: (value) => (value ? { ...value } : value)
  }
}));

vi.mock('../src/js/pal/scene.js', () => ({ default: {} }));
vi.mock('../src/js/pal/sprite.js', () => ({ default: vi.fn(() => ({})) }));
vi.mock('../src/js/pal/input.js', () => ({ default: {} }));
vi.mock('../src/services/script-service.js', () => ({ default: { runTriggerScript: vi.fn() } }));
vi.mock('../src/js/pal/music.js', () => ({ default: { play: vi.fn() } }));
vi.mock('../src/js/pal/sound.js', () => ({ default: { play: vi.fn() } }));
vi.mock('../src/services/resource-service.js', () => ({
  default: {
    loadMKF: vi.fn(() => Promise.resolve()),
    getMKF: vi.fn(() => ({
      readChunk: () => new Uint8Array(),
      decompressChunk: () => new Uint8Array()
    }))
  }
}));
vi.mock('../src/js/pal/fight.js', () => ({ default: { init: vi.fn(() => Promise.resolve()) } }));
vi.mock('../src/js/pal/ui.js', () => ({ default: {} }));
vi.mock('../src/js/pal/uibattle.js', () => ({
  default: {
    BattleUI: vi.fn(() => ({})),
    init: vi.fn(() => Promise.resolve()),
    dispose: vi.fn()
  }
}));
vi.mock('../src/services/battle-service.js', () => ({ default: battleServiceMock }));
vi.mock('../src/services/scene-event-adapter.js', () => ({ default: sceneEventAdapterMock }));
vi.mock('../src/services/battle-systems.js', () => ({ default: vi.fn(() => ({})) }));
vi.mock('../src/services/world-service.js', () => ({
  default: {
    copyEnemyTemplate: vi.fn((enemyID) => ({ enemyID })),
    getSceneEventObjectRange: vi.fn(() => ({ start: 0, end: 100 })),
    setWaveProgression: vi.fn(),
    setScreenWave: vi.fn(),
    setInBattle: vi.fn(),
    setSceneBuffer: vi.fn()
  }
}));
vi.mock('../src/services/game-data-adapter.js', () => ({
  default: {
    getLevelUpMagicTable: vi.fn(() => [])
  }
}));
vi.mock('../src/services/script-object-adapter.js', () => ({ default: scriptObjectAdapterMock }));
vi.mock('../src/services/party-trail-adapter.js', () => ({
  default: {
    getPartyState: () => []
  }
}));
vi.mock('../src/services/player-state-adapter.js', () => ({
  default: {},
  getEquipmentEffectsMatrix: () => [],
  getEquipmentEffectAt: () => 0,
  getMaxPartyMemberIndex: () => -1,
  getPlayerRoleFieldValue: () => 0,
  getPlayerHP: () => 0
}));
vi.mock('../src/services/battle-state-adapter.js', () => ({
  getEnemyTeamEntry: () => null,
  getEnemyFormationPosition: () => null,
  getBattleFieldEntry: () => null,
  getBattleFieldId: () => 0,
  getBattleMusicTrack: () => 0,
  getMusicTrack: () => 0,
  isAutoBattleEnabled: () => false,
  getBattleStateSnapshot: () => null
}));

beforeEach(() => {
  vi.resetModules();
  battleServiceMock.bindModule.mockClear();
  battleServiceMock.setEnemy.mockClear();
  sceneEventAdapterMock.getEventObjectIdForRelativeIndex.mockClear();
  sceneEventAdapterMock.getEventObjectEntryById.mockClear();
  scriptObjectAdapterMock.getObjectEntry.mockReset();
  scriptObjectAdapterMock.getScriptEntry.mockReset();
  lastEnemyMutated = null;

  globalThis.Const = {
    MAX_POISONS: 8,
    MAX_PLAYERS_IN_PARTY: 4,
    MAX_ENEMIES_IN_TEAM: 6,
    MAX_ACTIONQUEUE_ITEMS: 32
  };

  globalThis.TriggerMode = {
    None: 0,
    SearchNear: 1,
    SearchNormal: 2,
    SearchFar: 3,
    TouchNear: 4,
    TouchNormal: 5,
    TouchFar: 6,
    TouchFarther: 7,
    TouchFarthest: 8
  };

  globalThis.log = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn()
  };

  globalThis.Files = {
    DATA: { readChunk: () => new Uint8Array() },
    FBP: { decompressChunk: () => new Uint8Array() },
    ABC: { decompressChunk: () => new Uint8Array() },
    F: { decompressChunk: () => new Uint8Array() }
  };
});

describe('battle enemy scripts', () => {
  it('falls back to event trigger scripts when object scripts are missing', async () => {
    scriptObjectAdapterMock.getObjectEntry.mockReturnValue({
      enemy: {
        enemyID: 42,
        scriptOnTurnStart: 39979,
        scriptOnBattleEnd: 0,
        scriptOnReady: 0
      }
    });
    scriptObjectAdapterMock.getScriptEntry.mockImplementation((id) => {
      if (id === 39979) {
        return null;
      }
      if (id === 8444) {
        return { operation: 0, operand: [] };
      }
      if (id === 17) {
        return { operation: 0, operand: [] };
      }
      return null;
    });
    sceneEventAdapterMock.getEventObjectEntryById.mockReturnValue({
      id: 229,
      state: {
        triggerScript: 8444,
        autoScript: 17,
        triggerMode: TriggerMode.SearchNormal
      }
    });

    const { default: battle } = await import('../src/js/pal/battle.js');
    battle.spawnEnemy(0, 499, {});

    expect(scriptObjectAdapterMock.getScriptEntry).toHaveBeenCalledWith(39979);
    expect(sceneEventAdapterMock.getEventObjectEntryById).toHaveBeenCalled();
    expect(lastEnemyMutated).toBeTruthy();
    expect(lastEnemyMutated.scriptOnTurnStart).toBe(8444);
    expect(lastEnemyMutated.scriptOnReady).toBe(17);
  });

  it('does not use event scripts when trigger mode is touch-based', async () => {
    scriptObjectAdapterMock.getObjectEntry.mockReturnValue({
      enemy: {
        enemyID: 42,
        scriptOnTurnStart: 39979,
        scriptOnBattleEnd: 0,
        scriptOnReady: 0
      }
    });
    scriptObjectAdapterMock.getScriptEntry.mockReturnValue(null);
    sceneEventAdapterMock.getEventObjectEntryById.mockReturnValue({
      id: 229,
      state: {
        triggerScript: 8444,
        autoScript: 17,
        triggerMode: TriggerMode.TouchNormal
      }
    });

    const { default: battle } = await import('../src/js/pal/battle.js');
    battle.spawnEnemy(0, 499, {});

    expect(lastEnemyMutated).toBeTruthy();
    expect(lastEnemyMutated.scriptOnTurnStart).toBe(39979);
    expect(lastEnemyMutated.scriptOnReady).toBe(0);
  });

  it('retains explicit zero-valued scripts without falling back to map triggers', async () => {
    scriptObjectAdapterMock.getObjectEntry.mockReturnValue({
      enemy: {
        enemyID: 21,
        scriptOnTurnStart: 0,
        scriptOnBattleEnd: 0,
        scriptOnReady: 0
      }
    });
    scriptObjectAdapterMock.getScriptEntry.mockImplementation((id) => {
      if (id === 8444 || id === 17) {
        return { operation: 0, operand: [] };
      }
      return null;
    });
    sceneEventAdapterMock.getEventObjectEntryById.mockReturnValue({
      id: 229,
      state: {
        triggerScript: 8444,
        autoScript: 17,
        triggerMode: TriggerMode.TouchNormal
      }
    });

    const { default: battle } = await import('../src/js/pal/battle.js');
    battle.spawnEnemy(0, 501, {});

    expect(lastEnemyMutated).toBeTruthy();
    expect(lastEnemyMutated.scriptOnTurnStart).toBe(0);
    expect(lastEnemyMutated.scriptOnReady).toBe(17);
  });
});
