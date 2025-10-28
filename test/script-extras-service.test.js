import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import worldService from '../src/services/world-service.js';
import stateService from '../src/services/state-service.js';
import scriptExtras from '../src/js/pal/script-extras.js';

const DEFAULT_PLAYER_ROLES = 4;
const DEFAULT_POISON_SLOTS = 3;
const DEFAULT_MAGIC_SLOTS = 5;
const INVENTORY_CAPACITY = 8;

function createPlayerRoles() {
  return {
    HP: Array(DEFAULT_PLAYER_ROLES).fill(100),
    MP: Array(DEFAULT_PLAYER_ROLES).fill(50),
    maxHP: Array(DEFAULT_PLAYER_ROLES).fill(100),
    maxMP: Array(DEFAULT_PLAYER_ROLES).fill(80),
    level: Array(DEFAULT_PLAYER_ROLES).fill(1),
    attackStrength: Array(DEFAULT_PLAYER_ROLES).fill(10),
    magicStrength: Array(DEFAULT_PLAYER_ROLES).fill(12),
    defense: Array(DEFAULT_PLAYER_ROLES).fill(8),
    dexterity: Array(DEFAULT_PLAYER_ROLES).fill(6),
    fleeRate: Array(DEFAULT_PLAYER_ROLES).fill(4),
    cooperativeMagic: Array(DEFAULT_PLAYER_ROLES).fill(0),
    spriteNumInBattle: Array(DEFAULT_PLAYER_ROLES).fill(0),
    equipment: Array(3).fill(null).map(() => Array(DEFAULT_PLAYER_ROLES).fill(0)),
    magic: Array(DEFAULT_MAGIC_SLOTS).fill(null).map(() => Array(DEFAULT_PLAYER_ROLES).fill(0))
  };
}

function createPoisonStatus() {
  return Array(DEFAULT_POISON_SLOTS)
    .fill(null)
    .map(() => Array(DEFAULT_PLAYER_ROLES).fill(null).map(() => ({ poisonID: 0, poisonScript: 0 })));
}

function createInventory() {
  return Array(INVENTORY_CAPACITY).fill(null).map(() => ({
    item: 0,
    amount: 0,
    amountInUse: 0,
    uint8Array: new Uint8Array(8)
  }));
}

function hydrateState() {
  global.Const = {
    MAX_PLAYER_ROLES: DEFAULT_PLAYER_ROLES,
    MAX_PLAYABLE_PLAYER_ROLES: DEFAULT_PLAYER_ROLES,
    MAX_PLAYER_EQUIPMENTS: 3,
    MAX_PLAYER_MAGICS: DEFAULT_MAGIC_SLOTS,
    MAX_POISONS: DEFAULT_POISON_SLOTS,
    MAX_INVENTORY: INVENTORY_CAPACITY
  };
  global.PlayerStatus = {
    Confused: 0,
    Sleep: 1,
    Silence: 2,
    Paralyzed: 3,
    Slow: 4,
    Puppet: 5,
    Bravery: 6,
    Protect: 7,
    DualAttack: 8,
    Haste: 9,
    All: 10
  };
  global.BodyPart = {
    Hand: 0,
    Wear: 1
  };
  global.Direction = {
    South: 0,
    West: 1,
    North: 2,
    East: 3,
    Unknown: 4
  };
  global.PAL_XY = (x, y) => ((y & 0xFFFF) << 16) | (x & 0xFFFF);
  global.PAL_X = (value) => value & 0xFFFF;
  global.PAL_Y = (value) => (value >> 16) & 0xFFFF;
  global.randomLong = vi.fn(() => 0);

  const playerRoles = createPlayerRoles();

  global.GameData = {
    playerRoles,
    object: Array(10).fill(null).map((_, idx) => ({
      item: { scriptOnEquip: 0 },
      poison: {
        playerScript: idx + 1,
        poisonLevel: idx
      }
    })),
    enemy: [],
    map: [{
      width: 32,
      height: 32
    }],
    scene: [{
      mapNum: 0,
      eventObjectIndex: 0,
      scriptOnEnter: 0
    }],
    eventObject: [{
      x: 0,
      y: 0,
      direction: global.Direction.South,
      state: 0,
      vanishTime: 0,
      spriteFrames: 4,
      spriteFramesAuto: 0,
      autoScript: 0,
      triggerScript: 0,
      triggerMode: 0,
      currentFrameNum: 0,
      layer: 0
    }]
  };

  global.Global = {
    viewport: 0,
    partyOffset: 0,
    party: Array(DEFAULT_PLAYER_ROLES).fill(null).map((_, index) => ({
      playerRole: index,
      x: 0,
      y: 0,
      frame: 0
    })),
    trail: Array(DEFAULT_PLAYER_ROLES).fill(null).map(() => ({ x: 0, y: 0, direction: global.Direction.South })),
    numScene: 1,
    maxPartyMemberIndex: DEFAULT_PLAYER_ROLES - 1,
    playerStatus: Array(DEFAULT_PLAYER_ROLES).fill(null).map(() => Array(global.PlayerStatus.All).fill(0)),
    poisonStatus: createPoisonStatus(),
    inventory: createInventory(),
    cash: 0,
    inBattle: false,
    enteringScene: false
  };

  stateService.updateGlobal(global.Global);
  stateService.updateGameData({
    playerRoles: global.GameData.playerRoles,
    object: global.GameData.object,
    map: global.GameData.map,
    scene: global.GameData.scene,
    eventObject: global.GameData.eventObject
  });
  worldService.dispose();
  worldService.init();
}

