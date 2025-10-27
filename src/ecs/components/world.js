export const COMPONENTS = Object.freeze({
  Viewport: 'worldViewport',
  PartyMember: 'worldPartyMember',
  Trail: 'worldTrail',
  EventObject: 'worldEventObject',
  Scene: 'worldScene'
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
