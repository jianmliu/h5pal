import EventBus from './event-bus.js';
import stateService from './state-service.ts';
import worldService from './world-service';
import scriptService from './script-service.ts';
import co from '../js/pal/co.js';
import type { PalGlobal, PlayerRoles } from '../types/pal.js';

declare const GameData: { playerRoles?: any; [key: string]: any } | undefined;
declare const randomLong: ((min: number, max: number) => number) | undefined;
declare const Const: { MAX_LEVELS?: number } | undefined;
declare const global: any;
declare const BattleActionType: { [key: string]: number } | undefined;
import {
  getPlayerRolesSnapshot,
  getPlayerHP,
  getPlayerMP,
  getPlayerLevel,
  getPlayerMaxHP,
  getPlayerMaxMP,
  getPlayerAttackStrength,
  getPlayerMagicStrength,
  getPlayerDefense,
  getPlayerDexterity,
  getPlayerFleeRate,
  getPlayerStatusRow,
  getMaxPartyMemberIndex
} from './player-state-adapter.ts';
import partyTrailAdapter from './party-trail-adapter.js';
import { getExpStateSnapshot } from './game-data-adapter.js';
import {
  createEntityRegistry,
  BattleComponents,
  BattleTags,
  createBattleActorComponent,
  createTimeComponent,
  createStatsComponent,
  createStatusComponent,
  createPositionComponent,
  createSpriteComponent,
  createAnimationComponent,
  createCommandComponent,
  createQueueEntryComponent,
  createUIStateComponent
} from '../ecs/index.js';
import { autoBattleStream, getAutoBattleValue } from '../state/slices/auto-battle.ts';
import { updateBattleFlagsFromState, resetBattleFlagsSlice } from '../state/slices/battle-flags.js';

function getBattleActionEnum(): Record<string, number> | null {
  const globalThisAny: unknown = typeof globalThis !== 'undefined' ? (globalThis as any) : null;
  const globalAny: unknown = typeof global !== 'undefined' ? (global as any) : null;
  if (typeof BattleActionType !== 'undefined' && BattleActionType) {
    return BattleActionType;
  }
  if (globalThisAny && (globalThisAny as any).BattleActionType) {
    return (globalThisAny as any).BattleActionType as Record<string, number>;
  }
  if (globalAny && (globalAny as any).BattleActionType) {
    return (globalAny as any).BattleActionType as Record<string, number>;
  }
  return null;
}

function ensureGameGlobal(): PalGlobal | null {
  let store = stateService.getGlobal<PalGlobal>();
  if (store) return store;
  const globalThisAny: any = typeof globalThis !== 'undefined' ? (globalThis as any) : null;
  if (globalThisAny) {
    globalThisAny.Global = globalThisAny.Global || {};
    store = globalThisAny.Global;
  } else if (typeof global !== 'undefined') {
    const globalAny = global as any;
    globalAny.Global = globalAny.Global || {};
    store = globalAny.Global;
  }
  return store || null;
}

function getPartySnapshot() {
  // TODO(rxjs-cleanup): remove worldService party fallback once party slice is authoritative.
  const fallback = worldService.getParty();
  const party = partyTrailAdapter.getPartyState();
  const globalParty = stateService.getGlobal('party');
  if (Array.isArray(party) && party.length > 0 && party.length >= (Array.isArray(fallback) ? fallback.length : 0)) {
    return party;
  }
  if (Array.isArray(fallback) && fallback.length > 0) {
    return fallback;
  }
  if (Array.isArray(globalParty) && globalParty.length > 0) {
    return globalParty;
  }
  return Array.isArray(party) ? party : [];
}

function getAutoBattleFlag() {
  return !!getAutoBattleValue(false);
}

type UpdateOptions = { emit?: boolean };
type DamageOptions = { isBoss?: boolean; boss?: boolean; emit?: boolean };
type MagicOptions = { magicId?: number; casterIndex?: number; targetIndex?: number; emit?: boolean };
type ValueOrUpdater<T> = T | ((prev: T) => T);
type PlayerIndex = number;
type EnemyIndex = number;
type QueueIndex = number;
type StateMutator<T> = (current: T) => T;
type Path = string | number | Array<string | number>;
type UnknownRecord = { [key: string]: any; [key: number]: any };
type BattleState = {
  player?: PlayerState[];
  enemy?: EnemyState[];
  actionQueue?: Record<string, unknown>[];
  UI?: UIState;
  primaryExp?: Record<string, any>;
  [key: string]: any;
  [key: number]: any;
};
type ExpBucket = { exp?: number; level?: number; count?: number };
type ExpState = {
  __raw__?: BattleState;
  primaryExp?: Record<string, ExpBucket>;
  healthExp?: Record<string, ExpBucket>;
  magicExp?: Record<string, ExpBucket>;
  attackExp?: Record<string, ExpBucket>;
  magicPowerExp?: Record<string, ExpBucket>;
  defenseExp?: Record<string, ExpBucket>;
  dexterityExp?: Record<string, ExpBucket>;
  fleeExp?: Record<string, ExpBucket>;
  [key: string]: Record<string, ExpBucket> | ExpBucket | BattleState | undefined;
};
type BattleContext = Record<string, unknown>;

type EnemyState = {
  e?: {
    health?: number;
    magic?: number;
    magicRate?: number;
    idleFrames?: number;
    idleAnimSpeed?: number;
    maxHealth?: number;
  };
  status?: number[];
  poisons?: Array<Record<string, unknown>>;
  pos?: number | null;
  originalPos?: number | null;
  colorShift?: unknown;
  objectID?: number;
  wCurrentFrame?: number;
  currentFrame?: number | null;
  sprite?: unknown;
  action?: unknown;
};

type PlayerState = {
  action?: { actionType?: number | string };
  colorShift?: unknown;
  pos?: number | null;
  originalPos?: number | null;
  sprite?: unknown;
  currentFrame?: number | null;
};

type UIState = {
  state?: unknown;
  menuState?: unknown;
  curPlayerIndex?: number | null;
  selectedAction?: unknown;
  selectedIndex?: number | null;
  [key: string]: unknown;
};

type StateMutatedPayload = {
  path: Array<string | number | symbol>;
  value: unknown;
  previous: unknown;
  state: BattleState | null;
  deleted?: boolean;
};

type StateChangedPayload = {
  previous: BattleState | null;
  state: BattleState | null;
};

type SystemManager = {
  run?: (phase: string, context: BattleContext) => void;
  runPipeline?: (phases: string[], context: BattleContext) => void;
  runGenerator?: (phase: string, context: BattleContext) => IterableIterator<unknown>;
  runTick?: (context: BattleContext) => IterableIterator<unknown> | void;
  fire?: (event: string, payload: StateChangedPayload | StateMutatedPayload) => void;
  onStateChanged?: (payload: StateChangedPayload) => void;
  onStateMutated?: (payload: StateMutatedPayload) => void;
} | null;

