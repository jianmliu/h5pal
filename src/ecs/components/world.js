export const COMPONENTS = Object.freeze({
  Viewport: 'worldViewport',
  PartyMember: 'worldPartyMember',
  Trail: 'worldTrail',
  EventObject: 'worldEventObject',
  Scene: 'worldScene',
  MapMeta: 'worldMapMeta',
  MapTile: 'worldMapTile',
  NpcState: 'worldNpcState',
  ScriptRegister: 'worldScriptRegister'
});

export function createViewportComponent(options = {}) {
  return {
    value: options.value != null ? options.value : 0,
    partyOffset: options.partyOffset != null ? options.partyOffset : 0
  };
}

export function createPartyMemberComponent(options = {}) {
  return {
    index: typeof options.index === 'number' ? options.index : -1,
    stateRef: options.stateRef || null,
    roleId: typeof options.roleId === 'number' ? options.roleId : null,
    metadata: options.metadata || null
  };
}

export function createTrailComponent(options = {}) {
  return {
    stateRef: options.stateRef || null
  };
}

export function createEventObjectComponent(options = {}) {
  return {
    id: typeof options.id === 'number' ? options.id : -1,
    stateRef: options.stateRef || null,
    sceneId: typeof options.sceneId === 'number' ? options.sceneId : null,
    aiState: options.aiState || null
  };
}

export function createSceneComponent(options = {}) {
  return {
    sceneId: typeof options.sceneId === 'number' ? options.sceneId : null,
    sceneRef: options.sceneRef || null,
    nextSceneRef: options.nextSceneRef || null,
    mapId: typeof options.mapId === 'number' ? options.mapId : null,
    mapRef: options.mapRef || null
  };
}

export function createMapMetaComponent(options = {}) {
  return {
    sceneId: typeof options.sceneId === 'number' ? options.sceneId : null,
    mapId: typeof options.mapId === 'number' ? options.mapId : null,
    sceneRef: options.sceneRef || null,
    mapRef: options.mapRef || null,
    scriptOnEnter: typeof options.scriptOnEnter === 'number' ? options.scriptOnEnter : null,
    scriptOnTeleport: typeof options.scriptOnTeleport === 'number' ? options.scriptOnTeleport : null
  };
}

export function createMapTileComponent(options = {}) {
  return {
    mapId: typeof options.mapId === 'number' ? options.mapId : null,
    sceneId: typeof options.sceneId === 'number' ? options.sceneId : null,
    width: typeof options.width === 'number' ? options.width : 0,
    height: typeof options.height === 'number' ? options.height : 0,
    layers: options.layers || null,
    tileData: options.tileData || null
  };
}

export function createNpcStateComponent(options = {}) {
  return {
    id: typeof options.id === 'number' ? options.id : -1,
    sceneId: typeof options.sceneId === 'number' ? options.sceneId : null,
    stateRef: options.stateRef || null,
    position: options.position || null,
    direction: typeof options.direction === 'number' ? options.direction : null,
    currentFrame: typeof options.currentFrame === 'number' ? options.currentFrame : null,
    state: typeof options.state === 'number' ? options.state : null,
    vanishTime: typeof options.vanishTime === 'number' ? options.vanishTime : null
  };
}

export function createScriptRegisterComponent(options = {}) {
  return {
    count: typeof options.count === 'number' ? options.count : 0,
    entries: options.entries || null,
    lastSynced: options.lastSynced || Date.now()
  };
}
