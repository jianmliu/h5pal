import EventBus from './event-bus.js';
import stateService from './state-service.ts';
import reactiveContext from '../state/reactive-context.js';
import co from '../js/pal/co.js';
import {
  createEntityRegistry,
  WorldComponents,
  createViewportComponent,
  createPartyMemberComponent,
  createTrailComponent,
  createEventObjectComponent,
  createSceneComponent,
  createMapMetaComponent,
  createMapTileComponent,
  createNpcStateComponent,
  createScriptRegisterComponent,
  createMoveIntentComponent,
  createMoveRequestQueueComponent,
  createCollisionStateComponent
} from '../ecs/index.js';
import createWorldSystemManager from './world-systems.js';
import { updateAutoBattle, getAutoBattleValue } from '../state/slices/auto-battle.js';
import { updateFrameCount, getFrameCountValue } from '../state/slices/frame-count.js';
import {
  updateMainMenuIndex,
  getMainMenuIndexValue,
  updateSystemMenuIndex,
  getSystemMenuIndexValue,
  updateInventoryMenuIndex,
  getInventoryMenuIndexValue,
  updateNoMusicFlag,
  getNoMusicFlagValue,
  updateNoSoundFlag,
  getNoSoundFlagValue
} from '../state/slices/menu-selections.js';
import {
  updateViewportValue,
  getViewportValue,
  updatePartyOffsetValue,
  getPartyOffsetValue,
  updatePartyDirectionValue,
  getPartyDirectionValue,
  updateMaxPartyIndexValue,
  getMaxPartyIndexValue
} from '../state/slices/viewport.js';
import {
  updateInventoryValue,
  updateCashValue,
  updateLastUnequippedValue,
  updateInventoryCapacityValue
} from '../state/slices/inventory.js';
import {
  updatePlayerStatusMatrix,
  mutatePlayerStatusMatrix,
  getPlayerStatusMatrixValue,
  updatePoisonStatusMatrix,
  mutatePoisonStatusMatrix,
  getPoisonStatusMatrixValue
} from '../state/slices/status-matrices.js';
import {
  updatePartyValue as updatePartySliceValue,
  updateTrailValue as updateTrailSliceValue,
  updateFollowerCountValue as updateFollowerCountSliceValue,
  getTrailValue,
  getFollowerCountValue
} from '../state/slices/party-trail.js';
import {
  updateSceneIdValue,
  updateEventObjectsValue,
  updateCollisionStateValue,
  getSceneIdValue,
  getEventObjectsValue,
  getCollisionStateValue
} from '../state/slices/scene-events.js';
import {
  updateMusicTrackValue,
  updateBattleMusicTrackValue,
  updateBattleFieldIdValue,
  updateScreenWaveValue,
  updatePaletteIdValue,
  updateNightPaletteValue,
  updateLayerValue,
  getScreenWaveValue,
  getPaletteIdValue,
  getNightPaletteValue,
  getLayerValue,
  resetAudioResourceSlice
} from '../state/slices/audio-resources.js';
import {
  updateWaveProgressionValue,
  updateNeedToFadeInValue,
  getWaveProgressionValue,
  getNeedToFadeInValue
} from '../state/slices/time-flags.js';
import {
  updateScriptEntriesValue,
  updateObjectTableValue,
  updateObjectDescValue,
  resetScriptObjectSlice,
  scriptObjectSignals
} from '../state/slices/script-objects.js';
import {
  updateEnemyTeamValue,
  updateEnemyPositionValue,
  updateBattleFieldValue,
  resetBattleFormationSlice
} from '../state/slices/battle-formation.js';
import {
  updatePlayerRolesValue,
  updateEquipmentEffectValue,
  resetPlayerStateSlice,
  playerStateSignals
} from '../state/slices/player-state.js';
import {
  updateMagicTableValue,
  updateStoreTableValue,
  updateExpStateValue,
  updateEnemyTableValue,
  updateBattleEffectTableValue,
  updateLevelUpExpTableValue,
  updateLevelUpMagicTableValue,
  getLevelUpExpTableValue
} from '../state/slices/game-data.js';
import {
  updateCollectValue,
  updateChaseRangeValue,
  updateChaseSpeedCyclesValue,
  updateBattleSpeedValue,
  getCollectValue as getCollectFlagValue,
  getChaseRangeValue as getChaseRangeFlagValue,
  getChaseSpeedCyclesValue as getChaseSpeedFlagValue,
  getBattleSpeedValue as getBattleSpeedFlagValue
} from '../state/slices/game-flags.js';
import type { PlayerRoles } from '../types/pal.js';

function getGlobalStore(): Record<string, unknown> | null {
  if (typeof globalThis !== 'undefined' && (globalThis as any).Global) {
    return (globalThis as any).Global;
  }
  if (typeof global !== 'undefined' && (global as any).Global) {
    return (global as any).Global;
  }
  return null;
}

function getGameDataStore(): Record<string, unknown> | null {
  if (typeof globalThis !== 'undefined' && (globalThis as any).GameData) {
    return (globalThis as any).GameData;
  }
  if (typeof global !== 'undefined' && (global as any).GameData) {
    return (global as any).GameData;
  }
  return null;
}

function getGlobalObject(name: string): any {
  if (typeof globalThis !== 'undefined' && (globalThis as any)[name]) {
    return (globalThis as any)[name];
  }
  if (typeof global !== 'undefined' && (global as any)[name]) {
    return (global as any)[name];
  }
  return null;
}

function getGlobalFunction<T>(name: string, fallback: T): T {
  const obj = getGlobalObject(name);
  if (obj && typeof obj === 'function') {
    return obj as T;
  }
  return fallback;
}

function getConstValue(key: string, fallback: number) {
  const constRef = getGlobalObject('Const');
  if (constRef && typeof constRef[key] === 'number') {
    return constRef[key];
  }
  return fallback;
}

const MAX_PLAYER_ROLES = getConstValue('MAX_PLAYER_ROLES', 0);
const MAX_PLAYER_EQUIPMENTS = getConstValue('MAX_PLAYER_EQUIPMENTS', 0);
const MAX_PLAYER_MAGICS = getConstValue('MAX_PLAYER_MAGICS', 0);
const MAX_INVENTORY = getConstValue('MAX_INVENTORY', 0);
const MAX_POISONS = getConstValue('MAX_POISONS', 0);
const MAX_SPRITE_STATE_KEY = 'MAX_SPRITE_TO_DRAW';
const LEGACY_SPRITE_LIMIT_KEY = '__PAL_LEGACY_MAX_SPRITE__';
const DEFAULT_MAX_SPRITE_TO_DRAW = 2048;

const serviceModuleCache: Record<string, unknown> = Object.create(null);

function getGlobalServices(): Record<string, unknown> | null {
  if (typeof globalThis !== 'undefined' && (globalThis as any).services) {
    return (globalThis as any).services as Record<string, unknown>;
  }
  if (typeof global !== 'undefined' && (global as any).services) {
    return (global as any).services as Record<string, unknown>;
  }
  return null;
}

function loadServiceModule<T = unknown>(name: string, path: string): Promise<T> {
  if (serviceModuleCache[name]) {
    return Promise.resolve(serviceModuleCache[name] as T);
  }
  const services = getGlobalServices();
  if (services) {
    const direct = services[name as keyof typeof services];
    if (direct) {
      serviceModuleCache[name] = direct;
      return Promise.resolve(direct as T);
    }
    const adapters = (services as any).adapters as Record<string, unknown> | undefined;
    const adapter = adapters && adapters[name];
    if (adapter) {
      serviceModuleCache[name] = adapter;
      return Promise.resolve(adapter as T);
    }
  }
  return import(path).then((mod) => {
    const resolved: any = mod && (mod as any).default ? (mod as any).default : mod;
    serviceModuleCache[name] = resolved;
    return resolved as T;
  }).catch((err) => {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(`[world-service] failed to load module '${name}'`, err);
    }
    throw err;
  });
}

function getItemFlags() {
  const flags = getGlobalObject('ItemFlag');
  if (flags) {
    return flags;
  }
  return {
    Usable: 1,
    Equipable: 2,
    Throwable: 4,
    Consuming: 8,
    ApplyToAll: 16
  };
}

function setDefaultPartyStruct() {
  const constRef = getGlobalObject('Const');
  const maxMembers = constRef && typeof constRef.MAX_PARTY_MEMBERS === 'number'
    ? constRef.MAX_PARTY_MEMBERS
    : 5;

  const existingParty = stateService.getGlobal('party') as PartyMember[] | null;
  const nextParty: PartyMember[] = new Array(maxMembers);
  for (let idx = 0; idx < maxMembers; idx++) {
    const source = Array.isArray(existingParty) ? existingParty[idx] : null;
    if (source && typeof source.playerRole === 'number') {
      nextParty[idx] = {
        playerRole: source.playerRole,
        x: Number.isFinite(source.x) ? source.x : 0,
        y: Number.isFinite(source.y) ? source.y : 0,
        frame: Number.isFinite(source.frame) ? source.frame : 0,
        imageOffset: Number.isFinite(source.imageOffset) ? source.imageOffset : 0
      };
    } else {
      nextParty[idx] = { playerRole: idx, x: 0, y: 0, frame: 0, imageOffset: 0 };
    }
  }
  stateService.setGlobal('party', nextParty);

  const existingTrail = stateService.getGlobal('trail') as TrailEntry[] | null;
  const nextTrail: TrailEntry[] = new Array(maxMembers);
  for (let idx = 0; idx < maxMembers; idx++) {
    const source = Array.isArray(existingTrail) ? existingTrail[idx] : null;
    if (source && Number.isFinite(source.x) && Number.isFinite(source.y)) {
      nextTrail[idx] = {
        x: source.x,
        y: source.y,
        direction: Number.isFinite(source.direction) ? source.direction : Direction.South
      };
    } else {
      nextTrail[idx] = { x: 0, y: 0, direction: Direction.South };
    }
  }
  stateService.setGlobal('trail', nextTrail);

  if (typeof stateService.getGlobal('numFollower') !== 'number') {
    stateService.setGlobal('numFollower', 0);
  }
}

const toSignedWord = getGlobalFunction('SHORT', function(value: number) {
  const result = value & 0xFFFF;
  return (result & 0x8000) ? result - 0x10000 : result;
});

function toUnsignedWord(value: number) {
  const normalized = ((value % 0x10000) + 0x10000) & 0xFFFF;
  return normalized;
}

function resolveDirectionDefault() {
  let directionTable = null;
  if (typeof globalThis !== 'undefined' && (globalThis as any).Direction) {
    directionTable = (globalThis as any).Direction;
  } else if (typeof global !== 'undefined' && (global as any).Direction) {
    directionTable = (global as any).Direction;
  }
  return directionTable && typeof directionTable.South === 'number'
    ? directionTable.South
    : 0;
}

const DEFAULT_PARTY_DIRECTION = resolveDirectionDefault();
type PlayerRolesBuffer = { uint8Array?: Uint8Array };
type PartyMember = { playerRole: number | null; x?: number; y?: number; frame?: number; imageOffset?: number };
type TrailEntry = { x: number; y: number; direction: number };

type ValueOrUpdater<T> = T | ((prev: T) => T);
type UpdateOptions = Record<string, unknown>;
type EntityMaps = {
  viewport: number | null;
  party: Map<number, number>;
  trail: number | null;
  eventObject: Map<number, number>;
  scene: number | null;
  mapMeta: number | null;
  mapTile: number | null;
  scriptRegister: number | null;
  moveQueue: number | null;
  collision: number | null;
};
type PoisonEntry = { uint8Array?: Uint8Array; poisonID?: number; poisonScript?: number };
type PoisonRow = PoisonEntry[] | { uint8Array?: Uint8Array };
type StateChangeEvent = { key?: string; value?: unknown; data?: { key?: string; value?: unknown } } | null;
type EquipmentEffectEntry = { uint8Array?: Uint8Array } | Record<string, unknown>;
type EquipmentEffectTable = EquipmentEffectEntry[];
const isUint8Entry = (entry: EquipmentEffectEntry | null | undefined): entry is { uint8Array: Uint8Array } =>
  !!entry && entry.uint8Array instanceof Uint8Array;
type InventoryItem = Record<string, unknown>;
type EcsRegistry = {
  createEntity: (...args: unknown[]) => number;
  addComponent: (entityId: number, component: unknown, data: unknown) => void;
  getComponent: (entityId: number, component: unknown) => any;
  hasEntity?: (entityId: number) => boolean;
  destroyEntity?: (entityId: number) => void;
  removeComponent?: (entityId: number, component: unknown) => void;
  clear?: () => void;
};
type WorldEventPayload =
  | { value: number; partyOffset: number }
  | { size: number }
  | { trail: TrailEntry[] | null }
  | { sceneId: unknown; mapId: unknown }
  | { count: number; sceneId?: unknown }
  | { id: number; sceneId: unknown; state: unknown }
  | Record<string, unknown>;
type GlobalStoreLoose = {
  numFollower?: number;
  musicNum?: number;
  numBattleMusic?: number;
  numBattleField?: number;
  numPalette?: number;
  nightPalette?: boolean;
  layer?: number;
  viewport?: number;
  partyOffset?: number;
  partyDirection?: number;
  maxPartyMemberIndex?: number;
  party?: PartyMember[];
  trail?: TrailEntry[];
  curMainMenuItem?: number;
  curSystemMenuItem?: number;
  curInvMenuItem?: number;
  noMusic?: boolean | number;
  noSound?: boolean | number;
  screenWave?: number;
  waveProgression?: number;
  needToFadeIn?: boolean | number;
  [key: string]: unknown;
};

const playerStateSignalsRef = playerStateSignals();
const playerRolesSignal = playerStateSignalsRef.roles;
const equipmentEffectSignal = playerStateSignalsRef.equipmentEffect;


class WorldService extends EventBus {
  registry: EcsRegistry;
  entityMaps: EntityMaps;
  _initialised: boolean;
  systemManager: any;
  _collisionState: any;
  _eventObjectsVersion: number;
  _eventObjectsCache: any;
  _eventObjectsCacheVersion: number;
  _maxSpriteDrawLimit: number;

  constructor() {
    super();
    this.registry = createEntityRegistry();
    this.entityMaps = {
      viewport: null,
      party: new Map(),
      trail: null,
      eventObject: new Map(),
      scene: null,
      mapMeta: null,
      mapTile: null,
      scriptRegister: null,
      moveQueue: null,
      collision: null
    };
    this._initialised = false;
    this._handleGlobalChanged = this._handleGlobalChanged.bind(this);
    this._handleGameDataChanged = this._handleGameDataChanged.bind(this);
    this.systemManager = createWorldSystemManager({ worldService: this });
    this._collisionState = null;
    this._eventObjectsVersion = 0;
    this._eventObjectsCache = null;
    this._eventObjectsCacheVersion = -1;
    this._maxSpriteDrawLimit = DEFAULT_MAX_SPRITE_TO_DRAW;
  }