type EcsRegistry = {
  createEntity: (...args: any[]) => any;
  addComponent: (entity: any, component: any, data: any) => void;
  getComponent: (entity: any, component: any) => any;
  hasEntity?: (entity: any) => boolean;
  destroyEntity?: (entity: any) => void;
  clear: () => void;
};

class BattleService extends EventBus {
  module: Record<string, unknown> | null;
  rawState: BattleState | null;
  state: BattleState | null;
  _globalAccessorInstalled: boolean;
  _proxyCache: WeakMap<object, any>;
  ecs: EcsRegistry;
  entityMaps: {
    player: Map<number, PlayerState>;
    enemy: Map<number, EnemyState>;
    queue: Map<number, unknown>;
    ui: unknown;
  };
  systemManager: SystemManager;
  _autoBattleSubscription: { unsubscribe?: () => void } | (() => void) | null;
  _activeBattleTask: Promise<unknown> | null;

  constructor() {
    super();
    this.module = null;
    this.rawState = null;
    this.state = null;
    this._globalAccessorInstalled = false;
    this._proxyCache = new WeakMap();
    this.ecs = createEntityRegistry() as unknown as EcsRegistry;
    this.entityMaps = {
      player: new Map(),
      enemy: new Map(),
      queue: new Map(),
      ui: null
    };
    this.systemManager = null;
    this._autoBattleSubscription = null;
    this._ensureAutoBattleSubscription();
    resetBattleFlagsSlice();
    this._activeBattleTask = null;
  }

  bindModule(moduleRef: Record<string, unknown>) {
    if (this.module === moduleRef) {
      this._installGlobalAccessor();
      this._syncStateFromGlobal();
      return;
    }
    this.module = moduleRef;
    this._installGlobalAccessor();
    this._syncStateFromGlobal();
  }

  _ensureAutoBattleSubscription() {
    if (this._autoBattleSubscription) {
      if (typeof (this._autoBattleSubscription as any).unsubscribe === 'function') {
        (this._autoBattleSubscription as { unsubscribe: () => void }).unsubscribe();
      } else if (typeof this._autoBattleSubscription === 'function') {
        this._autoBattleSubscription();
      }
    }
    const stream = autoBattleStream();
    if (stream && typeof stream.subscribe === 'function') {
      this._autoBattleSubscription = stream.subscribe(() => {
        this.syncUIComponent();
      });
    }
  }

  _syncStateFromGlobal() {
    const gameGlobal = stateService.getGlobal<PalGlobal>();
    const battleState = gameGlobal && gameGlobal.battle;
    if (battleState && this.rawState !== (battleState as any).__raw__) {
      this.rawState = (battleState as any).__raw__ || battleState;
      this.state = battleState as BattleState;
      this._syncBattleFlags('battleService:syncFromGlobal');
    }
    return this.state;
  }

  _wrapState<T extends Record<string, unknown>>(target: T): T {
    if (!target || typeof target !== 'object') {
      return target;
    }
    const service = this;
    const cache = new WeakMap();

    const isTypedArray = (value: unknown) => ArrayBuffer.isView(value as ArrayBufferView) && !(value instanceof DataView);

    function wrap(obj: any, path: (string | number | symbol)[]) {
      if (!obj || typeof obj !== 'object' || isTypedArray(obj)) {
        return obj;
      }
      if (cache.has(obj)) {
        return cache.get(obj);
      }
      const proxy = new Proxy(obj, {
        get(t, prop, receiver) {
          if (prop === '__raw__') {
            return obj;
          }
          const value = Reflect.get(t, prop, receiver);
          if (typeof value === 'function') {
            return value.bind(t);
          }
          return wrap(value, path.concat(prop));
        },
        set(t, prop, value, receiver) {
          const previous = t[prop];
          const result = Reflect.set(t, prop, value, receiver);
      const payload: StateMutatedPayload = {
        path: path.concat(prop),
        value,
        previous,
        state: service.state
      };
      service.fire('stateMutated', payload);
      if (service.systemManager && typeof service.systemManager.onStateMutated === 'function') {
        service.systemManager.onStateMutated(payload);
      }
      return result;
      },
      deleteProperty(t, prop) {
        const previous = t[prop];
        const result = Reflect.deleteProperty(t, prop);
        const payload: StateMutatedPayload = {
          path: path.concat(prop),
          value: undefined,
          previous,
          state: service.state,
          deleted: true
        };
        service.fire('stateMutated', payload);
        if (service.systemManager && typeof service.systemManager.onStateMutated === 'function') {
          service.systemManager.onStateMutated(payload);
        }
        return result;
      }
    });
      cache.set(obj, proxy);
      return proxy;
    }

    this._proxyCache = cache;
    return wrap(target, []);
  }

  _installGlobalAccessor() {
    const gameGlobal = ensureGameGlobal();
    if (!gameGlobal || this._globalAccessorInstalled) {
      return;
    }
    const service = this;
    let backingValue = stateService.getGlobal('battle') || this.state || null;

    Object.defineProperty(gameGlobal, 'battle', {
      configurable: true,
      enumerable: true,
      get() {
        return service.state || backingValue;
      },
      set(nextState) {
        const previous = service.state || backingValue || null;
        service.rawState = nextState;
        service.state = service._wrapState(nextState);
        backingValue = service.state;
        service._syncBattleFlags('battleService:globalAccessor');
        const payload = { previous, state: service.state };
        service.fire('stateChanged', payload);
        if (service.systemManager && typeof service.systemManager.onStateChanged === 'function') {
          service.systemManager.onStateChanged(payload);
        }
      }
    });

    this._globalAccessorInstalled = true;
    if (backingValue && !this.state) {
      const raw = (backingValue as { __raw__?: BattleState }).__raw__;
      this.rawState = raw || backingValue;
      this.state = backingValue;
      this._syncBattleFlags('battleService:globalAccessor');
    }
  }

  fire(event: string, payload?: StateChangedPayload | StateMutatedPayload | Record<string, unknown>): unknown {
    return super.fire(event, payload);
  }

  getModule() {
    return this.module;
  }

  getState(): BattleState | null {
    if (this.state) {
      return this.state;
    }
    if (this.rawState) {
      this.state = this._wrapState(this.rawState);
      return this.state;
    }
    this._syncStateFromGlobal();
    if (this.state) {
      return this.state;
    }
    return null;
  }

  replaceState(nextState: BattleState) {
    const gameGlobal = stateService.getGlobal();
    const previous = this.getState();
    if (gameGlobal) {
      if (!this._globalAccessorInstalled) {
        this._installGlobalAccessor();
      }
      const descriptor = Object.getOwnPropertyDescriptor(gameGlobal, 'battle');
      if (descriptor && typeof descriptor.set === 'function') {
        descriptor.set.call(gameGlobal, nextState);
        return this.state;
      }
      this.rawState = nextState;
      this.state = this._wrapState(nextState);
      this._syncBattleFlags('battleService:replaceState');
      stateService.setGlobal('battle', this.state);
      return this.state;
    }
    this.rawState = nextState;
    this.state = this._wrapState(nextState);
    this._syncBattleFlags('battleService:replaceState');
    const payload: StateChangedPayload = { previous: previous as BattleState | null, state: this.state };
    this.fire('stateChanged', payload);
    return this.state;
  }

