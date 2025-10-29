import { beforeEach, describe, expect, it, vi } from 'vitest';

const worldServiceMock = {
  getParty: vi.fn(),
  getMaxPartyMemberIndex: vi.fn(),
  getPlayerLevel: vi.fn(),
  getPlayerHP: vi.fn(),
  getPlayerMaxHP: vi.fn(),
  getPlayerMP: vi.fn(),
  getPlayerMaxMP: vi.fn(),
  getPlayerNameId: vi.fn(),
  getPlayerEquipment: vi.fn(),
  getInventory: vi.fn(),
  mutateInventory: vi.fn(),
  getInventoryCapacity: vi.fn(),
  getInventorySlot: vi.fn(),
  getObjectEntry: vi.fn(),
  mutateObjectEntry: vi.fn(),
  getMagicEntry: vi.fn(),
  getStoreEntry: vi.fn(),
  getExpState: vi.fn(),
  getPoisonStatusMatrix: vi.fn(),
  getLevelUpExp: vi.fn(),
  getCash: vi.fn(() => 0),
  isInBattle: vi.fn(() => false)
};

const stateStore = {};

const stateServiceMock = {
  getGlobal: vi.fn((key) => stateStore[key]),
  setGlobal: vi.fn((key, value) => {
    stateStore[key] = value;
    return value;
  }),
  mutateGlobal: vi.fn((key, mutator) => {
    const current = stateStore[key];
    if (typeof mutator !== 'function') {
      return current;
    }
    const next = mutator(current);
    if (typeof next !== 'undefined' && next !== current) {
      stateStore[key] = next;
      return next;
    }
    return current;
  })
};

const inputMock = {
  keyPress: 0,
  isKeyPressed: vi.fn((mask) => ((inputMock.keyPress & mask) === mask)),
  clear: vi.fn(() => {
    inputMock.keyPress = 0;
  })
};

vi.mock('../src/services/world-service.js', () => ({
  __esModule: true,
  default: worldServiceMock
}));

vi.mock('../src/services/state-service.js', () => ({
  __esModule: true,
  default: stateServiceMock
}));

vi.mock('../src/js/pal/input.js', () => ({
  __esModule: true,
  default: inputMock
}));

vi.mock('../src/js/pal/music.js', () => ({
  __esModule: true,
  default: {
    play: vi.fn(),
    stop: vi.fn()
  }
}));

vi.mock('../src/js/pal/rle.js', () => ({
  __esModule: true,
  default: (data) => data
}));

const surfaceStub = {
  updateScreen: vi.fn(),
  blitRLE: vi.fn(),
  blit: vi.fn(),
  fadeIn: vi.fn(),
  fadeOut: vi.fn(),
  clear: vi.fn()
};

const uiStub = {
  sprite: { frames: { itembox: {}, cursor: {}, slash: {} } },
  SPRITENUM_ITEMBOX: 'itembox',
  SPRITENUM_CURSOR: 'cursor',
  SPRITENUM_SLASH: 'slash',
  ITEMUSEMENU_COLOR_STATLABEL: 11,
  MENUITEM_COLOR: 1,
  MENUITEM_COLOR_SELECTED: 2,
  MENUITEM_COLOR_SELECTED_FIRST: 10,
  MENUITEM_COLOR_SELECTED_TOTALNUM: 2,
  MENUITEM_COLOR_SELECTED_INACTIVE: 3,
  MENUITEM_COLOR_INACTIVE: 4,
  MENUITEM_COLOR_CONFIRMED: 5,
  STATUS_COLOR_EQUIPMENT: 6,
  STATUS_LABEL_LEVEL: 'lvl',
  STATUS_LABEL_HP: 'hp',
  STATUS_LABEL_MP: 'mp',
  STATUS_LABEL_ATTACKPOWER: 'atk',
  STATUS_LABEL_MAGICPOWER: 'mag',
  STATUS_LABEL_RESISTANCE: 'res',
  STATUS_LABEL_DEXTERITY: 'dex',
  STATUS_LABEL_FLEERATE: 'flee',
  STATUS_LABEL_EXP: 'exp',
  MENUITEM_COLOR_CONFIRMED_FIRST: 12,
  magicmenu: {
    magicSelectMenu: vi.fn()
  },
  getWord: vi.fn((id) => `W${id}`),
  drawText: vi.fn(),
  drawNumber: vi.fn(),
  createBox: vi.fn(() => ({ free: vi.fn() })),
  createSingleLineBox: vi.fn()
};

