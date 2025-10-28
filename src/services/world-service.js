import EventBus from './event-bus.js';
import stateService from './state-service.js';
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
  }

  init() {
    if (this._initialised) {
      this.syncAll();
      return;
    }
    stateService.on('globalChanged', this._handleGlobalChanged);
    stateService.on('gameDataChanged', this._handleGameDataChanged);
    this._initialised = true;
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
  }

  _ensureInitialised() {
    if (!this._initialised) {
      this.init();
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
    this._ensureMoveQueue();
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
    this.fire('trailSynced', { trail });
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
  }

  syncEventObjects() {
    this._ensureInitialised();
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
  }

  getViewportComponent() {
    this._ensureInitialised();
    if (!this.entityMaps.viewport) {
      return null;
    }
    return this.registry.getComponent(this.entityMaps.viewport, WorldComponents.Viewport);
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
    if (!this.entityMaps.scriptRegister) {
      return null;
    }
    const component = registry.getComponent(this.entityMaps.scriptRegister, WorldComponents.ScriptRegister);
    if (!component || !Array.isArray(component.entries)) {
      return null;
    }
    return component.entries[entry] || null;
  }

  getViewport() {
    this._ensureInitialised();
    return stateService.getGlobal('viewport') || 0;
  }

  getPartyOffset() {
    this._ensureInitialised();
    return stateService.getGlobal('partyOffset') || 0;
  }

  setViewport(value) {
    this._ensureInitialised();
    stateService.setGlobal('viewport', value);
    this.syncViewport();
    return value;
  }

  mutateViewport(mutator) {
    this._ensureInitialised();
    const result = stateService.mutateGlobal('viewport', (current) => {
      if (typeof mutator !== 'function') {
        return current;
      }
      const next = mutator(current);
      return typeof next === 'undefined' ? current : next;
    });
    this.syncViewport();
    return result;
  }

  setPartyOffset(value) {
    this._ensureInitialised();
    stateService.setGlobal('partyOffset', value);
    this.syncViewport();
    return value;
  }

  mutatePartyOffset(mutator) {
    this._ensureInitialised();
    const result = stateService.mutateGlobal('partyOffset', (current) => {
      if (typeof mutator !== 'function') {
        return current;
      }
      const next = mutator(current);
      return typeof next === 'undefined' ? current : next;
    });
    this.syncViewport();
    return result;
  }

  mutateTrail(mutator) {
    this._ensureInitialised();
    const result = stateService.mutateGlobal('trail', (current) => {
      if (!current || typeof mutator !== 'function') {
        return current;
      }
      mutator(current);
      return current;
    });
    this.syncTrail();
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
    return Array.isArray(party) ? party : [];
  }

  getMaxPartyMemberIndex() {
    this._ensureInitialised();
    const value = stateService.getGlobal('maxPartyMemberIndex');
    if (typeof value === 'number') {
      return value;
    }
    const party = this.getParty();
    return party.length > 0 ? party.length - 1 : -1;
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

  getInventory() {
    this._ensureInitialised();
    const inventory = stateService.getGlobal('inventory');
    return Array.isArray(inventory) ? inventory : [];
  }

  mutateInventory(mutator) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return null;
    }
    return stateService.mutateGlobal('inventory', (inventory) => {
      const current = Array.isArray(inventory) ? inventory : [];
      const result = mutator(current);
      return typeof result === 'undefined' ? current : result;
    });
  }

  getInventorySlot(index) {
    const inventory = this.getInventory();
    if (index < 0 || index >= inventory.length) {
      return null;
    }
    return inventory[index] || null;
  }

  getInventoryCapacity() {
    return MAX_INVENTORY || this.getInventory().length;
  }

  getPlayerStatusMatrix() {
    this._ensureInitialised();
    const status = stateService.getGlobal('playerStatus');
    return Array.isArray(status) ? status : [];
  }

  mutatePlayerStatus(mutator) {
    this._ensureInitialised();
    if (typeof mutator !== 'function') {
      return null;
    }
    return stateService.mutateGlobal('playerStatus', (status) => {
      const current = Array.isArray(status) ? status : [];
      const result = mutator(current);
      return typeof result === 'undefined' ? current : result;
    });
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

  getPoisonStatusMatrix() {
    this._ensureInitialised();
    const status = stateService.getGlobal('poisonStatus');
    return Array.isArray(status) ? status : [];
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
    return updatedEntry;
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

  getObjectEntry(id) {
    this._ensureInitialised();
    const store = getGameDataStore();
    if (!store || !Array.isArray(store.object)) {
      return null;
    }
    return store.object[id] || null;
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
    return updatedEntry;
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
    return snapshot;
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
    return snapshot;
  }

  getPlayerRoles() {
    this._ensureInitialised();
    const store = getGameDataStore();
    return store && store.playerRoles ? store.playerRoles : null;
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

  getStoreEntry(id) {
    this._ensureInitialised();
    const store = getGameDataStore();
    if (!store || !Array.isArray(store.store)) {
      return null;
    }
    return store.store[id] || null;
  }

  getEnemyEntry(id) {
    this._ensureInitialised();
    const store = getGameDataStore();
    if (!store || !Array.isArray(store.enemy)) {
      return null;
    }
    return store.enemy[id] || null;
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

  getEnemyTeamEntry(id) {
    this._ensureInitialised();
    const store = getGameDataStore();
    if (!store || !Array.isArray(store.enemyTeam)) {
      return null;
    }
    return store.enemyTeam[id] || null;
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

  getBattleFieldEntry(id) {
    this._ensureInitialised();
    const store = getGameDataStore();
    if (!store || !Array.isArray(store.battleField)) {
      return null;
    }
    return store.battleField[id] || null;
  }

  getBattleEffectIndexRow(id) {
    this._ensureInitialised();
    const store = getGameDataStore();
    if (!store || !Array.isArray(store.battleEffectIndex)) {
      return null;
    }
    return store.battleEffectIndex[id] || null;
  }

  mutatePlayerRoles(mutator) {
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
    });
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
    });
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
    const store = getGlobalStore();
    return store && store.equipmentEffect ? store.equipmentEffect : null;
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
    return typeof result === 'undefined' ? entry : result;
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
    return this._mutateEquipmentEffectWord(part, fieldIndex, roleId, value);
  }

  adjustEquipmentEffectWord(part, fieldIndex, roleId, delta) {
    return this._mutateEquipmentEffectWord(part, fieldIndex, roleId, (current) => {
      const signedCurrent = toSignedWord(current);
      const signedDelta = toSignedWord(delta);
      const next = signedCurrent + signedDelta;
      return toUnsignedWord(next);
    });
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
    return stateService.getGlobal('exp');
  }

  mutateExpState(mutator) {
    this._ensureInitialised();
    return stateService.mutateGlobal('exp', (exp) => {
      if (exp && typeof mutator === 'function') {
        mutator(exp);
      }
      return exp;
    });
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

  getPartyDirection() {
    this._ensureInitialised();
    const dir = stateService.getGlobal('partyDirection');
    return typeof dir === 'number' ? dir : DEFAULT_PARTY_DIRECTION;
  }

  setPartyDirection(value) {
    this._ensureInitialised();
    const resolved = typeof value === 'number' ? value : DEFAULT_PARTY_DIRECTION;
    stateService.setGlobal('partyDirection', resolved);
    return resolved;
  }

  getFollowerCount() {
    this._ensureInitialised();
    const count = stateService.getGlobal('numFollower');
    return typeof count === 'number' ? count : 0;
  }

  setFollowerCount(value) {
    this._ensureInitialised();
    const resolved = Number.isFinite(value) ? Math.max(0, value | 0) : 0;
    stateService.setGlobal('numFollower', resolved);
    return resolved;
  }

  getScreenWave() {
    this._ensureInitialised();
    const wave = stateService.getGlobal('screenWave');
    return typeof wave === 'number' ? wave : 0;
  }

  setScreenWave(value) {
    this._ensureInitialised();
    const resolved = Number.isFinite(value) ? value | 0 : 0;
    stateService.setGlobal('screenWave', resolved);
    return resolved;
  }

  adjustScreenWave(delta) {
    this._ensureInitialised();
    const current = this.getScreenWave();
    const adjustment = Number.isFinite(delta) ? delta : 0;
    const next = (current + adjustment) | 0;
    stateService.setGlobal('screenWave', next);
    return next;
  }

  getWaveProgression() {
    this._ensureInitialised();
    const value = stateService.getGlobal('waveProgression');
    return typeof value === 'number' ? value : 0;
  }

  setWaveProgression(value) {
    this._ensureInitialised();
    const resolved = Number.isFinite(value) ? value | 0 : 0;
    stateService.setGlobal('waveProgression', resolved);
    return resolved;
  }

  getNeedToFadeIn() {
    this._ensureInitialised();
    return !!stateService.getGlobal('needToFadeIn');
  }

  setNeedToFadeIn(value) {
    this._ensureInitialised();
    const resolved = !!value;
    stateService.setGlobal('needToFadeIn', resolved);
    return resolved;
  }

  getPaletteId() {
    this._ensureInitialised();
    const value = stateService.getGlobal('numPalette');
    return typeof value === 'number' ? value : 0;
  }

  setPaletteId(value) {
    this._ensureInitialised();
    const resolved = Number.isFinite(value) ? value | 0 : 0;
    stateService.setGlobal('numPalette', resolved);
    return resolved;
  }

  getNightPaletteFlag() {
    this._ensureInitialised();
    return !!stateService.getGlobal('nightPalette');
  }

  setNightPaletteFlag(value) {
    this._ensureInitialised();
    const resolved = !!value;
    stateService.setGlobal('nightPalette', resolved);
    return resolved;
  }

  getLayer() {
    this._ensureInitialised();
    const layer = stateService.getGlobal('layer');
    return typeof layer === 'number' ? layer : 0;
  }

  setLayer(value) {
    this._ensureInitialised();
    const resolved = Number.isFinite(value) ? value | 0 : 0;
    stateService.setGlobal('layer', resolved);
    return resolved;
  }

  getCash() {
    this._ensureInitialised();
    const cash = stateService.getGlobal('cash');
    return typeof cash === 'number' ? cash : 0;
  }

  setCash(value) {
    this._ensureInitialised();
    const resolved = Number.isFinite(value) ? Math.trunc(value) : 0;
    stateService.setGlobal('cash', resolved);
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
    return this._getValueGlobal('objectDesc', null);
  }

  setObjectDescTable(value) {
    return this._setValueGlobal('objectDesc', value);
  }

  getInventoryMenuIndex() {
    return this._getNumberGlobal('curInvMenuItem', 0);
  }

  setInventoryMenuIndex(value) {
    return this._setNumberGlobal('curInvMenuItem', value, 0);
  }

  getSystemMenuIndex() {
    return this._getNumberGlobal('curSystemMenuItem', 0);
  }

  setSystemMenuIndex(value) {
    return this._setNumberGlobal('curSystemMenuItem', value, 0);
  }

  getMainMenuIndex() {
    return this._getNumberGlobal('curMainMenuItem', 0);
  }

  setMainMenuIndex(value) {
    return this._setNumberGlobal('curMainMenuItem', value, 0);
  }

  getNoMusicFlag() {
    return this._getBooleanGlobal('noMusic', false);
  }

  setNoMusicFlag(value) {
    return this._setBooleanGlobal('noMusic', value);
  }

  getNoSoundFlag() {
    return this._getBooleanGlobal('noSound', false);
  }

  setNoSoundFlag(value) {
    return this._setBooleanGlobal('noSound', value);
  }

  getCurrentMusicTrackId() {
    return this._getNumberGlobal('wNumMusic', 0);
  }

  setCurrentMusicTrackId(value) {
    return this._setNumberGlobal('wNumMusic', value, 0);
  }

  getAutoBattle() {
    return this._getBooleanGlobal('autoBattle', false);
  }

  setAutoBattle(value) {
    return this._setBooleanGlobal('autoBattle', value);
  }

  getChaseRange() {
    return this._getNumberGlobal('chaseRange', 0);
  }

  setChaseRange(value) {
    return this._setNumberGlobal('chaseRange', value, 0);
  }

  adjustChaseRange(delta) {
    return this._adjustNumberGlobal('chaseRange', delta, 0);
  }

  getChaseSpeedChangeCycles() {
    return this._getNumberGlobal('chaseSpeedChangeCycles', 0);
  }

  setChaseSpeedChangeCycles(value) {
    return this._setNumberGlobal('chaseSpeedChangeCycles', value, 0);
  }

  getCollectValue() {
    return this._getNumberGlobal('collectValue', 0);
  }

  setCollectValue(value) {
    return this._setNumberGlobal('collectValue', value, 0);
  }

  adjustCollectValue(delta) {
    return this._adjustNumberGlobal('collectValue', delta, 0);
  }

  getCurPlayingRng() {
    return this._getValueGlobal('curPlayingRNG', 0);
  }

  setCurPlayingRng(value) {
    return this._setValueGlobal('curPlayingRNG', value);
  }

  getFrameCount() {
    return this._getNumberGlobal('frameNum', 0);
  }

  setFrameCount(value) {
    return this._setNumberGlobal('frameNum', value, 0);
  }

  incrementFrameCount(delta = 1) {
    return this._adjustNumberGlobal('frameNum', delta, 0);
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
    return this._getNumberGlobal('lastUnequippedItem', 0);
  }

  setLastUnequippedItem(value) {
    return this._setNumberGlobal('lastUnequippedItem', value, 0);
  }

  setMaxPartyMemberIndex(value) {
    return this._setNumberGlobal('maxPartyMemberIndex', value, 0);
  }

  isEnteringScene() {
    return this._getBooleanGlobal('enteringScene', false);
  }

  setEnteringScene(value) {
    return this._setBooleanGlobal('enteringScene', value);
  }

  getMusicTrack() {
    return this._getNumberGlobal('musicNum', 0);
  }

  setMusicTrack(value) {
    return this._setNumberGlobal('musicNum', value, 0);
  }

  getBattleMusicTrack() {
    return this._getNumberGlobal('numBattleMusic', 0);
  }

  setBattleMusicTrack(value) {
    return this._setNumberGlobal('numBattleMusic', value, 0);
  }

  getBattleFieldId() {
    return this._getNumberGlobal('numBattleField', 0);
  }

  setBattleFieldId(value) {
    return this._setNumberGlobal('numBattleField', value, 0);
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
        break;
      case 'trail':
        this.syncTrail();
        break;
      case 'numScene':
        this.syncScene();
        this.syncMapMeta();
        this.syncMapTiles();
        this.syncEventObjects();
        this.ensureCollisionState();
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
        break;
      case 'map':
        this.syncScene();
        this.syncMapMeta();
        this.syncMapTiles();
        this.syncEventObjects();
        this.ensureCollisionState();
        break;
      case 'scriptEntry':
        this.syncScriptRegisters();
        break;
      default:
        break;
    }
  }
}

const worldService = new WorldService();

export { WorldService };
export default worldService;