  updateState(updater: StateMutator<BattleState | null>) {
    const current = this.getState();
    const next = updater ? updater(current) || current : current;
    if (!next) {
      return current;
    }
    if (next !== current) {
      return this.replaceState(next);
    }
    const payload = { previous: current, state: current };
    this.fire('stateChanged', payload);
    if (this.systemManager && typeof this.systemManager.onStateChanged === 'function') {
      this.systemManager.onStateChanged(payload);
    }
    this._syncBattleFlags('battleService:updateState');
    return current;
  }

  getRegistry(): EcsRegistry {
    return this.ecs;
  }

  resetEntityRegistry() {
    this.ecs.clear();
    this.entityMaps.player.clear();
    this.entityMaps.enemy.clear();
    this.entityMaps.queue.clear();
    this.entityMaps.ui = null;
  }

  initialiseBattleEntities() {
    this.resetEntityRegistry();
    this._ensureAutoBattleSubscription();
    const state = this.getState();
    if (!state) {
      return;
    }
    const registry = this.ecs;
    const party = getPartySnapshot();
    const rawMaxPartyMemberIndex = getMaxPartyMemberIndex();
    const maxPartyMemberIndex = Math.max(
      -1,
      Math.min(
        (typeof rawMaxPartyMemberIndex === 'number' && rawMaxPartyMemberIndex >= 0)
          ? rawMaxPartyMemberIndex
          : party.length - 1,
        party.length - 1
      )
    );

    const gameData = typeof GameData !== 'undefined' ? GameData : null;

    for (let idx = 0; idx <= maxPartyMemberIndex; idx++) {
      const partyEntry = party[idx];
      const playerState = state.player && state.player[idx];
      if (!partyEntry || !playerState) {
        continue;
      }
      const roleId = partyEntry.playerRole;
      const statusRow = getPlayerStatusRow(roleId);
      const entityId = registry.createEntity({ tags: BattleTags.Player });
      registry.addComponent(entityId, BattleComponents.BattleActor, createBattleActorComponent({
        type: 'player',
        index: idx,
        roleId
      }));
      registry.addComponent(entityId, BattleComponents.Time, createTimeComponent(playerState));
      registry.addComponent(entityId, BattleComponents.Status, createStatusComponent({
        type: 'player',
        playerIndex: idx,
        roleId,
        statusRef: statusRow
      }));
      registry.addComponent(entityId, BattleComponents.Stats, createStatsComponent({
        type: 'player',
        actorIndex: idx,
        roleId,
        statsRef: gameData && gameData.playerRoles ? {
          hp: gameData.playerRoles.HP,
          mp: gameData.playerRoles.MP,
          maxHP: gameData.playerRoles.maxHP,
          maxMP: gameData.playerRoles.maxMP
        } : null,
        extra: {
          statusRef: statusRow
        }
      }));
      registry.addComponent(entityId, BattleComponents.Position, createPositionComponent({
        type: 'player',
        actorIndex: idx,
        stateRef: playerState,
        current: playerState.pos != null ? playerState.pos : null,
        original: playerState.originalPos != null ? playerState.originalPos : null
      }));
      registry.addComponent(entityId, BattleComponents.Sprite, createSpriteComponent({
        type: 'player',
        actorIndex: idx,
        spriteRef: playerState.sprite || null,
        colorShiftRef: playerState
      }));
      registry.addComponent(entityId, BattleComponents.Animation, createAnimationComponent({
        type: 'player',
        actorIndex: idx,
        stateRef: playerState,
        currentFrame: playerState.currentFrame != null ? playerState.currentFrame : 0
      }));
      if (playerState.action) {
        registry.addComponent(entityId, BattleComponents.Command, createCommandComponent({
          type: 'player',
          commandRef: playerState.action
        }));
      }
      this.entityMaps.player.set(idx, entityId);
    }

    const maxEnemyIndex = typeof state.maxEnemyIndex === 'number' ? state.maxEnemyIndex : -1;
    for (let idx = 0; idx <= maxEnemyIndex; idx++) {
      const enemyState = state.enemy && state.enemy[idx];
      if (!enemyState || enemyState.objectID === 0) {
        continue;
      }
      const entityId = registry.createEntity({ tags: BattleTags.Enemy });
      registry.addComponent(entityId, BattleComponents.BattleActor, createBattleActorComponent({
        type: 'enemy',
        index: idx,
        objectId: enemyState.objectID
      }));
      registry.addComponent(entityId, BattleComponents.Time, createTimeComponent(enemyState));
      registry.addComponent(entityId, BattleComponents.Status, createStatusComponent({
        type: 'enemy',
        enemyIndex: idx,
        statusRef: enemyState.status || null
      }));
      registry.addComponent(entityId, BattleComponents.Stats, createStatsComponent({
        type: 'enemy',
        actorIndex: idx,
        roleId: enemyState.objectID,
        statsRef: enemyState.e || null,
        extra: {
          poisonRef: enemyState.poisons || null
        }
      }));
      registry.addComponent(entityId, BattleComponents.Position, createPositionComponent({
        type: 'enemy',
        actorIndex: idx,
        stateRef: enemyState,
        current: enemyState.pos != null ? enemyState.pos : null,
        original: enemyState.originalPos != null ? enemyState.originalPos : null
      }));
      registry.addComponent(entityId, BattleComponents.Sprite, createSpriteComponent({
        type: 'enemy',
        actorIndex: idx,
        spriteRef: enemyState.sprite || null,
        colorShiftRef: enemyState
      }));
      registry.addComponent(entityId, BattleComponents.Animation, createAnimationComponent({
        type: 'enemy',
        actorIndex: idx,
        stateRef: enemyState,
        currentFrame: enemyState.currentFrame != null ? enemyState.currentFrame : 0,
        speedRef: enemyState.e || null,
        frameCount: enemyState.e && enemyState.e.idleFrames != null ? enemyState.e.idleFrames : null,
        metadata: {
          idleAnimSpeed: enemyState.e ? enemyState.e.idleAnimSpeed : null
        }
      }));
      if (enemyState.action) {
        registry.addComponent(entityId, BattleComponents.Command, createCommandComponent({
          type: 'enemy',
          commandRef: enemyState.action
        }));
      }
      this.entityMaps.enemy.set(idx, entityId);
    }

    if (Array.isArray(state.actionQueue)) {
      for (let idx = 0; idx < state.actionQueue.length; idx++) {
        const entryRef = state.actionQueue[idx];
        if (!entryRef) {
          continue;
        }
        const entityId = registry.createEntity();
        registry.addComponent(entityId, BattleComponents.QueueEntry, createQueueEntryComponent({
          index: idx,
          entryRef
        }));
        this.entityMaps.queue.set(idx, entityId);
      }
    }

    const uiState = state.UI || null;
    const uiEntity = registry.createEntity();
    registry.addComponent(uiEntity, BattleComponents.UIState, createUIStateComponent({
      stateRef: uiState,
      state: uiState ? uiState.state : null,
      menuState: uiState ? uiState.menuState : null,
      currentPlayer: uiState ? uiState.curPlayerIndex : null,
      selectedAction: uiState ? uiState.selectedAction : null,
      selectedIndex: uiState ? uiState.selectedIndex : null,
      autoBattle: getAutoBattleFlag()
    }));
    this.entityMaps.ui = uiEntity;

    this.syncActorComponents();
  }