  init() {
    if (this._initialised) {
      this.syncAll();
      return;
    }
    stateService.on('globalChanged', this._handleGlobalChanged);
    stateService.on('gameDataChanged', this._handleGameDataChanged);
    this._initialised = true;
    const globalStore = stateService.getGlobal() as GlobalStoreLoose | null;
    const hasPartyStruct = globalStore && Array.isArray(globalStore.party) && globalStore.party.length > 0;
    const hasTrailStruct = globalStore && Array.isArray(globalStore.trail) && globalStore.trail.length > 0;
    const hasFollowerCount = globalStore && typeof globalStore.numFollower === 'number';
    if (!hasPartyStruct || !hasTrailStruct || !hasFollowerCount) {
      setDefaultPartyStruct();
    }
    this._migrateLegacySpriteLimit();
    this.syncAll();
  }

  dispose() {
    if (this._initialised) {
      stateService.off('globalChanged', this._handleGlobalChanged);
      stateService.off('gameDataChanged', this._handleGameDataChanged);
      this._initialised = false;
    }
    if (typeof this.registry.clear === 'function') {
      this.registry.clear();
    }
    this.entityMaps.viewport = null;
    this.entityMaps.party.clear();
    this.entityMaps.trail = null;
    this.entityMaps.scene = null;
    this.entityMaps.eventObject.clear();
    this.entityMaps.mapMeta = null;
    this.entityMaps.mapTile = null;
    this.entityMaps.scriptRegister = null;
   this.entityMaps.moveQueue = null;
    this.entityMaps.collision = null;
    this._collisionState = null;
    this._eventObjectsVersion = (typeof this._eventObjectsVersion === 'number' ? this._eventObjectsVersion : 0) + 1;
    this._eventObjectsCache = null;
    this._eventObjectsCacheVersion = -1;
    updateSceneIdValue(0, { source: 'worldService:dispose' });
    updateEventObjectsValue([], { source: 'worldService:dispose' });
    updateCollisionStateValue(null, { source: 'worldService:dispose' });
    resetAudioResourceSlice();
    resetScriptObjectSlice();
    resetBattleFormationSlice();
    resetPlayerStateSlice();
  }

  _ensureInitialised() {
    if (!this._initialised) {
      this.init();
    }
  }

  _syncAutoBattleFlag(value: any) {
    const resolved = typeof value === 'boolean' ? value : this._getBooleanGlobal('autoBattle', false);
    updateAutoBattle(resolved, { emitEvent: false, source: 'worldService:sync' });
  }

  _syncFrameCountValue(value: any) {
    const resolved = Number.isFinite(value) ? Math.trunc(value) : this._getNumberGlobal('frameNum', 0);
    updateFrameCount(resolved, { emitEvent: false, source: 'worldService:sync' });
  }

  _cloneTrailSnapshot(trail: any[]) {
    if (!Array.isArray(trail)) {
      return [];
    }
    return trail.map((entry) => {
      if (entry && typeof entry === 'object') {
        return { ...entry };
      }
      return typeof entry === 'undefined' ? null : entry;
    });
  }

  _applyTrailReplacement(target: any[], source: any[]) {
    if (!Array.isArray(target) || !Array.isArray(source) || target === source) {
      return target;
    }

    if (target.length !== source.length) {
      target.length = source.length;
    }

    for (let index = 0; index < source.length; index++) {
      const sourceEntry = source[index];
      if (!sourceEntry || typeof sourceEntry !== 'object') {
        target[index] = typeof sourceEntry === 'undefined' ? null : sourceEntry;
        continue;
      }

      const destination = target[index];
      if (destination && typeof destination === 'object') {
        if (Object.prototype.hasOwnProperty.call(sourceEntry, 'x')) {
          destination.x = sourceEntry.x;
        }
        if (Object.prototype.hasOwnProperty.call(sourceEntry, 'y')) {
          destination.y = sourceEntry.y;
        }
        if (Object.prototype.hasOwnProperty.call(sourceEntry, 'direction')) {
          destination.direction = sourceEntry.direction;
        }
        Object.keys(sourceEntry).forEach((key) => {
          if (key === 'x' || key === 'y' || key === 'direction') {
            return;
          }
          destination[key] = sourceEntry[key];
        });
      } else {
        target[index] = { ...sourceEntry };
      }
    }

    return target;
  }

  _replaceGameDataTable<T>(key: string, value: T) {
    this._ensureInitialised();
    stateService.setGameData(key, value);
    return value;
  }

  _copyStructIntoGlobal<T>(key: string, source: T, syncFn?: () => void) {
    this._ensureInitialised();
    if (typeof source === 'undefined') {
      stateService.setGlobal(key, source);
      if (typeof syncFn === 'function') syncFn();
      return source;
    }
    const current = stateService.getGlobal(key) as T;
    if (
      current &&
      source &&
      (current as any).uint8Array instanceof Uint8Array &&
      (source as any).uint8Array instanceof Uint8Array &&
      (current as any).uint8Array.length === (source as any).uint8Array.length
    ) {
      (current as any).uint8Array.set((source as any).uint8Array);
      if (typeof syncFn === 'function') syncFn();
      return current;
    }
    const clone = (source && typeof (source as any).copy === 'function') ? (source as any).copy() : source;
    stateService.setGlobal(key, clone);
    if (typeof syncFn === 'function') syncFn();
    return clone;
  }

  _migrateLegacySpriteLimit() {
    let legacyValue = DEFAULT_MAX_SPRITE_TO_DRAW;
    if (typeof globalThis !== 'undefined' && typeof (globalThis as any)[LEGACY_SPRITE_LIMIT_KEY] === 'number') {
      const stored = (globalThis as any)[LEGACY_SPRITE_LIMIT_KEY];
      if (Number.isFinite(stored)) {
        legacyValue = Math.trunc(stored);
      }
    } else {
      const store = getGlobalStore();
      if (store && typeof store[MAX_SPRITE_STATE_KEY] === 'number' && Number.isFinite(store[MAX_SPRITE_STATE_KEY])) {
        legacyValue = Math.trunc(store[MAX_SPRITE_STATE_KEY]);
      }
    }
    this._maxSpriteDrawLimit = legacyValue;
    if (typeof globalThis !== 'undefined') {
      (globalThis as any)[LEGACY_SPRITE_LIMIT_KEY] = legacyValue;
    }
  }

  _ensureMoveQueue() {
    this._ensureInitialised();
    let entityId = this.entityMaps.moveQueue;
    if (!entityId) {
      entityId = this.registry.createEntity();
      this.registry.addComponent(entityId, WorldComponents.MoveRequestQueue, createMoveRequestQueueComponent());
      this.entityMaps.moveQueue = entityId;
    }
    return this.registry.getComponent(entityId, WorldComponents.MoveRequestQueue);
  }

  _ensureCollisionStateEntity() {
    this._ensureInitialised();
    let entityId = this.entityMaps.collision;
    if (!entityId) {
      entityId = this.registry.createEntity();
      this.registry.addComponent(entityId, WorldComponents.CollisionState, createCollisionStateComponent());
      this.entityMaps.collision = entityId;
    }
    return this.registry.getComponent(entityId, WorldComponents.CollisionState);
  }

  getRegistry() {
    return this.registry;
  }

  syncAll() {
    this.syncViewport();
    this.syncPartyMembers();
    this.syncTrail();
    this.syncScene();
    this.syncMapMeta();
    this.syncMapTiles();
    this.syncEventObjects();
    this.syncScriptRegisters();
    this.syncObjectStores();
    this.syncBattleFormation();
    this.syncPlayerRoles();
    this.syncStatusMatrices();
    this.syncEquipmentEffects();
    this._ensureMoveQueue();
    this.syncReactiveGlobals();
  }

  syncViewport() {
    this._ensureInitialised();
    const registry = this.registry;
    const viewportValue = stateService.getGlobal('viewport') || 0;
    const offsetValue = stateService.getGlobal('partyOffset') || 0;
    let entityId = this.entityMaps.viewport;
    if (!entityId) {
      entityId = registry.createEntity();
      registry.addComponent(entityId, WorldComponents.Viewport, createViewportComponent({
        value: viewportValue,
        partyOffset: offsetValue
      }));
      this.entityMaps.viewport = entityId;
    } else {
      const component = registry.getComponent(entityId, WorldComponents.Viewport);
      if (component) {
        component.value = viewportValue;
        component.partyOffset = offsetValue;
      }
    }
    this.fire('viewportSynced', { value: viewportValue, partyOffset: offsetValue });
  }

  persistViewport() {
    const component = this._ensureViewportComponent();
    const viewportValue = component && typeof component.value === 'number' ? component.value : 0;
    const offsetValue = component && typeof component.partyOffset === 'number' ? component.partyOffset : 0;
    stateService.setGlobal('viewport', viewportValue);
    stateService.setGlobal('partyOffset', offsetValue);
  }

  syncPartyMembers() {
    this._ensureInitialised();
    const registry = this.registry;
    const party = (stateService.getGlobal('party') as PartyMember[] | null) || [];
    const visited = new Set();
    for (let index = 0; index < party.length; index++) {
      const member = party[index];
      let entityId = this.entityMaps.party.get(index);
      if (!entityId) {
        entityId = registry.createEntity();
        registry.addComponent(entityId, WorldComponents.PartyMember, createPartyMemberComponent({
          index,
          stateRef: member,
          roleId: member ? member.playerRole : null
        }));
        this.entityMaps.party.set(index, entityId as number);
      } else {
        const component = registry.getComponent(entityId, WorldComponents.PartyMember);
        if (component) {
          component.index = index;
          component.stateRef = member;
          component.roleId = member ? member.playerRole : null;
        }
      }
      visited.add(index);
    }

    (this.entityMaps.party as Map<number, any>).forEach((entityId: any, index: number) => {
      if (!visited.has(index)) {
        this.entityMaps.party.delete(index);
        if (registry.hasEntity && registry.hasEntity(entityId)) {
          registry.destroyEntity && registry.destroyEntity(entityId);
        }
      }
    });

    updatePartySliceValue(party, { source: 'worldService:syncParty' });
    this.fire('partySynced', { size: party.length });
  }

  syncTrail() {
    this._ensureInitialised();
    const registry = this.registry;
    const trail = stateService.getGlobal('trail') || null;
    let entityId = this.entityMaps.trail;
    if (!entityId) {
      entityId = registry.createEntity();
      registry.addComponent(entityId, WorldComponents.Trail, createTrailComponent({
        stateRef: trail
      }));
      this.entityMaps.trail = entityId;
    } else {
      const component = registry.getComponent(entityId, WorldComponents.Trail);
      if (component) {
        component.stateRef = trail;
      }
    }
    updateTrailSliceValue(trail, { source: 'worldService:syncTrail' });
    this.fire('trailSynced', { trail });
  }

  syncReactiveGlobals() {
    const globalStore = stateService.getGlobal() as GlobalStoreLoose | null;
    const autoBattleValue = globalStore && typeof globalStore.autoBattle !== 'undefined'
      ? !!globalStore.autoBattle
      : this._getBooleanGlobal('autoBattle', false);
    this._syncAutoBattleFlag(autoBattleValue);

    const frameValue = globalStore && typeof globalStore.frameNum !== 'undefined'
      ? globalStore.frameNum
      : this._getNumberGlobal('frameNum', 0);
    this._syncFrameCountValue(frameValue);

    const mainMenuValue = globalStore && typeof globalStore.curMainMenuItem !== 'undefined'
      ? globalStore.curMainMenuItem
      : this._getNumberGlobal('curMainMenuItem', 0);
    updateMainMenuIndex(mainMenuValue, { emitEvent: false, source: 'worldService:sync' });

    const systemMenuValue = globalStore && typeof globalStore.curSystemMenuItem !== 'undefined'
      ? globalStore.curSystemMenuItem
      : this._getNumberGlobal('curSystemMenuItem', 0);
    updateSystemMenuIndex(systemMenuValue, { emitEvent: false, source: 'worldService:sync' });

    const inventoryMenuValue = globalStore && typeof globalStore.curInvMenuItem !== 'undefined'
      ? globalStore.curInvMenuItem
      : this._getNumberGlobal('curInvMenuItem', 0);
    updateInventoryMenuIndex(inventoryMenuValue, { emitEvent: false, source: 'worldService:sync' });

    const noMusicValue = globalStore && typeof globalStore.noMusic !== 'undefined'
      ? !!globalStore.noMusic
      : this._getBooleanGlobal('noMusic', false);
    updateNoMusicFlag(noMusicValue, { emitEvent: false, source: 'worldService:sync' });

    const noSoundValue = globalStore && typeof globalStore.noSound !== 'undefined'
      ? !!globalStore.noSound
      : this._getBooleanGlobal('noSound', false);
    updateNoSoundFlag(noSoundValue, { emitEvent: false, source: 'worldService:sync' });

    const inventoryValue = stateService.getGlobal('inventory');
    updateInventoryValue(Array.isArray(inventoryValue) ? inventoryValue : [], { emitEvent: false, source: 'worldService:sync', capacity: this.getInventoryCapacity() });

    const cashValue = stateService.getGlobal('cash');
    updateCashValue(typeof cashValue === 'number' ? Math.trunc(cashValue) : 0, { emitEvent: false, source: 'worldService:sync' });

    const lastUnequippedValue = stateService.getGlobal('lastUnequippedItem');
    updateLastUnequippedValue(typeof lastUnequippedValue === 'number' ? Math.trunc(lastUnequippedValue) : 0, { emitEvent: false, source: 'worldService:sync' });

    const collectValue = stateService.getGlobal('collectValue');
    updateCollectValue(typeof collectValue === 'number' ? Math.trunc(collectValue) : 0, { emitEvent: false, source: 'worldService:sync' });

    const chaseRangeValue = stateService.getGlobal('chaseRange');
    updateChaseRangeValue(typeof chaseRangeValue === 'number' ? Math.trunc(chaseRangeValue) : 0, { emitEvent: false, source: 'worldService:sync' });

    const chaseCyclesValue = stateService.getGlobal('chaseSpeedChangeCycles');
    updateChaseSpeedCyclesValue(typeof chaseCyclesValue === 'number' ? Math.trunc(chaseCyclesValue) : 0, { emitEvent: false, source: 'worldService:sync' });

    const battleSpeedValue = stateService.getGlobal('battleSpeed');
    updateBattleSpeedValue(typeof battleSpeedValue === 'number' ? Math.trunc(battleSpeedValue) : 2, { emitEvent: false, source: 'worldService:sync' });

    const viewportValue = globalStore && typeof globalStore.viewport !== 'undefined'
      ? globalStore.viewport
      : stateService.getGlobal('viewport') || 0;
    updateViewportValue(viewportValue, { emitEvent: false, source: 'worldService:sync' });

    const partyOffsetValue = globalStore && typeof (globalStore as GlobalStoreLoose).partyOffset !== 'undefined'
      ? (globalStore as GlobalStoreLoose).partyOffset
      : stateService.getGlobal('partyOffset') || 0;
    updatePartyOffsetValue(partyOffsetValue, { emitEvent: false, source: 'worldService:sync' });

    const partyDirectionValue = globalStore && typeof (globalStore as GlobalStoreLoose).partyDirection !== 'undefined'
      ? (globalStore as GlobalStoreLoose).partyDirection
      : this.getPartyDirection();
    updatePartyDirectionValue(partyDirectionValue, { emitEvent: false, source: 'worldService:sync' });

    const maxPartyIndexValue = globalStore && typeof (globalStore as GlobalStoreLoose).maxPartyMemberIndex !== 'undefined'
      ? (globalStore as GlobalStoreLoose).maxPartyMemberIndex
      : this.getMaxPartyMemberIndex();
    updateMaxPartyIndexValue(maxPartyIndexValue, { emitEvent: false, source: 'worldService:sync' });

    const partyValue = globalStore && Array.isArray((globalStore as GlobalStoreLoose).party)
      ? (globalStore as GlobalStoreLoose).party
      : (stateService.getGlobal('party') || []);
    updatePartySliceValue(partyValue, { emitEvent: false, source: 'worldService:sync' });

    const trailValue = globalStore && Array.isArray((globalStore as GlobalStoreLoose).trail)
      ? (globalStore as GlobalStoreLoose).trail
      : (stateService.getGlobal('trail') || []);
    updateTrailSliceValue(trailValue, { emitEvent: false, source: 'worldService:sync' });

    const looseStore = globalStore as GlobalStoreLoose | null;
    const followerCountValue = looseStore && typeof looseStore.numFollower !== 'undefined'
      ? looseStore.numFollower
      : this._getNumberGlobal('numFollower', 0);
    updateFollowerCountSliceValue(followerCountValue, { emitEvent: false, source: 'worldService:sync' });

    const musicTrackValue = looseStore && typeof looseStore.musicNum !== 'undefined'
      ? looseStore.musicNum
      : this._getNumberGlobal('musicNum', 0);
    updateMusicTrackValue(musicTrackValue, { emitEvent: false, source: 'worldService:sync' });

    const battleMusicValue = looseStore && typeof looseStore.numBattleMusic !== 'undefined'
      ? looseStore.numBattleMusic
      : this._getNumberGlobal('numBattleMusic', 0);
    updateBattleMusicTrackValue(battleMusicValue, { emitEvent: false, source: 'worldService:sync' });

    const battleFieldValue = looseStore && typeof looseStore.numBattleField !== 'undefined'
      ? looseStore.numBattleField
      : this._getNumberGlobal('numBattleField', 0);
    updateBattleFieldIdValue(battleFieldValue, { emitEvent: false, source: 'worldService:sync' });

    const screenWaveValue = looseStore && typeof looseStore.screenWave !== 'undefined'
      ? looseStore.screenWave
      : this._getNumberGlobal('screenWave', 0);
    updateScreenWaveValue(screenWaveValue, { emitEvent: false, source: 'worldService:sync' });

    const waveProgressValue = looseStore && typeof looseStore.waveProgression !== 'undefined'
      ? looseStore.waveProgression
      : this._getNumberGlobal('waveProgression', 0);
    updateWaveProgressionValue(waveProgressValue, { emitEvent: false, source: 'worldService:sync' });

    const needFadeInValue = looseStore && typeof looseStore.needToFadeIn !== 'undefined'
      ? !!looseStore.needToFadeIn
      : this._getBooleanGlobal('needToFadeIn', false);
    updateNeedToFadeInValue(needFadeInValue, { emitEvent: false, source: 'worldService:sync' });

    const paletteIdValue = looseStore && typeof looseStore.numPalette !== 'undefined'
      ? looseStore.numPalette
      : this._getNumberGlobal('numPalette', 0);
    updatePaletteIdValue(paletteIdValue, { emitEvent: false, source: 'worldService:sync' });

    const nightPaletteValue = looseStore && typeof looseStore.nightPalette !== 'undefined'
      ? !!looseStore.nightPalette
      : this._getBooleanGlobal('nightPalette', false);
    updateNightPaletteValue(nightPaletteValue, { emitEvent: false, source: 'worldService:sync' });

    const layerValue = looseStore && typeof looseStore.layer !== 'undefined'
      ? looseStore.layer
      : this._getNumberGlobal('layer', 0);
    updateLayerValue(layerValue, { emitEvent: false, source: 'worldService:sync' });
  }

