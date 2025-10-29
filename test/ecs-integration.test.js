import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const { runTriggerScriptMock } = vi.hoisted(() => ({
  runTriggerScriptMock: vi.fn(function* (entry) {
    return entry + 1;
  })
}));

vi.mock('../src/services/script-service.js', () => ({
  __esModule: true,
  default: {
    runTriggerScript: runTriggerScriptMock,
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  }
}));

import battleService from '../src/services/battle-service.js';
import worldService from '../src/services/world-service.js';
import stateService from '../src/services/state-service.js';
import { BattleComponents } from '../src/ecs/index.js';
import {
  statusDecaySystem,
  performActionPhaseSystem
} from '../src/services/battle-systems.js';

const noopModule = {
  init: function* () {},
  start: function* () {},
  won: function* () {},
  playerEscape: function* () {},
  enemyEscape: function* () {}
};

function setupGlobals() {
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
  globalThis.Const = {
    MAX_ACTIONQUEUE_ITEMS: 16,
    MAX_ENEMIES_IN_TEAM: 6,
    MAX_PLAYERS_IN_PARTY: 5,
    MAX_POISONS: 4,
    MAX_INVENTORY: 64
  };
  globalThis.BattlePhase = {
    SelectAction: 0,
    PerformAction: 1
  };
  globalThis.BattleActionType = {
    Attack: 0,
    Magic: 1,
    CoopMagic: 2,
    Defend: 3,
    UseItem: 4,
    ThrowItem: 5,
    Flee: 6,
    Pass: 7,
    AttackMate: 8
  };
  globalThis.FighterState = {
    Wait: 0,
    Com: 1,
    Act: 2
  };
  globalThis.BattleMenuState = {
    Main: 0
  };
  globalThis.BattleUIState = {
    Wait: 0,
    SelectMove: 1
  };
  globalThis.PlayerStatus = {
    Puppet: 0,
    Sleep: 1,
    Paralyzed: 2,
    Confused: 3
  };
  globalThis.Key = {
    ForceRepeat: 1,
    Force: 2,
    Repeat: 3,
    Flee: 4
  };
  globalThis.randomFloat = (value) => value;
  globalThis.randomLong = (min) => min;
  globalThis.WORD = (value) => value;
  globalThis.log = {
    trace: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    warning: vi.fn()
  };
  globalThis.Global = {
    viewport: PAL_XY(0, 0),
    partyOffset: PAL_XY(0, 0),
    party: [],
    trail: [],
    numScene: 1,
    maxPartyMemberIndex: 0,
    partyDirection: 0,
    equipmentEffect: []
  };
  globalThis.GameData = {
    playerRoles: {
      HP: [120, 110, 100],
      MP: [50, 40, 30],
      maxHP: [120, 110, 100],
      maxMP: [50, 40, 30]
    },
    eventObject: [],
    scene: [{ eventObjectIndex: 0, mapNum: 0, scriptOnEnter: 0 }, { eventObjectIndex: 3, mapNum: 0, scriptOnEnter: 0 }],
    map: [],
    object: []
  };
}

function resetStateService() {
  stateService.updateGlobal({
    battle: undefined,
    autoBattle: undefined,
    party: undefined,
    maxPartyMemberIndex: undefined,
    playerStatus: undefined,
    poisonStatus: undefined,
    numFollower: undefined,
    partyDirection: undefined
  });
}

function createBaseBattleState() {
  return {
    phase: BattlePhase.SelectAction,
    player: [
      {
        state: FighterState.Wait,
        pos: PAL_XY(48, 96),
        originalPos: PAL_XY(48, 96),
        currentFrame: 0,
        action: { actionType: BattleActionType.Attack, actionID: 0 },
        sprite: { getFrame: () => ({ width: 32, height: 48 }) }
      },
      {
        state: FighterState.Wait,
        pos: PAL_XY(72, 96),
        originalPos: PAL_XY(72, 96),
        currentFrame: 0,
        action: { actionType: BattleActionType.Attack, actionID: 0 },
        sprite: { getFrame: () => ({ width: 32, height: 48 }) }
      }
    ],
    enemy: [],
    maxEnemyIndex: -1,
    actionQueue: Array.from({ length: Const.MAX_ACTIONQUEUE_ITEMS }, () => ({
      index: 0xFFFF,
      dexterity: 0xFFFF,
      isEnemy: false
    })),
    curAction: 0,
    hidingTime: 0,
    background: new Uint8Array(320 * 200),
    backgroundColorShift: 0,
    sceneBuf: new Uint8Array(320 * 200),
    UI: {
      state: BattleUIState.SelectMove,
      menuState: BattleMenuState.Main,
      curPlayerIndex: 0,
      selectedAction: 0,
      selectedIndex: -1,
      autoAttack: false
    }
  };
}

