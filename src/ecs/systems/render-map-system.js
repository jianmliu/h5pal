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

const PAL_X = getGlobalFunction('PAL_X', function(pos) {
  return pos & 0xFFFF;
});

const PAL_Y = getGlobalFunction('PAL_Y', function(pos) {
  return (pos >> 16) & 0xFFFF;
});

const RECT = getGlobalFunction('RECT', function(x, y, w, h) {
  return { x, y, w, h };
});

export default function renderMapSystem(context = {}) {
  const world = context.worldService || context.world;
  if (!world || typeof world.getViewportComponent !== 'function') {
    return;
  }
  const surface = context.surface;
  if (!surface || typeof surface.blitMap !== 'function') {
    return;
  }

  const viewportComponent = context.viewportComponent || world.getViewportComponent();
  if (!viewportComponent) {
    return;
  }

  const mapMeta = context.mapMetaComponent || (typeof world.getMapMetaComponent === 'function'
    ? world.getMapMetaComponent()
    : null);
  const mapTile = context.mapTileComponent || (typeof world.getMapTileComponent === 'function'
    ? world.getMapTileComponent()
    : null);
  if (!mapMeta && !mapTile) {
    return;
  }

  let mapId = context.mapId;
  if (typeof mapId !== 'number') {
    if (mapMeta && typeof mapMeta.mapId === 'number') {
      mapId = mapMeta.mapId;
    } else if (mapTile && typeof mapTile.mapId === 'number') {
      mapId = mapTile.mapId;
    }
  }
  if (typeof mapId !== 'number') {
    return;
  }

  const cache = context.mapCache || null;
  let mapInstance = cache && cache[mapId];
  if (!mapInstance) {
    const files = context.Files || getGlobalObject('Files') || {};
    if (files.MAP && files.GOP) {
      mapInstance = Map.fromFile(mapId, files.MAP, files.GOP);
      if (mapInstance && cache) {
        cache[mapId] = mapInstance;
      }
    }
  }
  if (!mapInstance) {
    return;
  }

  const viewportValue = typeof context.viewportValue === 'number'
    ? context.viewportValue
    : viewportComponent.value || 0;
  const rectInstance = typeof RECT === 'function'
    ? new RECT(PAL_X(viewportValue), PAL_Y(viewportValue), 320, 200)
    : { x: PAL_X(viewportValue), y: PAL_Y(viewportValue), w: 320, h: 200 };

  surface.blitMap(mapInstance, rectInstance, 0);
  surface.blitMap(mapInstance, rectInstance, 1);
}