  syncScene() {
    this._ensureInitialised();
    const registry = this.registry;
    const numScene = stateService.getGlobal('numScene');
    const gameData = getGameDataStore();
    const scenes = gameData && Array.isArray((gameData as any).scene) ? (gameData as any).scene : [];
    const sceneIndex = typeof numScene === 'number' ? numScene - 1 : -1;
    const sceneRef = sceneIndex >= 0 && sceneIndex < scenes.length ? scenes[sceneIndex] : null;
    const nextSceneRef = sceneIndex + 1 >= 0 && sceneIndex + 1 < scenes.length ? scenes[sceneIndex + 1] : null;
    const mapId = sceneRef && typeof sceneRef.mapNum === 'number' ? sceneRef.mapNum : null;
    const maps = gameData && Array.isArray((gameData as any).map) ? (gameData as any).map : [];
    const mapRef = mapId != null && mapId >= 0 && mapId < maps.length ? maps[mapId] : null;

    let entityId = this.entityMaps.scene;
    if (!entityId) {
      entityId = registry.createEntity();
      registry.addComponent(entityId, WorldComponents.Scene, createSceneComponent({
        sceneId: numScene,
        sceneRef,
        nextSceneRef,
        mapId,
        mapRef
      }));
      this.entityMaps.scene = entityId;
    } else {
      const component = registry.getComponent(entityId, WorldComponents.Scene);
      if (component) {
        component.sceneId = numScene;
        component.sceneRef = sceneRef;
        component.nextSceneRef = nextSceneRef;
        component.mapId = mapId;
        component.mapRef = mapRef;
      }
    }

    this.fire('sceneSynced', {
      sceneId: numScene,
      scene: sceneRef,
      nextScene: nextSceneRef,
      mapId,
      map: mapRef
    });
    updateSceneIdValue(typeof numScene === 'number' ? numScene : 0, { source: 'worldService:syncScene' });

    this.syncMapMeta();
    this.syncMapTiles();
  }

  syncMapMeta() {
    this._ensureInitialised();
    const registry = this.registry;
    const sceneEntity = this.entityMaps.scene;
    if (!sceneEntity) {
      return;
    }
    const numScene = stateService.getGlobal('numScene');
    const gameData = getGameDataStore();
    const scenes = gameData && Array.isArray(gameData.scene) ? gameData.scene : [];
    const sceneIndex = typeof numScene === 'number' ? numScene - 1 : -1;
    const sceneRef = sceneIndex >= 0 && sceneIndex < scenes.length ? scenes[sceneIndex] : null;
    const mapId = sceneRef && typeof sceneRef.mapNum === 'number' ? sceneRef.mapNum : null;
    const maps = gameData && Array.isArray(gameData.map) ? gameData.map : null;
    const mapRef = mapId != null && maps ? maps[mapId] || null : null;

    const payload = {
      sceneId: numScene,
      mapId,
      sceneRef,
      mapRef,
      scriptOnEnter: sceneRef ? sceneRef.scriptOnEnter : null,
      scriptOnTeleport: sceneRef ? sceneRef.scriptOnTeleport : null
    };

    const component = registry.getComponent(sceneEntity, WorldComponents.MapMeta);
    if (component) {
      component.sceneId = payload.sceneId;
      component.mapId = payload.mapId;
      component.sceneRef = payload.sceneRef;
      component.mapRef = payload.mapRef;
      component.scriptOnEnter = payload.scriptOnEnter;
      component.scriptOnTeleport = payload.scriptOnTeleport;
    } else {
      registry.addComponent(sceneEntity, WorldComponents.MapMeta, createMapMetaComponent(payload));
    }
    this.entityMaps.mapMeta = sceneEntity;
    this.fire('mapMetaSynced', { sceneId: payload.sceneId, mapId: payload.mapId });
    this._collisionState = null;
    updateCollisionStateValue(null, { source: 'worldService:syncMapMeta' });
  }

  syncMapTiles() {
    this._ensureInitialised();
    const registry = this.registry;
    const sceneEntity = this.entityMaps.scene;
    if (!sceneEntity) {
      return;
    }
    const numScene = stateService.getGlobal('numScene');
    const gameData = getGameDataStore();
    const scenes = gameData && Array.isArray(gameData.scene) ? gameData.scene : [];
    const sceneIndex = typeof numScene === 'number' ? numScene - 1 : -1;
    const sceneRef = sceneIndex >= 0 && sceneIndex < scenes.length ? scenes[sceneIndex] : null;
    const mapId = sceneRef && typeof sceneRef.mapNum === 'number' ? sceneRef.mapNum : null;
    const maps = gameData && Array.isArray(gameData.map) ? gameData.map : null;
    const mapRef = mapId != null && maps ? maps[mapId] || null : null;

    const payload = {
      mapId,
      sceneId: numScene,
      mapRef,
      width: mapRef && typeof mapRef.width === 'number' ? mapRef.width : 64,
      height: mapRef && typeof mapRef.height === 'number' ? mapRef.height : 128,
      layers: mapRef && mapRef.layers ? mapRef.layers : null,
      tileData: mapRef && mapRef.tiles ? mapRef.tiles : null
    };

    const component = registry.getComponent(sceneEntity, WorldComponents.MapTile);
    if (component) {
      component.mapId = payload.mapId;
      component.sceneId = payload.sceneId;
      component.mapRef = payload.mapRef;
      component.width = payload.width;
      component.height = payload.height;
      component.layers = payload.layers;
      component.tileData = payload.tileData;
    } else {
      registry.addComponent(sceneEntity, WorldComponents.MapTile, createMapTileComponent(payload));
    }
    this.entityMaps.mapTile = sceneEntity;
    this.fire('mapTilesSynced', { sceneId: payload.sceneId, mapId: payload.mapId });
    this._collisionState = null;
    updateCollisionStateValue(null, { source: 'worldService:syncMapTiles' });
  }

  syncEventObjects() {
    this._ensureInitialised();
    const registry = this.registry;
    const gameData = getGameDataStore();
    const eventObjects = gameData && gameData.eventObject ? gameData.eventObject : [];
    const sceneId = stateService.getGlobal('numScene');
    const visited = new Set();
    const list = Array.isArray(eventObjects) ? eventObjects : [];
    for (let i = 0; i < list.length; i++) {
      const eventObject = list[i];
      if (!eventObject) {
        continue;
      }
      this._syncEventObjectEntity(i, eventObject, sceneId);
      visited.add(i);
    }

    (this.entityMaps.eventObject as Map<number, any>).forEach((entityId: any, id: number) => {
      if (!visited.has(id)) {
        this.entityMaps.eventObject.delete(id);
        if (registry.hasEntity && registry.hasEntity(entityId)) {
          registry.destroyEntity && registry.destroyEntity(entityId);
        }
      }
    });

    const count = Array.isArray(eventObjects) ? eventObjects.length : 0;
    this.fire('eventObjectsSynced', { count });
    this.fire('npcStatesSynced', { count, sceneId });
    this._collisionState = null;
    this._eventObjectsVersion = (typeof this._eventObjectsVersion === 'number' ? this._eventObjectsVersion : 0) + 1;
    const sceneEventObjects = this.getEventObjectsInCurrentScene();
    updateEventObjectsValue(sceneEventObjects, { source: 'worldService:syncEventObjects' });
    updateCollisionStateValue(null, { source: 'worldService:syncEventObjects' });
  }

  _syncEventObjectEntity(index: number, eventObject: any, sceneId = stateService.getGlobal('numScene')) {
    this._ensureInitialised();
    if (!eventObject) {
      this._teardownEventObjectEntity(index);
      return null;
    }
    const registry = this.registry;
    let entityId = this.entityMaps.eventObject.get(index);
    if (!entityId) {
      entityId = registry.createEntity();
      registry.addComponent(entityId, WorldComponents.EventObject, createEventObjectComponent({
        id: index,
        stateRef: eventObject,
        sceneId,
        aiState: eventObject ? {
          triggerMode: eventObject.triggerMode,
          state: eventObject.state,
          autoScript: eventObject.autoScript
        } : null
      }));
      registry.addComponent(entityId, WorldComponents.NpcState, createNpcStateComponent({
        id: index,
        sceneId,
        stateRef: eventObject,
        position: eventObject ? { x: eventObject.x, y: eventObject.y, layer: eventObject.layer } : null,
        direction: eventObject ? eventObject.direction : null,
        currentFrame: eventObject ? eventObject.currentFrameNum : null,
        state: eventObject ? eventObject.state : null,
        vanishTime: eventObject ? eventObject.vanishTime : null
      }));
      this.entityMaps.eventObject.set(index, entityId as number);
      return entityId;
    }

    const eventComponent = registry.getComponent(entityId, WorldComponents.EventObject);
    if (eventComponent) {
      eventComponent.id = index;
      eventComponent.stateRef = eventObject;
      eventComponent.sceneId = sceneId;
      eventComponent.aiState = eventObject ? {
        triggerMode: eventObject.triggerMode,
        state: eventObject.state,
        autoScript: eventObject.autoScript
      } : null;
    }

    const npcComponent = registry.getComponent(entityId, WorldComponents.NpcState);
    if (npcComponent) {
      npcComponent.id = index;
      npcComponent.sceneId = sceneId;
      npcComponent.stateRef = eventObject;
      npcComponent.position = eventObject ? { x: eventObject.x, y: eventObject.y, layer: eventObject.layer } : null;
      npcComponent.direction = eventObject ? eventObject.direction : null;
      npcComponent.currentFrame = eventObject ? eventObject.currentFrameNum : null;
      npcComponent.state = eventObject ? eventObject.state : null;
      npcComponent.vanishTime = eventObject ? eventObject.vanishTime : null;
    }

    return entityId;
  }

  _teardownEventObjectEntity(index: number) {
    const registry = this.registry;
    const entityId = this.entityMaps.eventObject.get(index);
    if (!entityId) {
      return;
    }
    this.entityMaps.eventObject.delete(index);
    if (registry.hasEntity && registry.hasEntity(entityId)) {
      registry.destroyEntity && registry.destroyEntity(entityId);
    }
  }

  syncScriptRegisters() {
    this._ensureInitialised();
    const registry = this.registry;
    const gameData = getGameDataStore();
    const rawEntries = gameData && gameData.scriptEntry ? gameData.scriptEntry : [];
    const scriptEntries = Array.isArray(rawEntries) ? rawEntries : [];
    let entityId = this.entityMaps.scriptRegister;
    const payload = {
      count: Array.isArray(scriptEntries) || (scriptEntries && typeof (scriptEntries as any).length === 'number')
        ? (scriptEntries as any).length
        : 0,
      entries: scriptEntries,
      lastSynced: Date.now()
    };
    if (!entityId) {
      entityId = registry.createEntity();
      registry.addComponent(entityId, WorldComponents.ScriptRegister, createScriptRegisterComponent(payload));
      this.entityMaps.scriptRegister = entityId;
    } else {
      const component = registry.getComponent(entityId, WorldComponents.ScriptRegister);
      if (component) {
        component.count = payload.count;
        component.entries = payload.entries;
        component.lastSynced = payload.lastSynced;
      } else {
        registry.addComponent(entityId, WorldComponents.ScriptRegister, createScriptRegisterComponent(payload));
      }
    }
    this.fire('scriptRegistersSynced', { count: payload.count });
    updateScriptEntriesValue(scriptEntries);
  }

