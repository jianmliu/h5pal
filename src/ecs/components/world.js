export const COMPONENTS = Object.freeze({
  Viewport: 'worldViewport',
  PartyMember: 'worldPartyMember',
  Trail: 'worldTrail',
  EventObject: 'worldEventObject',
  Scene: 'worldScene',
  MapMeta: 'worldMapMeta',
  MapTile: 'worldMapTile',
  NpcState: 'worldNpcState',
  ScriptRegister: 'worldScriptRegister',
  MoveIntent: 'worldMoveIntent',
  MoveRequestQueue: 'worldMoveRequestQueue',
  CollisionState: 'worldCollisionState'
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

export function createMoveIntentComponent(options = {}) {
  return {
    id: typeof options.id === 'number' ? options.id : -1,
    dx: typeof options.dx === 'number' ? options.dx : 0,
    dy: typeof options.dy === 'number' ? options.dy : 0,
    direction: typeof options.direction === 'number' ? options.direction : null,
    speed: typeof options.speed === 'number' ? options.speed : 0,
    frames: typeof options.frames === 'number' ? options.frames : 1,
    origin: options.origin || 'script'
  };
}

export function createMoveRequestQueueComponent(options = {}) {
  return {
    requests: Array.isArray(options.requests) ? options.requests.slice() : []
  };
}

export function createCollisionStateComponent(options = {}) {
  return {
    mapId: typeof options.mapId === 'number' ? options.mapId : null,
    state: options.state || null,
    version: typeof options.version === 'number' ? options.version : 0
  };
}