  getPlayerEntity(index: PlayerIndex) {
    return this.entityMaps.player.get(index) || null;
  }

  getEnemyEntity(index: EnemyIndex) {
    return this.entityMaps.enemy.get(index) || null;
  }

  getQueueEntity(index: QueueIndex) {
    return this.entityMaps.queue.get(index) || null;
  }

  getUIEntity() {
    return this.entityMaps.ui;
  }

  getUIComponent() {
    if (!this.entityMaps.ui) {
      return null;
    }
    const registry = this.getRegistry();
    if (!registry) {
      return null;
    }
    return registry.getComponent(this.entityMaps.ui, BattleComponents.UIState);
  }

  syncUIComponent() {
    const component = this.getUIComponent();
    if (!component) {
      return;
    }
    const state = this.getState();
    const uiState = state ? state.UI : null;
    component.stateRef = uiState;
    component.state = uiState ? uiState.state : null;
    component.menuState = uiState ? uiState.menuState : null;
    component.currentPlayer = uiState ? uiState.curPlayerIndex : null;
    component.selectedAction = uiState ? uiState.selectedAction : null;
    component.selectedIndex = uiState ? uiState.selectedIndex : null;
    component.autoBattle = getAutoBattleFlag();
  }

  syncActorComponents() {
    const registry = this.getRegistry();
    const state = this.getState();
    if (!registry || !state) {
      return;
    }
    const party = getPartySnapshot();
    const gameData = typeof GameData !== 'undefined' ? GameData : null;

    this.entityMaps.player.forEach((entityId, index) => {
      const playerState = state.player && state.player[index];
      const partyEntry = party[index];
      if (!playerState) {
        return;
      }
      const statsComp = registry.getComponent(entityId, BattleComponents.Stats);
      if (statsComp) {
        statsComp.stateRef = playerState;
        statsComp.actorIndex = index;
        if (statsComp.extra && partyEntry && typeof partyEntry.playerRole === 'number') {
          const roleId = partyEntry.playerRole;
          statsComp.extra.roleId = roleId;
          statsComp.extra.statusRef = getPlayerStatusRow(roleId);
          if (gameData && gameData.playerRoles) {
            statsComp.current = {
              hp: gameData.playerRoles.HP ? gameData.playerRoles.HP[roleId] : null,
              mp: gameData.playerRoles.MP ? gameData.playerRoles.MP[roleId] : null,
              maxHP: gameData.playerRoles.maxHP ? gameData.playerRoles.maxHP[roleId] : null,
              maxMP: gameData.playerRoles.maxMP ? gameData.playerRoles.maxMP[roleId] : null
            };
          }
        } else if (statsComp.extra) {
          statsComp.extra.statusRef = null;
        }
      }
      const positionComp = registry.getComponent(entityId, BattleComponents.Position);
      if (positionComp) {
        positionComp.actorIndex = index;
        positionComp.stateRef = playerState;
        positionComp.current = playerState.pos != null ? playerState.pos : positionComp.current;
        positionComp.original = playerState.originalPos != null ? playerState.originalPos : positionComp.original;
      }
      const spriteComp = registry.getComponent(entityId, BattleComponents.Sprite);
      if (spriteComp) {
        spriteComp.actorIndex = index;
        spriteComp.spriteRef = playerState.sprite || spriteComp.spriteRef || null;
        spriteComp.colorShiftRef = playerState;
      }
      const animationComp = registry.getComponent(entityId, BattleComponents.Animation);
      if (animationComp) {
        animationComp.actorIndex = index;
        animationComp.stateRef = playerState;
        animationComp.currentFrame = playerState.currentFrame != null ? playerState.currentFrame : animationComp.currentFrame;
      }
    });

    this.entityMaps.enemy.forEach((entityId, index) => {
      const enemyState = state.enemy && state.enemy[index];
      if (!enemyState) {
        return;
      }
      const statsComp = registry.getComponent(entityId, BattleComponents.Stats);
      if (statsComp) {
        statsComp.actorIndex = index;
        statsComp.stateRef = enemyState;
        statsComp.current = enemyState.e && enemyState.e.health != null ? {
          hp: enemyState.e.health,
          maxHP: enemyState.e.maxHealth != null ? enemyState.e.maxHealth : null
        } : statsComp.current;
      }
      const positionComp = registry.getComponent(entityId, BattleComponents.Position);
      if (positionComp) {
        positionComp.actorIndex = index;
        positionComp.stateRef = enemyState;
        positionComp.current = enemyState.pos != null ? enemyState.pos : positionComp.current;
        positionComp.original = enemyState.originalPos != null ? enemyState.originalPos : positionComp.original;
      }
      const spriteComp = registry.getComponent(entityId, BattleComponents.Sprite);
      if (spriteComp) {
        spriteComp.actorIndex = index;
        spriteComp.spriteRef = enemyState.sprite || spriteComp.spriteRef || null;
        spriteComp.colorShiftRef = enemyState;
      }
      const animationComp = registry.getComponent(entityId, BattleComponents.Animation);
      if (animationComp) {
        animationComp.actorIndex = index;
        animationComp.stateRef = enemyState;
        animationComp.currentFrame = enemyState.currentFrame != null ? enemyState.currentFrame : animationComp.currentFrame;
        if (animationComp.metadata) {
          animationComp.metadata.idleAnimSpeed = enemyState.e ? enemyState.e.idleAnimSpeed : animationComp.metadata.idleAnimSpeed;
        }
      }
    });

    const payload = { registry, state, source: 'syncActorComponents', previous: null as BattleState | null };
    this.fire('ecs:componentsSynced', payload);
    if (this.systemManager && typeof this.systemManager.fire === 'function') {
      this.systemManager.fire('componentsSynced', payload);
    }
  }

  setSystemManager(manager: SystemManager) {
    this.systemManager = manager;
  }

  getSystemManager() {
    return this.systemManager;
  }

  runSystems(phases: string | string[], context: BattleContext) {
    if (!this.systemManager) {
      return;
    }
    const runtimeContext = Object.assign({}, context, { battleService: this });
    if (Array.isArray(phases)) {
      if (this.systemManager.runPipeline) {
        this.systemManager.runPipeline(phases, runtimeContext);
      }
      return;
    }
    if (this.systemManager.run) {
      this.systemManager.run(phases, runtimeContext);
    }
  }

