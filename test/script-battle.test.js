import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worldService from '../src/services/world-service.js';
import scriptObjectAdapter from '../src/services/script-object-adapter.js';
import { resetInventorySlice } from '../src/state/slices/inventory.js';
import { resetScriptObjectSlice } from '../src/state/slices/script-objects.js';

vi.mock('../src/js/pal/script-extras.js', () => ({
  default: {
    init: vi.fn()
  }
}));

vi.mock('../src/js/pal/res.js', () => ({
  default: {}
}));

vi.mock('../src/js/pal/rng.js', () => ({
  default: {
    play: vi.fn()
  }
}));

vi.mock('../src/js/pal/music.js', () => ({
  default: {
    play: vi.fn(),
    stop: vi.fn()
  }
}));

vi.mock('../src/js/pal/sound.js', () => ({
  default: {
    play: vi.fn()
  }
}));

vi.mock('../src/js/pal/scene.js', () => ({
  default: {
    applyWave: vi.fn(),
    checkObstacle: vi.fn(() => false)
  }
}));

vi.mock('../src/js/pal/palette.js', () => ({
  default: {
    init: vi.fn()
  }
}));

const createPoisonSlots = () => Array.from({ length: 8 }, () => ({ poisonID: 0, poisonScript: 0 }));

const createEnemy = (override = {}) => {
  const { e: overrideE = {}, ...rest } = override;
  return {
    objectID: 1,
    e: {
      health: 100,
      collectValue: 0,
      magic: 0,
      magicRate: 10,
      ...overrideE
    },
    status: Array.from({ length: 16 }, () => 0),
    poisons: createPoisonSlots(),
    pos: { x: 0, y: 0 },
    originalPos: { x: 0, y: 0 },
    colorShift: 0,
    wCurrentFrame: 0,
    ...rest
  };
};

const createDefaultBattleState = () => ({
  enemy: [createEnemy()],
  player: [
    { action: { actionType: 2 }, currentFrameNum: 0, colorShift: 0 },
    { action: { actionType: 2 }, currentFrameNum: 0, colorShift: 0 }
  ],
  UI: { state: 0 },
  blow: 0,
  battleResult: 0,
  hidingTime: 0,
  sceneBuf: {}
});

let battleState = createDefaultBattleState();

