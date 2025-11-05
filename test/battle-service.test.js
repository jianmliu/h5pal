import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { BattleComponents } from '../src/ecs/index.js';
import worldService from '../src/services/world-service.js';
import stateService from '../src/services/state-service.js';
import scriptService from '../src/services/script-service.js';
import reactiveContext from '../src/state/reactive-context.js';
import { getCashValue } from '../src/state/slices/inventory.js';
import {
  getPlayerLevel as getPlayerLevelValue,
  getPlayerHP as getPlayerHPValue,
  getPlayerMaxHP as getPlayerMaxHPValue,
  getPlayerAttackStrength as getPlayerAttackStrengthValue
} from '../src/services/player-state-adapter.js';

const initMock = vi.fn(function* (...args) {
  yield { type: 'initStep', args };
  return undefined;
});

const startMock = vi.fn(function* (team, isBoss) {
  yield { type: 'startStep', team, isBoss };
  return 'BattleResult';
});

const wonMock = vi.fn(function* () {
  yield { type: 'wonStep' };
});

const playerEscapeMock = vi.fn(function* () {
  yield { type: 'playerEscapeStep' };
});

const enemyEscapeMock = vi.fn(function* () {
  yield { type: 'enemyEscapeStep' };
});

const battleModuleMock = {
  init: initMock,
  start: startMock,
  won: wonMock,
  playerEscape: playerEscapeMock,
  enemyEscape: enemyEscapeMock,
  value: 7
};

