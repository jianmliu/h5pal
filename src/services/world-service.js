import EventBus from './event-bus.js';
import stateService from './state-service.js';
import {
  createEntityRegistry,
  WorldComponents,
  createViewportComponent,
  createPartyMemberComponent,
  createTrailComponent,
  createEventObjectComponent,
  createSceneComponent
} from '../ecs/index.js';

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

class WorldService extends EventBus {
  constructor() {
    super();
    this.registry = createEntityRegistry();
    this.entityMaps = {
      viewport: null,
      party: new Map(),
      trail: null,
      eventObject: new Map(),
      scene: null
    };
    this._initialised = false;
    this._handleGlobalChanged = this._handleGlobalChanged.bind(this);
    this._handleGameDataChanged = this._handleGameDataChanged.bind(this);
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
  }

  _ensureInitialised() {
    if (!this._initialised) {
      this.init();
    }
  }

  getRegistry() {
    return this.registry;
  }

  syncAll() {
    this.syncViewport();
    this.syncPartyMembers();
    this.syncTrail();
    this.syncScene();
    this.syncEventObjects();
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

  getEventObjectComponent(id) {
    this._ensureInitialised();
    const entityId = this.entityMaps.eventObject.get(id);
    if (!entityId) {
      return null;
    }
    return this.registry.getComponent(entityId, WorldComponents.EventObject);
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

  getMapData() {
    const component = this.getSceneComponent();
    return component ? component.mapRef : null;
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
    this.syncEventObjects();
    return result;
  }

  _handleGlobalChanged(event) {
    if (!event || !event.key) {
      return;
    }
    switch (event.key) {
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
        this.syncEventObjects();
        break;
      default:
        break;
    }
  }

  _handleGameDataChanged(event) {
    if (!event || !event.key) {
      return;
    }
    switch (event.key) {
      case 'eventObject':
        this.syncEventObjects();
        break;
      case 'scene':
      case 'map':
        this.syncScene();
        this.syncEventObjects();
        break;
      default:
        break;
    }
  }
}

const worldService = new WorldService();

export { WorldService };
export default worldService;