const battleServiceMock = {
  getState: vi.fn(() => battleState),
  getEnemy: vi.fn((index) => battleState.enemy[index]),
  setEnemyHealth: vi.fn((index, updater) => {
    const enemy = battleState.enemy[index];
    if (!enemy || !enemy.e) return enemy;
    const next = typeof updater === 'function' ? updater(enemy.e.health) : updater;
    enemy.e.health = next;
    return enemy;
  }),
  setEnemyPoison: vi.fn((index, slot, patch) => {
    const enemy = battleState.enemy[index];
    if (!enemy) return;
    if (!enemy.poisons) {
      enemy.poisons = createPoisonSlots();
    }
    const target = enemy.poisons[slot] || (enemy.poisons[slot] = { poisonID: 0, poisonScript: 0 });
    if (typeof patch === 'function') {
      const result = patch(target);
      return result || target;
    }
    if (patch && typeof patch === 'object') {
      Object.assign(target, patch);
    }
    return target;
  }),
  clearEnemyPoison: vi.fn((index, slot) => {
    return battleServiceMock.setEnemyPoison(index, slot, (poison) => {
      poison.poisonID = 0;
      poison.poisonScript = 0;
      return poison;
    });
  }),
  setEnemyStatus: vi.fn((index, statusIndex, value) => {
    const enemy = battleState.enemy[index];
    if (!enemy) return enemy;
    if (!enemy.status) {
      enemy.status = Array.from({ length: 16 }, () => 0);
    }
    const numeric = Number(statusIndex);
    if (!Number.isNaN(numeric)) {
      enemy.status[numeric] = typeof value === 'function' ? value(enemy.status[numeric]) : value;
    }
    return enemy;
  }),
  updateEnemy: vi.fn((index, updater) => {
    const enemy = battleState.enemy[index];
    if (!enemy) return enemy;
    const result = updater(enemy);
    if (result && result !== enemy) {
      battleState.enemy[index] = result;
      return result;
    }
    return enemy;
  }),
  setEnemy: vi.fn((index, patch) => {
    const enemy = battleState.enemy[index];
    if (typeof patch === 'function') {
      const result = patch(enemy);
      if (result && result !== enemy) {
        battleState.enemy[index] = result;
        return result;
      }
      return enemy;
    }
    battleState.enemy[index] = { ...enemy, ...patch };
    return battleState.enemy[index];
  }),
  setEnemyMagic: vi.fn((index, value) => {
    const enemy = battleState.enemy[index];
    if (enemy && enemy.e) {
      enemy.e.magic = typeof value === 'function' ? value(enemy.e.magic) : value;
    }
    return enemy;
  }),
  setEnemyMagicRate: vi.fn((index, value) => {
    const enemy = battleState.enemy[index];
    if (enemy && enemy.e) {
      enemy.e.magicRate = typeof value === 'function' ? value(enemy.e.magicRate) : value;
    }
    return enemy;
  }),
  setEnemyPosition: vi.fn((index, value) => {
    const enemy = battleState.enemy[index];
    if (!enemy) return enemy;
    enemy.pos = typeof value === 'function' ? value(enemy.pos) : value;
    return enemy;
  }),
  setEnemyColorShift: vi.fn((index, value) => {
    const enemy = battleState.enemy[index];
    if (!enemy) return enemy;
    enemy.colorShift = typeof value === 'function' ? value(enemy.colorShift) : value;
    return enemy;
  }),
  setEnemyObject: vi.fn((index, value) => {
    const enemy = battleState.enemy[index];
    if (!enemy) return enemy;
    enemy.objectID = typeof value === 'function' ? value(enemy.objectID) : value;
    return enemy;
  }),
  setEnemyFrame: vi.fn((index, value) => {
    const enemy = battleState.enemy[index];
    if (!enemy) return enemy;
    enemy.wCurrentFrame = typeof value === 'function' ? value(enemy.wCurrentFrame) : value;
    return enemy;
  }),
  setHidingTime: vi.fn((value) => {
    battleState.hidingTime = typeof value === 'function' ? value(battleState.hidingTime) : value;
    return battleState.hidingTime;
  }),
  setBattleBlow: vi.fn((value) => {
    battleState.blow = typeof value === 'function' ? value(battleState.blow) : value;
    return battleState.blow;
  }),
  setBattleResult: vi.fn((value) => {
    battleState.battleResult = typeof value === 'function' ? value(battleState.battleResult) : value;
    return battleState.battleResult;
  }),
  setPlayerActionType: vi.fn((index, actionType) => {
    const player = battleState.player[index];
    if (player && player.action) {
      player.action.actionType = typeof actionType === 'function' ? actionType(player.action.actionType) : actionType;
    }
    return player;
  }),
  setPlayer: vi.fn((index, patch) => {
    const player = battleState.player[index];
    if (!player) return player;
    if (typeof patch === 'function') {
      const result = patch(player);
      if (result && result !== player) {
        battleState.player[index] = result;
        return result;
      }
      return player;
    }
    Object.assign(player, patch);
    return player;
  }),
  setPlayerColorShift: vi.fn((index, value) => {
    const player = battleState.player[index];
    if (!player) return player;
    player.colorShift = typeof value === 'function' ? value(player.colorShift) : value;
    return player;
  })
};

vi.mock('../src/services/battle-service.js', () => ({
  __esModule: true,
  default: battleServiceMock
}));

const resetBattleState = (overrides = {}) => {
  battleState = {
    ...createDefaultBattleState(),
    ...overrides
  };
  if (overrides.enemy) {
    battleState.enemy = overrides.enemy.map((enemy) => enemy);
  }
  battleState.maxEnemyIndex = battleState.enemy.length - 1;
  globalThis.Global.battle = battleState;
  globalThis.Global.maxPartyMemberIndex = Math.max(0, battleState.player.length - 1);
  globalThis.Global.party = Array.from({ length: battleState.player.length }, (_, index) => ({
    playerRole: index,
    x: 0,
    y: 0
  }));
};

const clearBattleServiceMocks = () => {
  Object.values(battleServiceMock).forEach((fn) => {
    if (fn && typeof fn.mock?.clear === 'function') {
      fn.mock.clear();
    }
  });
};

const noop = () => undefined;