const scriptMock = {
  getPlayerAttackStrength: vi.fn(() => 0),
  getPlayerMagicStrength: vi.fn(() => 0),
  getPlayerDefense: vi.fn(() => 0),
  getPlayerDexterity: vi.fn(() => 0),
  getPlayerFleeRate: vi.fn(() => 0),
  getItemAmount: vi.fn(() => 0),
  addItemToInventory: vi.fn(() => true),
  compressInventory: vi.fn(),
  runTriggerScript: vi.fn()
};

const objectStore = {};

function installFileStubs() {
  const files = (typeof global.Files === 'object' && global.Files) ? global.Files : {};
  files.BALL = { readChunk: vi.fn(() => null) };
  files.RGM = { readChunk: vi.fn(() => null) };
  files.FBP = { decompressChunk: vi.fn(() => null) };
  global.Files = files;
  return files;
}

let itemmenu;
let uigame;

function resetWorldService() {
  Object.keys(worldServiceMock).forEach((key) => {
    if (typeof worldServiceMock[key] === 'function') {
      worldServiceMock[key].mockReset();
    }
  });
  worldServiceMock.getCash.mockReturnValue(0);
  worldServiceMock.mutateObjectEntry.mockImplementation((id, mutator) => {
    const entry = objectStore[id];
    if (!entry) {
      return null;
    }
    const next = mutator(entry);
    if (typeof next !== 'undefined' && next !== entry) {
      objectStore[id] = next;
      return next;
    }
    return entry;
  });
  worldServiceMock.getObjectEntry.mockImplementation((id) => objectStore[id] || null);
}

function resetStateService() {
  Object.keys(stateStore).forEach((key) => delete stateStore[key]);
  stateServiceMock.getGlobal.mockClear();
  stateServiceMock.setGlobal.mockClear();
  stateServiceMock.mutateGlobal.mockClear();
}

function resetInput() {
  inputMock.keyPress = 0;
  inputMock.isKeyPressed.mockClear();
  inputMock.clear.mockClear();
}

async function loadModules() {
  ({ default: itemmenu } = await import('../src/js/pal/itemmenu.js'));
  ({ default: uigame } = await import('../src/js/pal/uigame.js'));
}

