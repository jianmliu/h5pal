import Map from '../../js/pal/map.js';

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

const PAL_X = getGlobalFunction('PAL_X', (pos) => pos & 0xFFFF);
const PAL_Y = getGlobalFunction('PAL_Y', (pos) => (pos >> 16) & 0xFFFF);
const ObjectState = getGlobalObject('ObjectState') || {};

function decodePosition(position) {
  if (typeof position === 'number') {
    return {
      x: PAL_X(position),
      y: PAL_Y(position)
    };
  }
  if (position && typeof position.x === 'number' && typeof position.y === 'number') {
    return { x: position.x, y: position.y };
  }
  return null;
}

function computeTileIndices(x, y) {
  let tileX = Math.floor(x / 32);
  let tileY = Math.floor(y / 16);
  let tileH = 0;
  const xr = x % 32;
  const yr = y % 16;

  if ((xr + yr * 2) >= 16) {
    if ((xr + yr * 2) >= 48) {
      tileX++;
      tileY++;
    } else if ((32 - (xr + yr * 2)) > 16) {
      tileX++;
    } else if ((32 - (xr + yr * 2)) < 48) {
      tileH = 1;
    } else {
      tileY++;
    }
  }

  return { tileX, tileY, tileH };
}

function getMapInstance(mapId, cache, files) {
  if (mapId == null) {
    return null;
  }
  if (cache && cache[mapId]) {
    return cache[mapId];
  }
  const sources = files || getGlobalObject('Files') || {};
  if (!sources.MAP || !sources.GOP) {
    return null;
  }
  const instance = Map.fromFile(mapId, sources.MAP, sources.GOP);
  if (instance && cache) {
    cache[mapId] = instance;
  }
  return instance;
}

export default function collisionSystem(context = {}) {
  const world = context.worldService || context.world;
  if (!world) {
    return;
  }

  const mapMeta = context.mapMetaComponent || (typeof world.getMapMetaComponent === 'function'
    ? world.getMapMetaComponent()
    : null);
  const mapTile = context.mapTileComponent || (typeof world.getMapTileComponent === 'function'
    ? world.getMapTileComponent()
    : null);
  const mapId = (mapMeta && typeof mapMeta.mapId === 'number')
    ? mapMeta.mapId
    : (mapTile && typeof mapTile.mapId === 'number' ? mapTile.mapId : null);

  const mapInstance = getMapInstance(mapId, context.mapCache, context.Files);

  const eventIds = typeof world.getEventObjectIds === 'function' ? world.getEventObjectIds() : [];
  const eventStates = eventIds.map((eventIndex) => {
    const component = world.getEventObjectComponent(eventIndex);
    return {
      id: eventIndex,
      stateRef: component && component.stateRef ? component.stateRef : null
    };
  });

  const collisionState = {
    mapId,
    isBlocked(position, options = {}) {
      const coords = decodePosition(position);
      if (!coords) {
        return false;
      }
      const { tileX, tileY, tileH } = computeTileIndices(coords.x, coords.y);
      if (!mapInstance) {
        return false;
      }
      if (tileX < 0 || tileY < 0 || tileX >= 64 || tileY >= 128) {
        return true;
      }
      if (mapInstance.isTileBlocked(tileX, tileY, tileH)) {
        if (options.checkEventObjects === false) {
          return true;
        }
        const allowByEvent = eventStates.some((evt) => {
          const stateRef = evt.stateRef;
          if (!stateRef) {
            return false;
          }
          const blockerThreshold = typeof ObjectState.Blocker === 'number' ? ObjectState.Blocker : 2;
          if (typeof stateRef.state === 'number' && stateRef.state >= blockerThreshold) {
            return false;
          }
          const dxEvt = Math.abs(stateRef.x - coords.x);
          const dyEvt = Math.abs(stateRef.y - coords.y);
          return dxEvt + dyEvt * 2 < 16;
        });
        if (!allowByEvent) {
          return true;
        }
      }
      if (options.checkEventObjects === false) {
        return false;
      }
      const ignoreId = typeof options.selfEventIndex === 'number'
        ? options.selfEventIndex
        : (typeof options.selfId === 'number' ? options.selfId : null);
      for (let i = 0; i < eventStates.length; i++) {
        const evt = eventStates[i];
        const stateRef = evt.stateRef;
        if (!stateRef) {
          continue;
        }
        if (ignoreId != null && evt.id === ignoreId) {
          continue;
        }
        const blockerThreshold = typeof ObjectState.Blocker === 'number' ? ObjectState.Blocker : 2;
        if (typeof stateRef.state === 'number' && stateRef.state < blockerThreshold) {
          continue;
        }
        const dx = Math.abs(evt.stateRef.x - coords.x);
        const dy = Math.abs(evt.stateRef.y - coords.y);
        if (dx + dy * 2 < 16) {
          return true;
        }
      }
      return false;
    }
  };

  world.setCollisionState(collisionState);
}