  syncObjectStores() {
    this._ensureInitialised();
    const gameData = getGameDataStore();
    const objectTable = gameData && Array.isArray((gameData as any).object) ? (gameData as any).object : [];
    updateObjectTableValue(objectTable);
    const magicTable = gameData && Array.isArray((gameData as any).magic) ? (gameData as any).magic : [];
    updateMagicTableValue(magicTable);
    const storeTable = gameData && Array.isArray((gameData as any).store) ? (gameData as any).store : [];
    updateStoreTableValue(storeTable);
    const levelUpMagicTable = gameData && Array.isArray((gameData as any).levelUpMagic) ? (gameData as any).levelUpMagic : [];
    updateLevelUpMagicTableValue(levelUpMagicTable);
    const levelUpExpTable = gameData && Array.isArray((gameData as any).levelUpExp) ? (gameData as any).levelUpExp : [];
    updateLevelUpExpTableValue(levelUpExpTable);
    const objectDesc = stateService.getGlobal('objectDesc');
    updateObjectDescValue((typeof objectDesc === 'undefined' ? null : objectDesc) as any);
    const expState = stateService.getGlobal('exp');
    updateExpStateValue(() => expState || null);
  }


  syncPlayerRoles() {
    this._ensureInitialised();
    const store = getGameDataStore();
    updatePlayerRolesValue(store && store.playerRoles ? store.playerRoles : null);
  }

  syncStatusMatrices() {
    this._ensureInitialised();
    const playerStatusGlobal = stateService.getGlobal('playerStatus');
    const poisonStatusGlobal = stateService.getGlobal('poisonStatus');
    const playerResolved = Array.isArray(playerStatusGlobal)
      ? playerStatusGlobal
      : this.getPlayerStatusMatrix();
    const poisonResolved = Array.isArray(poisonStatusGlobal)
      ? poisonStatusGlobal
      : this.getPoisonStatusMatrix();
    updatePlayerStatusMatrix(Array.isArray(playerResolved) ? playerResolved : [], { source: 'worldService:syncStatusMatrices' });
    updatePoisonStatusMatrix(Array.isArray(poisonResolved) ? poisonResolved : [], { source: 'worldService:syncStatusMatrices' });
  }

  syncEquipmentEffects() {
    this._ensureInitialised();
    updateEquipmentEffectValue(this._getEquipmentEffects() || []);
  }

  syncBattleFormation() {
    this._ensureInitialised();
    const gameData = getGameDataStore();
    const enemyTeam = gameData && Array.isArray(gameData.enemyTeam) ? gameData.enemyTeam : [];
    updateEnemyTeamValue(enemyTeam, { source: 'worldService:syncBattleFormation' });
    const enemyPositions = gameData && gameData.enemyPos ? gameData.enemyPos : null;
    updateEnemyPositionValue(enemyPositions || null, { source: 'worldService:syncBattleFormation' });
    const battleFields = gameData && Array.isArray(gameData.battleField) ? gameData.battleField : [];
    updateBattleFieldValue(battleFields, { source: 'worldService:syncBattleFormation' });
  }

  setScriptEntries(entries: any[]) {
    const resolved = this._replaceGameDataTable('scriptEntry', entries || []);
    updateScriptEntriesValue(resolved || []);
    return resolved;
  }

  getViewportComponent() {
    this._ensureInitialised();
    if (!this.entityMaps.viewport) {
      return null;
    }
    return this.registry.getComponent(this.entityMaps.viewport, WorldComponents.Viewport);
  }

  _ensureViewportComponent() {
    this._ensureInitialised();
    let entityId = this.entityMaps.viewport;
    const currentViewport = stateService.getGlobal('viewport') || 0;
    const currentOffset = stateService.getGlobal('partyOffset') || 0;
    if (!entityId) {
      entityId = this.registry.createEntity();
      this.registry.addComponent(entityId, WorldComponents.Viewport, createViewportComponent({
        value: currentViewport,
        partyOffset: currentOffset
      }));
      this.entityMaps.viewport = entityId;
      return this.registry.getComponent(entityId, WorldComponents.Viewport);
    }
    let component = this.registry.getComponent(entityId, WorldComponents.Viewport);
    if (!component) {
      this.registry.addComponent(entityId, WorldComponents.Viewport, createViewportComponent({
        value: currentViewport,
        partyOffset: currentOffset
      }));
      component = this.registry.getComponent(entityId, WorldComponents.Viewport);
    }
    return component;
  }

  getPartyComponent(index: number) {
    this._ensureInitialised();
    const entityId = this.entityMaps.party.get(index);
    if (!entityId) {
      return null;
    }
    return this.registry.getComponent(entityId, WorldComponents.PartyMember);
  }

  getTrailComponent() {
    this._ensureInitialised();
    if (!this.entityMaps.trail) {
      return null;
    }
    return this.registry.getComponent(this.entityMaps.trail, WorldComponents.Trail);
  }

  getSceneComponent() {
    this._ensureInitialised();
    if (!this.entityMaps.scene) {
      return null;
    }
    return this.registry.getComponent(this.entityMaps.scene, WorldComponents.Scene);
  }

  getMapMetaComponent() {
    this._ensureInitialised();
    if (!this.entityMaps.mapMeta) {
      return null;
    }
    return this.registry.getComponent(this.entityMaps.mapMeta, WorldComponents.MapMeta);
  }

  getMapTileComponent() {
    this._ensureInitialised();
    if (!this.entityMaps.mapTile) {
      return null;
    }
    return this.registry.getComponent(this.entityMaps.mapTile, WorldComponents.MapTile);
  }

  getScriptEntry(entry: number) {
    this._ensureInitialised();
    const registry = this.registry;
    if (this.entityMaps.scriptRegister) {
      const component = registry.getComponent(this.entityMaps.scriptRegister, WorldComponents.ScriptRegister);
      if (component && component.entries && typeof component.entries.length === 'number') {
        const candidate = (component.entries as any)[entry];
        if (typeof candidate !== 'undefined') {
          return candidate || null;
        }
      }
    }
    const gameData = getGameDataStore();
    const scriptEntries = gameData && (gameData as any).scriptEntry;
    if (scriptEntries && typeof (scriptEntries as any).length === 'number') {
      return (scriptEntries as any)[entry] || null;
    }
    return null;
  }

  getViewport() {
    this._ensureInitialised();
    const component = this.getViewportComponent() || this._ensureViewportComponent();
    const value = component && typeof component.value === 'number' ? component.value : (stateService.getGlobal('viewport') || 0);
    updateViewportValue(value, { emitEvent: false, source: 'worldService:get' });
    return value;
  }

  getPartyOffset() {
    this._ensureInitialised();
    const component = this.getViewportComponent() || this._ensureViewportComponent();
    const value = component && typeof component.partyOffset === 'number' ? component.partyOffset : (stateService.getGlobal('partyOffset') || 0);
    updatePartyOffsetValue(value, { emitEvent: false, source: 'worldService:get' });
    return value;
  }

  setViewport(value: number) {
    this._ensureInitialised();
    const component = this._ensureViewportComponent();
    const resolved = Number.isFinite(value) ? value : 0;
    component.value = resolved;
    this.persistViewport();
    updateViewportValue(resolved, { source: 'worldService' });
    return resolved;
  }

  mutateViewport(mutator: (value: number) => number | undefined) {
    this._ensureInitialised();
    const component = this._ensureViewportComponent();
    if (typeof mutator !== 'function') {
      return component.value;
    }
    const next = mutator(component.value);
    if (typeof next === 'undefined') {
      return component.value;
    }
    const resolved = Number.isFinite(next) ? next : component.value;
    component.value = resolved;
    this.persistViewport();
    updateViewportValue(resolved, { source: 'worldService' });
    return resolved;
  }

  setPartyOffset(value: number) {
    this._ensureInitialised();
    const component = this._ensureViewportComponent();
    const resolved = Number.isFinite(value) ? value : 0;
    component.partyOffset = resolved;
    this.persistViewport();
    updatePartyOffsetValue(resolved, { source: 'worldService' });
    return resolved;
  }

  mutatePartyOffset(mutator: (value: number) => number | undefined) {
    this._ensureInitialised();
    const component = this._ensureViewportComponent();
    if (typeof mutator !== 'function') {
      return component.partyOffset;
    }
    const next = mutator(component.partyOffset);
    if (typeof next === 'undefined') {
      return component.partyOffset;
    }
    const resolved = Number.isFinite(next) ? next : component.partyOffset;
    component.partyOffset = resolved;
    this.persistViewport();
    updatePartyOffsetValue(resolved, { source: 'worldService' });
    return resolved;
  }

