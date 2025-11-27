import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEntityRegistry, BattleComponents, BattleTags } from '../src/ecs/index.js';

const applyWaveMock = vi.fn();
const inputMock = { isKeyPressed: vi.fn(), keyPress: 0 };

vi.mock('../src/js/pal/scene.js', () => ({
  __esModule: true,
  default: { applyWave: applyWaveMock },
  applyWave: applyWaveMock
}));

vi.mock('../src/js/pal/input.js', () => ({
  __esModule: true,
  default: inputMock
}));

const getPartyStateMock = vi.fn(() => []);
vi.mock('../src/services/party-trail-adapter.ts', () => ({
  __esModule: true,
  default: {
    getPartyState: getPartyStateMock
  }
}));

vi.mock('../src/services/game-flags-adapter.js', () => ({
  __esModule: true,
  getBattleSpeed: () => 2,
  getCollectValue: () => 0,
  getChaseRange: () => 0,
  getChaseSpeedChangeCycles: () => 0,
  default: {
    getBattleSpeed: () => 2,
    getCollectValue: () => 0,
    getChaseRange: () => 0,
    getChaseSpeedChangeCycles: () => 0
  }
}));

let BattleSystemManager;
let idleAnimationSystem;
let renderSceneSystem;
let createBattleSystemManager;
let selectActionQueueSystem;
let performActionPhaseSystem;
beforeAll(async () => {
  const module = await import('../src/services/battle-systems.js');
  BattleSystemManager = module.BattleSystemManager;
  idleAnimationSystem = module.idleAnimationSystem;
  renderSceneSystem = module.renderSceneSystem;
  createBattleSystemManager = module.default;
  selectActionQueueSystem = module.selectActionQueueSystem;
  performActionPhaseSystem = module.performActionPhaseSystem;
});

function createStubBattleService(state, registry) {
  const service = {
    _registry: registry || createEntityRegistry(),
    _state: state,
    entityMaps: {
      player: new Map(),
      enemy: new Map(),
      queue: new Map(),
      ui: null
    },
    getRegistry() {
      return this._registry;
    },
    getState() {
      return this._state;
    },
    set(path, value) {
      const segments = Array.isArray(path) ? path : [path];
      let target = this._state;
      for (let i = 0; i < segments.length - 1; i++) {
        if (target == null) return null;
        target = target[segments[i]];
      }
      if (target == null) return null;
      const key = segments[segments.length - 1];
      const nextValue = typeof value === 'function' ? value(target[key]) : value;
      target[key] = nextValue;
      return target[key];
    },
    setPlayer(index, updater) {
      const player = this._state.player && this._state.player[index];
      if (!player) return null;
      if (typeof updater === 'function') {
        updater(player);
      } else if (updater && typeof updater === 'object') {
        Object.assign(player, updater);
      }
      return player;
    },
    getPlayerEntity() {
      return null;
    },
    getEnemyEntity() {
      return null;
    },
    getQueueEntity() {
      return null;
    },
    setEnemyPoison(index, slot, updater) {
      const enemy = this._state.enemy && this._state.enemy[index];
      if (!enemy) return;
      if (!enemy.poisons) {
        enemy.poisons = [];
      }
      const slotIndex = Number(slot);
      enemy.poisons[slotIndex] = enemy.poisons[slotIndex] || { poisonID: 0, poisonScript: 0 };
      if (typeof updater === 'function') {
        updater(enemy.poisons[slotIndex]);
      } else if (updater && typeof updater === 'object') {
        Object.assign(enemy.poisons[slotIndex], updater);
      }
    },
    setHidingTime(value) {
      this._state.hidingTime = value;
    },
    runSystems: vi.fn(),
    syncActorComponents: vi.fn(),
    fire: vi.fn()
  };
  return service;
}