  *runGeneratorSystems(phases: string | string[], context: BattleContext) {
    if (!this.systemManager) {
      return;
    }
    const runtimeContext = Object.assign({}, context, { battleService: this });
    if (Array.isArray(phases)) {
      for (let i = 0; i < phases.length; i++) {
        if (this.systemManager.runGenerator) {
          yield* this.systemManager.runGenerator(phases[i], runtimeContext);
        }
      }
      return;
    }
    if (this.systemManager.runGenerator) {
      yield* this.systemManager.runGenerator(phases, runtimeContext);
    }
  }

  *runTick(context: BattleContext) {
    if (!this.systemManager || typeof this.systemManager.runTick !== 'function') {
      return;
    }
    const runtimeContext = Object.assign({}, context, { battleService: this });
    const result = this.systemManager.runTick(runtimeContext);
    if (result && typeof (result as any)[Symbol.iterator] === 'function') {
      yield* result as IterableIterator<unknown>;
    }
  }

  _ensureModule(method: string) {
    if (!this.module || typeof (this.module as any)[method] !== 'function') {
      throw new Error(`Battle module is not bound or missing method "${method}"`);
    }
    return (this.module as any)[method];
  }

  *_wrapGeneratorCall(method: string, payloadBuilder: (...args: any[]) => Record<string, unknown>, ...args: any[]) {
    const fn = this._ensureModule(method);
    const payload = payloadBuilder ? payloadBuilder(...args) : {};
    this.fire(`before${method[0].toUpperCase()}${method.slice(1)}`, payload);
    const result = yield* fn.apply(this.module, args);
    this._syncStateFromGlobal();
    this.fire(`after${method[0].toUpperCase()}${method.slice(1)}`, {
      ...payload,
      result,
      state: this.state
    });
    return result;
  }

  *init(...args: any[]) {
    return yield* this._wrapGeneratorCall('init', (...params: any[]) => ({ args: params }), ...args);
  }

  *start(enemyTeam: any, isBoss: any) {
    return yield* this._wrapGeneratorCall('start', (team: any, boss: any) => ({ enemyTeam: team, isBoss: boss }), enemyTeam, isBoss);
  }

