import EventBus from './event-bus.js';
import stateService from './state-service.js';
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

function ensureGameGlobal() {
  let store = stateService.getGlobal();
  if (store) {
    return store;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.Global = globalThis.Global || {};
    store = globalThis.Global;
  } else if (typeof global !== 'undefined') {
    global.Global = global.Global || {};
    store = global.Global;
  }
  return store;
}

class BattleService extends EventBus {
  constructor() {
    super();
    this.module = null;
    this.rawState = null;
    this.state = null;
    this._globalAccessorInstalled = false;
    this._proxyCache = new WeakMap();
    this.ecs = createEntityRegistry();
    this.entityMaps = {
      player: new Map(),
      enemy: new Map(),
      queue: new Map(),
      ui: null
    };
    this.systemManager = null;
  }

  bindModule(moduleRef) {
    if (this.module === moduleRef) {
      this._installGlobalAccessor();
      this._syncStateFromGlobal();
      return;
    }
    this.module = moduleRef;
    this._installGlobalAccessor();
    this._syncStateFromGlobal();
  }

  _syncStateFromGlobal() {
    const gameGlobal = stateService.getGlobal();
    if (gameGlobal && gameGlobal.battle && this.rawState !== gameGlobal.battle.__raw__) {
      this.rawState = gameGlobal.battle.__raw__ || gameGlobal.battle;
      this.state = gameGlobal.battle;
    }
    return this.state;
  }

  _wrapState(target) {
    if (!target || typeof target !== 'object') {
      return target;
    }
    const service = this;
    const cache = new WeakMap();

    const isTypedArray = (value) => ArrayBuffer.isView(value) && !(value instanceof DataView);

    function wrap(obj, path) {
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
        const payload = {
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
        const payload = {
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
        const payload = { previous, state: service.state };
        service.fire('stateChanged', payload);
        if (service.systemManager && typeof service.systemManager.onStateChanged === 'function') {
          service.systemManager.onStateChanged(payload);
        }
      }
    });

    this._globalAccessorInstalled = true;
    if (backingValue && !this.state) {
      this.rawState = backingValue.__raw__ || backingValue;
      this.state = backingValue;
    }
  }

  getModule() {
    return this.module;
  }

  getState() {
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

  replaceState(nextState) {
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
      stateService.setGlobal('battle', this.state);
      return this.state;
    }
    this.rawState = nextState;
    this.state = this._wrapState(nextState);
    this.fire('stateChanged', { previous, state: this.state });
    return this.state;
  }

  updateState(updater) {
    const current = this.getState();
    const next = updater ? updater(current) || current : current;
    if (next !== current) {
      return this.replaceState(next);
    }
    const payload = { previous: current, state: current };
    this.fire('stateChanged', payload);
    if (this.systemManager && typeof this.systemManager.onStateChanged === 'function') {
      this.systemManager.onStateChanged(payload);
    }
    return current;
  }