globalThis.log = {
  trace: noop,
  debug: noop,
  warn: noop,
  error: noop
};

globalThis.PAL_XY = (x, y) => ({ x, y });
globalThis.PAL_X = (pos) => (pos && pos.x) || 0;
globalThis.PAL_Y = (pos) => (pos && pos.y) || 0;
globalThis.sleep = noop;
globalThis.sleepByFrame = noop;
globalThis.randomLong = (min) => min;
globalThis.randomFloat = () => 0;
globalThis.timestamp = () => 0;
globalThis.hrtime = () => 0;
globalThis.FrameTime = 16;
globalThis.PAL_CLASSIC = false;
globalThis.SHORT = (value) => value;
globalThis.WORD = (value) => value;

globalThis.Direction = {
  North: 0,
  East: 1,
  South: 2,
  West: 3
};

globalThis.PlayerStatus = {
  Confused: 0,
  Slow: 1,
  Sleep: 2,
  Silence: 3,
  Puppet: 4,
  Paralyzed: 5,
  All: 16
};

globalThis.Const = {
  MAX_ENEMIES_IN_TEAM: 6,
  MAX_ENEMY_PER_TEAM: 6,
  MAX_POISONS: 8,
  MAX_PLAYERS_IN_PARTY: 4,
  MAX_PLAYER_EQUIPMENTS: 4,
  MAX_PLAYER_ROLES: 4,
  MAX_PLAYABLE_PLAYER_ROLES: 4,
  MAX_INVENTORY: 10
};

globalThis.Global = {
  party: [],
  maxPartyMemberIndex: 0
};

globalThis.battle = {
  battleShowPlayerPreMagicAnim: vi.fn(() => 0),
  cloneEnemy: vi.fn(() => createEnemy()),
  recalculateMaxEnemyIndex: vi.fn(),
  loadBattleSprites: vi.fn(),
  delay: vi.fn(() => 0),
  backupScene: vi.fn(),
  backupScreen: vi.fn(),
  makeScene: vi.fn(),
  fadeScene: vi.fn(() => 0),
  updateFighters: vi.fn(),
  spawnEnemy: vi.fn(() => createEnemy()),
  enemyEscape: vi.fn(() => 0),
  stealFromEnemy: vi.fn(() => 0),
  simulateMagic: vi.fn(() => 0),
  fadeScreen: vi.fn(() => 0)
};

globalThis.GameData = {
  scriptEntry: [],
  enemy: [],
  object: [],
  playerRoles: {
    HP: [],
    maxHP: [],
    equipment: []
  },
  eventObject: []
};

globalThis.ui = {
  setDialogDelayTime: noop,
  drawText: noop,
  getWord: () => new Uint8Array(),
  endDialog: function* () {},
  createBox: () => ({ free: noop }),
  createSingleLineBox: () => ({ free: noop }),
  MENUITEM_VALUE_CANCELLED: 0xff,
  MENUITEM_COLOR: 0,
  MENUITEM_COLOR_CONFIRMED: 0,
  MENUITEM_COLOR_SELECTED: 0
};

globalThis.memcpy = (dest, src) => {
  if (dest && src && typeof dest.set === 'function') {
    dest.set(src);
  } else if (Array.isArray(dest) && Array.isArray(src)) {
    for (let i = 0; i < src.length; i++) {
      dest[i] = src[i];
    }
  }
  return dest;
};

globalThis.memset = (arr, value, length) => {
  if (!arr) return arr;
  const limit = length == null ? arr.length : length;
  for (let i = 0; i < limit; i++) {
    arr[i] = value;
  }
  return arr;
};

const resolveGenerator = async (iterator) => {
  let step = iterator.next();
  while (!step.done) {
    let yielded = step.value;
    if (yielded && typeof yielded.next === 'function') {
      yielded = await resolveGenerator(yielded);
    } else if (yielded && typeof yielded.then === 'function') {
      yielded = await yielded;
    }
    step = iterator.next(yielded);
  }
  return step.value;
};

const runInstruction = async (operation, operands = [], options = {}) => {
  const { entryIndex = 0, eventObjectID = 0 } = options;
  const operandArray = [0, 0, 0];
  for (let i = 0; i < Math.min(operands.length, operandArray.length); i++) {
    operandArray[i] = operands[i];
  }
  GameData.scriptEntry[entryIndex] = {
    operation,
    operand: operandArray
  };
  const iterator = script.interpretInstruction(entryIndex, eventObjectID);
  return resolveGenerator(iterator);
};