  startBattle(formationId: any, options: DamageOptions = {}) {
    const enemyTeam = Number.isFinite(formationId) ? Math.trunc(formationId) : 0;
    const bossFlag = options && typeof (options as any).isBoss === 'boolean' ? (options as any).isBoss : !!(options && (options as any).boss);
    if (this._activeBattleTask) {
      return this._activeBattleTask;
    }
    const task = co(this.start.bind(this, enemyTeam, bossFlag))
      .catch((err: any) => {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[battle-service] startBattle failed', err);
        }
        throw err;
      })
      .finally(() => {
        this._activeBattleTask = null;
      });
    this._activeBattleTask = task;
    return task;
  }

  *won(...args: any[]) {
    return yield* this._wrapGeneratorCall('won', (...params: any[]) => ({ args: params }), ...args);
  }

  *playerEscape(...args: any[]) {
    return yield* this._wrapGeneratorCall('playerEscape', (...params: any[]) => ({ args: params }), ...args);
  }

  *enemyEscape(...args: any[]) {
    return yield* this._wrapGeneratorCall('enemyEscape', (...params: any[]) => ({ args: params }), ...args);
  }

  castMagic(options: MagicOptions = {}) {
    const { magicId, casterIndex, targetIndex } = options || {};
    const state = this.getState();
    if (!state || !Array.isArray(state.player)) {
      return false;
    }
    const actionEnum = getBattleActionEnum();
    const magicAction = actionEnum && typeof actionEnum.Magic === 'number' ? actionEnum.Magic : 3;
    const playerIndex = Number.isFinite(casterIndex as number) ? Math.trunc(casterIndex as number) : 0;
    if (playerIndex < 0 || playerIndex >= state.player.length) {
      return false;
    }
    const resolvedMagic = Number.isFinite(magicId as number) ? Math.trunc(magicId as number) : 0;
    const resolvedTarget = Number.isFinite(targetIndex as number) ? Math.trunc(targetIndex as number) : -1;
    this.updatePlayer(playerIndex, (player: any) => {
      if (!player) {
        return player;
      }
      if (!player.action) {
        player.action = { actionType: magicAction, actionID: resolvedMagic, target: resolvedTarget, remainingTime: 0 };
        return player;
      }
      player.action.actionType = magicAction;
      player.action.actionID = resolvedMagic;
      player.action.target = resolvedTarget;
      return player;
    });
    return true;
  }

  _syncBattleFlags(source: string, emitEvent = true) {
    updateBattleFlagsFromState(this.getState(), { source, emitEvent });
  }

  emitStateChanged() {
    const state = this.getState();
    const payload: StateChangedPayload = { previous: state, state };
    this.fire('stateChanged', payload);
    if (this.systemManager && typeof this.systemManager.onStateChanged === 'function') {
      this.systemManager.onStateChanged(payload);
    }
    this._syncBattleFlags('battleService:emitStateChanged');
  }

  withState<T>(callback: (state: BattleState) => T, options: UpdateOptions = {}) {
    const state = this.getState();
    if (!state || typeof callback !== 'function') {
      return null;
    }
    const result = callback(state);
    if (options.emit !== false) {
      this.emitStateChanged();
    } else {
      this._syncBattleFlags('battleService:withState', false);
    }
    if (typeof callback === 'function') {
      this.syncUIComponent();
    }
    return result;
  }

  set(path: Path, value: unknown, options: UpdateOptions = {}) {
    const state = this.getState();
    if (!state) return null;
    const segments = Array.isArray(path) ? path : [path];
    let target: any = state;
    for (let i = 0; i < segments.length - 1; i++) {
      if (target == null) return null;
      target = target[segments[i]];
    }
    if (target == null) return null;
    const key = segments[segments.length - 1];
    const nextValue = typeof value === 'function' ? (value as any)(target[key]) : value;
    target[key] = nextValue;
    if ((options as any).emit !== false) {
      this.emitStateChanged();
    } else {
      this._syncBattleFlags('battleService:set', false);
    }
    return target[key];
  }

  update(path: Path, updater: StateMutator<any>, options: UpdateOptions = {}) {
    return this.set(path, updater, options);
  }

  getPlayer(index: PlayerIndex) {
    const state = this.getState();
    return state && state.player ? state.player[index] : null;
  }

  updatePlayer(index: PlayerIndex, updater: StateMutator<PlayerState>, options: UpdateOptions = {}) {
    return this.update(['player', index], updater, options);
  }

  setPlayer(index: PlayerIndex, patch: Record<string, unknown> | StateMutator<PlayerState>, options: UpdateOptions = {}) {
    return this.updatePlayer(index, function(player: PlayerState) {
      if (!player) return player;
      if (typeof patch === 'function') {
        return patch(player) || player;
      }
      Object.assign(player, patch);
      return player;
    }, options);
  }

  getEnemy(index: EnemyIndex) {
    const state = this.getState();
    return state && state.enemy ? state.enemy[index] : null;
  }

  updateEnemy(index: EnemyIndex, updater: StateMutator<any>, options: UpdateOptions = {}) {
    return this.update(['enemy', index], updater, options);
  }

  setEnemy(index: EnemyIndex, patch: Record<string, unknown> | StateMutator<EnemyState>, options: UpdateOptions = {}) {
    return this.updateEnemy(index, function(enemy: EnemyState) {
      if (!enemy) return enemy;
      if (typeof patch === 'function') {
        return patch(enemy) || enemy;
      }
      Object.assign(enemy, patch);
      return enemy;
    }, options);
  }

  getUI() {
    const state = this.getState();
    return state ? state.UI : null;
  }

  updateUI(updater: StateMutator<Record<string, unknown>>, options: UpdateOptions = {}) {
    const result = this.update(['UI'], updater, options);
    this.syncUIComponent();
    return result;
  }

  setUI(patch: Record<string, unknown> | StateMutator<Record<string, unknown>>, options: UpdateOptions = {}) {
    const result = this.update(['UI'], function(uiState: Record<string, unknown>) {
      if (!uiState) return uiState;
      if (typeof patch === 'function') {
        return patch(uiState) || uiState;
      }
      Object.assign(uiState, patch);
      return uiState;
    }, options);
    this.syncUIComponent();
    return result;
  }

  getActionQueue() {
    const state = this.getState();
    return state ? state.actionQueue : null;
  }

  updateActionQueue(index: QueueIndex, updater: StateMutator<Record<string, unknown>>, options: UpdateOptions = {}) {
    if (typeof index === 'function' && updater === undefined) {
      return this.update(['actionQueue'], index, options);
    }
    return this.update(['actionQueue', index], updater, options);
  }

  setActionQueue(index: QueueIndex, patch: Record<string, unknown> | StateMutator<Record<string, unknown>>, options: UpdateOptions = {}) {
    return this.updateActionQueue(index, function(queueItem: Record<string, unknown>) {
      if (!queueItem) return queueItem;
      if (typeof patch === 'function') {
        return patch(queueItem) || queueItem;
      }
      Object.assign(queueItem, patch);
      return queueItem;
    }, options);
  }

  getSceneBuffer() {
    const state = this.getState();
    return state ? state.sceneBuf : null;
  }

  setSceneBuffer(buffer: any, options: UpdateOptions = {}) {
    return this.set(['sceneBuf'], buffer, options);
  }

  getBackground() {
    const state = this.getState();
    return state ? state.background : null;
  }

  setBackground(background: unknown, options: UpdateOptions = {}) {
    return this.set(['background'], background, options);
  }

  setEnemyHealth(index: EnemyIndex, updater: ValueOrUpdater<number>, options: UpdateOptions = {}) {
    return this.updateEnemy(index, function(enemy: EnemyState) {
      if (!enemy || !enemy.e) return enemy;
      const current = typeof enemy.e.health === 'number' ? enemy.e.health : 0;
      const next = typeof updater === 'function' ? updater(current) : updater;
      enemy.e.health = next;
      return enemy;
    }, options);
  }

  setEnemyMagic(index: EnemyIndex, value: ValueOrUpdater<number>, options: UpdateOptions = {}) {
    return this.updateEnemy(index, function(enemy: EnemyState) {
      if (!enemy || !enemy.e) return enemy;
      const current = typeof enemy.e.magic === 'number' ? enemy.e.magic : 0;
      enemy.e.magic = typeof value === 'function' ? value(current) : value;
      return enemy;
    }, options);
  }

  setEnemyMagicRate(index: EnemyIndex, value: ValueOrUpdater<number>, options: UpdateOptions = {}) {
    return this.updateEnemy(index, function(enemy: EnemyState) {
      if (!enemy || !enemy.e) return enemy;
      const current = typeof enemy.e.magicRate === 'number' ? enemy.e.magicRate : 0;
      enemy.e.magicRate = typeof value === 'function' ? value(current) : value;
      return enemy;
    }, options);
  }

  setEnemyStatus(index: EnemyIndex, statusIndex: number, value: ValueOrUpdater<number>, options: UpdateOptions = {}) {
    return this.updateEnemy(index, function(enemy: EnemyState) {
      if (!enemy || !enemy.status) return enemy;
      if (!Number.isFinite(statusIndex)) return enemy;
      const idx = Math.trunc(statusIndex);
      const current = enemy.status[idx] || 0;
      enemy.status[idx] = typeof value === 'function' ? value(current) : value;
      return enemy;
    }, options);
  }

  setEnemyPoison(index: EnemyIndex, slot: number, patch: Record<string, unknown> | StateMutator<Record<string, unknown>>, options: UpdateOptions = {}) {
    return this.updateEnemy(index, function(enemy: EnemyState) {
      if (!enemy) return enemy;
      const slotIndex = Number(slot);
      if (Number.isNaN(slotIndex)) return enemy;
      if (!enemy.poisons) {
        enemy.poisons = [];
      }
      const poison = enemy.poisons[slotIndex] || (enemy.poisons[slotIndex] = {});
      if (typeof patch === 'function') {
        patch(poison);
      } else if (patch && typeof patch === 'object') {
        Object.assign(poison, patch);
      }
      return enemy;
    }, options);
  }

  clearEnemyPoison(index: EnemyIndex, slot: number, options: UpdateOptions = {}) {
    return this.setEnemyPoison(index, slot, function(poison: Record<string, unknown>) {
      poison.poisonID = 0;
      poison.poisonScript = 0;
      return poison;
    }, options);
  }

  setEnemyPosition(index: EnemyIndex, pos: number | ValueOrUpdater<number | null | undefined>, options: UpdateOptions = {}) {
    return this.updateEnemy(index, function(enemy: EnemyState) {
      if (!enemy) return enemy;
      const current = enemy.pos == null ? null : enemy.pos;
      enemy.pos = typeof pos === 'function' ? pos(current) : pos;
      return enemy;
    }, options);
  }

  setEnemyColorShift(index: EnemyIndex, value: unknown, options: UpdateOptions = {}) {
    return this.updateEnemy(index, function(enemy: EnemyState) {
      if (!enemy) return enemy;
      enemy.colorShift = typeof value === 'function' ? value(enemy.colorShift) : value;
      return enemy;
    }, options);
  }

  replaceEnemy(index: EnemyIndex, enemyData: EnemyState, options: UpdateOptions = {}) {
    return this.updateEnemy(index, function() {
      return enemyData;
    }, options);
  }

  setEnemyObject(index: EnemyIndex, objectID: number | ValueOrUpdater<number | undefined>, options: UpdateOptions = {}) {
    return this.updateEnemy(index, function(enemy: EnemyState) {
      if (!enemy) return enemy;
      enemy.objectID = typeof objectID === 'function' ? objectID(enemy.objectID) : objectID;
      return enemy;
    }, options);
  }

  setEnemyFrame(index: EnemyIndex, frame: number | ValueOrUpdater<number | undefined>, options: UpdateOptions = {}) {
    return this.updateEnemy(index, function(enemy: EnemyState) {
      if (!enemy) return enemy;
      enemy.wCurrentFrame = typeof frame === 'function' ? frame(enemy.wCurrentFrame) : frame;
      return enemy;
    }, options);
  }

  setHidingTime(value: number | ValueOrUpdater<number>, options: UpdateOptions = {}) {
    return this.set(['hidingTime'], value, options);
  }

  setBattleBlow(value: number | ValueOrUpdater<number>, options: UpdateOptions = {}) {
    return this.set(['blow'], value, options);
  }

  setBattleResult(value: number | ValueOrUpdater<number>, options: UpdateOptions = {}) {
    return this.set(['battleResult'], value, options);
  }

  setPlayerActionType(index: PlayerIndex, actionType: number | string | ValueOrUpdater<number | string | undefined>, options: UpdateOptions = {}) {
    return this.updatePlayer(index, function(player: PlayerState) {
      if (!player || !player.action) return player;
      player.action.actionType = typeof actionType === 'function' ? actionType(player.action.actionType) : actionType;
      return player;
    }, options);
  }

  setPlayerColorShift(index: PlayerIndex, value: unknown, options: UpdateOptions = {}) {
    return this.updatePlayer(index, function(player: PlayerState) {
      if (!player) return player;
      player.colorShift = typeof value === 'function' ? value(player.colorShift) : value;
      return player;
    }, options);
  }

  getExpState() {
    const snapshot = getExpStateSnapshot();
    if (snapshot) {
      return snapshot;
    }
    // TODO(rxjs-cleanup): drop worldService exp fallback once adapter snapshot is guaranteed.
    return typeof worldService.getExpState === 'function'
      ? worldService.getExpState()
      : null;
  }

  mutateExpState(mutator: (state: UnknownRecord) => UnknownRecord) {
    return worldService.mutateExpState(mutator);
  }

  getPlayerRoles(): PlayerRoles | null {
    return getPlayerRolesSnapshot() as PlayerRoles | null;
  }

  mutatePlayerRoles(
    mutator: (roles: PlayerRoles | null) => PlayerRoles | null,
    options: UpdateOptions = {}
  ) {
    return worldService.mutatePlayerRoles(mutator, options);
  }

  getPlayerHP(roleId: number) {
    return getPlayerHP(roleId);
  }

  setPlayerHP(roleId: number, value: ValueOrUpdater<number>) {
    return worldService.setPlayerHP(roleId, value);
  }

  getPlayerMP(roleId: number) {
    return getPlayerMP(roleId);
  }

  setPlayerMP(roleId: number, value: ValueOrUpdater<number>) {
    return worldService.setPlayerMP(roleId, value);
  }

  getPlayerLevel(roleId: number) {
    return getPlayerLevel(roleId);
  }

  setPlayerLevel(roleId: number, value: ValueOrUpdater<number>) {
    return worldService.setPlayerLevel(roleId, value);
  }

  getPlayerMaxHP(roleId: number) {
    return getPlayerMaxHP(roleId);
  }

  getPlayerMaxMP(roleId: number) {
    return getPlayerMaxMP(roleId);
  }

  getPlayerAttackStrength(roleId: number) {
    return getPlayerAttackStrength(roleId);
  }

  setPlayerAttackStrength(roleId: number, value: ValueOrUpdater<number>) {
    return worldService.setPlayerAttackStrength(roleId, value);
  }

  getPlayerMagicStrength(roleId: number) {
    return getPlayerMagicStrength(roleId);
  }

  setPlayerMagicStrength(roleId: number, value: ValueOrUpdater<number>) {
    return worldService.setPlayerMagicStrength(roleId, value);
  }

  getPlayerDefense(roleId: number) {
    return getPlayerDefense(roleId);
  }

  setPlayerDefense(roleId: number, value: ValueOrUpdater<number>) {
    return worldService.setPlayerDefense(roleId, value);
  }

  getPlayerDexterity(roleId: number) {
    return getPlayerDexterity(roleId);
  }

  setPlayerDexterity(roleId: number, value: ValueOrUpdater<number>) {
    return worldService.setPlayerDexterity(roleId, value);
  }

  getPlayerFleeRate(roleId: number) {
    return getPlayerFleeRate(roleId);
  }

  setPlayerFleeRate(roleId: number, value: ValueOrUpdater<number>) {
    return worldService.setPlayerFleeRate(roleId, value);
  }

  getPlayerSnapshot(roleId: PlayerIndex) {
    const roles = this.getPlayerRoles() as PlayerRoles | null;
    if (!roles) {
      return null;
    }
    return {
      roleId: roleId,
      nameId: Array.isArray(roles.name) ? roles.name[roleId] || 0 : 0,
      level: Array.isArray(roles.level) ? roles.level[roleId] || 0 : 0,
      hp: Array.isArray(roles.HP) ? roles.HP[roleId] || 0 : 0,
      maxHP: Array.isArray(roles.maxHP) ? roles.maxHP[roleId] || 0 : 0,
      mp: Array.isArray(roles.MP) ? roles.MP[roleId] || 0 : 0,
      maxMP: Array.isArray(roles.maxMP) ? roles.maxMP[roleId] || 0 : 0,
      attackStrength: this.getPlayerAttackStrength(roleId),
      magicStrength: this.getPlayerMagicStrength(roleId),
      defense: this.getPlayerDefense(roleId),
      dexterity: this.getPlayerDexterity(roleId),
      fleeRate: this.getPlayerFleeRate(roleId)
    };
  }

  awardExp(roleId: number, expGained: number) {
    const before = this.getPlayerSnapshot(roleId);
    if (!before) {
      return { roleId, before: null, after: null, levelUp: false, expApplied: 0 };
    }
    if (!expGained || expGained <= 0 || before.hp <= 0) {
      return { roleId, before, after: before, levelUp: false, expApplied: 0 };
    }

    const maxLevel = typeof Const !== 'undefined' && Const && typeof Const.MAX_LEVELS === 'number'
      ? Const.MAX_LEVELS
      : 99;
    const levelUpExpTable = stateService.getGameData('levelUpExp') || (typeof GameData !== 'undefined' && GameData.levelUpExp ? GameData.levelUpExp : []);

    const bucketNames = ['primaryExp', 'attackExp', 'defenseExp', 'dexterityExp', 'fleeExp', 'healthExp', 'magicExp', 'magicPowerExp'];
    this.mutateExpState((expState: any) => {
      if (!expState) {
        return expState;
      }
      bucketNames.forEach((name) => {
        if (!expState[name]) {
          expState[name] = [];
        }
        if (!expState[name][roleId]) {
          expState[name][roleId] = { exp: 0, level: 0, count: 0 };
        }
      });
      return expState;
    });

    let expState = (this.getExpState() || {}) as ExpState;
    const threshold = (lvl: number) => {
      if (!levelUpExpTable || typeof levelUpExpTable[lvl] === 'undefined' || levelUpExpTable[lvl] === null) {
        return Infinity;
      }
      return levelUpExpTable[lvl];
    };

    let currentLevel = before.level;
    let expValue = (expState.primaryExp && expState.primaryExp[roleId] ? expState.primaryExp[roleId].exp || 0 : 0) + expGained;
    let levelUpOccurred = false;

    if (currentLevel > maxLevel) {
      currentLevel = maxLevel;
      this.setPlayerLevel(roleId, currentLevel);
    }

    while (currentLevel < maxLevel && expValue >= threshold(currentLevel)) {
      expValue -= threshold(currentLevel);
      currentLevel++;
      levelUpOccurred = true;
      this.setPlayerLevel(roleId, currentLevel);
      if (scriptService && typeof scriptService.playerLevelUp === 'function') {
        scriptService.playerLevelUp(roleId, 1);
      }
      const maxHP = this.getPlayerMaxHP(roleId);
      const maxMP = this.getPlayerMaxMP(roleId);
      this.setPlayerHP(roleId, maxHP);
      this.setPlayerMP(roleId, maxMP);
    }

    this.mutateExpState((state) => {
      const expState = (state || {}) as ExpState;
      if (expState.primaryExp && expState.primaryExp[roleId]) {
        expState.primaryExp[roleId].exp = expValue;
      }
      return expState;
    });

    expState = (this.getExpState() || {}) as ExpState;
    const hiddenBuckets = [
      { bucket: 'healthExp', stat: 'maxHP' },
      { bucket: 'magicExp', stat: 'maxMP' },
      { bucket: 'attackExp', stat: 'attackStrength' },
      { bucket: 'magicPowerExp', stat: 'magicStrength' },
      { bucket: 'defenseExp', stat: 'defense' },
      { bucket: 'dexterityExp', stat: 'dexterity' },
      { bucket: 'fleeExp', stat: 'fleeRate' }
    ];
    let totalCount = 0;
    hiddenBuckets.forEach(({ bucket }) => {
      const bucketState = expState[bucket] as Record<number, ExpBucket> | undefined;
      const entry = bucketState && bucketState[roleId];
      if (entry && typeof entry.count === 'number') {
        totalCount += entry.count;
      }
    });

    const rand = (min: number, max: number) => {
      const rng: any = (typeof randomLong === 'function' ? randomLong : (globalThis as any).randomLong);
      if (typeof rng === 'function') {
        return rng(min, max);
      }
      return Math.floor(Math.random() * (max - min + 1)) + min;
    };

    if (totalCount > 0) {
      hiddenBuckets.forEach(({ bucket, stat }) => {
        const bucketState = expState[bucket] as Record<number, ExpBucket> | undefined;
        let entry = bucketState && bucketState[roleId];
        if (!entry) {
          return;
        }
        let bucketLevel = entry.level != null ? entry.level : 0;
        if (bucketLevel > maxLevel) {
          bucketLevel = maxLevel;
          this.mutateExpState((state) => {
            if (state && state[bucket] && state[bucket][roleId]) {
              state[bucket][roleId].level = bucketLevel;
            }
            return state;
          });
          expState = (this.getExpState() || {}) as ExpState;
          const bucketState = expState[bucket] as Record<number, ExpBucket> | undefined;
          entry = bucketState && bucketState[roleId];
        }

        const safeEntry: ExpBucket = entry || { exp: 0, level: 0, count: 0 };
        let hiddenExp = expGained * (safeEntry.count || 0);
        hiddenExp /= totalCount;
        hiddenExp *= 2;
        hiddenExp += safeEntry.exp || 0;

        while (bucketLevel < maxLevel && hiddenExp >= threshold(bucketLevel)) {
          hiddenExp -= threshold(bucketLevel);
          const increment = rand(1, 2);
          this.mutatePlayerRoles((roles) => {
            if (!roles) return roles;
            const bucket = roles[stat as keyof PlayerRoles];
            if (Array.isArray(bucket)) {
              bucket[roleId] = (bucket[roleId] ?? 0) + increment;
            }
            return roles;
          });
          bucketLevel++;
          this.mutateExpState((state) => {
            const expState = (state || {}) as ExpState;
            const bucketState = expState[bucket] as Record<number, ExpBucket> | undefined;
            if (bucketState && bucketState[roleId]) {
              bucketState[roleId].level = bucketLevel;
            }
            return expState;
          });
        }

        this.mutateExpState((state) => {
          const expState = (state || {}) as ExpState;
          const bucketState = expState[bucket] as Record<number, ExpBucket> | undefined;
          if (bucketState && bucketState[roleId]) {
            bucketState[roleId].exp = hiddenExp;
          }
          return expState;
        });
        expState = (this.getExpState() || {}) as ExpState;
      });
    }

    const after = this.getPlayerSnapshot(roleId) || before;
    return {
      roleId,
      before,
      after,
      levelUp: levelUpOccurred,
      expApplied: expGained
    };
  }
}