  getRegistry() {
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
    const state = this.getState();
    if (!state) {
      return;
    }
    const registry = this.ecs;
    const hasGlobal = typeof Global !== 'undefined' && Global;

    const maxPartyMemberIndex = hasGlobal && typeof Global.maxPartyMemberIndex === 'number'
      ? Global.maxPartyMemberIndex
      : -1;

    const gameData = typeof GameData !== 'undefined' ? GameData : null;

    for (let idx = 0; idx <= maxPartyMemberIndex; idx++) {
      const partyEntry = hasGlobal && Array.isArray(Global.party) ? Global.party[idx] : null;
      const playerState = state.player && state.player[idx];
      if (!partyEntry || !playerState) {
        continue;
      }
      const entityId = registry.createEntity({ tags: BattleTags.Player });
      registry.addComponent(entityId, BattleComponents.BattleActor, createBattleActorComponent({
        type: 'player',
        index: idx,
        roleId: partyEntry.playerRole
      }));
      registry.addComponent(entityId, BattleComponents.Time, createTimeComponent(playerState));
      registry.addComponent(entityId, BattleComponents.Status, createStatusComponent({
        type: 'player',
        playerIndex: idx,
        roleId: partyEntry.playerRole,
        statusRef: hasGlobal && Global.playerStatus ? Global.playerStatus[partyEntry.playerRole] : null
      }));
      registry.addComponent(entityId, BattleComponents.Stats, createStatsComponent({
        type: 'player',
        actorIndex: idx,
        roleId: partyEntry.playerRole,
        statsRef: gameData && gameData.playerRoles ? {
          hp: gameData.playerRoles.HP,
          mp: gameData.playerRoles.MP,
          maxHP: gameData.playerRoles.maxHP,
          maxMP: gameData.playerRoles.maxMP
        } : null,
        extra: {
          statusRef: hasGlobal && Global.playerStatus ? Global.playerStatus[partyEntry.playerRole] : null
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
      autoBattle: typeof Global !== 'undefined' && Global ? Global.autoBattle : false
    }));
    this.entityMaps.ui = uiEntity;

    this.syncActorComponents();
  }

  getPlayerEntity(index) {
    return this.entityMaps.player.get(index) || null;
  }

  getEnemyEntity(index) {
    return this.entityMaps.enemy.get(index) || null;
  }

  getQueueEntity(index) {
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
    component.autoBattle = typeof Global !== 'undefined' && Global ? Global.autoBattle : false;
  }

  syncActorComponents() {
    const registry = this.getRegistry();
    const state = this.getState();
    if (!registry || !state) {
      return;
    }
    const hasGlobal = typeof Global !== 'undefined' && Global;
    const gameData = typeof GameData !== 'undefined' ? GameData : null;

    this.entityMaps.player.forEach((entityId, index) => {
      const playerState = state.player && state.player[index];
      if (!playerState) {
        return;
      }
      const statsComp = registry.getComponent(entityId, BattleComponents.Stats);
      if (statsComp) {
        statsComp.stateRef = playerState;
        statsComp.actorIndex = index;
        if (statsComp.extra && hasGlobal && Global.party && Global.party[index]) {
          const roleId = Global.party[index].playerRole;
          statsComp.extra.roleId = roleId;
          if (gameData && gameData.playerRoles) {
            statsComp.current = {
              hp: gameData.playerRoles.HP ? gameData.playerRoles.HP[roleId] : null,
              mp: gameData.playerRoles.MP ? gameData.playerRoles.MP[roleId] : null,
              maxHP: gameData.playerRoles.maxHP ? gameData.playerRoles.maxHP[roleId] : null,
              maxMP: gameData.playerRoles.maxMP ? gameData.playerRoles.maxMP[roleId] : null
            };
          }
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

    const payload = { registry, state, source: 'syncActorComponents' };
    this.fire('ecs:componentsSynced', payload);
    if (this.systemManager && typeof this.systemManager.fire === 'function') {
      this.systemManager.fire('componentsSynced', payload);
    }
  }

  setSystemManager(manager) {
    this.systemManager = manager;
  }

  getSystemManager() {
    return this.systemManager;
  }

  runSystems(phases, context) {
    if (!this.systemManager) {
      return;
    }
    const runtimeContext = Object.assign({}, context, { battleService: this });
    if (Array.isArray(phases)) {
      this.systemManager.runPipeline(phases, runtimeContext);
      return;
    }
    this.systemManager.run(phases, runtimeContext);
  }

  *runGeneratorSystems(phases, context) {
    if (!this.systemManager) {
      return;
    }
    const runtimeContext = Object.assign({}, context, { battleService: this });
    if (Array.isArray(phases)) {
      for (let i = 0; i < phases.length; i++) {
        yield* this.systemManager.runGenerator(phases[i], runtimeContext);
      }
      return;
    }
    yield* this.systemManager.runGenerator(phases, runtimeContext);
  }

  _ensureModule(method) {
    if (!this.module || typeof this.module[method] !== 'function') {
      throw new Error(`Battle module is not bound or missing method "${method}"`);
    }
    return this.module[method];
  }

  *_wrapGeneratorCall(method, payloadBuilder, ...args) {
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

  *init(...args) {
    return yield* this._wrapGeneratorCall('init', (...params) => ({ args: params }), ...args);
  }

  *start(enemyTeam, isBoss) {
    return yield* this._wrapGeneratorCall('start', (team, boss) => ({ enemyTeam: team, isBoss: boss }), enemyTeam, isBoss);
  }

  *won(...args) {
    return yield* this._wrapGeneratorCall('won', (...params) => ({ args: params }), ...args);
  }

  *playerEscape(...args) {
    return yield* this._wrapGeneratorCall('playerEscape', (...params) => ({ args: params }), ...args);
  }

  *enemyEscape(...args) {
    return yield* this._wrapGeneratorCall('enemyEscape', (...params) => ({ args: params }), ...args);
  }

  emitStateChanged() {
    const state = this.getState();
    const payload = { previous: state, state };
    this.fire('stateChanged', payload);
    if (this.systemManager && typeof this.systemManager.onStateChanged === 'function') {
      this.systemManager.onStateChanged(payload);
    }
  }

  withState(callback, options = {}) {
    const state = this.getState();
    if (!state || typeof callback !== 'function') {
      return null;
    }
    const result = callback(state);
    if (options.emit !== false) {
      this.emitStateChanged();
    }
    if (typeof callback === 'function') {
      this.syncUIComponent();
    }
    return result;
  }

  set(path, value, options = {}) {
    const state = this.getState();
    if (!state) return null;
    const segments = Array.isArray(path) ? path : [path];
    let target = state;
    for (let i = 0; i < segments.length - 1; i++) {
      if (target == null) return null;
      target = target[segments[i]];
    }
    if (target == null) return null;
    const key = segments[segments.length - 1];
    const nextValue = typeof value === 'function' ? value(target[key]) : value;
    target[key] = nextValue;
    if (options.emit !== false) {
      this.emitStateChanged();
    }
    return target[key];
  }

  update(path, updater, options = {}) {
    return this.set(path, updater, options);
  }

  getPlayer(index) {
    const state = this.getState();
    return state && state.player ? state.player[index] : null;
  }

  updatePlayer(index, updater, options) {
    return this.update(['player', index], updater, options);
  }

  setPlayer(index, patch, options) {
    return this.updatePlayer(index, function(player) {
      if (!player) return player;
      if (typeof patch === 'function') {
        return patch(player) || player;
      }
      Object.assign(player, patch);
      return player;
    }, options);
  }

  getEnemy(index) {
    const state = this.getState();
    return state && state.enemy ? state.enemy[index] : null;
  }

  updateEnemy(index, updater, options) {
    return this.update(['enemy', index], updater, options);
  }

  setEnemy(index, patch, options) {
    return this.updateEnemy(index, function(enemy) {
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

  updateUI(updater, options) {
    const result = this.update(['UI'], updater, options);
    this.syncUIComponent();
    return result;
  }

  setUI(patch, options) {
    const result = this.update(['UI'], function(uiState) {
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

  updateActionQueue(index, updater, options) {
    if (typeof index === 'function' && updater === undefined) {
      return this.update(['actionQueue'], index, options);
    }
    return this.update(['actionQueue', index], updater, options);
  }

  setActionQueue(index, patch, options) {
    return this.updateActionQueue(index, function(queueItem) {
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

  setSceneBuffer(buffer, options) {
    return this.set(['sceneBuf'], buffer, options);
  }

  getBackground() {
    const state = this.getState();
    return state ? state.background : null;
  }

  setBackground(background, options) {
    return this.set(['background'], background, options);
  }

  setEnemyHealth(index, updater, options) {
    return this.updateEnemy(index, function(enemy) {
      if (!enemy || !enemy.e) return enemy;
      if (typeof updater === 'function') {
        enemy.e.health = updater(enemy.e.health);
      } else {
        enemy.e.health = updater;
      }
      return enemy;
    }, options);
  }

  setEnemyMagic(index, value, options) {
    return this.updateEnemy(index, function(enemy) {
      if (!enemy || !enemy.e) return enemy;
      enemy.e.magic = typeof value === 'function' ? value(enemy.e.magic) : value;
      return enemy;
    }, options);
  }

  setEnemyMagicRate(index, value, options) {
    return this.updateEnemy(index, function(enemy) {
      if (!enemy || !enemy.e) return enemy;
      enemy.e.magicRate = typeof value === 'function' ? value(enemy.e.magicRate) : value;
      return enemy;
    }, options);
  }

  setEnemyStatus(index, statusIndex, value, options) {
    return this.updateEnemy(index, function(enemy) {
      if (!enemy || !enemy.status) return enemy;
      const idx = Number(statusIndex);
      if (!Number.isNaN(idx)) {
        enemy.status[idx] = typeof value === 'function' ? value(enemy.status[idx]) : value;
      }
      return enemy;
    }, options);
  }

  setEnemyPoison(index, slot, patch, options) {
    return this.updateEnemy(index, function(enemy) {
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

  clearEnemyPoison(index, slot, options) {
    return this.setEnemyPoison(index, slot, function(poison) {
      poison.poisonID = 0;
      poison.poisonScript = 0;
      return poison;
    }, options);
  }

  setEnemyPosition(index, pos, options) {
    return this.updateEnemy(index, function(enemy) {
      if (!enemy) return enemy;
      enemy.pos = typeof pos === 'function' ? pos(enemy.pos) : pos;
      return enemy;
    }, options);
  }

  setEnemyColorShift(index, value, options) {
    return this.updateEnemy(index, function(enemy) {
      if (!enemy) return enemy;
      enemy.colorShift = typeof value === 'function' ? value(enemy.colorShift) : value;
      return enemy;
    }, options);
  }

  replaceEnemy(index, enemyData, options) {
    return this.updateEnemy(index, function() {
      return enemyData;
    }, options);
  }

  setEnemyObject(index, objectID, options) {
    return this.updateEnemy(index, function(enemy) {
      if (!enemy) return enemy;
      enemy.objectID = typeof objectID === 'function' ? objectID(enemy.objectID) : objectID;
      return enemy;
    }, options);
  }

  setEnemyFrame(index, frame, options) {
    return this.updateEnemy(index, function(enemy) {
      if (!enemy) return enemy;
      enemy.wCurrentFrame = typeof frame === 'function' ? frame(enemy.wCurrentFrame) : frame;
      return enemy;
    }, options);
  }

  setHidingTime(value, options) {
    return this.set(['hidingTime'], value, options);
  }

  setBattleBlow(value, options) {
    return this.set(['blow'], value, options);
  }

  setBattleResult(value, options) {
    return this.set(['battleResult'], value, options);
  }

  setPlayerActionType(index, actionType, options) {
    return this.updatePlayer(index, function(player) {
      if (!player || !player.action) return player;
      player.action.actionType = typeof actionType === 'function' ? actionType(player.action.actionType) : actionType;
      return player;
    }, options);
  }

  setPlayerColorShift(index, value, options) {
    return this.updatePlayer(index, function(player) {
      if (!player) return player;
      player.colorShift = typeof value === 'function' ? value(player.colorShift) : value;
      return player;
    }, options);
  }
}

const serviceInstance = new BattleService();

const battleService = new Proxy(serviceInstance, {
  get(target, prop, receiver) {
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
  set(target, prop, value) {
    if (prop === 'module' || prop === 'state' || prop in target) {
      target[prop] = value;
    } else if (target.getModule()) {
      target.getModule()[prop] = value;
    } else {
      target[prop] = value;
    }
    return true;
  },
  has(target, prop) {
    if (prop in target) return true;
    const moduleRef = target.getModule();
    return moduleRef ? prop in moduleRef : false;
  },
  ownKeys(target) {
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
