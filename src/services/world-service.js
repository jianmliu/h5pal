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
    const registry = this.registry;
    const gameData = getGameDataStore();
    const eventObjects = gameData && gameData.eventObject ? gameData.eventObject : [];
    const sceneId = stateService.getGlobal('numScene');
    const visited = new Set();
    for (let i = 0; i < eventObjects.length; i++) {
      const eventObject = eventObjects[i];
      let entityId = this.entityMaps.eventObject.get(i);
      if (!entityId) {
        entityId = registry.createEntity();
        registry.addComponent(entityId, WorldComponents.EventObject, createEventObjectComponent({
          id: i,
          stateRef: eventObject,
          sceneId,
          aiState: eventObject ? {
            triggerMode: eventObject.triggerMode,
            state: eventObject.state,
            autoScript: eventObject.autoScript
          } : null
        }));
        this.entityMaps.eventObject.set(i, entityId);
      } else {
        const component = registry.getComponent(entityId, WorldComponents.EventObject);
        if (component) {
          component.id = i;
          component.stateRef = eventObject;
          component.sceneId = sceneId;
          component.aiState = eventObject ? {
            triggerMode: eventObject.triggerMode,
            state: eventObject.state,
            autoScript: eventObject.autoScript
          } : null;
        }
      }
      const npcPayload = {
        id: i,
        sceneId,
        stateRef: eventObject,
        position: eventObject ? { x: eventObject.x, y: eventObject.y, layer: eventObject.layer } : null,
        direction: eventObject ? eventObject.direction : null,
        currentFrame: eventObject ? eventObject.currentFrameNum : null,
        state: eventObject ? eventObject.state : null,
        vanishTime: eventObject ? eventObject.vanishTime : null
      };
      const npcComponent = registry.getComponent(entityId, WorldComponents.NpcState);
      if (npcComponent) {
        npcComponent.id = npcPayload.id;
        npcComponent.sceneId = npcPayload.sceneId;
        npcComponent.stateRef = npcPayload.stateRef;
        npcComponent.position = npcPayload.position;
        npcComponent.direction = npcPayload.direction;
        npcComponent.currentFrame = npcPayload.currentFrame;
        npcComponent.state = npcPayload.state;
        npcComponent.vanishTime = npcPayload.vanishTime;
      } else {
        registry.addComponent(entityId, WorldComponents.NpcState, createNpcStateComponent(npcPayload));
      }
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
    component.mapId = typeof payload.mapId === 'number' ? payload.mapId : component.mapId;
    component.state = payload.state || null;
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
    this.syncEventObjects();
    return typeof result !== 'undefined' ? result : target;
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