const serviceInstance = new BattleService();

const battleService = new Proxy(serviceInstance as any, {
  get(target: any, prop, receiver) {
    if (prop === 'module' || prop === 'state' || prop in target) {
      return Reflect.get(target, prop, receiver);
    }
    const moduleRef = target.getModule();
    if (moduleRef && prop in moduleRef) {
      const value = moduleRef[prop];
      if (typeof value === 'function') {
        return value.bind(moduleRef);
      }
      return value;
    }
    return undefined;
  },
  set(target: any, prop, value) {
    if (prop === 'module' || prop === 'state' || prop in target) {
      target[prop] = value;
    } else if (target.getModule()) {
      target.getModule()[prop] = value;
    } else {
      target[prop] = value;
    }
    return true;
  },
  has(target: any, prop) {
    if (prop in target) return true;
    const moduleRef = target.getModule();
    return moduleRef ? prop in moduleRef : false;
  },
  ownKeys(target: any) {
    const keys = new Set(Reflect.ownKeys(target));
    const moduleRef = target.getModule();
    if (moduleRef) {
      Reflect.ownKeys(moduleRef).forEach((key) => keys.add(key));
    }
    return Array.from(keys);
  },
  getOwnPropertyDescriptor(target, prop) {
    if (prop in target) {
      return Object.getOwnPropertyDescriptor(target, prop);
    }
    const moduleRef = target.getModule();
    if (moduleRef && prop in moduleRef) {
      return Object.getOwnPropertyDescriptor(moduleRef, prop);
    }
    return undefined;
  }
});

export { BattleService };
export default battleService;