describe('script extras service hooks', () => {
  let script;
  let iterator;

  beforeEach(() => {
    vi.restoreAllMocks();
    hydrateState();
    script = {};
    iterator = scriptExtras.init({}, script);
    iterator.next();
  });

  afterEach(() => {
    worldService.dispose();
    delete global.Const;
    delete global.PlayerStatus;
    delete global.BodyPart;
    delete global.Direction;
    delete global.PAL_XY;
    delete global.PAL_X;
    delete global.PAL_Y;
    delete global.randomLong;
    delete global.GameData;
    delete global.Global;
  });

  it('sets and clears player statuses via worldService', () => {
    const role = 0;
    expect(worldService.getPlayerStatus(role)[global.PlayerStatus.Bravery]).toBe(0);

    script.setPlayerStatus(role, global.PlayerStatus.Bravery, 5);
    expect(worldService.getPlayerStatus(role)[global.PlayerStatus.Bravery]).toBe(5);

    worldService.mutatePlayerStatusEntry(role, (row) => {
      row[global.PlayerStatus.Protect] = 1200;
      return row;
    });
    script.clearAllPlayerStatus();

    const statusRow = worldService.getPlayerStatus(role);
    expect(statusRow[global.PlayerStatus.Bravery]).toBe(0);
    expect(statusRow[global.PlayerStatus.Protect]).toBe(1200);

    script.removePlayerStatus(role, global.PlayerStatus.Protect);
    expect(worldService.getPlayerStatus(role)[global.PlayerStatus.Protect]).toBe(1200);
  });

  it('levels up players through worldService and resets exp', () => {
    const role = 1;
    const initialLevel = worldService.getPlayerLevel(role);
    const initialMaxHP = worldService.getPlayerMaxHP(role);
    const initialMaxMP = worldService.getPlayerMaxMP(role);

    stateService.setGlobal('exp', {
      primaryExp: Array(DEFAULT_PLAYER_ROLES).fill(null).map(() => ({ exp: 123, level: initialLevel }))
    });

    script.playerLevelUp(role, 1);

    const levelAfter = worldService.getPlayerLevel(role);
    expect(levelAfter).toBe(initialLevel + 1);
    expect(worldService.getPlayerMaxHP(role)).toBe(initialMaxHP + 10);
    expect(worldService.getPlayerMaxMP(role)).toBe(initialMaxMP + 8);
    expect(worldService.getPlayerAttackStrength(role)).toBeGreaterThan(10);
    expect(worldService.getExpState().primaryExp[role].exp).toBe(0);
    expect(worldService.getExpState().primaryExp[role].level).toBe(levelAfter);
  });

  it('manages poison entries through worldService helpers', () => {
    const role = 2;
    const poisonId = 3;

    script.addPoisonForPlayer(role, poisonId);

    expect(script.isPlayerPoisonedByKind(role, poisonId)).toBe(true);
    expect(script.isPlayerPoisonedByLevel(role, 1)).toBe(true);

    script.curePoisonByLevel(role, 2);
    expect(script.isPlayerPoisonedByKind(role, poisonId)).toBe(true);

    script.curePoisonByLevel(role, 5);
    expect(script.isPlayerPoisonedByKind(role, poisonId)).toBe(false);
  });
});
