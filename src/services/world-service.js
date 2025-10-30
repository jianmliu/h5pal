import EventBus from './event-bus.js';
import stateService from './state-service.js';
import reactiveContext from '../state/reactive-context.js';
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
  updateFollowerCountValue as updateFollowerCountSliceValue
} from '../state/slices/party-trail.js';
import {
  updateSceneIdValue,
  updateEventObjectsValue,
  updateCollisionStateValue
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
  resetScriptObjectSlice
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
  updateBattleEffectTableValue
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

function getGlobalStore() {
  if (typeof globalThis !== 'undefined' && globalThis.Global) {
    return globalThis.Global;
  }
  if (typeof global !== 'undefined' && global.Global) {
    return global.Global;
  }
  return null;
}

function getGameDataStore() {
  if (typeof globalThis !== 'undefined' && globalThis.GameData) {
    return globalThis.GameData;
  }
  if (typeof global !== 'undefined' && global.GameData) {
    return global.GameData;
  }
  return null;
}

function getGlobalObject(name) {
  if (typeof globalThis !== 'undefined' && globalThis[name]) {
    return globalThis[name];
  }
  if (typeof global !== 'undefined' && global[name]) {
    return global[name];
  }
  return null;
}

function getGlobalFunction(name, fallback) {
  const obj = getGlobalObject(name);
  if (obj && typeof obj === 'function') {
    return obj;
  }
  return fallback;
}

function getConstValue(key, fallback) {
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

const toSignedWord = getGlobalFunction('SHORT', function(value) {
  const result = value & 0xFFFF;
  return (result & 0x8000) ? result - 0x10000 : result;
});

function toUnsignedWord(value) {
  const normalized = ((value % 0x10000) + 0x10000) & 0xFFFF;
  return normalized;
}

function resolveDirectionDefault() {
  let directionTable = null;
  if (typeof globalThis !== 'undefined' && globalThis.Direction) {
    directionTable = globalThis.Direction;
  } else if (typeof global !== 'undefined' && global.Direction) {
    directionTable = global.Direction;
  }
  return directionTable && typeof directionTable.South === 'number'
    ? directionTable.South
    : 0;
}

const DEFAULT_PARTY_DIRECTION = resolveDirectionDefault();

const playerStateSignalsRef = playerStateSignals();
const playerRolesSignal = playerStateSignalsRef.roles;
const equipmentEffectSignal = playerStateSignalsRef.equipmentEffect;


class WorldService extends EventBus {
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
    this._migrateLegacySpriteLimit();
    this.syncAll();
  }

  dispose() {
    if (this._initialised) {
      stateService.off('globalChanged', this._handleGlobalChanged);
      stateService.off('gameDataChanged', this._handleGameDataChanged);
      this._initialised = false;
    }
    this.registry.clear();
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

  _syncAutoBattleFlag(value) {
    const resolved = typeof value === 'boolean' ? value : this._getBooleanGlobal('autoBattle', false);
    updateAutoBattle(resolved, { emitEvent: false, source: 'worldService:sync' });
  }

  _syncFrameCountValue(value) {
    const resolved = Number.isFinite(value) ? Math.trunc(value) : this._getNumberGlobal('frameNum', 0);
    updateFrameCount(resolved, { emitEvent: false, source: 'worldService:sync' });
  }

  _cloneTrailSnapshot(trail) {
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

  _applyTrailReplacement(target, source) {
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

  _replaceGameDataTable(key, value) {
    this._ensureInitialised();
    stateService.setGameData(key, value);
    return value;
  }

  _copyStructIntoGlobal(key, source, syncFn) {
    this._ensureInitialised();
    if (typeof source === 'undefined') {
      stateService.setGlobal(key, source);
      if (typeof syncFn === 'function') syncFn();
      return source;
    }
    const current = stateService.getGlobal(key);
    if (current && current.uint8Array && source && source.uint8Array && current.uint8Array.length === source.uint8Array.length) {
      current.uint8Array.set(source.uint8Array);
      if (typeof syncFn === 'function') syncFn();
      return current;
    }
    const clone = (source && typeof source.copy === 'function') ? source.copy() : source;
    stateService.setGlobal(key, clone);
    if (typeof syncFn === 'function') syncFn();
    return clone;
  }

  _migrateLegacySpriteLimit() {
    let legacyValue = DEFAULT_MAX_SPRITE_TO_DRAW;
    if (typeof globalThis !== 'undefined' && typeof globalThis[LEGACY_SPRITE_LIMIT_KEY] === 'number') {
      const stored = globalThis[LEGACY_SPRITE_LIMIT_KEY];
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
      globalThis[LEGACY_SPRITE_LIMIT_KEY] = legacyValue;
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
    const party = stateService.getGlobal('party') || [];
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
        this.entityMaps.party.set(index, entityId);
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

    this.entityMaps.party.forEach((entityId, index) => {
      if (!visited.has(index)) {
        this.entityMaps.party.delete(index);
        if (registry.hasEntity(entityId)) {
          registry.destroyEntity(entityId);
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
    const globalStore = stateService.getGlobal();
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

    const partyOffsetValue = globalStore && typeof globalStore.partyOffset !== 'undefined'
      ? globalStore.partyOffset
      : stateService.getGlobal('partyOffset') || 0;
    updatePartyOffsetValue(partyOffsetValue, { emitEvent: false, source: 'worldService:sync' });

    const partyDirectionValue = globalStore && typeof globalStore.partyDirection !== 'undefined'
      ? globalStore.partyDirection
      : this.getPartyDirection();
    updatePartyDirectionValue(partyDirectionValue, { emitEvent: false, source: 'worldService:sync' });

    const maxPartyIndexValue = globalStore && typeof globalStore.maxPartyMemberIndex !== 'undefined'
      ? globalStore.maxPartyMemberIndex
      : this.getMaxPartyMemberIndex();
    updateMaxPartyIndexValue(maxPartyIndexValue, { emitEvent: false, source: 'worldService:sync' });

    const partyValue = globalStore && Array.isArray(globalStore.party)
      ? globalStore.party
      : (stateService.getGlobal('party') || []);
    updatePartySliceValue(partyValue, { emitEvent: false, source: 'worldService:sync' });

    const trailValue = globalStore && Array.isArray(globalStore.trail)
      ? globalStore.trail
      : (stateService.getGlobal('trail') || []);
    updateTrailSliceValue(trailValue, { emitEvent: false, source: 'worldService:sync' });

    const followerCountValue = globalStore && typeof globalStore.numFollower !== 'undefined'
      ? globalStore.numFollower
      : this._getNumberGlobal('numFollower', 0);
    updateFollowerCountSliceValue(followerCountValue, { emitEvent: false, source: 'worldService:sync' });

    const musicTrackValue = globalStore && typeof globalStore.musicNum !== 'undefined'
      ? globalStore.musicNum
      : this._getNumberGlobal('musicNum', 0);
    updateMusicTrackValue(musicTrackValue, { emitEvent: false, source: 'worldService:sync' });

    const battleMusicValue = globalStore && typeof globalStore.numBattleMusic !== 'undefined'
      ? globalStore.numBattleMusic
      : this._getNumberGlobal('numBattleMusic', 0);
    updateBattleMusicTrackValue(battleMusicValue, { emitEvent: false, source: 'worldService:sync' });

    const battleFieldValue = globalStore && typeof globalStore.numBattleField !== 'undefined'
      ? globalStore.numBattleField
      : this._getNumberGlobal('numBattleField', 0);
    updateBattleFieldIdValue(battleFieldValue, { emitEvent: false, source: 'worldService:sync' });

    const screenWaveValue = globalStore && typeof globalStore.screenWave !== 'undefined'
      ? globalStore.screenWave
      : this._getNumberGlobal('screenWave', 0);
    updateScreenWaveValue(screenWaveValue, { emitEvent: false, source: 'worldService:sync' });

    const waveProgressValue = globalStore && typeof globalStore.waveProgression !== 'undefined'
      ? globalStore.waveProgression
      : this._getNumberGlobal('waveProgression', 0);
    updateWaveProgressionValue(waveProgressValue, { emitEvent: false, source: 'worldService:sync' });

    const needFadeInValue = globalStore && typeof globalStore.needToFadeIn !== 'undefined'
      ? !!globalStore.needToFadeIn
      : this._getBooleanGlobal('needToFadeIn', false);
    updateNeedToFadeInValue(needFadeInValue, { emitEvent: false, source: 'worldService:sync' });

    const paletteIdValue = globalStore && typeof globalStore.numPalette !== 'undefined'
      ? globalStore.numPalette
      : this._getNumberGlobal('numPalette', 0);
    updatePaletteIdValue(paletteIdValue, { emitEvent: false, source: 'worldService:sync' });

    const nightPaletteValue = globalStore && typeof globalStore.nightPalette !== 'undefined'
      ? !!globalStore.nightPalette
      : this._getBooleanGlobal('nightPalette', false);
    updateNightPaletteValue(nightPaletteValue, { emitEvent: false, source: 'worldService:sync' });

    const layerValue = globalStore && typeof globalStore.layer !== 'undefined'
      ? globalStore.layer
      : this._getNumberGlobal('layer', 0);
    updateLayerValue(layerValue, { emitEvent: false, source: 'worldService:sync' });
  }

  syncScene() {
    this._ensureInitialised();
    const registry = this.registry;
    const numScene = stateService.getGlobal('numScene');
    const gameData = getGameDataStore();
    const scenes = gameData && gameData.scene ? gameData.scene : [];
    const sceneIndex = typeof numScene === 'number' ? numScene - 1 : -1;
    const sceneRef = sceneIndex >= 0 && sceneIndex < scenes.length ? scenes[sceneIndex] : null;
    const nextSceneRef = sceneIndex + 1 >= 0 && sceneIndex + 1 < scenes.length ? scenes[sceneIndex + 1] : null;
    const mapId = sceneRef && typeof sceneRef.mapNum === 'number' ? sceneRef.mapNum : null;
    const maps = gameData && gameData.map ? gameData.map : [];
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
    for (let i = 0; i < eventObjects.length; i++) {
      const eventObject = eventObjects[i];
      this._syncEventObjectEntity(i, eventObject, sceneId);
      visited.add(i);
    }

    this.entityMaps.eventObject.forEach((entityId, id) => {
      if (!visited.has(id)) {
        this.entityMaps.eventObject.delete(id);
        if (registry.hasEntity(entityId)) {
          registry.destroyEntity(entityId);
        }
      }
    });

    this.fire('eventObjectsSynced', { count: eventObjects.length });
    this.fire('npcStatesSynced', { count: eventObjects.length, sceneId });
    this._collisionState = null;
    this._eventObjectsVersion = (typeof this._eventObjectsVersion === 'number' ? this._eventObjectsVersion : 0) + 1;
    const sceneEventObjects = this.getEventObjectsInCurrentScene();
    updateEventObjectsValue(sceneEventObjects, { source: 'worldService:syncEventObjects' });
    updateCollisionStateValue(null, { source: 'worldService:syncEventObjects' });
  }

  _syncEventObjectEntity(index, eventObject, sceneId = stateService.getGlobal('numScene')) {
    this._ensureInitialised();
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
      this.entityMaps.eventObject.set(index, entityId);
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

  syncScriptRegisters() {
    this._ensureInitialised();
    const registry = this.registry;
    const gameData = getGameDataStore();
    const scriptEntries = gameData && gameData.scriptEntry ? gameData.scriptEntry : [];
    let entityId = this.entityMaps.scriptRegister;
    const payload = {
      count: Array.isArray(scriptEntries) || (scriptEntries && typeof scriptEntries.length === 'number')
        ? scriptEntries.length
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
    updateScriptEntriesValue(scriptEntries, { source: 'worldService:syncScriptRegisters' });
  }

  syncObjectStores() {
    this._ensureInitialised();
    const gameData = getGameDataStore();
    const objectTable = gameData && gameData.object ? gameData.object : [];
    updateObjectTableValue(objectTable, { source: 'worldService:syncObjectStores' });
    const magicTable = gameData && Array.isArray(gameData.magic) ? gameData.magic : [];
    updateMagicTableValue(magicTable, { source: 'worldService:syncObjectStores' });
    const storeTable = gameData && Array.isArray(gameData.store) ? gameData.store : [];
    updateStoreTableValue(storeTable, { source: 'worldService:syncObjectStores' });
    const objectDesc = stateService.getGlobal('objectDesc');
    updateObjectDescValue(typeof objectDesc === 'undefined' ? null : objectDesc, { source: 'worldService:syncObjectStores' });
    const expState = stateService.getGlobal('exp');
    updateExpStateValue(expState || null, { source: 'worldService:syncObjectStores' });
  }


  syncPlayerRoles() {
    this._ensureInitialised();
    const store = getGameDataStore();
    updatePlayerRolesValue(store && store.playerRoles ? store.playerRoles : null, { source: 'worldService:syncPlayerRoles' });
  }

  syncEquipmentEffects() {
    this._ensureInitialised();
    updateEquipmentEffectValue(this._getEquipmentEffects() || [], { source: 'worldService:syncEquipmentEffects' });
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

  setScriptEntries(entries) {
    const resolved = this._replaceGameDataTable('scriptEntry', entries || []);
    updateScriptEntriesValue(resolved || [], { source: 'worldService:setScriptEntries' });
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

  getPartyComponent(index) {
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

  getEventObjectComponent(id) {
    this._ensureInitialised();
    const entityId = this.entityMaps.eventObject.get(id);
    if (!entityId) {
      return null;
    }
    return this.registry.getComponent(entityId, WorldComponents.EventObject);
  }

  getNpcStateByEventId(id) {
    this._ensureInitialised();
    const entityId = this.entityMaps.eventObject.get(id);
    if (!entityId) {
      return null;
    }
    return this.registry.getComponent(entityId, WorldComponents.NpcState);
  }

  getEventObjectIds() {
    this._ensureInitialised();
    return Array.from(this.entityMaps.eventObject.keys());
  }

  getEventObjectsVersion() {
    return typeof this._eventObjectsVersion === 'number' ? this._eventObjectsVersion : 0;
  }

  getScriptEntry(entry) {
    this._ensureInitialised();
    const registry = this.registry;
    if (this.entityMaps.scriptRegister) {
      const component = registry.getComponent(this.entityMaps.scriptRegister, WorldComponents.ScriptRegister);
      if (component && component.entries && typeof component.entries.length === 'number') {
        const candidate = component.entries[entry];
        if (typeof candidate !== 'undefined') {
          return candidate || null;
        }
      }
    }
    const gameData = getGameDataStore();
    const scriptEntries = gameData && gameData.scriptEntry;
    if (scriptEntries && typeof scriptEntries.length === 'number') {
      return scriptEntries[entry] || null;
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

  setViewport(value) {
    this._ensureInitialised();
    const component = this._ensureViewportComponent();
    const resolved = Number.isFinite(value) ? value : 0;
    component.value = resolved;
    this.persistViewport();
    updateViewportValue(resolved, { source: 'worldService' });
    return resolved;
  }

  mutateViewport(mutator) {
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

  setPartyOffset(value) {
    this._ensureInitialised();
    const component = this._ensureViewportComponent();
    const resolved = Number.isFinite(value) ? value : 0;
    component.partyOffset = resolved;
    this.persistViewport();
    updatePartyOffsetValue(resolved, { source: 'worldService' });
    return resolved;
  }

  mutatePartyOffset(mutator) {
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

  mutateTrail(mutator) {
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
    const snapshot = this._cloneTrailSnapshot(trailRef);
    updateTrailSliceValue(snapshot, { source: 'worldService:mutateTrail' });
    this.syncTrail();
    return result;
  }

  getTrailStruct() {
    this._ensureInitialised();
    return stateService.getGlobal('trail') || null;
  }

  setTrailStruct(struct) {
    const result = this._copyStructIntoGlobal('trail', struct, () => this.syncTrail());
    const trail = this.getTrail();
    const snapshot = Array.isArray(trail)
      ? trail.map((entry) => (entry && typeof entry === 'object' ? { ...entry } : entry))
      : [];
    updateTrailSliceValue(snapshot, { source: 'worldService:setTrailStruct' });
    return result;
  }

  getPartyMember(index) {
    this._ensureInitialised();
    const party = stateService.getGlobal('party') || [];
    return party[index] || null;
  }

  getParty() {
    this._ensureInitialised();
    const party = stateService.getGlobal('party');
    if (Array.isArray(party)) {
      return party;
    }
    if (party && typeof party.length === 'number') {
      return party;
    }
    return [];
  }

  getPartyStruct() {
    this._ensureInitialised();
    return stateService.getGlobal('party') || null;
  }

  getMaxPartyMemberIndex() {
    this._ensureInitialised();
    const value = stateService.getGlobal('maxPartyMemberIndex');
    if (typeof value === 'number') {
      updateMaxPartyIndexValue(value, { emitEvent: false, source: 'worldService:get' });
      return value;
    }
    const party = this.getParty();
    const fallback = party.length > 0 ? party.length - 1 : -1;
    updateMaxPartyIndexValue(fallback, { emitEvent: false, source: 'worldService:get' });
    return fallback;
  }

  mutateParty(mutator) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return null;
    }
    return stateService.mutateGlobal('party', (party) => {
      const current = Array.isArray(party) ? party : [];
      const result = mutator(current);
      return typeof result === 'undefined' ? current : result;
    });
  }

  setPartyStruct(struct) {
    return this._copyStructIntoGlobal('party', struct, () => this.syncPartyMembers());
  }

  getInventory() {
    this._ensureInitialised();
    const inventory = stateService.getGlobal('inventory');
    const resolved = Array.isArray(inventory) ? inventory : [];
    const capacity = this.getInventoryCapacity();
    updateInventoryValue(resolved, { emitEvent: false, source: 'worldService:get', capacity });
    return resolved;
  }

  getInventoryStruct() {
    this._ensureInitialised();
    const inventory = stateService.getGlobal('inventory');
    const resolved = Array.isArray(inventory) ? inventory : (inventory || null);
    if (resolved) {
      updateInventoryValue(resolved, { emitEvent: false, source: 'worldService:get', capacity: this.getInventoryCapacity() });
    }
    return resolved;
  }

  mutateInventory(mutator) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return null;
    }
    const result = stateService.mutateGlobal('inventory', (inventory) => {
      const current = Array.isArray(inventory) ? inventory : [];
      const next = mutator(current);
      return typeof next === 'undefined' ? current : next;
    });
    updateInventoryValue(Array.isArray(result) ? result : [], { source: 'worldService', capacity: this.getInventoryCapacity() });
    return result;
  }

  setInventoryStruct(struct) {
    const resolved = this._copyStructIntoGlobal('inventory', struct);
    updateInventoryValue(Array.isArray(resolved) ? resolved : [], { source: 'worldService', capacity: this.getInventoryCapacity() });
    return resolved;
  }

  getInventorySlot(index) {
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

  getPlayerStatusMatrix() {
    this._ensureInitialised();
    const status = stateService.getGlobal('playerStatus');
    const resolved = Array.isArray(status) ? status : [];
    updatePlayerStatusMatrix(resolved, { emitEvent: false, source: 'worldService:get' });
    return resolved;
  }

  getPlayerStatusStruct() {
    this._ensureInitialised();
    const status = stateService.getGlobal('playerStatus');
    const resolved = Array.isArray(status) ? status : (status || null);
    if (resolved) {
      updatePlayerStatusMatrix(resolved, { emitEvent: false, source: 'worldService:get' });
    }
    return resolved;
  }

  mutatePlayerStatus(mutator) {
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

  mutatePlayerStatusEntry(roleId, mutator) {
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

  getPlayerStatus(roleId) {
    const matrix = this.getPlayerStatusMatrix();
    return matrix[roleId] || null;
  }

  setPlayerStatusStruct(struct) {
    return this._copyStructIntoGlobal('playerStatus', struct);
  }

  resetPlayerStatusMatrix() {
    this._ensureInitialised();
    const status = stateService.getGlobal('playerStatus');
    if (!status) {
      return null;
    }
    if (status.uint8Array) {
      status.uint8Array.fill(0);
      return status;
    }
    if (Array.isArray(status)) {
      for (let i = 0; i < status.length; i++) {
        const row = status[i];
        if (!row) {
          continue;
        }
        if (row.uint8Array) {
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

  mutatePoisonStatus(mutator) {
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
      if (poisonStatus.uint8Array) {
        poisonStatus.uint8Array.fill(0);
        return poisonStatus;
      }
      for (let i = 0; i < poisonStatus.length; i++) {
        const row = poisonStatus[i];
        if (!row) {
          continue;
        }
        if (row.uint8Array) {
          row.uint8Array.fill(0);
          continue;
        }
        for (let j = 0; j < row.length; j++) {
          const entry = row[j];
          if (!entry) {
            continue;
          }
          if (entry.uint8Array) {
            entry.uint8Array.fill(0);
            continue;
          }
          entry.poisonID = 0;
          entry.poisonScript = 0;
        }
      }
      return poisonStatus;
    });
  }

  setPoisonStatusStruct(struct) {
    return this._copyStructIntoGlobal('poisonStatus', struct);
  }

  getPlayerMagicSlots(roleId) {
    const roles = this.getPlayerRoles();
    if (!roles || !Array.isArray(roles.magic)) {
      return [];
    }
    const result = [];
    for (let slot = 0; slot < roles.magic.length; slot++) {
      const row = roles.magic[slot];
      result.push(row ? row[roleId] || 0 : 0);
    }
    return result;
  }

  setPlayerMagicSlot(roleId, slotIndex, value) {
    return this.mutatePlayerRoles((roles) => {
      if (roles && Array.isArray(roles.magic) && roles.magic[slotIndex]) {
        roles.magic[slotIndex][roleId] = value;
      }
      return roles;
    });
  }

  findPlayerMagicSlot(roleId, magicId) {
    const slots = this.getPlayerMagicSlots(roleId);
    for (let i = 0; i < slots.length; i++) {
      if (slots[i] === magicId) {
        return i;
      }
    }
    return -1;
  }

  clearPlayerMagicSlot(roleId, slotIndex) {
    return this.setPlayerMagicSlot(roleId, slotIndex, 0);
  }

  getTrail() {
    this._ensureInitialised();
    const trail = stateService.getGlobal('trail');
    if (Array.isArray(trail)) {
      return trail;
    }
    return trail || [];
  }

  getSceneId() {
    this._ensureInitialised();
    return stateService.getGlobal('numScene');
  }

  setSceneId(sceneId) {
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

  getSceneEntry(sceneId) {
    this._ensureInitialised();
    if (typeof sceneId !== 'number' || sceneId <= 0) {
      sceneId = this.getSceneId();
    }
    const currentId = this.getSceneId();
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

  mutateSceneEntry(sceneId, mutator) {
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

  setSceneTable(scenes) {
    return this._replaceGameDataTable('scene', scenes || []);
  }

  getSceneTable() {
    this._ensureInitialised();
    const store = getGameDataStore();
    return store ? store.scene || null : null;
  }

  getNextSceneData() {
    const component = this.getSceneComponent();
    return component ? component.nextSceneRef : null;
  }

  getMapData() {
    const component = this.getSceneComponent();
    return component ? component.mapRef : null;
  }

  runSystems(phases, context = {}) {
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

  enqueueMoveRequest(request) {
    this._ensureInitialised();
    const eventIndex = typeof request === 'object' && request != null
      ? (typeof request.eventIndex === 'number'
        ? request.eventIndex
        : (typeof request.eventObjectId === 'number' ? request.eventObjectId - 1 : null))
      : null;
    if (eventIndex != null) {
      const component = this.getEventObjectComponent(eventIndex);
      const currentRef = this.getEventObject(eventIndex);
      if (component && currentRef && component.stateRef !== currentRef) {
        this.syncEventObjects();
      }
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

  setMoveIntent(eventIndex, intent) {
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

  clearMoveIntent(eventIndex) {
    const entityId = this.entityMaps.eventObject.get(eventIndex);
    if (!entityId) {
      return;
    }
    this.registry.removeComponent(entityId, WorldComponents.MoveIntent);
  }

  getMoveIntent(eventIndex) {
    const entityId = this.entityMaps.eventObject.get(eventIndex);
    if (!entityId) {
      return null;
    }
    return this.registry.getComponent(entityId, WorldComponents.MoveIntent);
  }

  setCollisionState(payload) {
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
      this.runSystems('collision', context);
    }
    updateCollisionStateValue(this._collisionState, { emitEvent: false, source: 'worldService:ensureCollisionState' });
    return this._collisionState;
  }

  isPositionBlocked(position, options = {}, context) {
    const state = this.ensureCollisionState(context || {});
    if (!state || typeof state.isBlocked !== 'function') {
      return null;
    }
    return state.isBlocked(position, options);
  }

  mutatePartyMember(index, mutator) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return null;
    }
    const party = stateService.getGlobal('party') || [];
    const member = party[index];
    if (!member) {
      return null;
    }
    const result = mutator(member);
    this.syncPartyMembers();
    return result;
  }

  getEventObject(id) {
    this._ensureInitialised();
    const gameData = getGameDataStore();
    if (!gameData || !Array.isArray(gameData.eventObject)) {
      return null;
    }
    return gameData.eventObject[id] || null;
  }

  mutateEventObject(id, mutator) {
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
    const result = mutator(target);
    if (typeof result !== 'undefined' && result !== target) {
      gameData.eventObject[id] = result;
    }
    const updatedEntry = typeof result !== 'undefined' ? result : target;
    this._syncEventObjectEntity(id, updatedEntry, stateService.getGlobal('numScene'));
    this._collisionState = null;
    this._eventObjectsVersion = (typeof this._eventObjectsVersion === 'number' ? this._eventObjectsVersion : 0) + 1;
    this.fire('eventObjectMutated', { id, sceneId: stateService.getGlobal('numScene'), state: updatedEntry });
    updateEventObjectsValue(this.getEventObjectsInCurrentScene(), { source: 'worldService:mutateEventObject' });
    updateCollisionStateValue(null, { source: 'worldService:mutateEventObject' });
    return updatedEntry;
  }

  mutateEventObjectById(eventId, mutator) {
    if (!Number.isFinite(eventId)) {
      return null;
    }
    const index = Math.trunc(eventId) - 1;
    if (index < 0) {
      return null;
    }
    return this.mutateEventObject(index, mutator);
  }

  mutateEventObjects(mutator) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return null;
    }
    let snapshot = null;
    stateService.mutateGameData('eventObject', (eventObjects) => {
      if (!eventObjects) {
        return eventObjects;
      }
      const result = mutator(eventObjects);
      snapshot = typeof result !== 'undefined' ? result : eventObjects;
      return snapshot;
    });
    if (snapshot) {
      this.syncEventObjects();
    }
    return snapshot;
  }

  setEventObjectTable(eventObjects) {
    return this._replaceGameDataTable('eventObject', eventObjects || []);
  }

  getEventObjectTable() {
    this._ensureInitialised();
    const store = getGameDataStore();
    return store ? store.eventObject || null : null;
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
    return results;
  }

  getAllEventObjects() {
    this._ensureInitialised();
    const store = getGameDataStore();
    const eventObjects = store && Array.isArray(store.eventObject) ? store.eventObject : [];
    const results = [];
    for (let idx = 0; idx < eventObjects.length; idx++) {
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
    return results;
  }

  mutateObjectEntry(id, mutator) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return null;
    }
    let updatedEntry = null;
    stateService.mutateGameData('object', (objects) => {
      if (!Array.isArray(objects)) {
        return objects;
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
      updateObjectTableValue(store && store.object ? store.object : [], { source: 'worldService:mutateObjectEntry' });
    }
    return updatedEntry;
  }

  setObjectScriptValue(objectId, dataIndex, value) {
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
      } else if (ArrayBuffer.isView(currentData) && typeof currentData.slice === 'function') {
        nextData = currentData.slice();
      } else if (typeof currentData === 'object') {
        nextData = { ...currentData };
      } else {
        return entry;
      }

      if (typeof nextData.length === 'number') {
        if (index >= nextData.length) {
          return entry;
        }
        nextData[index] = value;
      } else {
        nextData[index] = value;
      }

      return nextData === currentData ? entry : { ...entry, data: nextData };
    });
  }

  mutateObjects(mutator) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return null;
    }
    let snapshot = null;
    stateService.mutateGameData('object', (objects) => {
      if (!objects) {
        return objects;
      }
      const result = mutator(objects);
      snapshot = typeof result !== 'undefined' ? result : objects;
      return snapshot;
    });
    if (snapshot) {
      updateObjectTableValue(snapshot, { source: 'worldService:mutateObjects' });
    }
    return snapshot;
  }

  setObjectTable(objects) {
    const resolved = this._replaceGameDataTable('object', objects || []);
    updateObjectTableValue(resolved || [], { source: 'worldService:setObjectTable' });
    return resolved;
  }

  getObjectTable() {
    this._ensureInitialised();
    const store = getGameDataStore();
    return store ? store.object || null : null;
  }

  mutateMagicTable(mutator) {
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
      updateMagicTableValue(snapshot, { source: 'worldService:mutateMagicTable' });
    }
    return snapshot;
  }

  setMagicTable(magicTable) {
    const resolved = this._replaceGameDataTable('magic', magicTable || []);
    updateMagicTableValue(resolved || [], { source: 'worldService:setMagicTable' });
    return resolved;
  }

  getPlayerRoles() {
    this._ensureInitialised();
    const store = getGameDataStore();
    const roles = store && store.playerRoles ? store.playerRoles : null;
    updatePlayerRolesValue(roles, { emitEvent: false, source: 'worldService:getPlayerRoles' });
    return roles;
  }

  getPlayerBattleSpriteNum(roleId) {
    const roles = this.getPlayerRoles();
    if (roles && roles.spriteNumInBattle) {
      return roles.spriteNumInBattle[roleId] || 0;
    }
    return 0;
  }

  _getPlayerRoleArray(field) {
    const roles = this.getPlayerRoles();
    if (!roles) {
      return null;
    }
    return roles[field] || null;
  }

  _getPlayerRoleArrayValue(field, roleId, fallback = 0) {
    const arr = this._getPlayerRoleArray(field);
    if (!arr) {
      return fallback;
    }
    const value = arr[roleId];
    return typeof value === 'undefined' ? fallback : value;
  }

  _setPlayerRoleArrayValue(field, roleId, value) {
    return this.mutatePlayerRoles((roles) => {
      if (roles && roles[field]) {
        roles[field][roleId] = value;
      }
      return roles;
    });
  }

  getMagicEntry(id) {
    this._ensureInitialised();
    const store = getGameDataStore();
    if (!store || !Array.isArray(store.magic)) {
      return null;
    }
    return store.magic[id] || null;
  }

  getLevelUpMagicTable() {
    this._ensureInitialised();
    const store = getGameDataStore();
    if (!store || !Array.isArray(store.levelUpMagic)) {
      return [];
    }
    return store.levelUpMagic;
  }

  setLevelUpMagicTable(levelUpMagic) {
    return this._replaceGameDataTable('levelUpMagic', levelUpMagic || []);
  }

  getStoreEntry(id) {
    this._ensureInitialised();
    const store = getGameDataStore();
    if (!store || !Array.isArray(store.store)) {
      return null;
    }
    return store.store[id] || null;
  }

  setStoreTable(stores) {
    const resolved = this._replaceGameDataTable('store', stores || []);
    updateStoreTableValue(resolved || [], { source: 'worldService:setStoreTable' });
    return resolved;
  }

  getEnemyEntry(id) {
    this._ensureInitialised();
    const store = getGameDataStore();
    if (!store || !Array.isArray(store.enemy)) {
      return null;
    }
    return store.enemy[id] || null;
  }

  setEnemyTable(enemies) {
    const resolved = this._replaceGameDataTable('enemy', enemies || []);
    updateEnemyTableValue(resolved || [], { source: 'worldService:setEnemyTable' });
    return resolved;
  }

  copyEnemyTemplate(enemyId) {
    const entry = this.getEnemyEntry(enemyId);
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

  setEnemyTeamTable(enemyTeams) {
    const resolved = this._replaceGameDataTable('enemyTeam', enemyTeams || []);
    updateEnemyTeamValue(resolved || [], { source: 'worldService:setEnemyTeamTable' });
    return resolved;
  }

  getEnemyFormationPosition(index, maxEnemyIndex) {
    this._ensureInitialised();
    const store = getGameDataStore();
    const enemyPos = store && store.enemyPos && store.enemyPos.pos ? store.enemyPos.pos : null;
    if (!enemyPos || !enemyPos[index]) {
      return null;
    }
    return enemyPos[index][maxEnemyIndex] || null;
  }

  setEnemyPositionTable(enemyPositions) {
    const resolved = this._replaceGameDataTable('enemyPos', enemyPositions || null);
    updateEnemyPositionValue(resolved || null, { source: 'worldService:setEnemyPositionTable' });
    return resolved;
  }

  setBattleFieldTable(battleFields) {
    const resolved = this._replaceGameDataTable('battleField', battleFields || []);
    updateBattleFieldValue(resolved || [], { source: 'worldService:setBattleFieldTable' });
    return resolved;
  }

  getBattleEffectIndexRow(id) {
    this._ensureInitialised();
    const store = getGameDataStore();
    if (!store || !Array.isArray(store.battleEffectIndex)) {
      return null;
    }
    return store.battleEffectIndex[id] || null;
  }

  setBattleEffectIndexTable(battleEffectIndex) {
    const resolved = this._replaceGameDataTable('battleEffectIndex', battleEffectIndex || []);
    updateBattleEffectTableValue(resolved || [], { source: 'worldService:setBattleEffectIndexTable' });
    return resolved;
  }

  setPlayerRoles(playerRoles) {
    const resolved = this._replaceGameDataTable('playerRoles', playerRoles || null);
    updatePlayerRolesValue(resolved || null, { source: 'worldService:setPlayerRoles' });
    return resolved;
  }

  mutatePlayerRoles(mutator, options = {}) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return null;
    }
    let snapshot = null;
    stateService.mutateGameData('playerRoles', (playerRoles) => {
      if (!playerRoles) {
        return playerRoles;
      }
      const result = mutator(playerRoles);
      snapshot = typeof result !== 'undefined' ? result : playerRoles;
      return snapshot;
    });
    if (snapshot) {
      const updateOptions = {
        source: 'worldService:mutatePlayerRoles',
        ...options
      };
      if (!updateOptions.source) {
        updateOptions.source = 'worldService:mutatePlayerRoles';
      }
      updatePlayerRolesValue(snapshot, updateOptions);
    }
    return snapshot;
  }

  getPlayerHP(roleId) {
    const roles = this.getPlayerRoles();
    return roles && roles.HP ? roles.HP[roleId] || 0 : 0;
  }

  setPlayerHP(roleId, value) {
    return this.mutatePlayerRoles((roles) => {
      if (roles && roles.HP) {
        roles.HP[roleId] = value;
      }
      return roles;
    }, { source: 'worldService:setPlayerHP' });
  }

  adjustPlayerHP(roleId, delta) {
    const adjustment = Number.isFinite(delta) ? delta : 0;
    const current = this.getPlayerHP(roleId);
    return this.setPlayerHP(roleId, current + adjustment);
  }

  getPlayerMP(roleId) {
    const roles = this.getPlayerRoles();
    return roles && roles.MP ? roles.MP[roleId] || 0 : 0;
  }

  setPlayerMP(roleId, value) {
    return this.mutatePlayerRoles((roles) => {
      if (roles && roles.MP) {
        roles.MP[roleId] = value;
      }
      return roles;
    }, { source: 'worldService:setPlayerMP' });
  }

  adjustPlayerMP(roleId, delta) {
    const adjustment = Number.isFinite(delta) ? delta : 0;
    const current = this.getPlayerMP(roleId);
    return this.setPlayerMP(roleId, current + adjustment);
  }

  getPlayerMaxHP(roleId) {
    const roles = this.getPlayerRoles();
    return roles && roles.maxHP ? roles.maxHP[roleId] || 0 : 0;
  }

  setPlayerMaxHP(roleId, value) {
    return this.mutatePlayerRoles((roles) => {
      if (roles && roles.maxHP) {
        roles.maxHP[roleId] = value;
      }
      return roles;
    });
  }

  getPlayerMaxMP(roleId) {
    const roles = this.getPlayerRoles();
    return roles && roles.maxMP ? roles.maxMP[roleId] || 0 : 0;
  }

  setPlayerMaxMP(roleId, value) {
    return this.mutatePlayerRoles((roles) => {
      if (roles && roles.maxMP) {
        roles.maxMP[roleId] = value;
      }
      return roles;
    });
  }

  getPlayerLevel(roleId) {
    const roles = this.getPlayerRoles();
    return roles && roles.level ? roles.level[roleId] || 0 : 0;
  }

  setPlayerLevel(roleId, value) {
    return this.mutatePlayerRoles((roles) => {
      if (roles && roles.level) {
        roles.level[roleId] = value;
      }
      return roles;
    });
  }

  getPlayerNameId(roleId) {
    const roles = this.getPlayerRoles();
    return roles && roles.name ? roles.name[roleId] || 0 : 0;
  }

  getPlayerSpriteNum(roleId) {
    const roles = this.getPlayerRoles();
    return roles && roles.spriteNum ? roles.spriteNum[roleId] || 0 : 0;
  }

  getPlayerWalkFrames(roleId) {
    const roles = this.getPlayerRoles();
    return roles && roles.walkFrames ? roles.walkFrames[roleId] || 0 : 0;
  }

  getPlayerAvatarId(roleId) {
    const roles = this.getPlayerRoles();
    return roles && roles.avatar ? roles.avatar[roleId] || 0 : 0;
  }

  getPlayerAttackStrength(roleId) {
    const roles = this.getPlayerRoles();
    return roles && roles.attackStrength ? roles.attackStrength[roleId] || 0 : 0;
  }

  setPlayerAttackStrength(roleId, value) {
    return this.mutatePlayerRoles((roles) => {
      if (roles && roles.attackStrength) {
        roles.attackStrength[roleId] = value;
      }
      return roles;
    });
  }

  getPlayerMagicStrength(roleId) {
    const roles = this.getPlayerRoles();
    return roles && roles.magicStrength ? roles.magicStrength[roleId] || 0 : 0;
  }

  setPlayerMagicStrength(roleId, value) {
    return this.mutatePlayerRoles((roles) => {
      if (roles && roles.magicStrength) {
        roles.magicStrength[roleId] = value;
      }
      return roles;
    });
  }

  getPlayerDefense(roleId) {
    const roles = this.getPlayerRoles();
    return roles && roles.defense ? roles.defense[roleId] || 0 : 0;
  }

  setPlayerDefense(roleId, value) {
    return this.mutatePlayerRoles((roles) => {
      if (roles && roles.defense) {
        roles.defense[roleId] = value;
      }
      return roles;
    });
  }

  getPlayerDexterity(roleId) {
    const roles = this.getPlayerRoles();
    return roles && roles.dexterity ? roles.dexterity[roleId] || 0 : 0;
  }

  setPlayerDexterity(roleId, value) {
    return this.mutatePlayerRoles((roles) => {
      if (roles && roles.dexterity) {
        roles.dexterity[roleId] = value;
      }
      return roles;
    });
  }

  getPlayerFleeRate(roleId) {
    const roles = this.getPlayerRoles();
    return roles && roles.fleeRate ? roles.fleeRate[roleId] || 0 : 0;
  }

  setPlayerFleeRate(roleId, value) {
    return this.mutatePlayerRoles((roles) => {
      if (roles && roles.fleeRate) {
        roles.fleeRate[roleId] = value;
      }
      return roles;
    });
  }

  getPlayerEquipment(slot, roleId) {
    const roles = this.getPlayerRoles();
    if (!roles || !Array.isArray(roles.equipment)) {
      return 0;
    }
    const equipmentRow = roles.equipment[slot];
    if (!equipmentRow) {
      return 0;
    }
    return equipmentRow[roleId] || 0;
  }

  setPlayerEquipment(slot, roleId, value) {
    return this.mutatePlayerRoles((roles) => {
      if (roles && Array.isArray(roles.equipment) && roles.equipment[slot]) {
        roles.equipment[slot][roleId] = value;
      }
      return roles;
    });
  }

  _getEquipmentEffects() {
    const cached = equipmentEffectSignal.value;
    if (Array.isArray(cached) && cached.length > 0) {
      return cached;
    }
    const store = getGlobalStore();
    const effects = store && store.equipmentEffect ? store.equipmentEffect : null;
    updateEquipmentEffectValue(effects || [], { emitEvent: false, source: 'worldService:getEquipmentEffects' });
    return effects;
  }

  getEquipmentEffects() {
    this._ensureInitialised();
    return this._getEquipmentEffects();
  }

  getEquipmentEffect(part) {
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
    if (effects.uint8Array) {
      effects.uint8Array.fill(0);
      return;
    }
    for (let idx = 0; idx < effects.length; idx++) {
      const entry = effects[idx];
      if (entry && entry.uint8Array) {
        entry.uint8Array.fill(0);
      }
    }
    updateEquipmentEffectValue(Array.isArray(effects) ? effects.slice() : (effects || []), { source: 'worldService:resetEquipmentEffects' });
  }

  mutateEquipmentEffect(part, mutator) {
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
    const result = mutator(entry);
    if (typeof result !== 'undefined' && result !== entry) {
      effects[part] = result;
    }
    updateEquipmentEffectValue(Array.isArray(effects) ? effects.slice() : (effects || []), { source: 'worldService:mutateEquipmentEffect' });
    return typeof result !== 'undefined' ? result : entry;
  }

  _mutateEquipmentEffectWord(part, fieldIndex, roleId, updater) {
    if (typeof part !== 'number' || typeof fieldIndex !== 'number' || typeof roleId !== 'number' || MAX_PLAYER_ROLES <= 0) {
      return null;
    }
    const effect = this.getEquipmentEffect(part);
    if (!effect || !effect.uint8Array) {
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

  setEquipmentEffectWord(part, fieldIndex, roleId, value) {
    const result = this._mutateEquipmentEffectWord(part, fieldIndex, roleId, value);
    const effects = this._getEquipmentEffects();
    updateEquipmentEffectValue(Array.isArray(effects) ? effects.slice() : (effects || []), { emitEvent: false, source: 'worldService:setEquipmentEffectWord' });
    return result;
  }

  adjustEquipmentEffectWord(part, fieldIndex, roleId, delta) {
    const result = this._mutateEquipmentEffectWord(part, fieldIndex, roleId, (current) => {
      const signedCurrent = toSignedWord(current);
      const signedDelta = toSignedWord(delta);
      const next = signedCurrent + signedDelta;
      return toUnsignedWord(next);
    });
    const effects = this._getEquipmentEffects();
    updateEquipmentEffectValue(Array.isArray(effects) ? effects.slice() : (effects || []), { emitEvent: false, source: 'worldService:adjustEquipmentEffectWord' });
    return result;
  }

  clearEquipmentEffect(part, roleId) {
    if (MAX_PLAYER_ROLES <= 0) {
      return;
    }
    const effect = this.getEquipmentEffect(part);
    if (!effect || !effect.uint8Array) {
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
    updateEquipmentEffectValue(Array.isArray(effects) ? effects.slice() : (effects || []), { emitEvent: false, source: 'worldService:clearEquipmentEffect' });
  }

  adjustPlayerMaxHP(roleId, delta) {
    const current = this.getPlayerMaxHP(roleId);
    return this.setPlayerMaxHP(roleId, current + delta);
  }

  adjustPlayerMaxMP(roleId, delta) {
    const current = this.getPlayerMaxMP(roleId);
    return this.setPlayerMaxMP(roleId, current + delta);
  }

  adjustPlayerAttackStrength(roleId, delta) {
    const current = this.getPlayerAttackStrength(roleId);
    return this.setPlayerAttackStrength(roleId, current + delta);
  }

  adjustPlayerMagicStrength(roleId, delta) {
    const current = this.getPlayerMagicStrength(roleId);
    return this.setPlayerMagicStrength(roleId, current + delta);
  }

  adjustPlayerDefense(roleId, delta) {
    const current = this.getPlayerDefense(roleId);
    return this.setPlayerDefense(roleId, current + delta);
  }

  adjustPlayerDexterity(roleId, delta) {
    const current = this.getPlayerDexterity(roleId);
    return this.setPlayerDexterity(roleId, current + delta);
  }

  adjustPlayerFleeRate(roleId, delta) {
    const current = this.getPlayerFleeRate(roleId);
    return this.setPlayerFleeRate(roleId, current + delta);
  }

  getPlayerRoleWord(fieldIndex, roleId) {
    if (typeof fieldIndex !== 'number' || typeof roleId !== 'number' || MAX_PLAYER_ROLES <= 0) {
      return null;
    }
    const store = getGameDataStore();
    const playerRoles = store && store.playerRoles;
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

  getPlayerCoveredBy(roleId) {
    return this._getPlayerRoleArrayValue('coveredBy', roleId, 0);
  }

  getPlayerMagicSound(roleId) {
    return this._getPlayerRoleArrayValue('magicSound', roleId, 0);
  }

  getPlayerAttackSound(roleId) {
    return this._getPlayerRoleArrayValue('attackSound', roleId, 0);
  }

  getPlayerCriticalSound(roleId) {
    return this._getPlayerRoleArrayValue('criticalSound', roleId, 0);
  }

  getPlayerWeaponSound(roleId) {
    return this._getPlayerRoleArrayValue('weaponSound', roleId, 0);
  }

  getPlayerCoverSound(roleId) {
    return this._getPlayerRoleArrayValue('coverSound', roleId, 0);
  }

  getPlayerDyingSound(roleId) {
    return this._getPlayerRoleArrayValue('dyingSound', roleId, 0);
  }

  getPlayerDeathSound(roleId) {
    return this._getPlayerRoleArrayValue('deathSound', roleId, 0);
  }

  getPlayerMagicAt(slotIndex, roleId) {
    const roles = this.getPlayerRoles();
    if (!roles || !Array.isArray(roles.magic)) {
      return 0;
    }
    const row = roles.magic[slotIndex];
    if (!row) {
      return 0;
    }
    return row[roleId] || 0;
  }

  _mutatePlayerRoleWord(fieldIndex, roleId, updater) {
    if (typeof fieldIndex !== 'number' || typeof roleId !== 'number' || MAX_PLAYER_ROLES <= 0) {
      return null;
    }
    let result = null;
    stateService.mutateGameData('playerRoles', (playerRoles) => {
      if (!playerRoles || !playerRoles.uint8Array) {
        return playerRoles;
      }
      const buffer = playerRoles.uint8Array;
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const offset = (fieldIndex * MAX_PLAYER_ROLES + roleId) * 2;
      if (offset < 0 || offset + 2 > buffer.byteLength) {
        return playerRoles;
      }
      const current = view.getUint16(offset, false);
      const nextValue = typeof updater === 'function' ? updater(current) : updater;
      if (typeof nextValue === 'number' && !Number.isNaN(nextValue)) {
        const normalized = toUnsignedWord(nextValue);
        view.setUint16(offset, normalized, false);
        result = normalized;
      }
      return playerRoles;
    });
    return result;
  }

  adjustPlayerRoleWord(fieldIndex, roleId, delta) {
    return this._mutatePlayerRoleWord(fieldIndex, roleId, (current) => {
      const signedCurrent = toSignedWord(current);
      const signedDelta = toSignedWord(delta);
      const next = signedCurrent + signedDelta;
      return toUnsignedWord(next);
    });
  }

  setPlayerRoleWord(fieldIndex, roleId, value) {
    return this._mutatePlayerRoleWord(fieldIndex, roleId, value);
  }

  getExpState() {
    this._ensureInitialised();
    const expState = stateService.getGlobal('exp');
    updateExpStateValue(expState || null, { emitEvent: false, source: 'worldService:getExpState' });
    return expState;
  }

  mutateExpState(mutator) {
    this._ensureInitialised();
    const result = stateService.mutateGlobal('exp', (exp) => {
      if (exp && typeof mutator === 'function') {
        mutator(exp);
      }
      return exp;
    });
    updateExpStateValue(result || null, { source: 'worldService:mutateExpState' });
    return result;
  }

  setExpStruct(struct) {
    const resolved = this._copyStructIntoGlobal('exp', struct);
    updateExpStateValue(resolved || null, { source: 'worldService:setExpStruct' });
    return resolved;
  }

  getLevelUpExp(level) {
    this._ensureInitialised();
    const store = getGameDataStore();
    const table = store && Array.isArray(store.levelUpExp) ? store.levelUpExp : [];
    if (typeof level !== 'number') {
      return 0;
    }
    if (level < 0 || level >= table.length) {
      return table[level] || 0;
    }
    return table[level] || 0;
  }

  getLevelUpExpTable() {
    this._ensureInitialised();
    const store = getGameDataStore();
    return store && Array.isArray(store.levelUpExp) ? store.levelUpExp : [];
  }

  setLevelUpExpTable(levelUpExp) {
    return this._replaceGameDataTable('levelUpExp', levelUpExp || []);
  }

  getPartyDirection() {
    this._ensureInitialised();
    const dir = stateService.getGlobal('partyDirection');
    const fallback = typeof dir === 'number' ? dir : DEFAULT_PARTY_DIRECTION;
    updatePartyDirectionValue(fallback, { emitEvent: false, source: 'worldService:get' });
    return fallback;
  }

  setPartyDirection(value) {
    this._ensureInitialised();
    const resolved = typeof value === 'number' ? value : DEFAULT_PARTY_DIRECTION;
    stateService.setGlobal('partyDirection', resolved);
    updatePartyDirectionValue(resolved, { source: 'worldService' });
    return resolved;
  }

  getFollowerCount() {
    this._ensureInitialised();
    const count = stateService.getGlobal('numFollower');
    const resolved = typeof count === 'number' ? count : 0;
    updateFollowerCountSliceValue(resolved, { emitEvent: false, source: 'worldService:getFollowerCount' });
    return resolved;
  }

  setFollowerCount(value) {
    this._ensureInitialised();
    const resolved = Number.isFinite(value) ? Math.max(0, value | 0) : 0;
    stateService.setGlobal('numFollower', resolved);
    updateFollowerCountSliceValue(resolved, { source: 'worldService:setFollowerCount' });
    return resolved;
  }

  getScreenWave() {
    this._ensureInitialised();
    const resolved = this._getNumberGlobal('screenWave', getScreenWaveValue(0));
    updateScreenWaveValue(resolved, { emitEvent: false, source: 'worldService:getScreenWave' });
    return resolved;
  }

  setScreenWave(value) {
    this._ensureInitialised();
    const resolved = this._setNumberGlobal('screenWave', value, getScreenWaveValue(0));
    updateScreenWaveValue(resolved, { source: 'worldService:setScreenWave' });
    return resolved;
  }

  adjustScreenWave(delta) {
    this._ensureInitialised();
    const resolved = this._adjustNumberGlobal('screenWave', delta, getScreenWaveValue(0));
    updateScreenWaveValue(resolved, { source: 'worldService:adjustScreenWave' });
    return resolved;
  }

  getWaveProgression() {
    this._ensureInitialised();
    const resolved = this._getNumberGlobal('waveProgression', getWaveProgressionValue(0));
    updateWaveProgressionValue(resolved, { emitEvent: false, source: 'worldService:getWaveProgression' });
    return resolved;
  }

  setWaveProgression(value) {
    this._ensureInitialised();
    const resolved = this._setNumberGlobal('waveProgression', value, getWaveProgressionValue(0));
    updateWaveProgressionValue(resolved, { source: 'worldService:setWaveProgression' });
    return resolved;
  }

  getNeedToFadeIn() {
    this._ensureInitialised();
    const resolved = this._getBooleanGlobal('needToFadeIn', getNeedToFadeInValue(false));
    updateNeedToFadeInValue(resolved, { emitEvent: false, source: 'worldService:getNeedToFadeIn' });
    return resolved;
  }

  setNeedToFadeIn(value) {
    this._ensureInitialised();
    const resolved = this._setBooleanGlobal('needToFadeIn', value);
    updateNeedToFadeInValue(resolved, { source: 'worldService:setNeedToFadeIn' });
    return resolved;
  }

  getPaletteId() {
    this._ensureInitialised();
    const resolved = this._getNumberGlobal('numPalette', getPaletteIdValue(0));
    updatePaletteIdValue(resolved, { emitEvent: false, source: 'worldService:getPaletteId' });
    return resolved;
  }

  setPaletteId(value) {
    this._ensureInitialised();
    const resolved = this._setNumberGlobal('numPalette', value, getPaletteIdValue(0));
    updatePaletteIdValue(resolved, { source: 'worldService:setPaletteId' });
    return resolved;
  }

  getNightPaletteFlag() {
    this._ensureInitialised();
    const resolved = this._getBooleanGlobal('nightPalette', getNightPaletteValue(false));
    updateNightPaletteValue(resolved, { emitEvent: false, source: 'worldService:getNightPalette' });
    return resolved;
  }

  setNightPaletteFlag(value) {
    this._ensureInitialised();
    const resolved = this._setBooleanGlobal('nightPalette', value);
    updateNightPaletteValue(resolved, { source: 'worldService:setNightPalette' });
    return resolved;
  }

  getLayer() {
    this._ensureInitialised();
    const resolved = this._getNumberGlobal('layer', getLayerValue(0));
    updateLayerValue(resolved, { emitEvent: false, source: 'worldService:getLayer' });
    return resolved;
  }

  setLayer(value) {
    this._ensureInitialised();
    const resolved = this._setNumberGlobal('layer', value, getLayerValue(0));
    updateLayerValue(resolved, { source: 'worldService:setLayer' });
    return resolved;
  }

  getCash() {
    this._ensureInitialised();
    const cash = this._getNumberGlobal('cash', 0);
    updateCashValue(cash, { emitEvent: false, source: 'worldService:get' });
    return cash;
  }

  setCash(value) {
    this._ensureInitialised();
    const resolved = Number.isFinite(value) ? Math.trunc(value) : 0;
    stateService.setGlobal('cash', resolved);
    updateCashValue(resolved, { source: 'worldService' });
    return resolved;
  }

  adjustCash(delta) {
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

  _getNumberGlobal(key, fallback = 0) {
    this._ensureInitialised();
    const value = stateService.getGlobal(key);
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  _setNumberGlobal(key, value, fallback = 0) {
    this._ensureInitialised();
    const resolved = Number.isFinite(value) ? Math.trunc(value) : fallback;
    stateService.setGlobal(key, resolved);
    return resolved;
  }

  _adjustNumberGlobal(key, delta, fallback = 0) {
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

  _getBooleanGlobal(key, fallback = false) {
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

  _setBooleanGlobal(key, value) {
    this._ensureInitialised();
    const resolved = !!value;
    stateService.setGlobal(key, resolved);
    return resolved;
  }

  _getValueGlobal(key, fallback = null) {
    this._ensureInitialised();
    const value = stateService.getGlobal(key);
    return typeof value === 'undefined' ? fallback : value;
  }

  _setValueGlobal(key, value) {
    this._ensureInitialised();
    stateService.setGlobal(key, value);
    return value;
  }

  getObjectDescTable() {
    const value = this._getValueGlobal('objectDesc', null);
    updateObjectDescValue(typeof value === 'undefined' ? null : value, { emitEvent: false, source: 'worldService:getObjectDescTable' });
    return value;
  }

  setObjectDescTable(value) {
    const resolved = this._setValueGlobal('objectDesc', value);
    updateObjectDescValue(typeof resolved === 'undefined' ? null : resolved, { source: 'worldService:setObjectDescTable' });
    return resolved;
  }

  getInventoryMenuIndex() {
    return getInventoryMenuIndexValue(this._getNumberGlobal('curInvMenuItem', 0));
  }

  setInventoryMenuIndex(value) {
    const resolved = this._setNumberGlobal('curInvMenuItem', value, 0);
    updateInventoryMenuIndex(resolved, { source: 'worldService' });
    return resolved;
  }

  getSystemMenuIndex() {
    return getSystemMenuIndexValue(this._getNumberGlobal('curSystemMenuItem', 0));
  }

  setSystemMenuIndex(value) {
    const resolved = this._setNumberGlobal('curSystemMenuItem', value, 0);
    updateSystemMenuIndex(resolved, { source: 'worldService' });
    return resolved;
  }

  getMainMenuIndex() {
    return getMainMenuIndexValue(this._getNumberGlobal('curMainMenuItem', 0));
  }

  setMainMenuIndex(value) {
    const resolved = this._setNumberGlobal('curMainMenuItem', value, 0);
    updateMainMenuIndex(resolved, { source: 'worldService' });
    return resolved;
  }

  getLastEventObjectId() {
    return this._getNumberGlobal('lastEventObjectId', 0);
  }

  setLastEventObjectId(value) {
    return this._setNumberGlobal('lastEventObjectId', value, 0);
  }

  getNoMusicFlag() {
    return getNoMusicFlagValue(this._getBooleanGlobal('noMusic', false));
  }

  setNoMusicFlag(value) {
    const resolved = this._setBooleanGlobal('noMusic', value);
    updateNoMusicFlag(resolved, { source: 'worldService' });
    return resolved;
  }

  getNoSoundFlag() {
    return getNoSoundFlagValue(this._getBooleanGlobal('noSound', false));
  }

  setNoSoundFlag(value) {
    const resolved = this._setBooleanGlobal('noSound', value);
    updateNoSoundFlag(resolved, { source: 'worldService' });
    return resolved;
  }

  getCurrentMusicTrackId() {
    return this._getNumberGlobal('wNumMusic', 0);
  }

  setCurrentMusicTrackId(value) {
    return this._setNumberGlobal('wNumMusic', value, 0);
  }

  getAutoBattle() {
    return getAutoBattleValue(this._getBooleanGlobal('autoBattle', false));
  }

  setAutoBattle(value) {
    const resolved = this._setBooleanGlobal('autoBattle', value);
    updateAutoBattle(resolved, { source: 'worldService' });
    return resolved;
  }

  getChaseRange() {
    const value = this._getNumberGlobal('chaseRange', getChaseRangeFlagValue(0));
    updateChaseRangeValue(value, { emitEvent: false, source: 'worldService:getChaseRange' });
    return value;
  }

  setChaseRange(value) {
    const resolved = this._setNumberGlobal('chaseRange', value, getChaseRangeFlagValue(0));
    updateChaseRangeValue(resolved, { source: 'worldService:setChaseRange' });
    return resolved;
  }

  adjustChaseRange(delta) {
    const resolved = this._adjustNumberGlobal('chaseRange', delta, getChaseRangeFlagValue(0));
    updateChaseRangeValue(resolved, { source: 'worldService:adjustChaseRange' });
    return resolved;
  }

  getChaseSpeedChangeCycles() {
    const value = this._getNumberGlobal('chaseSpeedChangeCycles', getChaseSpeedFlagValue(0));
    updateChaseSpeedCyclesValue(value, { emitEvent: false, source: 'worldService:getChaseSpeedChangeCycles' });
    return value;
  }

  setChaseSpeedChangeCycles(value) {
    const resolved = this._setNumberGlobal('chaseSpeedChangeCycles', value, getChaseSpeedFlagValue(0));
    updateChaseSpeedCyclesValue(resolved, { source: 'worldService:setChaseSpeedChangeCycles' });
    return resolved;
  }

  adjustChaseSpeedChangeCycles(delta) {
    const resolved = this._adjustNumberGlobal('chaseSpeedChangeCycles', delta, getChaseSpeedFlagValue(0));
    updateChaseSpeedCyclesValue(resolved, { source: 'worldService:adjustChaseSpeedChangeCycles' });
    return resolved;
  }

  getCollectValue() {
    const value = this._getNumberGlobal('collectValue', getCollectFlagValue(0));
    updateCollectValue(value, { emitEvent: false, source: 'worldService:getCollectValue' });
    return value;
  }

  setCollectValue(value) {
    const resolved = this._setNumberGlobal('collectValue', value, getCollectFlagValue(0));
    updateCollectValue(resolved, { source: 'worldService:setCollectValue' });
    return resolved;
  }

  adjustCollectValue(delta) {
    const resolved = this._adjustNumberGlobal('collectValue', delta, getCollectFlagValue(0));
    updateCollectValue(resolved, { source: 'worldService:adjustCollectValue' });
    return resolved;
  }

  getCurPlayingRng() {
    return this._getValueGlobal('curPlayingRNG', 0);
  }

  setCurPlayingRng(value) {
    return this._setValueGlobal('curPlayingRNG', value);
  }

  getFrameCount() {
    return getFrameCountValue(this._getNumberGlobal('frameNum', 0));
  }

  setFrameCount(value) {
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

  setInBattle(value) {
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

  setCurrentSaveSlot(value) {
    return this._setNumberGlobal('currentSaveSlot', value, 1);
  }

  getLastUnequippedItem() {
    const value = this._getNumberGlobal('lastUnequippedItem', 0);
    updateLastUnequippedValue(value, { emitEvent: false, source: 'worldService:get' });
    return value;
  }

  setLastUnequippedItem(value) {
    const resolved = this._setNumberGlobal('lastUnequippedItem', value, 0);
    updateLastUnequippedValue(resolved, { source: 'worldService' });
    return resolved;
  }

  setMaxPartyMemberIndex(value) {
    const resolved = this._setNumberGlobal('maxPartyMemberIndex', value, 0);
    updateMaxPartyIndexValue(resolved, { source: 'worldService' });
    return resolved;
  }

  isEnteringScene() {
    return this._getBooleanGlobal('enteringScene', false);
  }

  setEnteringScene(value) {
    return this._setBooleanGlobal('enteringScene', value);
  }

  setMusicTrack(value) {
    const resolved = this._setNumberGlobal('musicNum', value, 0);
    updateMusicTrackValue(resolved, { source: 'worldService:setMusicTrack' });
    return resolved;
  }

  setBattleMusicTrack(value) {
    const resolved = this._setNumberGlobal('numBattleMusic', value, 0);
    updateBattleMusicTrackValue(resolved, { source: 'worldService:setBattleMusicTrack' });
    return resolved;
  }

  setBattleFieldId(value) {
    const resolved = this._setNumberGlobal('numBattleField', value, 0);
    updateBattleFieldIdValue(resolved, { source: 'worldService:setBattleFieldId' });
    return resolved;
  }

  getBattleSpeed() {
    const value = this._getNumberGlobal('battleSpeed', getBattleSpeedFlagValue(2));
    updateBattleSpeedValue(value, { emitEvent: false, source: 'worldService:getBattleSpeed' });
    return value;
  }

  setBattleSpeed(value) {
    const resolved = this._setNumberGlobal('battleSpeed', value, getBattleSpeedFlagValue(2));
    updateBattleSpeedValue(resolved, { source: 'worldService:setBattleSpeed' });
    return resolved;
  }

  getMaxSpriteDrawLimit() {
    return this._maxSpriteDrawLimit;
  }

  setMaxSpriteDrawLimit(value) {
    const normalized = Number.isFinite(value) ? Math.trunc(value) : DEFAULT_MAX_SPRITE_TO_DRAW;
    this._maxSpriteDrawLimit = normalized;
    if (typeof globalThis !== 'undefined') {
      globalThis[LEGACY_SPRITE_LIMIT_KEY] = normalized;
    }
    return normalized;
  }

  getFrameNum() {
    return this.getFrameCount();
  }

  setFrameNum(value) {
    return this.setFrameCount(value);
  }

  adjustFrameNum(delta) {
    return this.incrementFrameCount(delta);
  }

  isGameStart() {
    return this._getBooleanGlobal('gameStart', false);
  }

  setGameStart(value) {
    return this._setBooleanGlobal('gameStart', value);
  }

  _handleGlobalChanged(event) {
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
      case 'objectDesc':
        updateObjectDescValue(typeof payload.value === 'undefined' ? null : payload.value, { source: 'worldService:legacyGlobal' });
        break;
      case 'equipmentEffect':
        updateEquipmentEffectValue(payload.value || [], { source: 'worldService:legacyGlobal' });
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

  _handleGameDataChanged(event) {
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
        updateObjectTableValue(getGameDataStore() && getGameDataStore().object ? getGameDataStore().object : [], { source: 'worldService:gameDataChanged' });
        break;
      default:
        break;
    }
  }
}

const worldService = new WorldService();

export { WorldService };
export default worldService;