describe('ECS integration tests', () => {
  beforeEach(() => {
    runTriggerScriptMock.mockClear();
    setupGlobals();
    worldService.dispose();
    worldService.init();
    battleService._events = {};
    battleService.state = null;
    battleService.module = noopModule;
    battleService._globalAccessorInstalled = false;
    battleService.resetEntityRegistry();
  });

  afterEach(() => {
    worldService.dispose();
    resetStateService();
  });

  it('keeps battle UI autoBattle flag aligned with worldService state', () => {
    const partyStruct = [
      { playerRole: 0, x: 48, y: 96, frame: 0 },
      { playerRole: 1, x: 72, y: 96, frame: 0 }
    ];
    const statusMatrix = [
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ];
    worldService.setPartyStruct(partyStruct);
    worldService.setMaxPartyMemberIndex(1);
    worldService.setPlayerStatusStruct(statusMatrix);
    worldService.setAutoBattle(true);

    battleService.replaceState(createBaseBattleState());
    battleService.initialiseBattleEntities();

    const uiEntity = battleService.getUIEntity();
    const uiComponent = battleService.getRegistry().getComponent(uiEntity, BattleComponents.UIState);
    expect(uiComponent.autoBattle).toBe(true);
    expect(uiComponent.stateRef.autoAttack).toBe(false);

    worldService.setAutoBattle(false);
    battleService.syncUIComponent();
    const updatedComponent = battleService.getRegistry().getComponent(uiEntity, BattleComponents.UIState);
    expect(updatedComponent.autoBattle).toBe(false);
  });

  it('decays player statuses and enemy poisons using ECS-driven data', () => {
    worldService.setPartyStruct([{ playerRole: 0 }, { playerRole: 1 }]);
    worldService.setMaxPartyMemberIndex(1);
    const playerStatus = [
      [0, 2, 1, 3],
      [0, 0, 0, 0]
    ];
    worldService.setPlayerStatusStruct(playerStatus);
    const poisonMatrix = Array.from({ length: Const.MAX_POISONS }, () =>
      Array.from({ length: 2 }, () => ({ poisonID: 0, poisonScript: 0 }))
    );
    poisonMatrix[0][0] = { poisonID: 1, poisonScript: 123 };
    worldService.setPoisonStatusStruct(poisonMatrix);

    const battleState = createBaseBattleState();
    battleState.phase = BattlePhase.PerformAction;
    battleState.player[0].state = FighterState.Wait;
    battleState.enemy = [
      {
        objectID: 10,
        state: FighterState.Wait,
        e: { idleAnimSpeed: 1, idleFrames: 2 },
        poisons: [{ poisonID: 2, poisonScript: 321 }]
      }
    ];
    battleState.maxEnemyIndex = 0;

    battleService.replaceState(battleState);
    battleService.initialiseBattleEntities();

    statusDecaySystem({ battleService });
    const battleHooks = {
      backupStat: vi.fn(),
      postActionCheck: vi.fn(function* () {}),
      displayStatChange: vi.fn(() => false)
    };
    const actionIterator = performActionPhaseSystem({
      battleService,
      battle: battleHooks
    });
    let step = actionIterator.next();
    let guard = 0;
    while (!step.done && guard < 20) {
      step = actionIterator.next();
      guard += 1;
    }

    expect(worldService.getPlayerStatus(0)).toMatchInlineSnapshot(`
      [
        0,
        1,
        0,
        2,
      ]
    `);
    const updatedPoison = worldService.getPoisonStatusMatrix()[0][0];
    expect(updatedPoison.poisonScript).toBe(124);
    const enemyPoison = battleService.getState().enemy[0].poisons[0];
    expect(enemyPoison.poisonScript).toBe(322);
    expect(battleHooks.backupStat).toHaveBeenCalled();
    expect(runTriggerScriptMock).toHaveBeenCalledTimes(2);
    expect(runTriggerScriptMock).toHaveBeenNthCalledWith(1, 123, 0);
    expect(runTriggerScriptMock).toHaveBeenNthCalledWith(2, 321, WORD(0));
  });

  it('applies script opcode 0x009A to event objects via worldService', async () => {
    worldService.setEventObjectTable([
      { state: 1, triggerMode: 0, spriteNum: 0 },
      { state: 2, triggerMode: 0, spriteNum: 0 },
      { state: 3, triggerMode: 0, spriteNum: 0 }
    ]);
    worldService.syncEventObjects();
    worldService.setScriptEntries([
      null,
      { operation: 0x009A, operand: [1, 3, 5, 0] }
    ]);

    globalThis.BATTLE = () => ({});

    const scriptModule = await import('../src/js/pal/script.js');
    const iterator = scriptModule.default.interpretInstruction(1, 0);
    const result = iterator.next();
    expect(result.done).toBe(true);

    expect(worldService.getEventObject(0).state).toBe(5);
    expect(worldService.getEventObject(1).state).toBe(5);
    expect(worldService.getEventObject(2).state).toBe(5);
  });
});