  mutateTrail(mutator: (trail: any[]) => any[] | undefined) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return stateService.getGlobal('trail');
    }
    let applied = null;
    const result = stateService.mutateGlobal('trail', (current) => {
      if (!Array.isArray(current)) {
        applied = current;
        return current;
      }
      const output = mutator(current);
      if (Array.isArray(output) && output !== current) {
        this._applyTrailReplacement(current, output);
      }
      applied = current;
      return current;
    });
    const trailRef = Array.isArray(applied) ? applied : (Array.isArray(result) ? result : stateService.getGlobal('trail'));
    const snapshot = this._cloneTrailSnapshot(Array.isArray(trailRef) ? trailRef : []);
    updateTrailSliceValue(snapshot, { source: 'worldService:mutateTrail' });
    this.syncTrail();
    return result;
  }

  setTrailStruct(struct: any) {
    const result = this._copyStructIntoGlobal('trail', struct, () => this.syncTrail());
    const trail = this.getTrail();
    const snapshot = Array.isArray(trail)
      ? trail.map((entry) => (entry && typeof entry === 'object' ? { ...(entry as any) } : entry))
      : [];
    updateTrailSliceValue(snapshot, { source: 'worldService:setTrailStruct' });
    return result;
  }

  getPartyMember(index: number) {
    this._ensureInitialised();
    const party = stateService.getGlobal('party') as PartyMember[] | null || [];
    return party[index] || null;
  }

  getParty(): PartyMember[] {
    this._ensureInitialised();
    const party = stateService.getGlobal('party');
    if (Array.isArray(party)) {
      return party as PartyMember[];
    }
    if (party && typeof (party as any).length === 'number') {
      return party as PartyMember[];
    }
    return [];
  }

  getMaxPartyMemberIndex() {
    this._ensureInitialised();
    const value = stateService.getGlobal('maxPartyMemberIndex');
    if (typeof value === 'number') {
      updateMaxPartyIndexValue(value, { emitEvent: false, source: 'worldService:get' });
      return value;
    }
    const legacyGlobal = getGlobalObject('Global');
    if (legacyGlobal && typeof legacyGlobal.maxPartyMemberIndex === 'number') {
      const legacyValue = legacyGlobal.maxPartyMemberIndex;
      updateMaxPartyIndexValue(legacyValue, { emitEvent: false, source: 'worldService:get' });
      return legacyValue;
    }
    const party = this.getParty();
    let fallback = -1;
    if (Array.isArray(party)) {
      for (let index = 0; index < party.length; index++) {
        const member = party[index];
        if (member && typeof member.playerRole === 'number' && member.playerRole >= 0) {
          fallback = index;
        }
      }
    }
    updateMaxPartyIndexValue(fallback, { emitEvent: false, source: 'worldService:get' });
    return fallback;
  }

  mutateParty(mutator: (party: PartyMember[]) => PartyMember[] | undefined) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return null;
    }
    return stateService.mutateGlobal('party', (party) => {
      const current = Array.isArray(party) ? (party as PartyMember[]) : [];
      const result = mutator(current);
      return typeof result === 'undefined' ? current : result;
    });
  }

  setPartyStruct(struct: PartyMember[]) {
    return this._copyStructIntoGlobal<PartyMember[]>('party', struct, () => this.syncPartyMembers());
  }

  getInventory(): InventoryItem[] {
    this._ensureInitialised();
    const inventory = stateService.getGlobal('inventory') as InventoryItem[] | null;
    const resolved = Array.isArray(inventory) ? inventory : [];
    const capacity = this.getInventoryCapacity();
    updateInventoryValue(resolved, { emitEvent: false, source: 'worldService:get', capacity });
    return resolved;
  }

  mutateInventory(mutator: (inventory: InventoryItem[]) => InventoryItem[] | undefined) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return null;
    }
    const result = stateService.mutateGlobal('inventory', (inventory) => {
      const current = Array.isArray(inventory) ? (inventory as InventoryItem[]) : [];
      const next = mutator(current);
      return typeof next === 'undefined' ? current : next;
    });
    updateInventoryValue(Array.isArray(result) ? result : [], { source: 'worldService', capacity: this.getInventoryCapacity() });
    return result;
  }

  setInventoryStruct(struct: InventoryItem[]) {
    const resolved = this._copyStructIntoGlobal<InventoryItem[]>('inventory', struct);
    updateInventoryValue(Array.isArray(resolved) ? resolved : [], { source: 'worldService', capacity: this.getInventoryCapacity() });
    return resolved;
  }

  getInventorySlot(index: number) {
    const inventory = this.getInventory();
    if (index < 0 || index >= inventory.length) {
      return null;
    }
    return inventory[index] || null;
  }

  getInventoryCapacity() {
    const globalInventory = stateService.getGlobal('inventory');
    const fallback = Array.isArray(globalInventory) ? globalInventory.length : 0;
    const capacity = (typeof Const !== 'undefined' && Const && typeof Const.MAX_INVENTORY === 'number')
      ? Const.MAX_INVENTORY
      : fallback;
    updateInventoryCapacityValue(capacity, { emitEvent: false, source: 'worldService:get' });
    return capacity;
  }

  useInventoryItem(itemId: number, targetIndex: number | null) {
    const world = this;
    return co(function* (): Generator<any, boolean, any> {
      if (!Number.isFinite(itemId) || itemId <= 0) {
        return false;
      }

      let scriptSvc = null;
      try {
        scriptSvc = yield loadServiceModule('script', './script-service.ts');
      } catch (err) {
        return false;
      }
      if (!scriptSvc || typeof scriptSvc.runTriggerScript !== 'function') {
        return false;
      }

      let objectEntry = null;
      try {
        const scriptObjects = yield loadServiceModule('scriptObjects', './script-object-adapter.js');
        if (scriptObjects && typeof scriptObjects.getObjectEntry === 'function') {
          objectEntry = scriptObjects.getObjectEntry(itemId);
        }
      } catch (err) {
        objectEntry = null;
      }
      if (!objectEntry) {
        const gameData = stateService.getGameData<Record<number, Record<string, unknown>>>('object');
        if (gameData && typeof gameData === 'object') {
          const maybeEntry = (gameData as Record<number, Record<string, unknown>>)[itemId];
          objectEntry = maybeEntry && typeof maybeEntry === 'object' ? maybeEntry : null;
        }
      }
      if (!objectEntry || !objectEntry.item) {
        return false;
      }

      const scriptEntry = objectEntry.item.scriptOnUse;
      if (!Number.isFinite(scriptEntry) || scriptEntry <= 0) {
        return false;
      }

      const itemFlags = getItemFlags();
      const flags = Number(objectEntry.item.flags) || 0;
      const applyAll = !!(flags & itemFlags.ApplyToAll);
      const consuming = !!(flags & itemFlags.Consuming);

      let targetRole = 0xFFFF;
      if (!applyAll) {
        const party = world.getParty();
        let targetMember: PartyMember | null = null;
        const targetIdx = typeof targetIndex === 'number' && Number.isFinite(targetIndex) ? targetIndex : null;
        if (targetIdx != null && targetIdx >= 0 && targetIdx < party.length) {
          targetMember = party[targetIdx] || null;
        }
        if (!targetMember) {
          targetMember = party.find((member) => member && typeof member.playerRole === 'number') || null;
        }
        if (!targetMember || typeof targetMember.playerRole !== 'number') {
          return false;
        }
        targetRole = targetMember.playerRole;
      }

      try {
        const nextScript = yield scriptSvc.runTriggerScript(scriptEntry, targetRole);
        world.mutateObjectEntry(itemId, (entry) => {
          if (entry && entry.item) {
            entry.item.scriptOnUse = nextScript;
          }
          return entry;
        });
        if (consuming && typeof scriptSvc.addItemToInventory === 'function') {
          scriptSvc.addItemToInventory(itemId, -1);
        }
        return !!scriptSvc.scriptSuccess;
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[world-service] useInventoryItem failed', err);
        }
        return false;
      }
    });
  }

  getPlayerStatusMatrix() {
    this._ensureInitialised();
    const status = stateService.getGlobal('playerStatus');
    const resolved = Array.isArray(status) ? status : [];
    updatePlayerStatusMatrix(resolved, { emitEvent: false, source: 'worldService:get' });
    return resolved;
  }

  mutatePlayerStatus(mutator: (matrix: number[][]) => number[][] | undefined) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return null;
    }
    const result = stateService.mutateGlobal('playerStatus', (status) => {
      const current = Array.isArray(status) ? status : [];
      const next = mutator(current);
      return typeof next === 'undefined' ? current : next;
    });
    updatePlayerStatusMatrix(Array.isArray(result) ? result : [], { source: 'worldService' });
    return result;
  }

  mutatePlayerStatusEntry(roleId: number, mutator: (row: number[]) => number[] | void) {
    if (typeof mutator !== 'function') {
      return null;
    }
    let result = null;
    this.mutatePlayerStatus((matrix) => {
      const row = matrix[roleId];
      if (!row) {
        return matrix;
      }
      const next = mutator(row);
      if (typeof next !== 'undefined' && next !== row) {
        matrix[roleId] = next;
        result = next;
      } else {
        result = row;
      }
      return matrix;
    });
    return result;
  }

  getPlayerStatus(roleId: number) {
    const matrix = this.getPlayerStatusMatrix();
    return matrix[roleId] || null;
  }

  setPlayerStatusStruct(struct: any) {
    return this._copyStructIntoGlobal('playerStatus', struct);
  }

  resetPlayerStatusMatrix() {
    this._ensureInitialised();
    const status = stateService.getGlobal('playerStatus') as { uint8Array?: Uint8Array } | number[][] | Record<string, number>[] | null;
    if (!status) {
      return null;
    }
    if ((status as any).uint8Array instanceof Uint8Array) {
      (status as any).uint8Array.fill(0);
      return status;
    }
    if (Array.isArray(status)) {
      for (let i = 0; i < status.length; i++) {
        const row = status[i] as any;
        if (!row) {
          continue;
        }
        if (row.uint8Array instanceof Uint8Array) {
          row.uint8Array.fill(0);
          continue;
        }
        if (Array.isArray(row)) {
          for (let j = 0; j < row.length; j++) {
            row[j] = 0;
          }
        } else if (typeof row === 'object') {
          Object.keys(row).forEach((key) => {
            row[key] = 0;
          });
        }
      }
    }
    return status;
  }

  getPoisonStatusMatrix() {
    this._ensureInitialised();
    const status = stateService.getGlobal('poisonStatus');
    return Array.isArray(status) ? status : [];
  }

  getPoisonStatusStruct() {
    this._ensureInitialised();
    return stateService.getGlobal('poisonStatus') || null;
  }

  mutatePoisonStatus(mutator: (status: PoisonRow[]) => PoisonRow[] | undefined) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return null;
    }
    return stateService.mutateGlobal('poisonStatus', (status) => {
      const current = Array.isArray(status) ? status : [];
      const result = mutator(current);
      return typeof result === 'undefined' ? current : result;
    });
  }

  resetPoisonStatusMatrix() {
    this._ensureInitialised();
    this.mutatePoisonStatus((poisonStatus) => {
      if (!poisonStatus) {
        return poisonStatus;
      }
      if ((poisonStatus as any).uint8Array instanceof Uint8Array) {
        (poisonStatus as any).uint8Array.fill(0);
        return poisonStatus;
      }
      for (let i = 0; i < poisonStatus.length; i++) {
        const row = poisonStatus[i];
        if (!row) {
          continue;
        }
        if ((row as any).uint8Array instanceof Uint8Array) {
          (row as any).uint8Array.fill(0);
          continue;
        }
        if (Array.isArray(row)) {
          for (let j = 0; j < row.length; j++) {
            const entry = row[j] as { uint8Array?: Uint8Array; poisonID?: number; poisonScript?: number } | null | undefined;
            if (!entry) {
              continue;
            }
            if (entry.uint8Array instanceof Uint8Array) {
              entry.uint8Array.fill(0);
              continue;
            }
            entry.poisonID = 0;
            entry.poisonScript = 0;
          }
        }
      }
      return poisonStatus;
    });
  }

  setPoisonStatusStruct(struct: any) {
    return this._copyStructIntoGlobal('poisonStatus', struct);
  }

  _getPlayerMagicSlots(roleId: number) {
    const roles = this.getPlayerRoles() as any;
    if (!roles || !Array.isArray(roles.magic)) {
      return [];
    }
    const result: number[] = [];
    for (let slot = 0; slot < roles.magic.length; slot++) {
      const row = roles.magic[slot];
      result.push(row ? row[roleId] || 0 : 0);
    }
    return result;
  }

  setPlayerMagicSlot(roleId: number, slotIndex: number, value: number) {
    return this.mutatePlayerRoles((roles: any) => {
      if (roles && Array.isArray(roles.magic) && roles.magic[slotIndex]) {
        roles.magic[slotIndex][roleId] = value;
      }
      return roles;
    });
  }

  findPlayerMagicSlot(roleId: number, magicId: number) {
    const slots = this._getPlayerMagicSlots(roleId);
    for (let i = 0; i < slots.length; i++) {
      if (slots[i] === magicId) {
        return i;
      }
    }
    return -1;
  }

  clearPlayerMagicSlot(roleId: number, slotIndex: number) {
    return this.setPlayerMagicSlot(roleId, slotIndex, 0);
  }

  getTrail() {
    this._ensureInitialised();
    const trail = getTrailValue([]);
    return Array.isArray(trail) ? trail : [];
  }

  getSceneId() {
    this._ensureInitialised();
    return stateService.getGlobal('numScene');
  }

  setSceneId(sceneId: number) {
    this._ensureInitialised();
    stateService.setGlobal('numScene', sceneId);
    this.syncScene();
    this.syncMapMeta();
    this.syncMapTiles();
    this.syncEventObjects();
    this.ensureCollisionState();
    return sceneId;
  }

  getSceneData() {
    const component = this.getSceneComponent();
    return component ? component.sceneRef : null;
  }

  getSceneEntry(sceneId: number) {
    this._ensureInitialised();
    if (typeof sceneId !== 'number' || sceneId <= 0) {
      sceneId = getSceneIdValue(0);
    }
    const currentId = getSceneIdValue(0);
    if (sceneId === currentId) {
      const component = this.getSceneComponent();
      return component ? component.sceneRef : null;
    }
    const store = getGameDataStore();
    const scenes = store && Array.isArray(store.scene) ? store.scene : [];
    const index = sceneId - 1;
    if (index < 0 || index >= scenes.length) {
      return null;
    }
    return scenes[index];
  }

  mutateSceneEntry(sceneId: number, mutator: (entry: any) => any) {
    this._ensureInitialised();
    if (typeof sceneId !== 'number' || typeof mutator !== 'function') {
      return null;
    }
    let result = null;
    stateService.mutateGameData('scene', (scenes) => {
      if (!Array.isArray(scenes)) {
        return scenes;
      }
      const index = sceneId - 1;
      const entry = scenes[index];
      if (!entry) {
        return scenes;
      }
      const next = mutator(entry);
      if (typeof next !== 'undefined' && next !== entry) {
        scenes[index] = next;
        result = next;
      } else {
        result = entry;
      }
      return scenes;
    });
    this.syncScene();
    return result;
  }

  setSceneTable(scenes: any[]) {
    return this._replaceGameDataTable('scene', scenes || []);
  }

  getNextSceneData() {
    const component = this.getSceneComponent();
    return component ? component.nextSceneRef : null;
  }

  getMapData() {
    const component = this.getSceneComponent();
    return component ? component.mapRef : null;
  }

  runSystems(phases: string | string[], context: Record<string, unknown> = {}) {
    if (!this.systemManager || typeof this.systemManager.runPipeline !== 'function') {
      return;
    }
    const runtime = Object.assign(
      {},
      context,
      {
        worldService: this,
        world: this,
        registry: this.registry
      }
    );
    this.systemManager.runPipeline(phases, runtime);
  }

  enqueueMoveRequest(request: Record<string, unknown>) {
    this._ensureInitialised();
    const eventIndex = typeof request === 'object' && request != null
      ? (typeof request.eventIndex === 'number'
        ? request.eventIndex
        : (typeof request.eventObjectId === 'number' ? request.eventObjectId - 1 : null))
      : null;
    if (eventIndex != null) {
      this.syncEventObjects();
    }
    const queue = this._ensureMoveQueue();
    queue.requests.push(Object.assign({}, request));
    return queue.requests.length;
  }

  drainMoveRequests() {
    const queue = this._ensureMoveQueue();
    const requests = queue.requests.slice();
    queue.requests.length = 0;
    return requests;
  }

  setMoveIntent(eventIndex: number, intent: Record<string, unknown>) {
    const entityId = this.entityMaps.eventObject.get(eventIndex);
    if (!entityId) {
      return null;
    }
    const component = this.registry.getComponent(entityId, WorldComponents.MoveIntent);
    if (component) {
      Object.assign(component, intent);
      return component;
    }
    return this.registry.addComponent(entityId, WorldComponents.MoveIntent, createMoveIntentComponent(Object.assign({ id: eventIndex }, intent)));
  }

  clearMoveIntent(eventIndex: number) {
    const entityId = this.entityMaps.eventObject.get(eventIndex);
    if (!entityId) {
      return;
    }
    if (typeof this.registry.removeComponent === 'function') {
      this.registry.removeComponent(entityId, WorldComponents.MoveIntent);
    }
  }

  getMoveIntent(eventIndex: number) {
    const entityId = this.entityMaps.eventObject.get(eventIndex);
    if (!entityId) {
      return null;
    }
    return this.registry.getComponent(entityId, WorldComponents.MoveIntent);
  }

  setCollisionState(payload: any) {
    const component = this._ensureCollisionStateEntity();
    const directState = payload && typeof payload.isBlocked === 'function' ? payload : null;
    const resolvedState = directState || (payload && payload.state) || null;
    const resolvedMapId = typeof payload.mapId === 'number'
      ? payload.mapId
      : (resolvedState && typeof resolvedState.mapId === 'number' ? resolvedState.mapId : component.mapId);
    component.mapId = resolvedMapId;
    component.state = resolvedState;
    component.version = (typeof component.version === 'number' ? component.version : 0) + 1;
    this._collisionState = component.state;
    updateCollisionStateValue(this._collisionState, { source: 'worldService:setCollisionState' });
  }

  getCollisionState() {
    return this._collisionState;
  }

  ensureCollisionState(context = {}) {
    this._ensureInitialised();
    const mapMeta = this.getMapMetaComponent();
    const mapTile = this.getMapTileComponent();
    const expectedMapId = mapMeta && typeof mapMeta.mapId === 'number'
      ? mapMeta.mapId
      : (mapTile && typeof mapTile.mapId === 'number' ? mapTile.mapId : null);
    const state = this._collisionState;
    const currentMapId = state && typeof state.mapId === 'number' ? state.mapId : null;
    if (!state || (expectedMapId != null && currentMapId !== expectedMapId)) {
      const runtimeContext = Object.assign(
        {},
        context,
        {
          sceneEventObjects: getEventObjectsValue([])
        }
      );
      this.runSystems('collision', runtimeContext);
    }
    updateCollisionStateValue(this._collisionState, { emitEvent: false, source: 'worldService:ensureCollisionState' });
    return this._collisionState;
  }

  isPositionBlocked(position: { x: number; y: number; layer?: number }, options: Record<string, unknown> = {}, context?: Record<string, unknown>) {
    const state = this.ensureCollisionState(context || {});
    if (!state || typeof state.isBlocked !== 'function') {
      return null;
    }
    return state.isBlocked(position, options);
  }

  mutatePartyMember(index: number, mutator: (member: PartyMember) => PartyMember | null | void) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return null;
    }
    const party = stateService.getGlobal('party') as PartyMember[] | null || [];
    const member = party[index];
    if (!member) {
      return null;
    }
    const result = mutator(member) ?? member;
    this.syncPartyMembers();
    return result;
  }

  mutateEventObject(id: number, mutator: (entry: Record<string, unknown>) => Record<string, unknown> | void) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return null;
    }
    const gameData = getGameDataStore();
    if (!gameData || !Array.isArray(gameData.eventObject)) {
      return null;
    }
    const target = gameData.eventObject[id];
    if (!target) {
      return null;
    }
    const result = mutator(target) ?? target;
    if (result !== target) {
      gameData.eventObject[id] = result;
    }
    const updatedEntry = result;
    this._syncEventObjectEntity(id, updatedEntry, stateService.getGlobal('numScene'));
    this._collisionState = null;
    this._eventObjectsVersion = (typeof this._eventObjectsVersion === 'number' ? this._eventObjectsVersion : 0) + 1;
    this.fire('eventObjectMutated', { id, sceneId: stateService.getGlobal('numScene'), state: updatedEntry });
    updateEventObjectsValue(this.getEventObjectsInCurrentScene(), { source: 'worldService:mutateEventObject' });
    updateCollisionStateValue(null, { source: 'worldService:mutateEventObject' });
    return updatedEntry;
  }

  mutateEventObjectById(eventId: number, mutator: (entry: Record<string, unknown>) => Record<string, unknown> | void) {
    if (!Number.isFinite(eventId)) {
      return null;
    }
    const index = Math.trunc(eventId) - 1;
    if (index < 0) {
      return null;
    }
    return this.mutateEventObject(index, mutator);
  }

  mutateEventObjects(mutator: (objects: Record<string, unknown>[]) => Record<string, unknown>[] | null | undefined) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return null;
    }
    let snapshot = null;
    stateService.mutateGameData('eventObject', (eventObjects) => {
      if (!eventObjects) {
        return eventObjects;
      }
      const result = mutator(eventObjects as Record<string, unknown>[]);
      snapshot = typeof result !== 'undefined' ? result : eventObjects;
      return snapshot;
    });
    if (snapshot) {
      this.syncEventObjects();
    }
    return snapshot;
  }

  setEventObjectTable(eventObjects: any[]) {
    const resolved = this._replaceGameDataTable('eventObject', eventObjects || []);
    this.syncEventObjects();
    return resolved;
  }

  getSceneEventObjectRange() {
    this._ensureInitialised();
    const sceneRef = this.getSceneData();
    const nextSceneRef = this.getNextSceneData();
    const store = getGameDataStore();
    const eventObjects = store && Array.isArray(store.eventObject) ? store.eventObject : [];
    const start = sceneRef && typeof sceneRef.eventObjectIndex === 'number'
      ? sceneRef.eventObjectIndex
      : 0;
    const end = nextSceneRef && typeof nextSceneRef.eventObjectIndex === 'number'
      ? nextSceneRef.eventObjectIndex
      : eventObjects.length;
    return {
      start,
      end,
      count: Math.max(0, end - start)
    };
  }

  getEventObjectsInCurrentScene() {
    this._ensureInitialised();
    if (
      Array.isArray(this._eventObjectsCache) &&
      this._eventObjectsCacheVersion === this._eventObjectsVersion
    ) {
      return this._eventObjectsCache;
    }
    const range = this.getSceneEventObjectRange();
    const store = getGameDataStore();
    const eventObjects = store && Array.isArray(store.eventObject) ? store.eventObject : [];
    const results = [];
    for (let idx = range.start; idx < range.end && idx < eventObjects.length; idx++) {
      const state = eventObjects[idx];
      if (!state) {
        continue;
      }
      results.push({
        index: idx,
        id: idx + 1,
        state
      });
    }
    this._eventObjectsCache = results;
    this._eventObjectsCacheVersion = this._eventObjectsVersion;
    return this._eventObjectsCache;
  }

  getAllEventObjects() {
    this._ensureInitialised();
    const current = getEventObjectsValue([]);
    if (Array.isArray(current) && current.length) {
      return current;
    }
    const store = getGameDataStore();
    const eventObjects = store && Array.isArray(store.eventObject) ? store.eventObject : [];
    return eventObjects.map((state, idx) => ({
      index: idx,
      id: idx + 1,
      state
    })).filter((entry) => entry.state);
  }

  mutateObjectEntry(id: number, mutator: (entry: any) => any) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return null;
    }
    let updatedEntry = null;
    stateService.mutateGameData('object', (objects: any[] | null | undefined) => {
      if (!Array.isArray(objects)) {
        return objects || null;
      }
      const entry = objects[id];
      if (!entry) {
        return objects;
      }
      const result = mutator(entry);
      if (typeof result !== 'undefined' && result !== entry) {
        objects[id] = result;
        updatedEntry = result;
      } else {
        updatedEntry = entry;
      }
      return objects;
    });
    if (updatedEntry) {
      const store = getGameDataStore();
      updateObjectTableValue(store && Array.isArray(store.object) ? store.object : []);
    }
    return updatedEntry;
  }

  setObjectScriptValue(objectId: number, dataIndex: number, value: unknown) {
    if (typeof objectId !== 'number' || objectId < 0) {
      return null;
    }
    const index = Number.isFinite(dataIndex) ? Math.trunc(dataIndex) : null;
    if (index === null || index < 0) {
      return null;
    }
    return this.mutateObjectEntry(objectId, (entry) => {
      if (!entry || !entry.data) {
        return entry;
      }
      const currentData = entry.data;
      let nextData;
      if (Array.isArray(currentData)) {
        nextData = currentData.slice();
      } else if (ArrayBuffer.isView(currentData)) {
        const view = currentData as ArrayBufferView;
        nextData = new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice();
      } else if (typeof currentData === 'object') {
        nextData = { ...currentData };
      } else {
        return entry;
      }

      if (typeof (nextData as any).length === 'number') {
        if (index >= (nextData as any).length) {
          return entry;
        }
        (nextData as any)[index] = value;
      } else {
        (nextData as any)[index] = value;
      }

      return nextData === currentData ? entry : { ...entry, data: nextData };
    });
  }

  mutateObjects(mutator: (objects: any[]) => any[] | null) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return null;
    }
    let snapshot = null;
    stateService.mutateGameData('object', (objects: any[] | null | undefined) => {
      if (!objects) {
        return objects || null;
      }
      const result = mutator(objects);
      snapshot = typeof result !== 'undefined' ? result : objects;
      return snapshot;
    });
    if (snapshot) {
      updateObjectTableValue(snapshot);
    }
    return snapshot;
  }

  setObjectTable(objects: any[]) {
    const resolved = this._replaceGameDataTable('object', objects || []);
    updateObjectTableValue(resolved || []);
    return resolved;
  }

  mutateMagicTable(mutator: (magicData: any) => any) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return null;
    }
    let snapshot = null;
    stateService.mutateGameData('magic', (magicData) => {
      if (!magicData) {
        return magicData;
      }
      const result = mutator(magicData);
      snapshot = typeof result !== 'undefined' ? result : magicData;
      return snapshot;
    });
    if (snapshot) {
      updateMagicTableValue(snapshot);
    }
    return snapshot;
  }

  setMagicTable(magicTable: any[]) {
    const resolved = this._replaceGameDataTable('magic', magicTable || []);
    updateMagicTableValue(resolved || []);
    return resolved;
  }

  getPlayerRoles(): PlayerRoles | null {
    this._ensureInitialised();
    const store = getGameDataStore();
    const roles = store && (store.playerRoles as PlayerRoles | null);
    updatePlayerRolesValue(roles);
    return roles;
  }

  getPlayerBattleSpriteNum(roleId: number) {
    const roles = this.getPlayerRoles();
    if (roles && roles.spriteNumInBattle) {
      return roles.spriteNumInBattle[roleId] || 0;
    }
    return 0;
  }

  _getPlayerRoleArray(field: string) {
    const roles = this.getPlayerRoles();
    if (!roles) {
      return null;
    }
    const value = (roles as Record<string, unknown>)[field];
    return Array.isArray(value) ? value as number[] : null;
  }

  _getPlayerRoleArrayValue(field: string, roleId: number, fallback = 0) {
    const arr = this._getPlayerRoleArray(field);
    if (!arr) {
      return fallback;
    }
    const value = arr[roleId];
    return typeof value === 'undefined' ? fallback : value;
  }

  _setPlayerRoleArrayValue(field: string, roleId: number, value: number) {
    return this.mutatePlayerRoles((roles) => {
      if (roles) {
        const arr = this._getPlayerRoleArray(field);
        if (arr) {
          arr[roleId] = value;
        }
      }
      return roles;
    });
  }

  setLevelUpMagicTable(levelUpMagic: any[]) {
    const resolved = this._replaceGameDataTable('levelUpMagic', levelUpMagic || []);
    updateLevelUpMagicTableValue(resolved || []);
    return resolved;
  }

  setStoreTable(stores: any[]) {
    const resolved = this._replaceGameDataTable('store', stores || []);
    updateStoreTableValue(resolved || []);
    return resolved;
  }

  setEnemyTable(enemies: any[]) {
    const resolved = this._replaceGameDataTable('enemy', enemies || []);
    updateEnemyTableValue(resolved || []);
    return resolved;
  }

  copyEnemyTemplate(enemyId: number) {
    this._ensureInitialised();
    const store = getGameDataStore();
    const enemyTable = store && Array.isArray(store.enemy) ? store.enemy : [];
    const entry = typeof enemyId === 'number' ? enemyTable[enemyId] : null;
    if (!entry) {
      return null;
    }
    if (typeof entry.copy === 'function') {
      return entry.copy();
    }
    try {
      return JSON.parse(JSON.stringify(entry));
    } catch (err) {
      return { ...entry };
    }
  }

  setEnemyTeamTable(enemyTeams: any[]) {
    const resolved = this._replaceGameDataTable('enemyTeam', enemyTeams || []);
    updateEnemyTeamValue(resolved || [], { source: 'worldService:setEnemyTeamTable' });
    return resolved;
  }

  getEnemyFormationPosition(index: number, maxEnemyIndex: number) {
    this._ensureInitialised();
    const store = getGameDataStore();
    const enemyPos = store && (store as any).enemyPos && (store as any).enemyPos.pos ? (store as any).enemyPos.pos : null;
    if (!enemyPos || !enemyPos[index]) {
      return null;
    }
    return enemyPos[index][maxEnemyIndex] || null;
  }

  setEnemyPositionTable(enemyPositions: any) {
    const resolved = this._replaceGameDataTable('enemyPos', enemyPositions || null);
    updateEnemyPositionValue(resolved || null, { source: 'worldService:setEnemyPositionTable' });
    return resolved;
  }

  setBattleFieldTable(battleFields: any) {
    const resolved = this._replaceGameDataTable('battleField', battleFields || []);
    updateBattleFieldValue(resolved || [], { source: 'worldService:setBattleFieldTable' });
    return resolved;
  }

  setBattleEffectIndexTable(battleEffectIndex: any) {
    const resolved = this._replaceGameDataTable('battleEffectIndex', battleEffectIndex || []);
    updateBattleEffectTableValue(resolved || []);
    return resolved;
  }

  setPlayerRoles(playerRoles: PlayerRoles | null) {
    const resolved = this._replaceGameDataTable('playerRoles', playerRoles || null);
    updatePlayerRolesValue(resolved || null);
    return resolved;
  }

  mutatePlayerRoles(mutator: (roles: PlayerRoles | null) => PlayerRoles | null, options: UpdateOptions = {}) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return null;
    }
    let snapshot: PlayerRoles | null | undefined = null;
    stateService.mutateGameData('playerRoles', (playerRoles) => {
      const result = mutator((playerRoles as PlayerRoles | null) || null);
      snapshot = typeof result !== 'undefined' ? result : (playerRoles as PlayerRoles | null | undefined);
      return snapshot as PlayerRoles | null | undefined;
    });
    if (snapshot) {
      const updateOptions = {
        source: 'worldService:mutatePlayerRoles',
        ...options
      };
      if (!updateOptions.source) {
        updateOptions.source = 'worldService:mutatePlayerRoles';
      }
      updatePlayerRolesValue(snapshot as PlayerRoles);
    }
    return snapshot || null;
  }

  setPlayerHP(roleId: number, value: ValueOrUpdater<number>) {
    return this.mutatePlayerRoles((roles: any) => {
      if (roles && roles.HP) {
        const current = roles.HP[roleId] || 0;
        roles.HP[roleId] = typeof value === 'function' ? (value as (prev: number) => number)(current) : value;
      }
      return roles;
    }, { source: 'worldService:setPlayerHP' });
  }

  adjustPlayerHP(roleId: number, delta: number) {
    const adjustment = Number.isFinite(delta) ? delta : 0;
    const current = this._getPlayerRoleArrayValue('HP', roleId, 0);
    return this.setPlayerHP(roleId, current + adjustment);
  }

  setPlayerMP(roleId: number, value: ValueOrUpdater<number>) {
    return this.mutatePlayerRoles((roles: any) => {
      if (roles && roles.MP) {
        const current = roles.MP[roleId] || 0;
        roles.MP[roleId] = typeof value === 'function' ? (value as (prev: number) => number)(current) : value;
      }
      return roles;
    }, { source: 'worldService:setPlayerMP' });
  }

  adjustPlayerMP(roleId: number, delta: number) {
    const adjustment = Number.isFinite(delta) ? delta : 0;
    const current = this._getPlayerRoleArrayValue('MP', roleId, 0);
    return this.setPlayerMP(roleId, current + adjustment);
  }

  setPlayerMaxHP(roleId: number, value: number) {
    return this.mutatePlayerRoles((roles: any) => {
      if (roles && roles.maxHP) {
        roles.maxHP[roleId] = value;
      }
      return roles;
    });
  }
  setPlayerMaxMP(roleId: number, value: number) {
    return this.mutatePlayerRoles((roles: any) => {
      if (roles && roles.maxMP) {
        roles.maxMP[roleId] = value;
      }
      return roles;
    });
  }
  setPlayerLevel(roleId: number, value: ValueOrUpdater<number>) {
    return this.mutatePlayerRoles((roles: any) => {
      if (roles && roles.level) {
        const current = roles.level[roleId] || 0;
        roles.level[roleId] = typeof value === 'function' ? (value as (prev: number) => number)(current) : value;
      }
      return roles;
    });
  }
  setPlayerAttackStrength(roleId: number, value: ValueOrUpdater<number>) {
    return this.mutatePlayerRoles((roles: any) => {
      if (roles && roles.attackStrength) {
        const current = roles.attackStrength[roleId] || 0;
        roles.attackStrength[roleId] = typeof value === 'function' ? (value as (prev: number) => number)(current) : value;
      }
      return roles;
    });
  }
  setPlayerMagicStrength(roleId: number, value: ValueOrUpdater<number>) {
    return this.mutatePlayerRoles((roles: any) => {
      if (roles && roles.magicStrength) {
        const current = roles.magicStrength[roleId] || 0;
        roles.magicStrength[roleId] = typeof value === 'function' ? (value as (prev: number) => number)(current) : value;
      }
      return roles;
    });
  }

  setPlayerDefense(roleId: number, value: ValueOrUpdater<number>) {
    return this.mutatePlayerRoles((roles: any) => {
      if (roles && roles.defense) {
        const current = roles.defense[roleId] || 0;
        roles.defense[roleId] = typeof value === 'function' ? (value as (prev: number) => number)(current) : value;
      }
      return roles;
    });
  }

  setPlayerDexterity(roleId: number, value: ValueOrUpdater<number>) {
    return this.mutatePlayerRoles((roles: any) => {
      if (roles && roles.dexterity) {
        const current = roles.dexterity[roleId] || 0;
        roles.dexterity[roleId] = typeof value === 'function' ? (value as (prev: number) => number)(current) : value;
      }
      return roles;
    });
  }

  setPlayerFleeRate(roleId: number, value: ValueOrUpdater<number>) {
    return this.mutatePlayerRoles((roles: any) => {
      if (roles && roles.fleeRate) {
        const current = roles.fleeRate[roleId] || 0;
        roles.fleeRate[roleId] = typeof value === 'function' ? (value as (prev: number) => number)(current) : value;
      }
      return roles;
    });
  }

  setPlayerEquipment(slot: number, roleId: number, value: number) {
    return this.mutatePlayerRoles((roles: any) => {
      if (roles && Array.isArray(roles.equipment) && roles.equipment[slot]) {
        roles.equipment[slot][roleId] = value;
      }
      return roles;
    });
  }

  _getEquipmentEffects(): EquipmentEffectTable | null {
    const cached = equipmentEffectSignal.value;
    if (Array.isArray(cached) && cached.length > 0) {
      return cached as EquipmentEffectTable;
    }
    const store = getGlobalStore();
    const effects = store && store.equipmentEffect ? store.equipmentEffect : null;
    updateEquipmentEffectValue(effects || []);
    return effects as EquipmentEffectTable | null;
  }

  getEquipmentEffects() {
    this._ensureInitialised();
    return this._getEquipmentEffects();
  }

  getEquipmentEffect(part: number) {
    this._ensureInitialised();
    if (typeof part !== 'number') {
      return null;
    }
    const effects = this._getEquipmentEffects();
    if (!effects) {
      return null;
    }
    if (part < 0 || part >= effects.length) {
      return null;
    }
    return effects[part] || null;
  }

  resetEquipmentEffects() {
    this._ensureInitialised();
    const effects = this._getEquipmentEffects();
    if (!effects) {
      return;
    }
    effects.forEach((entry) => {
      if (isUint8Entry(entry)) {
        entry.uint8Array.fill(0);
      }
    });
    updateEquipmentEffectValue(Array.isArray(effects) ? effects.slice() : (effects || []));
  }

  mutateEquipmentEffect(part: number, mutator: (entry: EquipmentEffectEntry) => EquipmentEffectEntry | void) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return null;
    }
    const effects = this._getEquipmentEffects();
    if (!effects || typeof part !== 'number' || part < 0 || part >= effects.length) {
      return null;
    }
    const entry = effects[part];
    if (!entry) {
      return null;
    }
    let result: EquipmentEffectEntry | void = entry;
    const mutated = mutator(entry);
    if (typeof mutated !== 'undefined' && mutated !== entry) {
      effects[part] = mutated;
      result = mutated;
    }
    updateEquipmentEffectValue(Array.isArray(effects) ? effects.slice() : (effects || []));
    return typeof result !== 'undefined' ? result : entry;
  }

  _mutateEquipmentEffectWord(
    part: number,
    fieldIndex: number,
    roleId: number,
    updater: number | ((current: number) => number)
  ) {
    if (typeof part !== 'number' || typeof fieldIndex !== 'number' || typeof roleId !== 'number' || MAX_PLAYER_ROLES <= 0) {
      return null;
    }
    const effect = this.getEquipmentEffect(part);
    if (!effect || !isUint8Entry(effect)) {
      return null;
    }
    const buffer = effect.uint8Array;
    const offset = (fieldIndex * MAX_PLAYER_ROLES + roleId) * 2;
    if (offset < 0 || offset + 2 > buffer.length) {
      return null;
    }
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const current = view.getUint16(offset, false);
    const nextValue = typeof updater === 'function' ? updater(current) : updater;
    if (typeof nextValue === 'number' && !Number.isNaN(nextValue)) {
      const normalized = toUnsignedWord(nextValue);
      view.setUint16(offset, normalized, false);
      return normalized;
    }
    return current;
  }

  setEquipmentEffectWord(part: number, fieldIndex: number, roleId: number, value: number) {
    const result = this._mutateEquipmentEffectWord(part, fieldIndex, roleId, value);
    const effects = this._getEquipmentEffects();
    updateEquipmentEffectValue(Array.isArray(effects) ? effects.slice() : (effects || []));
    return result;
  }

  adjustEquipmentEffectWord(part: number, fieldIndex: number, roleId: number, delta: number) {
    const result = this._mutateEquipmentEffectWord(part, fieldIndex, roleId, (current) => {
      const signedCurrent = toSignedWord(current);
      const signedDelta = toSignedWord(delta);
      const next = signedCurrent + signedDelta;
      return toUnsignedWord(next);
    });
    const effects = this._getEquipmentEffects();
    updateEquipmentEffectValue(Array.isArray(effects) ? effects.slice() : (effects || []));
    return result;
  }

  clearEquipmentEffect(part: number, roleId: number) {
    if (MAX_PLAYER_ROLES <= 0) {
      return;
    }
    const effect = this.getEquipmentEffect(part);
    if (!effect || !isUint8Entry(effect)) {
      return;
    }
    const buffer = effect.uint8Array;
    const totalWords = buffer.length / 2;
    if (totalWords <= 0) {
      return;
    }
    const fields = Math.floor(totalWords / MAX_PLAYER_ROLES);
    for (let field = 0; field < fields; field++) {
      this._mutateEquipmentEffectWord(part, field, roleId, 0);
    }
    const effects = this._getEquipmentEffects();
    updateEquipmentEffectValue(Array.isArray(effects) ? effects.slice() : (effects || []));
  }

  adjustPlayerMaxHP(roleId: number, delta: number) {
    const current = this._getPlayerRoleArrayValue('maxHP', roleId, 0);
    return this.setPlayerMaxHP(roleId, current + delta);
  }

  adjustPlayerMaxMP(roleId: number, delta: number) {
    const current = this._getPlayerRoleArrayValue('maxMP', roleId, 0);
    return this.setPlayerMaxMP(roleId, current + delta);
  }

  adjustPlayerAttackStrength(roleId: number, delta: number) {
    const current = this._getPlayerRoleArrayValue('attackStrength', roleId, 0);
    return this.setPlayerAttackStrength(roleId, current + delta);
  }

  adjustPlayerMagicStrength(roleId: number, delta: number) {
    const current = this._getPlayerRoleArrayValue('magicStrength', roleId, 0);
    return this.setPlayerMagicStrength(roleId, current + delta);
  }

  adjustPlayerDefense(roleId: number, delta: number) {
    const current = this._getPlayerRoleArrayValue('defense', roleId, 0);
    return this.setPlayerDefense(roleId, current + delta);
  }

  adjustPlayerDexterity(roleId: number, delta: number) {
    const current = this._getPlayerRoleArrayValue('dexterity', roleId, 0);
    return this.setPlayerDexterity(roleId, current + delta);
  }

  adjustPlayerFleeRate(roleId: number, delta: number) {
    const current = this._getPlayerRoleArrayValue('fleeRate', roleId, 0);
    return this.setPlayerFleeRate(roleId, current + delta);
  }

  getPlayerRoleWord(fieldIndex: number, roleId: number) {
    if (typeof fieldIndex !== 'number' || typeof roleId !== 'number' || MAX_PLAYER_ROLES <= 0) {
      return null;
    }
    const store = getGameDataStore();
    const playerRoles = store && (store.playerRoles as PlayerRolesBuffer | null);
    if (!playerRoles || !playerRoles.uint8Array) {
      return null;
    }
    const buffer = playerRoles.uint8Array;
    const offset = (fieldIndex * MAX_PLAYER_ROLES + roleId) * 2;
    if (offset < 0 || offset + 2 > buffer.byteLength) {
      return null;
    }
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    return view.getUint16(offset, false);
  }

  _mutatePlayerRoleWord(fieldIndex: number, roleId: number, updater: number | ((current: number) => number)) {
    if (typeof fieldIndex !== 'number' || typeof roleId !== 'number' || MAX_PLAYER_ROLES <= 0) {
      return null;
    }
    let result = null;
    stateService.mutateGameData('playerRoles', (playerRoles?: PlayerRolesBuffer | null) => {
      if (!playerRoles || !playerRoles.uint8Array) {
        return playerRoles as any;
      }
      const buffer = playerRoles.uint8Array;
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const offset = (fieldIndex * MAX_PLAYER_ROLES + roleId) * 2;
      if (offset < 0 || offset + 2 > buffer.byteLength) {
        return playerRoles as any;
      }
      const current = view.getUint16(offset, false);
      const nextValue = typeof updater === 'function' ? updater(current) : updater;
      if (typeof nextValue === 'number' && !Number.isNaN(nextValue)) {
        const normalized = toUnsignedWord(nextValue);
        view.setUint16(offset, normalized, false);
        result = normalized;
      }
      return playerRoles as any;
    });
    return result;
  }

  adjustPlayerRoleWord(fieldIndex: number, roleId: number, delta: number) {
    return this._mutatePlayerRoleWord(fieldIndex, roleId, (current) => {
      const signedCurrent = toSignedWord(current);
      const signedDelta = toSignedWord(delta);
      const next = signedCurrent + signedDelta;
      return toUnsignedWord(next);
    });
  }

  setPlayerRoleWord(fieldIndex: number, roleId: number, value: number) {
    return this._mutatePlayerRoleWord(fieldIndex, roleId, value);
  }

  getExpState() {
    this._ensureInitialised();
    const expState = stateService.getGlobal('exp');
    updateExpStateValue(expState || null);
    return expState;
  }

  mutateExpState(mutator: (exp: any) => any) {
    this._ensureInitialised();
    const result = stateService.mutateGlobal('exp', (exp) => {
      if (exp && typeof mutator === 'function') {
        mutator(exp);
      }
      return exp;
    });
    updateExpStateValue(result || null);
    return result;
  }

  setExpStruct(struct: any) {
    const resolved = this._copyStructIntoGlobal('exp', struct);
    updateExpStateValue(resolved || null);
    return resolved;
  }

  getLevelUpExp(level: number) {
    this._ensureInitialised();
    const table = getLevelUpExpTableValue([]);
    if (typeof level !== 'number') {
      return 0;
    }
    if (level < 0 || level >= table.length) {
      return table[level] || 0;
    }
    return table[level] || 0;
  }

  setLevelUpExpTable(levelUpExp: number[]) {
    const resolved = this._replaceGameDataTable('levelUpExp', levelUpExp || []);
    updateLevelUpExpTableValue(resolved || []);
    return resolved;
  }

  getPartyDirection() {
    this._ensureInitialised();
    const resolved = getPartyDirectionValue(DEFAULT_PARTY_DIRECTION);
    const direction = typeof resolved === 'number' ? resolved : DEFAULT_PARTY_DIRECTION;
    stateService.setGlobal('partyDirection', direction);
    return direction;
  }

  setPartyDirection(value: number) {
    this._ensureInitialised();
    const resolved = typeof value === 'number' ? value : DEFAULT_PARTY_DIRECTION;
    stateService.setGlobal('partyDirection', resolved);
    updatePartyDirectionValue(resolved, { source: 'worldService:setPartyDirection' });
    return resolved;
  }

  getFollowerCount() {
    this._ensureInitialised();
    const value = getFollowerCountValue(0);
    const resolved = Number.isFinite(value) ? Math.max(0, value | 0) : 0;
    stateService.setGlobal('numFollower', resolved);
    updateFollowerCountSliceValue(resolved, { emitEvent: false, source: 'worldService:getFollowerCount' });
    return resolved;
  }

  setFollowerCount(value: number) {
    this._ensureInitialised();
    const resolved = Number.isFinite(value) ? Math.max(0, value | 0) : 0;
    stateService.setGlobal('numFollower', resolved);
    updateFollowerCountSliceValue(resolved, { source: 'worldService:setFollowerCount' });
    return resolved;
  }

  getScreenWave() {
    this._ensureInitialised();
    const value = getScreenWaveValue(0);
    const resolved = Number.isFinite(value) ? Math.trunc(value) : 0;
    stateService.setGlobal('screenWave', resolved);
    updateScreenWaveValue(resolved, { emitEvent: false, source: 'worldService:getScreenWave' });
    return resolved;
  }

  setScreenWave(value: number) {
    this._ensureInitialised();
    const resolved = Number.isFinite(value) ? Math.trunc(value) : getScreenWaveValue(0);
    stateService.setGlobal('screenWave', resolved);
    updateScreenWaveValue(resolved, { source: 'worldService:setScreenWave' });
    return resolved;
  }

  adjustScreenWave(delta: number) {
    this._ensureInitialised();
    const current = getScreenWaveValue(0);
    const adjustment = Number.isFinite(delta) ? delta : 0;
    const resolved = Math.trunc((Number.isFinite(current) ? current : 0) + adjustment);
    stateService.setGlobal('screenWave', resolved);
    updateScreenWaveValue(resolved, { source: 'worldService:adjustScreenWave' });
    return resolved;
  }

  getWaveProgression() {
    this._ensureInitialised();
    const value = getWaveProgressionValue(0);
    const resolved = Number.isFinite(value) ? Math.trunc(value) : 0;
    stateService.setGlobal('waveProgression', resolved);
    updateWaveProgressionValue(resolved, { emitEvent: false, source: 'worldService:getWaveProgression' });
    return resolved;
  }

  setWaveProgression(value: number) {
    this._ensureInitialised();
    const resolved = Number.isFinite(value) ? Math.trunc(value) : getWaveProgressionValue(0);
    stateService.setGlobal('waveProgression', resolved);
    updateWaveProgressionValue(resolved, { source: 'worldService:setWaveProgression' });
    return resolved;
  }

  getNeedToFadeIn() {
    this._ensureInitialised();
    const resolved = !!getNeedToFadeInValue(false);
    stateService.setGlobal('needToFadeIn', resolved);
    updateNeedToFadeInValue(resolved, { emitEvent: false, source: 'worldService:getNeedToFadeIn' });
    return resolved;
  }

  setNeedToFadeIn(value: boolean) {
    this._ensureInitialised();
    const resolved = !!value;
    stateService.setGlobal('needToFadeIn', resolved);
    updateNeedToFadeInValue(resolved, { source: 'worldService:setNeedToFadeIn' });
    return resolved;
  }

  getPaletteId() {
    this._ensureInitialised();
    const value = getPaletteIdValue(0);
    const resolved = Number.isFinite(value) ? Math.trunc(value) : 0;
    stateService.setGlobal('numPalette', resolved);
    updatePaletteIdValue(resolved, { emitEvent: false, source: 'worldService:getPaletteId' });
    return resolved;
  }

  setPaletteId(value: number) {
    this._ensureInitialised();
    const resolved = Number.isFinite(value) ? Math.trunc(value) : getPaletteIdValue(0);
    stateService.setGlobal('numPalette', resolved);
    updatePaletteIdValue(resolved, { source: 'worldService:setPaletteId' });
    return resolved;
  }

  getNightPaletteFlag() {
    this._ensureInitialised();
    const resolved = !!getNightPaletteValue(false);
    stateService.setGlobal('nightPalette', resolved);
    updateNightPaletteValue(resolved, { emitEvent: false, source: 'worldService:getNightPalette' });
    return resolved;
  }

  setNightPaletteFlag(value: boolean) {
    this._ensureInitialised();
    const resolved = !!value;
    stateService.setGlobal('nightPalette', resolved);
    updateNightPaletteValue(resolved, { source: 'worldService:setNightPalette' });
    return resolved;
  }

  getLayer() {
    this._ensureInitialised();
    const value = getLayerValue(0);
    const resolved = Number.isFinite(value) ? Math.trunc(value) : 0;
    stateService.setGlobal('layer', resolved);
    updateLayerValue(resolved, { emitEvent: false, source: 'worldService:getLayer' });
    return resolved;
  }

  setLayer(value: number) {
    this._ensureInitialised();
    const resolved = Number.isFinite(value) ? Math.trunc(value) : getLayerValue(0);
    stateService.setGlobal('layer', resolved);
    updateLayerValue(resolved, { source: 'worldService:setLayer' });
    return resolved;
  }

  setCash(value: number) {
    this._ensureInitialised();
    const resolved = Number.isFinite(value) ? Math.trunc(value) : 0;
    stateService.setGlobal('cash', resolved);
    updateCashValue(resolved, { source: 'worldService' });
    return resolved;
  }

  adjustCash(delta: number) {
    this._ensureInitialised();
    const adjustment = Number.isFinite(delta) ? delta : 0;
    let nextValue = null;
    stateService.mutateGlobal('cash', (cash) => {
      const current = typeof cash === 'number' ? cash : 0;
      const next = Math.trunc(current + adjustment);
      nextValue = next;
      return next;
    });
    updateCashValue(typeof nextValue === 'number' ? nextValue : 0, { source: 'worldService' });
    return nextValue;
  }

  _getNumberGlobal(key: string, fallback = 0) {
    this._ensureInitialised();
    const value = stateService.getGlobal(key);
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  _setNumberGlobal(key: string, value: number, fallback = 0) {
    this._ensureInitialised();
    const resolved = Number.isFinite(value) ? Math.trunc(value) : fallback;
    stateService.setGlobal(key, resolved);
    return resolved;
  }

  _adjustNumberGlobal(key: string, delta: number, fallback = 0) {
    this._ensureInitialised();
    const adjustment = Number.isFinite(delta) ? delta : 0;
    let nextValue = fallback;
    stateService.mutateGlobal(key, (current) => {
      const currentValue = typeof current === 'number' && Number.isFinite(current) ? current : fallback;
      nextValue = Math.trunc(currentValue + adjustment);
      return nextValue;
    });
    return nextValue;
  }

  _getBooleanGlobal(key: string, fallback = false) {
    this._ensureInitialised();
    const value = stateService.getGlobal(key);
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return fallback;
  }

  _setBooleanGlobal(key: string, value: boolean) {
    this._ensureInitialised();
    const resolved = !!value;
    stateService.setGlobal(key, resolved);
    return resolved;
  }

  _getValueGlobal(key: string, fallback: unknown = null) {
    this._ensureInitialised();
    const value = stateService.getGlobal(key);
    return typeof value === 'undefined' ? fallback : value;
  }

  _setValueGlobal(key: string, value: unknown) {
    this._ensureInitialised();
    stateService.setGlobal(key, value);
    return value;
  }

  setObjectDescTable(value: unknown) {
    const resolved = this._setValueGlobal('objectDesc', value);
    const nextDesc = typeof resolved === 'undefined' ? null : (resolved as any);
    updateObjectDescValue(nextDesc as any);
    return resolved;
  }

  getInventoryMenuIndex() {
    return getInventoryMenuIndexValue(this._getNumberGlobal('curInvMenuItem', 0));
  }

  setInventoryMenuIndex(value: number) {
    const resolved = this._setNumberGlobal('curInvMenuItem', value, 0);
    updateInventoryMenuIndex(resolved, { source: 'worldService' });
    return resolved;
  }

  getSystemMenuIndex() {
    return getSystemMenuIndexValue(this._getNumberGlobal('curSystemMenuItem', 0));
  }

  setSystemMenuIndex(value: number) {
    const resolved = this._setNumberGlobal('curSystemMenuItem', value, 0);
    updateSystemMenuIndex(resolved, { source: 'worldService' });
    return resolved;
  }

  getMainMenuIndex() {
    return getMainMenuIndexValue(this._getNumberGlobal('curMainMenuItem', 0));
  }

  setMainMenuIndex(value: number) {
    const resolved = this._setNumberGlobal('curMainMenuItem', value, 0);
    updateMainMenuIndex(resolved, { source: 'worldService' });
    return resolved;
  }

  getLastEventObjectId() {
    return this._getNumberGlobal('lastEventObjectId', 0);
  }

  setLastEventObjectId(value: number) {
    return this._setNumberGlobal('lastEventObjectId', value, 0);
  }

  getNoMusicFlag() {
    return getNoMusicFlagValue(this._getBooleanGlobal('noMusic', false));
  }

  setNoMusicFlag(value: boolean) {
    const resolved = this._setBooleanGlobal('noMusic', value);
    updateNoMusicFlag(resolved, { source: 'worldService' });
    return resolved;
  }

  getNoSoundFlag() {
    return getNoSoundFlagValue(this._getBooleanGlobal('noSound', false));
  }

  setNoSoundFlag(value: boolean) {
    const resolved = this._setBooleanGlobal('noSound', value);
    updateNoSoundFlag(resolved, { source: 'worldService' });
    return resolved;
  }

  getCurrentMusicTrackId() {
    return this._getNumberGlobal('wNumMusic', 0);
  }

  setCurrentMusicTrackId(value: number) {
    return this._setNumberGlobal('wNumMusic', value, 0);
  }

  getAutoBattle() {
    return getAutoBattleValue(this._getBooleanGlobal('autoBattle', false));
  }

  setAutoBattle(value: boolean) {
    const resolved = this._setBooleanGlobal('autoBattle', value);
    updateAutoBattle(resolved, { source: 'worldService' });
    return resolved;
  }

  getChaseRange() {
    const value = this._getNumberGlobal('chaseRange', getChaseRangeFlagValue(0));
    updateChaseRangeValue(value, { emitEvent: false, source: 'worldService:getChaseRange' });
    return value;
  }

  setChaseRange(value: number) {
    const resolved = this._setNumberGlobal('chaseRange', value, getChaseRangeFlagValue(0));
    updateChaseRangeValue(resolved, { source: 'worldService:setChaseRange' });
    return resolved;
  }

  adjustChaseRange(delta: number) {
    const resolved = this._adjustNumberGlobal('chaseRange', delta, getChaseRangeFlagValue(0));
    updateChaseRangeValue(resolved, { source: 'worldService:adjustChaseRange' });
    return resolved;
  }

  getChaseSpeedChangeCycles() {
    const value = this._getNumberGlobal('chaseSpeedChangeCycles', getChaseSpeedFlagValue(0));
    updateChaseSpeedCyclesValue(value, { emitEvent: false, source: 'worldService:getChaseSpeedChangeCycles' });
    return value;
  }

  setChaseSpeedChangeCycles(value: number) {
    const resolved = this._setNumberGlobal('chaseSpeedChangeCycles', value, getChaseSpeedFlagValue(0));
    updateChaseSpeedCyclesValue(resolved, { source: 'worldService:setChaseSpeedChangeCycles' });
    return resolved;
  }

  adjustChaseSpeedChangeCycles(delta: number) {
    const resolved = this._adjustNumberGlobal('chaseSpeedChangeCycles', delta, getChaseSpeedFlagValue(0));
    updateChaseSpeedCyclesValue(resolved, { source: 'worldService:adjustChaseSpeedChangeCycles' });
    return resolved;
  }

  getCollectValue() {
    const value = this._getNumberGlobal('collectValue', getCollectFlagValue(0));
    updateCollectValue(value, { emitEvent: false, source: 'worldService:getCollectValue' });
    return value;
  }

  setCollectValue(value: number) {
    const resolved = this._setNumberGlobal('collectValue', value, getCollectFlagValue(0));
    updateCollectValue(resolved, { source: 'worldService:setCollectValue' });
    return resolved;
  }

  adjustCollectValue(delta: number) {
    const resolved = this._adjustNumberGlobal('collectValue', delta, getCollectFlagValue(0));
    updateCollectValue(resolved, { source: 'worldService:adjustCollectValue' });
    return resolved;
  }

  getCurPlayingRng() {
    return this._getValueGlobal('curPlayingRNG', 0);
  }

  setCurPlayingRng(value: number) {
    return this._setValueGlobal('curPlayingRNG', value);
  }

  getFrameCount() {
    return getFrameCountValue(this._getNumberGlobal('frameNum', 0));
  }

  setFrameCount(value: number) {
    const resolved = this._setNumberGlobal('frameNum', value, 0);
    updateFrameCount(resolved, { source: 'worldService' });
    return resolved;
  }

  incrementFrameCount(delta = 1) {
    const resolved = this._adjustNumberGlobal('frameNum', delta, 0);
    updateFrameCount(resolved, { source: 'worldService' });
    return resolved;
  }

  isInBattle() {
    return this._getBooleanGlobal('inBattle', false);
  }

  setInBattle(value: boolean) {
    return this._setBooleanGlobal('inBattle', value);
  }

  getBattleState() {
    this._ensureInitialised();
    const battle = stateService.getGlobal('battle');
    return battle || null;
  }

  getCurrentSaveSlot() {
    const slot = this._getNumberGlobal('currentSaveSlot', 1);
    return slot || 1;
  }

  setCurrentSaveSlot(value: number) {
    return this._setNumberGlobal('currentSaveSlot', value, 1);
  }

  getLastUnequippedItem() {
    const value = this._getNumberGlobal('lastUnequippedItem', 0);
    updateLastUnequippedValue(value, { emitEvent: false, source: 'worldService:get' });
    return value;
  }

  setLastUnequippedItem(value: number) {
    const resolved = this._setNumberGlobal('lastUnequippedItem', value, 0);
    updateLastUnequippedValue(resolved, { source: 'worldService' });
    return resolved;
  }

  setMaxPartyMemberIndex(value: number) {
    const resolved = this._setNumberGlobal('maxPartyMemberIndex', value, 0);
    updateMaxPartyIndexValue(resolved, { source: 'worldService' });
    return resolved;
  }

  isEnteringScene() {
    return this._getBooleanGlobal('enteringScene', false);
  }

  setEnteringScene(value: boolean) {
    return this._setBooleanGlobal('enteringScene', value);
  }

  setMusicTrack(value: number) {
    const resolved = this._setNumberGlobal('musicNum', value, 0);
    updateMusicTrackValue(resolved, { source: 'worldService:setMusicTrack' });
    return resolved;
  }

  setBattleMusicTrack(value: number) {
    const resolved = this._setNumberGlobal('numBattleMusic', value, 0);
    updateBattleMusicTrackValue(resolved, { source: 'worldService:setBattleMusicTrack' });
    return resolved;
  }

  setBattleFieldId(value: number) {
    const resolved = this._setNumberGlobal('numBattleField', value, 0);
    updateBattleFieldIdValue(resolved, { source: 'worldService:setBattleFieldId' });
    return resolved;
  }

  getBattleSpeed() {
    const value = this._getNumberGlobal('battleSpeed', getBattleSpeedFlagValue(2));
    updateBattleSpeedValue(value, { emitEvent: false, source: 'worldService:getBattleSpeed' });
    return value;
  }

  setBattleSpeed(value: number) {
    const resolved = this._setNumberGlobal('battleSpeed', value, getBattleSpeedFlagValue(2));
    updateBattleSpeedValue(resolved, { source: 'worldService:setBattleSpeed' });
    return resolved;
  }

  getMaxSpriteDrawLimit() {
    return this._maxSpriteDrawLimit;
  }

  setMaxSpriteDrawLimit(value: number) {
    const normalized = Number.isFinite(value) ? Math.trunc(value) : DEFAULT_MAX_SPRITE_TO_DRAW;
    this._maxSpriteDrawLimit = normalized;
    if (typeof globalThis !== 'undefined') {
      (globalThis as Record<string, unknown>)[LEGACY_SPRITE_LIMIT_KEY] = normalized;
    }
    return normalized;
  }

  getFrameNum() {
    return this.getFrameCount();
  }

  setFrameNum(value: number) {
    return this.setFrameCount(value);
  }

  adjustFrameNum(delta: number) {
    return this.incrementFrameCount(delta);
  }

  isGameStart() {
    return this._getBooleanGlobal('gameStart', false);
  }

  setGameStart(value: boolean) {
    return this._setBooleanGlobal('gameStart', value);
  }

  _handleGlobalChanged(event: StateChangeEvent) {
    const payload = event && typeof event === 'object'
      ? (event.data && typeof event.data === 'object' ? event.data : event)
      : null;
    if (!payload || !payload.key) {
      return;
    }
    switch (payload.key) {
      case 'viewport':
      case 'partyOffset':
        this.syncViewport();
        break;
      case 'party':
        this.syncPartyMembers();
        updatePartySliceValue(stateService.getGlobal('party') || [], { source: 'worldService:legacyGlobal' });
        break;
      case 'trail':
        this.syncTrail();
        updateTrailSliceValue(stateService.getGlobal('trail') || [], { source: 'worldService:legacyGlobal' });
        break;
      case 'viewport':
        updateViewportValue(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'partyOffset':
        updatePartyOffsetValue(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'partyDirection':
        updatePartyDirectionValue(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'maxPartyMemberIndex':
        updateMaxPartyIndexValue(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'curMainMenuItem':
        updateMainMenuIndex(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'curSystemMenuItem':
        updateSystemMenuIndex(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'curInvMenuItem':
        updateInventoryMenuIndex(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'noMusic':
        updateNoMusicFlag(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'noSound':
        updateNoSoundFlag(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'inventory':
        updateInventoryValue(Array.isArray(payload.value) ? payload.value : [], { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'cash':
        updateCashValue(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'lastUnequippedItem':
        updateLastUnequippedValue(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'collectValue':
        updateCollectValue(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'chaseRange':
        updateChaseRangeValue(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'chaseSpeedChangeCycles':
        updateChaseSpeedCyclesValue(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'playerStatus':
      case 'poisonStatus':
        this.syncStatusMatrices();
        break;
      case 'objectDesc':
        updateObjectDescValue(typeof payload.value === 'undefined' ? null : (payload.value as any));
        break;
      case 'equipmentEffect':
        updateEquipmentEffectValue(payload.value || []);
        break;
      case 'musicNum':
        updateMusicTrackValue(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'numBattleMusic':
        updateBattleMusicTrackValue(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'numBattleField':
        updateBattleFieldIdValue(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'battleSpeed':
        updateBattleSpeedValue(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'screenWave':
        updateScreenWaveValue(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'waveProgression':
        updateWaveProgressionValue(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'needToFadeIn':
        updateNeedToFadeInValue(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'numPalette':
        updatePaletteIdValue(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'nightPalette':
        updateNightPaletteValue(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'layer':
        updateLayerValue(payload.value, { emitEvent: false, source: 'worldService:legacyGlobal' });
        break;
      case 'numFollower':
        updateFollowerCountSliceValue(payload.value, { source: 'worldService:legacyGlobal' });
        break;
      case 'autoBattle':
        this._syncAutoBattleFlag(payload.value);
        break;
      case 'numScene':
        this.syncScene();
        this.syncMapMeta();
        this.syncMapTiles();
        this.syncEventObjects();
        this.ensureCollisionState();
        updateSceneIdValue(typeof payload.value === 'number' ? payload.value : (this.getSceneId() || 0), { source: 'worldService:legacyGlobal' });
        break;
      case 'frameNum':
        this._syncFrameCountValue(payload.value);
        break;
      default:
        break;
    }
  }

  _handleGameDataChanged(event: StateChangeEvent) {
    const payload = event && typeof event === 'object'
      ? (event.data && typeof event.data === 'object' ? event.data : event)
      : null;
    if (!payload || !payload.key) {
      return;
    }
    switch (payload.key) {
      case 'eventObject':
        this.syncEventObjects();
        this.ensureCollisionState();
        break;
      case 'scene':
        this.syncScene();
        this.syncMapMeta();
        this.syncMapTiles();
        this.syncEventObjects();
        this.ensureCollisionState();
        this.syncBattleFormation();
        break;
      case 'map':
        this.syncScene();
        this.syncMapMeta();
        this.syncMapTiles();
        this.syncEventObjects();
        this.ensureCollisionState();
        this.syncBattleFormation();
        break;
      case 'scriptEntry':
        this.syncScriptRegisters();
        break;
      case 'playerRoles':
        this.syncPlayerRoles();
        break;
      case 'enemyTeam':
      case 'enemyPos':
      case 'battleField':
        this.syncBattleFormation();
        break;
      case 'object':
        const store = getGameDataStore();
        const objectTable = store && (store as any).object ? (store as any).object : [];
        updateObjectTableValue(objectTable);
        break;
      default:
        break;
    }
  }
}

const worldService = new WorldService();

export { WorldService };
export default worldService;