describe('BattleService', () => {
  let battleService;
  const root = globalThis;

  beforeEach(async () => {
    reactiveContext.dispose();
    initMock.mockClear();
    startMock.mockClear();
    wonMock.mockClear();
    playerEscapeMock.mockClear();
    enemyEscapeMock.mockClear();
    const module = await import('../src/services/battle-service.js');
    battleService = module.default;
    battleService._events = {};
    battleService.state = null;
    battleService.module = null;
    battleService._globalAccessorInstalled = false;
    root.Global = { autoBattle: false, frameNum: 0 };
    root.Global.playerStatus = [];
    root.Global.poisonStatus = [];
    battleService.bindModule(battleModuleMock);
    worldService.dispose();
    scriptService.playerLevelUp = vi.fn();
  });

  afterEach(() => {
    worldService.dispose();
    reactiveContext.dispose();
    stateService.updateGlobal({
      cash: undefined,
      party: undefined,
      maxPartyMemberIndex: undefined,
      playerStatus: undefined,
      exp: undefined,
      viewport: undefined,
      partyOffset: undefined,
      trail: undefined,
      numScene: undefined
    });
    stateService.updateGameData({
      playerRoles: undefined,
      levelUpExp: undefined,
      levelUpMagic: undefined
    });
    delete root.GameData;
    delete root.Const;
    delete root.randomLong;
  });

  it('proxies module properties', () => {
    expect(battleService.value).toBe(7);
    battleService.value = 10;
    expect(battleService.getModule().value).toBe(10);
  });

  it('wraps init with lifecycle events', () => {
    const beforeSpy = vi.fn();
    const afterSpy = vi.fn();
    battleService.on('beforeInit', beforeSpy);
    battleService.on('afterInit', afterSpy);

    const iterator = battleService.init('surface');
    const firstStep = iterator.next();
    expect(beforeSpy).toHaveBeenCalledWith({
      type: 'beforeInit',
      data: { args: ['surface'] }
    });
    expect(firstStep.value).toEqual({ type: 'initStep', args: ['surface'] });
    const result = iterator.next();
    expect(result.done).toBe(true);
    expect(afterSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'afterInit',
      data: expect.objectContaining({ args: ['surface'], result: undefined })
    }));
  });

  it('wraps start and returns the underlying result', () => {
    const beforeSpy = vi.fn();
    const afterSpy = vi.fn();
    battleService.on('beforeStart', beforeSpy);
    battleService.on('afterStart', afterSpy);

    const iterator = battleService.start([1, 2], true);
    const firstStep = iterator.next();
    expect(beforeSpy).toHaveBeenCalledWith({
      type: 'beforeStart',
      data: { enemyTeam: [1, 2], isBoss: true }
    });
    expect(firstStep.value).toEqual({ type: 'startStep', team: [1, 2], isBoss: true });
    const result = iterator.next();
    expect(result.value).toBe('BattleResult');
    expect(afterSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'afterStart',
      data: expect.objectContaining({ enemyTeam: [1, 2], isBoss: true, result: 'BattleResult' })
    }));
  });

  it('exposes other generator helpers through the proxy', () => {
    const wonIterator = battleService.won();
    expect(wonIterator.next().value).toEqual({ type: 'wonStep' });
    wonIterator.next();

    const escapeIterator = battleService.playerEscape();
    expect(escapeIterator.next().value).toEqual({ type: 'playerEscapeStep' });
    escapeIterator.next();

    const enemyIterator = battleService.enemyEscape();
    expect(enemyIterator.next().value).toEqual({ type: 'enemyEscapeStep' });
    enemyIterator.next();
  });

  it('emits stateMutated events for deep property writes', () => {
    battleService.replaceState({ foo: { bar: 1 } });
    const spy = vi.fn();
    battleService.on('stateMutated', spy);
    const state = battleService.getState();
    state.foo.bar = 2;
    expect(spy).toHaveBeenCalledTimes(1);
    const event = spy.mock.calls[0][0];
    expect(event.type).toBe('stateMutated');
    expect(event.data).toEqual(expect.objectContaining({
      path: ['foo', 'bar'],
      value: 2,
      previous: 1
    }));
    battleService.off && battleService.off('stateMutated', spy);
  });

  it('initialises ECS entities for players and enemies', () => {
    const sampleState = {
      player: [
        { timeMeter: 10, timeSpeedModifier: 1, action: {}, pos: 100, originalPos: 90, currentFrame: 0, sprite: { id: 'p0' }, colorShift: 0 },
        { timeMeter: 5, timeSpeedModifier: 1.5, action: {}, pos: 110, originalPos: 95, currentFrame: 0, sprite: { id: 'p1' }, colorShift: 0 }
      ],
      enemy: [
        {
          objectID: 42,
          timeMeter: 7,
          timeSpeedModifier: 1,
          status: new Array(9).fill(0),
          action: { actionType: 2 },
          pos: 200,
          originalPos: 180,
          currentFrame: 0,
          sprite: { id: 'e0' },
          e: { idleAnimSpeed: 1, idleFrames: 2 }
        },
        { objectID: 0 }
      ],
      maxEnemyIndex: 0,
      actionQueue: [
        { index: 0, dexterity: 50, isEnemy: false },
        { index: 0xFFFF, dexterity: 0xFFFF, isEnemy: false }
      ],
      UI: {
        state: 0,
        menuState: 0,
        curPlayerIndex: 0,
        selectedAction: 0,
        selectedIndex: -1,
        autoAttack: false
      }
    };
    battleService.replaceState(sampleState);
    root.Global.maxPartyMemberIndex = 1;
    root.Global.party = [
      { playerRole: 3 },
      { playerRole: 4 }
    ];
    worldService.setAutoBattle(false);
    root.Global.playerStatus[3] = new Array(9).fill(0);
    root.Global.playerStatus[4] = new Array(9).fill(0);

    battleService.initialiseBattleEntities();
    const registry = battleService.getRegistry();

    const playerEntity = battleService.getPlayerEntity(0);
    expect(playerEntity).not.toBeNull();
    const playerActor = registry.getComponent(playerEntity, BattleComponents.BattleActor);
    expect(playerActor).toEqual(expect.objectContaining({
      type: 'player',
      index: 0,
      roleId: 3
    }));
    const playerTime = registry.getComponent(playerEntity, BattleComponents.Time);
    const currentState = battleService.getState();
    expect(playerTime.stateRef).toBe(currentState.player[0]);
    const playerStatus = registry.getComponent(playerEntity, BattleComponents.Status);
    expect(playerStatus).toEqual(expect.objectContaining({
      type: 'player',
      roleId: 3,
      statusRef: expect.any(Array)
    }));
    const playerStats = registry.getComponent(playerEntity, BattleComponents.Stats);
    expect(playerStats).toEqual(expect.objectContaining({
      type: 'player',
      actorIndex: 0
    }));
    const playerPosition = registry.getComponent(playerEntity, BattleComponents.Position);
    expect(playerPosition).toEqual(expect.objectContaining({
      type: 'player',
      actorIndex: 0,
      current: sampleState.player[0].pos,
      original: sampleState.player[0].originalPos
    }));
    const playerSprite = registry.getComponent(playerEntity, BattleComponents.Sprite);
    expect(playerSprite).toEqual(expect.objectContaining({
      type: 'player',
      actorIndex: 0
    }));
    const playerAnimation = registry.getComponent(playerEntity, BattleComponents.Animation);
    expect(playerAnimation).toEqual(expect.objectContaining({
      type: 'player',
      actorIndex: 0,
      currentFrame: sampleState.player[0].currentFrame
    }));
    const playerCommand = registry.getComponent(playerEntity, BattleComponents.Command);
    expect(playerCommand).toEqual(expect.objectContaining({
      type: 'player',
      commandRef: sampleState.player[0].action
    }));

    const enemyEntity = battleService.getEnemyEntity(0);
    expect(enemyEntity).not.toBeNull();
    const enemyActor = registry.getComponent(enemyEntity, BattleComponents.BattleActor);
    expect(enemyActor).toEqual(expect.objectContaining({
      type: 'enemy',
      index: 0,
      objectId: 42
    }));
    const enemyTime = registry.getComponent(enemyEntity, BattleComponents.Time);
    expect(enemyTime.stateRef).toBe(currentState.enemy[0]);
    const enemyStatus = registry.getComponent(enemyEntity, BattleComponents.Status);
    expect(enemyStatus).toEqual(expect.objectContaining({
      type: 'enemy',
      enemyIndex: 0,
      statusRef: expect.any(Array)
    }));
    const enemyStats = registry.getComponent(enemyEntity, BattleComponents.Stats);
    expect(enemyStats).toEqual(expect.objectContaining({
      type: 'enemy',
      actorIndex: 0
    }));
    const enemyPosition = registry.getComponent(enemyEntity, BattleComponents.Position);
    expect(enemyPosition).toEqual(expect.objectContaining({
      type: 'enemy',
      actorIndex: 0,
      current: sampleState.enemy[0].pos,
      original: sampleState.enemy[0].originalPos
    }));
    const enemySprite = registry.getComponent(enemyEntity, BattleComponents.Sprite);
    expect(enemySprite).toEqual(expect.objectContaining({
      type: 'enemy',
      actorIndex: 0
    }));
    const enemyAnimation = registry.getComponent(enemyEntity, BattleComponents.Animation);
    expect(enemyAnimation).toEqual(expect.objectContaining({
      type: 'enemy',
      actorIndex: 0
    }));
    const enemyCommand = registry.getComponent(enemyEntity, BattleComponents.Command);
    expect(enemyCommand).toEqual(expect.objectContaining({
      type: 'enemy',
      commandRef: sampleState.enemy[0].action
    }));

    const queueEntity = battleService.getQueueEntity(0);
    expect(queueEntity).not.toBeNull();
    const queueComp = registry.getComponent(queueEntity, BattleComponents.QueueEntry);
    expect(queueComp).toEqual(expect.objectContaining({
      index: 0,
      entryRef: sampleState.actionQueue[0]
    }));

    const uiEntity = battleService.getUIEntity();
    expect(uiEntity).not.toBeNull();
    const uiComponent = registry.getComponent(uiEntity, BattleComponents.UIState);
    expect(uiComponent).toEqual(expect.objectContaining({
      stateRef: sampleState.UI,
      state: sampleState.UI.state,
      menuState: sampleState.UI.menuState,
      currentPlayer: sampleState.UI.curPlayerIndex,
      selectedAction: sampleState.UI.selectedAction,
      selectedIndex: sampleState.UI.selectedIndex,
      autoBattle: false
    }));
  });

  it('keeps the UI component synchronised with state updates', () => {
    const sampleState = {
      player: [
        { timeMeter: 10, timeSpeedModifier: 1, action: {} }
      ],
      enemy: [
        { objectID: 0, timeMeter: 0, timeSpeedModifier: 1, status: new Array(9).fill(0), action: { actionType: 0 } }
      ],
      maxEnemyIndex: 0,
      actionQueue: [
        { index: 0, dexterity: 30, isEnemy: false }
      ],
      UI: {
        state: 0,
        menuState: 0,
        curPlayerIndex: 0,
        selectedAction: 0,
        selectedIndex: -1,
        autoAttack: false
      }
    };
    battleService.replaceState(sampleState);
    root.Global.maxPartyMemberIndex = 0;
    root.Global.party = [{ playerRole: 3 }];
    worldService.setAutoBattle(false);
    root.Global.playerStatus[3] = new Array(9).fill(0);

    battleService.initialiseBattleEntities();

    battleService.setUI({
      state: 2,
      selectedIndex: 3,
      autoAttack: true
    });

    const uiComponent = battleService.getUIComponent();
    const uiState = battleService.getUI();

    expect(uiState).toEqual(expect.objectContaining({
      state: 2,
      selectedIndex: 3,
      autoAttack: true
    }));
    expect(uiComponent.state).toBe(2);
    expect(uiComponent.selectedIndex).toBe(3);
    expect(uiComponent.autoBattle).toBe(worldService.getAutoBattle());

    worldService.setAutoBattle(true);
    expect(battleService.getUIComponent().autoBattle).toBe(true);

    battleService.updateUI(function(ui) {
      ui.menuState = 4;
      return ui;
    });

    const updatedComponent = battleService.getUIComponent();
    expect(updatedComponent.menuState).toBe(4);
    expect(battleService.getUI().menuState).toBe(4);
  });

  it('awardExp updates exp state, player stats, and ECS components', () => {
    const root = globalThis;
    root.Const = { MAX_LEVELS: 5 };
    root.randomLong = vi.fn(() => 1);

    const expState = {
      primaryExp: [{ exp: 0, level: 1, count: 0 }],
      attackExp: [{ exp: 0, level: 0, count: 1 }],
      defenseExp: [{ exp: 0, level: 0, count: 1 }],
      dexterityExp: [{ exp: 0, level: 0, count: 1 }],
      fleeExp: [{ exp: 0, level: 0, count: 1 }],
      healthExp: [{ exp: 0, level: 0, count: 1 }],
      magicExp: [{ exp: 0, level: 0, count: 1 }],
      magicPowerExp: [{ exp: 0, level: 0, count: 1 }]
    };

    const playerRoles = {
      name: [123],
      level: [1],
      HP: [50],
      maxHP: [60],
      MP: [20],
      maxMP: [30],
      attackStrength: [10],
      magicStrength: [12],
      defense: [8],
      dexterity: [9],
      fleeRate: [7]
    };

    stateService.setGlobal('cash', 100);
    stateService.setGlobal('party', [{ playerRole: 0 }]);
    stateService.setGlobal('maxPartyMemberIndex', 0);
    stateService.setGlobal('playerStatus', [new Array(9).fill(0)]);
    stateService.setGlobal('trail', []);
    stateService.setGlobal('viewport', 0);
    stateService.setGlobal('partyOffset', 0);
    stateService.setGlobal('numScene', 1);
    stateService.setGlobal('exp', expState);

    stateService.setGameData('playerRoles', playerRoles);
    stateService.setGameData('levelUpExp', [5, 10, 20, 30, 40, 50]);
    stateService.setGameData('levelUpMagic', [{ m: [{ level: 2, magic: 500 }] }]);

    root.GameData = {
      playerRoles: stateService.getGameData('playerRoles'),
      levelUpExp: stateService.getGameData('levelUpExp'),
      levelUpMagic: stateService.getGameData('levelUpMagic'),
      scene: [
        { eventObjectIndex: 0, mapNum: 0, scriptOnEnter: 0 },
        { eventObjectIndex: 0, mapNum: 0, scriptOnEnter: 0 }
      ],
      eventObject: [],
      map: [{}, {}],
      object: [{ enemy: { enemyID: 0 } }],
      enemy: []
    };

    worldService.init();
    worldService.syncAll();

    const battleState = {
      player: [
        {
          timeMeter: 0,
          timeSpeedModifier: 1,
          action: {},
          pos: 0,
          originalPos: 0,
          currentFrame: 0,
          sprite: { id: 'p0' },
          colorShift: 0
        }
      ],
      enemy: [],
      maxEnemyIndex: -1,
      actionQueue: [],
      UI: {}
    };

    battleService.replaceState(battleState);
    root.Global.maxPartyMemberIndex = 0;
    root.Global.party = [{ playerRole: 0 }];
    worldService.setAutoBattle(false);
    root.Global.playerStatus[0] = new Array(9).fill(0);
    battleService.initialiseBattleEntities();

    const beforeSnapshot = battleService.getPlayerSnapshot(0);

    const summary = battleService.awardExp(0, 30);
    expect(summary.roleId).toBe(0);
    expect(summary.levelUp).toBe(true);
    expect(getPlayerLevelValue(0)).toBe(3);
    expect(getPlayerHPValue(0)).toBeLessThanOrEqual(getPlayerMaxHPValue(0));
    expect(getPlayerHPValue(0)).toBeGreaterThanOrEqual(beforeSnapshot.hp);
    expect(getPlayerAttackStrengthValue(0)).toBeGreaterThan(beforeSnapshot.attackStrength);

    const updatedExpState = worldService.getExpState();
    expect(updatedExpState.primaryExp[0].exp).toBe(0);

    battleService.syncActorComponents();
    const registry = battleService.getRegistry();
    const statsComp = registry.getComponent(battleService.getPlayerEntity(0), BattleComponents.Stats);
    expect(statsComp).toBeTruthy();
    expect(statsComp.statsRef.hp[0]).toBe(getPlayerHPValue(0));

    worldService.adjustCash(50);
    expect(getCashValue()).toBe(150);
  });
});