function setGlobalScaffolding() {
  globalThis.PlayerStatus = {
    Puppet: 0,
    Sleep: 1,
    Paralyzed: 2,
    Confused: 3
  };
  globalThis.Const = {
    MAX_ACTIONQUEUE_ITEMS: 16,
    MAX_ENEMIES_IN_TEAM: 6,
    MAX_PLAYERS_IN_PARTY: 5,
    MAX_POISONS: 8,
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
  globalThis.MagicFlag = {
    UsableToEnemy: 1
  };
  globalThis.WORD = (value) => value;
  globalThis.randomFloat = (min) => min;
  globalThis.PAL_X = (pos) => pos & 0xFFFF;
  globalThis.PAL_Y = (pos) => (pos >>> 16) & 0xFFFF;
  globalThis.PAL_XY = (x, y) => ((y & 0xFFFF) << 16) | (x & 0xFFFF);
  globalThis.randomLong = (min, max) => min;
  globalThis.Key = {
    ForceRepeat: 1,
    Force: 2,
    Repeat: 3,
    Flee: 4
  };
}

describe('BattleSystemManager', () => {
  beforeEach(() => {
    setGlobalScaffolding();
    applyWaveMock.mockReset();
    getPartyStateMock.mockReset();
    getPartyStateMock.mockReturnValue([]);
  });

describe('selectActionQueueSystem', () => {
  beforeEach(() => {
    setGlobalScaffolding();
    inputMock.isKeyPressed.mockReset();
    inputMock.keyPress = 0;
  });

  it('moves waiting player into the action queue and switches phase', () => {
    const state = {
      phase: BattlePhase.SelectAction,
      player: [
        {
          state: FighterState.Act,
          defending: false,
          action: {
            actionType: BattleActionType.Attack,
            actionID: 0
          }
        }
      ],
      enemy: [],
      maxEnemyIndex: -1,
      actionQueue: Array.from({ length: Const.MAX_ACTIONQUEUE_ITEMS }, () => ({
        index: 0xFFFF,
        dexterity: 0xFFFF,
        isEnemy: false
      })),
      curAction: 0
    };
    globalThis.Global = {
      party: [{ playerRole: 0 }],
      playerStatus: [[0, 0, 0, 0]],
      maxPartyMemberIndex: 0,
      battle: state
    };
    globalThis.GameData = {
      playerRoles: {
        HP: [100],
        MP: [50],
        maxHP: [100],
        maxMP: [50]
      },
      object: [
        { magic: { flags: 0 } }
      ]
    };
    getPartyStateMock.mockReturnValue(globalThis.Global.party);
    const battleStub = {
      getPlayerActualDexterity: () => 15,
      isPlayerDying: () => false
    };
    const service = createStubBattleService(state, null);
    const onReady = vi.fn();

    selectActionQueueSystem({
      battleService: service,
      battle: battleStub,
      onPlayerReady: onReady
    });

    expect(state.phase).toBe(BattlePhase.PerformAction);
    expect(state.actionQueue[0]).toMatchObject({
      index: 0,
      isEnemy: false
    });
    expect(onReady).not.toHaveBeenCalled();
  });
});

describe('performActionPhaseSystem', () => {
  beforeEach(() => {
    setGlobalScaffolding();
    inputMock.isKeyPressed.mockReset();
    inputMock.keyPress = 0;
    getPartyStateMock.mockReset();
    getPartyStateMock.mockReturnValue([]);
  });

  it('executes player action and advances the queue', async () => {
    const performActionMock = vi.fn();
    const battleStub = {
      playerPerformAction: function*(index) {
        performActionMock(index);
      }
    };
    const state = {
      phase: BattlePhase.PerformAction,
      player: [
        {
          state: FighterState.Act,
          action: {
            actionType: BattleActionType.Attack,
            actionID: 0,
            target: -1
          }
        }
      ],
      enemy: [],
      maxEnemyIndex: -1,
      actionQueue: [
        { index: 0, isEnemy: false, dexterity: 10 }
      ],
      curAction: 0,
      hidingTime: 0,
      repeat: false,
      force: false,
      flee: false
    };
    globalThis.Global = {
      party: [{ playerRole: 0 }],
      playerStatus: [[0, 0, 0, 0]],
      maxPartyMemberIndex: 0,
      battle: state
    };
    globalThis.GameData = {
      playerRoles: {
        HP: [100],
        MP: [50],
        maxHP: [100],
        maxMP: [50]
      },
      object: [
        { magic: { flags: 0 } }
      ]
    };
    getPartyStateMock.mockReturnValue(globalThis.Global.party);
    const service = createStubBattleService(state, null);
    const iterator = performActionPhaseSystem({
      battleService: service,
      battle: battleStub,
      surface: null,
      onlyPuppet: false
    });

    // consume generator
    if (iterator && typeof iterator.next === 'function') {
      iterator.next();
    }

    expect(performActionMock).toHaveBeenCalledWith(0);
    expect(state.curAction).toBe(1);
  });
});

  it('runs registered systems in order', () => {
    const service = createStubBattleService({}, createEntityRegistry());
    const manager = new BattleSystemManager(service);
    const first = vi.fn();
    const second = vi.fn();
    manager.register('test', first);
    manager.register('test', second);

    manager.run('test', { value: 1 });

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(first.mock.invocationCallOrder[0]).toBeLessThan(second.mock.invocationCallOrder[0]);
  });

  it('updates player animation frames through idleAnimationSystem', () => {
    const registry = createEntityRegistry();
    const state = {
      player: [
        {
          pos: globalThis.PAL_XY(100, 120),
          originalPos: globalThis.PAL_XY(100, 120),
          currentFrame: 0,
          sprite: { getFrame: () => ({ width: 10, height: 10 }) },
          defending: false,
          colorShift: 0
        }
      ],
      enemy: [],
      maxEnemyIndex: -1
    };
    const service = createStubBattleService(state, registry);
    const playerEntity = registry.createEntity({ tags: BattleTags.Player });
    service.entityMaps.player.set(0, playerEntity);
    registry.addComponent(playerEntity, BattleComponents.BattleActor, {
      type: 'player',
      index: 0,
      roleId: 0
    });
    registry.addComponent(playerEntity, BattleComponents.Position, {
      type: 'player',
      actorIndex: 0,
      current: state.player[0].pos,
      original: state.player[0].originalPos,
      stateRef: state.player[0]
    });
    registry.addComponent(playerEntity, BattleComponents.Animation, {
      type: 'player',
      actorIndex: 0,
      stateRef: state.player[0],
      currentFrame: 0
    });
    registry.addComponent(playerEntity, BattleComponents.Sprite, {
      type: 'player',
      actorIndex: 0,
      spriteRef: state.player[0].sprite,
      colorShiftRef: state.player[0]
    });
    const statusRow = [0, 0, 0, 0];
    registry.addComponent(playerEntity, BattleComponents.Stats, {
      type: 'player',
      actorIndex: 0,
      roleId: 0,
      extra: { statusRef: statusRow }
    });

    globalThis.Global = {
      party: [{ playerRole: 0 }],
      playerStatus: [statusRow],
      maxPartyMemberIndex: 0,
      battle: state
    };
    globalThis.GameData = {
      playerRoles: {
        HP: [10],
        maxHP: [10],
        MP: [5],
        maxMP: [5]
      }
    };
    getPartyStateMock.mockReturnValue(globalThis.Global.party);
    const battleStub = {
      isPlayerDying: () => false
    };

    idleAnimationSystem({ battleService: service, battle: battleStub });

    expect(state.player[0].currentFrame).toBe(0);
    expect(service.syncActorComponents).toHaveBeenCalledOnce();
  });

  it('renders into the scene buffer through renderSceneSystem', () => {
    const width = 4;
    const height = 2;
    const registry = createEntityRegistry();
    const background = new Uint8Array(width * height);
    background.fill(0x11);
    const sceneBuffer = new Uint8Array(width * height);
    const state = {
      player: [],
      enemy: [{
        objectID: 1,
        status: new Array(9).fill(0),
        sprite: { getFrame: () => ({ width: 1, height: 1 }) },
        pos: globalThis.PAL_XY(1, 1),
        originalPos: globalThis.PAL_XY(1, 1),
        currentFrame: 0,
        colorShift: 0,
        e: { idleFrames: 1, idleAnimSpeed: 1, health: 10, maxHealth: 10 }
      }],
      maxEnemyIndex: 0,
      background,
      sceneBuf: sceneBuffer,
      backgroundColorShift: 0,
      summonSprite: null,
      summonPos: 0,
      hidingTime: 0
    };
    const service = createStubBattleService(state, registry);
    const enemyEntity = registry.createEntity({ tags: BattleTags.Enemy });
    service.entityMaps.enemy.set(0, enemyEntity);
    registry.addComponent(enemyEntity, BattleComponents.BattleActor, {
      type: 'enemy',
      index: 0,
      objectId: 1
    });
    registry.addComponent(enemyEntity, BattleComponents.Position, {
      type: 'enemy',
      actorIndex: 0,
      current: state.enemy[0].pos,
      original: state.enemy[0].originalPos,
      stateRef: state.enemy[0]
    });
    registry.addComponent(enemyEntity, BattleComponents.Sprite, {
      type: 'enemy',
      actorIndex: 0,
      spriteRef: state.enemy[0].sprite,
      colorShiftRef: state.enemy[0]
    });
    registry.addComponent(enemyEntity, BattleComponents.Animation, {
      type: 'enemy',
      actorIndex: 0,
      stateRef: state.enemy[0],
      currentFrame: 0,
      metadata: { idleAnimSpeed: 1 }
    });
    registry.addComponent(enemyEntity, BattleComponents.Stats, {
      type: 'enemy',
      actorIndex: 0,
      statsRef: state.enemy[0].e
    });

    globalThis.Global = {
      battle: state
    };

    const surface = {
      pitch: width,
      height,
      blitRLE: vi.fn((frame, pos, buffer) => {
        const index = (pos >>> 16) * width + (pos & 0xFFFF);
        buffer[index] = 0xAA;
      }),
      blitRLEWithColorShift: vi.fn((frame, pos, shift, buffer) => {
        const index = (pos >>> 16) * width + (pos & 0xFFFF);
        buffer[index] = shift & 0xFF;
      })
    };

    renderSceneSystem({ battleService: service, surface, battle: {} });

    expect(applyWaveMock).toHaveBeenCalledOnce();
    expect(sceneBuffer.some((value) => value !== 0)).toBe(true);
  });

  it('createBattleSystemManager wires default systems', () => {
    const registry = createEntityRegistry();
    const state = {
      player: [],
      enemy: [],
      maxEnemyIndex: -1,
      background: new Uint8Array(4),
      sceneBuf: new Uint8Array(4)
    };
    const service = createStubBattleService(state, registry);
    const manager = createBattleSystemManager({ battleService: service, surface: { pitch: 2, height: 2 }, battle: {} });

    expect(manager).toBeInstanceOf(BattleSystemManager);
    service.setSystemManager && service.setSystemManager(manager);
    manager.run('animation', { surface: { pitch: 2, height: 2 }, battle: {} });
    manager.run('render', { surface: { pitch: 2, height: 2 }, battle: {} });
  });
});
