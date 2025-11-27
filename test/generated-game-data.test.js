import { describe, expect, it, vi } from 'vitest';
import '../src/js/pal/binary-helper.ts';
import '../src/js/pal/pal-global.js';
import { hydrateGeneratedGameData, applyGeneratedGameData } from '../src/services/generated-game-data.ts';

function createFilledArray(length, start = 1) {
  const buffer = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    buffer[i] = (start + i) & 0xFF;
  }
  return buffer;
}

function encodeChunk(buffer) {
  return Buffer.from(buffer).toString('base64');
}

function buildPayload() {
  const payload = {
    version: 1,
    files: {
      SSS: {},
      DATA: {}
    }
  };

  payload.files.SSS.eventObject = {
    chunk: 0,
    encoding: 'base64',
    data: encodeChunk(createFilledArray(EventObject.size * 2))
  };
  payload.files.SSS.scene = {
    chunk: 1,
    encoding: 'base64',
    data: encodeChunk(createFilledArray(Scene.size * 2))
  };
  payload.files.SSS.object = {
    chunk: 2,
    encoding: 'base64',
    data: encodeChunk(createFilledArray(ObjectUnion.size * 2))
  };
  payload.files.SSS.scriptEntry = {
    chunk: 4,
    encoding: 'base64',
    data: encodeChunk(createFilledArray(ScriptEntry.size * 2))
  };

  payload.files.DATA.store = {
    chunk: 0,
    encoding: 'base64',
    data: encodeChunk(createFilledArray(Store.size))
  };
  payload.files.DATA.enemy = {
    chunk: 1,
    encoding: 'base64',
    data: encodeChunk(createFilledArray(Enemy.size))
  };
  payload.files.DATA.enemyTeam = {
    chunk: 2,
    encoding: 'base64',
    data: encodeChunk(createFilledArray(EnemyTeam.size))
  };
  payload.files.DATA.magic = {
    chunk: 4,
    encoding: 'base64',
    data: encodeChunk(createFilledArray(Magic.size))
  };
  payload.files.DATA.battleField = {
    chunk: 5,
    encoding: 'base64',
    data: encodeChunk(createFilledArray(BattleField.size))
  };
  payload.files.DATA.levelUpMagic = {
    chunk: 6,
    encoding: 'base64',
    data: encodeChunk(createFilledArray(LevelUpMagicAll.size))
  };
  payload.files.DATA.battleEffectIndex = {
    chunk: 11,
    encoding: 'base64',
    data: encodeChunk(createFilledArray(10 * 2 * 2))
  };
  payload.files.DATA.enemyPos = {
    chunk: 13,
    encoding: 'base64',
    data: encodeChunk(createFilledArray(EnemyPos.size))
  };
  payload.files.DATA.levelUpExp = {
    chunk: 14,
    encoding: 'base64',
    data: encodeChunk(createFilledArray(Const.MAX_LEVELS * 2))
  };
  payload.files.DATA.playerRoles = {
    chunk: 3,
    encoding: 'base64',
    data: encodeChunk(createFilledArray(PlayerRoles.size))
  };

  return payload;
}

function createWorldStub() {
  return {
    setEventObjectTable: vi.fn(),
    setSceneTable: vi.fn(),
    setObjectTable: vi.fn(),
    setScriptEntries: vi.fn(),
    setPlayerRoles: vi.fn(),
    setStoreTable: vi.fn(),
    setEnemyTable: vi.fn(),
    setEnemyTeamTable: vi.fn(),
    setMagicTable: vi.fn(),
    setBattleFieldTable: vi.fn(),
    setLevelUpMagicTable: vi.fn(),
    setBattleEffectIndexTable: vi.fn(),
    setEnemyPositionTable: vi.fn(),
    setLevelUpExpTable: vi.fn()
  };
}

describe('generated-game-data', () => {
  it('hydrates generated payload into typed tables', () => {
    const payload = buildPayload();
    const hydrated = hydrateGeneratedGameData(payload);
    expect(hydrated).toBeTruthy();
    expect(hydrated.eventObjects).toHaveLength(2);
    expect(hydrated.scenes).toHaveLength(2);
    expect(hydrated.objects).toHaveLength(2);
    expect(hydrated.scriptEntries).toHaveLength(2);
    expect(hydrated.playerRoles).toBeInstanceOf(PlayerRoles);
    expect(hydrated.battleEffectIndex).toHaveLength(10);
    expect(hydrated.levelUpExp).toHaveLength(Const.MAX_LEVELS);
  });

  it('applies hydrated tables to the provided world service', () => {
    const payload = buildPayload();
    const world = createWorldStub();
    const result = applyGeneratedGameData(payload, world);
    expect(result).toBe(true);
    expect(world.setEventObjectTable).toHaveBeenCalled();
    expect(world.setSceneTable).toHaveBeenCalled();
    expect(world.setObjectTable).toHaveBeenCalled();
    expect(world.setScriptEntries).toHaveBeenCalled();
    expect(world.setPlayerRoles).toHaveBeenCalled();
    expect(world.setStoreTable).toHaveBeenCalled();
    expect(world.setEnemyTable).toHaveBeenCalled();
    expect(world.setEnemyTeamTable).toHaveBeenCalled();
    expect(world.setMagicTable).toHaveBeenCalled();
    expect(world.setBattleFieldTable).toHaveBeenCalled();
    expect(world.setLevelUpMagicTable).toHaveBeenCalled();
    expect(world.setBattleEffectIndexTable).toHaveBeenCalled();
    expect(world.setEnemyPositionTable).toHaveBeenCalled();
    expect(world.setLevelUpExpTable).toHaveBeenCalled();
  });

  it('returns null when required chunks are missing', () => {
    const invalid = {
      version: 1,
      files: {
        SSS: {},
        DATA: {}
      }
    };
    expect(hydrateGeneratedGameData(invalid)).toBeNull();
  });
});
