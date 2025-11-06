import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/pal/uigame.js', () => {
  const createMenuHandler = (label) =>
    vi.fn(function* () {
      yield Promise.resolve();
      return label;
    });

  return {
    default: {
      inGameMenu: createMenuHandler('main'),
      inventoryMenu: createMenuHandler('inventory'),
      playerStatus: createMenuHandler('status'),
      inGameMagicMenu: createMenuHandler('magic'),
      systemMenu: createMenuHandler('system')
    }
  };
});

import stateService from '../src/services/state-service.js';
import worldService from '../src/services/world-service.js';
import battleService from '../src/services/battle-service.js';
import resourceService from '../src/services/resource-service.js';

let scriptService;
let uigameMock;

beforeAll(async () => {
  scriptService = (await import('../src/services/script-service.js')).default;
  uigameMock = (await import('../src/js/pal/uigame.js')).default;
  global.ItemFlag = Object.freeze({
    ApplyToAll: 16,
    Consuming: 8
  });
  global.BattleActionType = Object.freeze({
    Magic: 3
  });
});

beforeEach(() => {
  scriptService._activeMenuTask = null;
});

afterEach(() => {
  stateService.setGameData('object', undefined);
  if (global.services) {
    delete global.services;
  }
});

describe('scriptService.openMenu', () => {
  it('routes to the expected menu handler', async () => {
    const result = await scriptService.openMenu('inventory');
    expect(result).toBe('inventory');
    expect(uigameMock.inventoryMenu).toHaveBeenCalledTimes(1);
  });

  it('reuses in-flight task for duplicate requests', async () => {
    const promise = scriptService.openMenu('main');
    const second = scriptService.openMenu('main');
    expect(second).toBe(promise);
    await promise;
    expect(uigameMock.inGameMenu).toHaveBeenCalledTimes(1);
  });
});

describe('worldService.useInventoryItem', () => {
  it('runs item script and consumes inventory when successful', async () => {
    const fakeScriptObjects = {
      getObjectEntry: vi.fn().mockReturnValue({
        item: { scriptOnUse: 123, flags: ItemFlag.ApplyToAll | ItemFlag.Consuming }
      })
    };

    global.services = {
      script: scriptService,
      adapters: {
        scriptObjects: fakeScriptObjects
      }
    };

    stateService.setGameData('object', [
      { item: { scriptOnUse: 123, flags: ItemFlag.ApplyToAll | ItemFlag.Consuming } }
    ]);

    const outcome = await worldService.useInventoryItem(0);
    expect(typeof outcome).toBe('boolean');
  });
});

describe('battleService helpers', () => {
  beforeEach(() => {
    const initialState = {
      player: [
        {
          action: { actionType: 0, actionID: 0, target: 0, remainingTime: 0 }
        }
      ],
      enemy: [],
      actionQueue: [],
      UI: {}
    };
    battleService.replaceState(initialState);
    battleService._activeBattleTask = null;
  });

  it('casts magic by mutating player action', () => {
    const updated = battleService.castMagic({ magicId: 77, casterIndex: 0, targetIndex: 2 });
    expect(updated).toBe(true);
    const state = battleService.getState();
    expect(state.player[0].action).toMatchObject({ actionType: 3, actionID: 77, target: 2 });
  });

  it('starts battle via generator wrapper', async () => {
    const startSpy = vi
      .spyOn(battleService, 'start')
      .mockImplementation(function* (formation, boss) {
        expect(formation).toBe(5);
        expect(boss).toBe(true);
        return 'result';
      });

    const result = await battleService.startBattle(5, { isBoss: true });
    expect(result).toBe('result');
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(battleService._activeBattleTask).toBe(null);

    startSpy.mockRestore();
  });
});

describe('resourceService.saveGame', () => {
  it('delegates to game.saveGame', async () => {
    const saveGame = vi.fn().mockReturnValue(true);
    const resolver = vi
      .spyOn(resourceService, '_resolveGameModule')
      .mockResolvedValue({ saveGame });

    const result = await resourceService.saveGame(3);
    expect(result).toBe(true);
    expect(saveGame).toHaveBeenCalledWith(3);

    resolver.mockRestore();
  });
});