describe('ui menus (service-backed)', () => {
  beforeEach(async () => {
    vi.resetModules();
    resetWorldService();
    resetStateService();
    resetInput();
    Object.keys(objectStore).forEach((key) => delete objectStore[key]);

    global.RECT = function(x, y, w, h) {
      this.left = x;
      this.top = y;
      this.right = w;
      this.bottom = h;
    };

    global.Const = {
      MAX_INVENTORY: 10,
      MAX_PLAYER_EQUIPMENTS: 3,
      MAX_PLAYER_MAGICS: 4,
      MAX_PLAYERS_IN_PARTY: 4,
      MAX_POISONS: 3,
      MAX_STORE_ITEM: 5
    };
    global.ItemFlag = {
      Usable: 1,
      EquipableByPlayerRole_First: 1 << 4
    };
    global.Direction = {
      South: 0,
      West: 1,
      North: 2,
      East: 3,
      Unknown: 4
    };
    global.Key = {
      Up: 1,
      Down: 2,
      Left: 4,
      Right: 8,
      Menu: 16,
      Search: 32,
      PageUp: 64,
      PageDown: 128
    };
    global.NumColor = {
      Yellow: 'yellow',
      Cyan: 'cyan'
    };
    global.NumAlign = {
      Right: 'right'
    };
    global.PAL_XY = (x, y) => ((y & 0xffff) << 16) | (x & 0xffff);
    global.PAL_X = (value) => (value & 0xffff);
    global.PAL_Y = (value) => ((value >> 16) & 0xffff);
    global.log = {
      trace: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      warn: vi.fn()
    };
    global.sleepByFrame = vi.fn(() => 0);
    global.sleep = vi.fn(() => 0);
    global.timestamp = vi.fn(() => 0);
    installFileStubs();
    global.memcpy = vi.fn();
    global.memmove = vi.fn();
    global.uibattle = {
      playerInfoBox: vi.fn()
    };
    global.ui = uiStub;
    global.script = scriptMock;
    scriptMock.getPlayerAttackStrength.mockReturnValue(12);
    scriptMock.getPlayerMagicStrength.mockReturnValue(8);
    scriptMock.getPlayerDefense.mockReturnValue(6);
    scriptMock.getPlayerDexterity.mockReturnValue(7);
    scriptMock.getPlayerFleeRate.mockReturnValue(5);
    scriptMock.getItemAmount.mockReturnValue(3);
    scriptMock.runTriggerScript.mockResolvedValue(999);

    await loadModules();
    installFileStubs();

    // initialise modules with stubs
    itemmenu.init(surfaceStub, uiStub).next();
    uigame.init(surfaceStub, uiStub).next();
  });

  it('itemmenu.itemSelectMenuInit appends usable equipped items via worldService', () => {
    const inventory = Array.from({ length: Const.MAX_INVENTORY }, () => ({ item: 0, amount: 0, amountInUse: 0 }));
    inventory[0] = { item: 10, amount: 2, amountInUse: 0 };
    worldServiceMock.getInventory.mockReturnValue(inventory);
    worldServiceMock.getInventoryCapacity.mockReturnValue(Const.MAX_INVENTORY);
    worldServiceMock.getParty.mockReturnValue([{ playerRole: 1 }]);
    worldServiceMock.getMaxPartyMemberIndex.mockReturnValue(0);
    worldServiceMock.getPlayerEquipment.mockReturnValue(200);
    objectStore[200] = { item: { flags: ItemFlag.Usable, bitmap: 0, scriptOnEquip: 123 } };
    objectStore[10] = { item: { flags: ItemFlag.Usable, bitmap: 0 } };
    stateServiceMock.getGlobal.mockImplementation((key) => {
      if (key === 'inBattle') return false;
      return stateStore[key];
    });
    worldServiceMock.mutateInventory.mockImplementation((mutator) => mutator(inventory));

    itemmenu.itemSelectMenuInit(ItemFlag.Usable);

    expect(worldServiceMock.mutateInventory).toHaveBeenCalled();
    const extraSlot = inventory.find((slot) => slot.item === 200 && slot.amountInUse === -1);
    expect(extraSlot).toBeTruthy();
  });

  it('uigame.itemUseMenu returns selected role from worldService party', () => {
    const party = [
      { playerRole: 101, x: 0, y: 0 },
      { playerRole: 202, x: 0, y: 0 }
    ];
    worldServiceMock.getParty.mockReturnValue(party);
    worldServiceMock.getMaxPartyMemberIndex.mockReturnValue(1);
    worldServiceMock.getPlayerLevel.mockImplementation((role) => ({ 101: 5, 202: 3 }[role] || 0));
    worldServiceMock.getPlayerHP.mockImplementation((role) => ({ 101: 40, 202: 22 }[role] || 0));
    worldServiceMock.getPlayerMaxHP.mockImplementation((role) => ({ 101: 80, 202: 60 }[role] || 0));
    worldServiceMock.getPlayerMP.mockImplementation((role) => ({ 101: 18, 202: 9 }[role] || 0));
    worldServiceMock.getPlayerMaxMP.mockImplementation((role) => ({ 101: 30, 202: 20 }[role] || 0));
    worldServiceMock.getPlayerNameId.mockImplementation((role) => ({ 101: 501, 202: 502 }[role] || 0));
    scriptMock.getItemAmount.mockReturnValue(1);

    const iterator = uigame.itemUseMenu(777);
    iterator.next();
    inputMock.keyPress = Key.Search;

    let step = iterator.next();
    let guard = 0;
    while (!step.done && guard < 10) {
      step = iterator.next();
      guard++;
    }

    expect(step.value).toBe(101);
  });

  it('uigame.buyMenu_onItemChange displays cash and inventory amount from services', () => {
    const inventory = [
      { item: 300, amount: 4, amountInUse: 0 },
      { item: 0, amount: 0, amountInUse: 0 }
    ];
    worldServiceMock.getInventory.mockReturnValue(inventory);
    worldServiceMock.getCash.mockReturnValue(999);
    objectStore[300] = { item: { flags: 0, price: 123, bitmap: 45 } };

    uigame.buyMenu_onItemChange(300);

    const expectedCashPos = PAL_XY(69, 159);
    expect(uiStub.drawNumber).toHaveBeenCalledWith(999, 6, expectedCashPos, NumColor.Yellow, NumAlign.Right);
    expect(worldServiceMock.getInventory).toHaveBeenCalled();
  });
});