globalThis.BattleActionType = {
  Pass: 0,
  Defend: 1,
  Attack: 2,
  Magic: 3,
  CoopMagic: 4,
  Flee: 5,
  ThrowItem: 6,
  UseItem: 7,
  AttackMate: 8
};

globalThis.BattlePhase = {
  SelectAction: 0,
  PerformAction: 1
};

globalThis.BattleUIState = {
  Wait: 0
};

globalThis.BattleUIAction = {
  Attack: 0
};

globalThis.MagicFlag = {
  ApplyToAll: 1
};

globalThis.ALLIANCE_PLAYER = 0;

globalThis.BATTLE_ACTION_QUEUE_SIZE = 0;

globalThis.inventory = [];

let script;

describe('script utility behaviour', () => {
  beforeAll(async () => {
    const module = await import('../src/js/pal/script.js');
    script = module.default;
    worldService.init();
  });

  beforeEach(() => {
    resetInventorySlice();
    resetScriptObjectSlice();
    vi.clearAllMocks();
    clearBattleServiceMocks();
    resetBattleState();
    if (scriptObjectAdapter && typeof scriptObjectAdapter.dispose === 'function') {
      scriptObjectAdapter.dispose();
    }
    GameData.scriptEntry = [];
    GameData.object = [];
    GameData.enemy = [];
    GameData.playerRoles.HP = [];
    GameData.playerRoles.maxHP = [];
    GameData.playerRoles.MP = [];
    GameData.playerRoles.maxMP = [];
    GameData.playerRoles.spriteNumInBattle = [];
    GameData.playerRoles.magic = Array.from({ length: Const.MAX_PLAYER_MAGICS }, () => []);
    GameData.magic = [];
    GameData.playerRoles.equipment = Array.from({ length: Const.MAX_PLAYER_EQUIPMENTS }, () => []);
    script.runTriggerScript = function* () { return 0; };
    GameData.eventObject = [
      {
        direction: Direction.East,
        x: 0,
        y: 0,
        spriteFrames: 4,
        spriteFramesAuto: 0,
        currentFrameNum: 0
      }
    ];
    Global.party = battleState.player.map((_, index) => ({ playerRole: index }));
    Global.maxPartyMemberIndex = battleState.player.length - 1;
    Global.inBattle = true;
  });

  it('NPCWalkOneStep moves event object according to direction', () => {
    script.NPCWalkOneStep(1, 1);
    const obj = GameData.eventObject[0];
    expect(obj.x).toBe(2);
    expect(obj.y).toBe(1);
    expect(obj.currentFrameNum).toBe(1);
  });

  it('NPCWalkTo moves NPC towards target tile', () => {
    const obj = GameData.eventObject[0];
    obj.direction = Direction.North;
    const result = script.NPCWalkTo(1, 1, 0, 1);
    expect(result).toBe(false);
    expect(obj.x).not.toBe(0);
    expect(obj.y).not.toBe(0);
  });

  it('inflicts damage on a single enemy through battle service', async () => {
    battleState.enemy[0].e.health = 120;
    await runInstruction(0x0021, [0, 30], { eventObjectID: 0 });
    expect(battleServiceMock.setEnemyHealth).toHaveBeenCalledWith(0, expect.any(Function));
    expect(battleState.enemy[0].e.health).toBe(90);
  });

  it('applies poison to targeted enemy via battle service', async () => {
    const poisonId = 5;
    battleState.enemy[0].objectID = 1;
    GameData.object[1] = { enemy: { resistanceToSorcery: 0 } };
    GameData.object[poisonId] = { poison: { enemyScript: 0 } };
    script.runTriggerScript = vi.fn(() => 42);

    await runInstruction(0x0028, [0, poisonId], { eventObjectID: 0 });

    const applied = battleState.enemy[0].poisons.find((poison) => poison.poisonID === poisonId);
    expect(applied).toBeDefined();
    expect(applied.poisonScript).toBe(42);
    const [firstCall] = battleServiceMock.setEnemyPoison.mock.calls;
    expect(firstCall[0]).toBe(0);
    expect(firstCall[1]).toBe(0);
    expect(typeof firstCall[2]).toBe('function');
  });

  it('scales magic base damage based on current MP (opcode 0x0057)', async () => {
    const magicObjectId = 6;
    const magicNumber = 3;
    GameData.object[magicObjectId] = { magic: { magicNumber } };
    GameData.magic[magicNumber] = { costMP: 5, baseDamage: 10 };
    GameData.playerRoles.MP[0] = 20;
    GameData.playerRoles.maxMP[0] = 30;
    await runInstruction(0x0057, [magicObjectId, 2], { eventObjectID: 0 });

    expect(GameData.magic[magicNumber].baseDamage).toBe(40);
    expect(worldService.getPlayerMP(0)).toBe(0);
  });

  it('scales magic base damage based on current cash (opcode 0x0088)', async () => {
    const magicObjectId = 7;
    const magicNumber = 4;
    GameData.object[magicObjectId] = { magic: { magicNumber } };
    GameData.magic[magicNumber] = { costMP: 1, baseDamage: 0 };
    worldService.setCash(3000);
    await runInstruction(0x0088, [magicObjectId, 0, 0]);
    expect(GameData.magic[magicNumber].baseDamage).toBe(1200);
    expect(worldService.getCash()).toBe(0);
  });

  it('transforms enemy while preserving health (opcode 0x009F)', async () => {
    const transformObjectId = 8;
    const newEnemyId = 5;
    battleState.enemy[0] = createEnemy({
      objectID: 2,
      e: { health: 80, collectValue: 0, magic: 0, magicRate: 10 }
    });
    GameData.object[transformObjectId] = {
      enemy: {
        enemyID: newEnemyId,
        scriptOnTurnStart: 12,
        scriptOnBattleEnd: 13,
        scriptOnReady: 14
      }
    };
    GameData.object[2] = { enemy: { enemyID: 1, scriptOnTurnStart: 0, scriptOnBattleEnd: 0, scriptOnReady: 0 } };
    GameData.enemy[newEnemyId] = {
      health: 200,
      collectValue: 10,
      magic: 3,
      magicRate: 20,
      copy() {
        return { ...this };
      }
    };

    await runInstruction(0x009F, [transformObjectId, 0, 0], { eventObjectID: 0 });

    expect(battleServiceMock.setEnemyObject).toHaveBeenCalledWith(0, transformObjectId);
    expect(battleState.enemy[0].objectID).toBe(transformObjectId);
    expect(battleState.enemy[0].e.health).toBe(80);
  });

  it('clears enemy poison through battle service helper', async () => {
    const poisonId = 7;
    battleState.enemy[0].poisons[0] = { poisonID: poisonId, poisonScript: 99 };
    GameData.object[1] = { enemy: { resistanceToSorcery: 0 } };

    await runInstruction(0x002A, [0, poisonId], { eventObjectID: 0 });

    expect(battleServiceMock.clearEnemyPoison).toHaveBeenCalledWith(0, 0);
    expect(battleState.enemy[0].poisons[0].poisonID).toBe(0);
    expect(battleState.enemy[0].poisons[0].poisonScript).toBe(0);
  });

  it('updates player animation state through battle service during magic prep', async () => {
    const players = [
      { action: { actionType: BattleActionType.Attack }, currentFrameNum: 0, colorShift: 0 },
      { action: { actionType: BattleActionType.Attack }, currentFrameNum: 0, colorShift: 0 }
    ];
    resetBattleState({ player: players });
    Global.party = battleState.player.map((_, index) => ({ playerRole: index }));
    Global.maxPartyMemberIndex = battleState.player.length - 1;

    await runInstruction(0x0092, [1, 0, 0], { eventObjectID: 0 });

    expect(battleState.player[0].currentFrameNum).toBe(6);
    expect(battleState.player[0].colorShift).toBe(8);
    expect(battleState.player[1].colorShift).toBe(8);
    expect(globalThis.battle.battleShowPlayerPreMagicAnim).toHaveBeenCalledWith(0, false);
  });

  it('sets battle result using battle service API', async () => {
    await runInstruction(0x0089, [2, 0, 0]);
    expect(battleServiceMock.setBattleResult).toHaveBeenCalledWith(2);
    expect(battleState.battleResult).toBe(2);
  });
});
