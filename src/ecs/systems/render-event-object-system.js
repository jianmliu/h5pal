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

const SHORT = getGlobalFunction('SHORT', function(value) {
  const result = value & 0xFFFF;
  return (result & 0x8000) ? result - 0x10000 : result;
});

const ObjectState = getGlobalObject('ObjectState') || {};

export default function renderEventObjectSystem(context = {}) {
  const world = context.worldService || context.world;
  if (!world || typeof world.getViewportComponent !== 'function') {
    return;
  }
  const surface = context.surface;
  if (!surface) {
    return;
  }
  const addToDrawList = typeof context.addToDrawList === 'function' ? context.addToDrawList : null;
  if (!addToDrawList) {
    return;
  }
  const calcCoverTiles = typeof context.calcCoverTiles === 'function' ? context.calcCoverTiles : null;
  const getEventObjectSprite = typeof context.getEventObjectSprite === 'function' ? context.getEventObjectSprite : null;
  if (!getEventObjectSprite) {
    return;
  }

  const viewportComponent = context.viewportComponent || world.getViewportComponent();
  if (!viewportComponent) {
    return;
  }
  const viewportValue = typeof context.viewportValue === 'number'
    ? context.viewportValue
    : viewportComponent.value || 0;
  const viewportX = PAL_X(viewportValue);
  const viewportY = PAL_Y(viewportValue);
  const sceneId = typeof world.getSceneId === 'function' ? world.getSceneId() : null;

  const debugStr = typeof surface.__debugStr === 'function' ? surface.__debugStr.bind(surface) : null;
  const sceneEventObjects = Array.isArray(context.sceneEventObjects)
    ? context.sceneEventObjects
    : null;
  if (sceneEventObjects && sceneEventObjects.length > 0) {
    for (let idx = 0; idx < sceneEventObjects.length; idx++) {
      const entry = sceneEventObjects[idx];
      if (!entry || !entry.state) {
        continue;
      }
      const eventObj = entry.state;
      if (!eventObj || eventObj.state == null) {
        continue;
      }
      if (eventObj.state === ObjectState.Hidden || eventObj.vanishTime > 0 || eventObj.state < 0) {
        continue;
      }
      const sprite = getEventObjectSprite(entry.id);
      if (!sprite) {
        continue;
      }
      let frameNum = eventObj.currentFrameNum || 0;
      if (eventObj.spriteFrames === 3) {
        if (frameNum === 2) {
          frameNum = 0;
        } else if (frameNum === 3) {
          frameNum = 2;
        }
      }
      const direction = typeof eventObj.direction === 'number' ? eventObj.direction : 0;
      const spriteFrames = typeof eventObj.spriteFrames === 'number' ? eventObj.spriteFrames : 1;
      const frame = sprite.getFrame(direction * spriteFrames + frameNum);
      if (!frame) {
        continue;
      }

      if (debugStr) {
        debugStr('[' + entry.id + ']', SHORT(eventObj.x) - viewportX, SHORT(eventObj.y) - viewportY, '#f00', 'middle', 'center', 24);
      }

      const screenX = SHORT(eventObj.x) - viewportX - ~~(frame.width / 2);
      if (screenX >= 320 || screenX < -frame.width) {
        continue;
      }
      const layerValue = eventObj.layer || 0;
      const screenY = SHORT(eventObj.y) - viewportY + layerValue * 8 + 9;
      const vy = screenY - frame.height - layerValue * 8 + 2;
      if (vy >= 200 || vy < -frame.height) {
        continue;
      }

      const spriteEntry = addToDrawList(frame, screenX, screenY, layerValue * 8 + 2);
      if (spriteEntry && calcCoverTiles) {
        calcCoverTiles(spriteEntry);
      }
    }
    return;
  }

  if (typeof world.getEventObjectsInCurrentScene !== 'function') {
    return;
  }

  const fallbackEntries = world.getEventObjectsInCurrentScene() || [];
  for (let idx = 0; idx < fallbackEntries.length; idx++) {
    const entry = fallbackEntries[idx];
    if (!entry || !entry.state) {
      continue;
    }
    const eventObj = entry.state;
    if (!eventObj) {
      continue;
    }
    if (eventObj.state == null) {
      continue;
    }
    if (eventObj.state === ObjectState.Hidden || eventObj.vanishTime > 0 || eventObj.state < 0) {
      continue;
    }

    const sprite = getEventObjectSprite(entry.id);
    if (!sprite) {
      continue;
    }
    let frameNum = eventObj.currentFrameNum || 0;
    if (eventObj.spriteFrames === 3) {
      if (frameNum === 2) {
        frameNum = 0;
      } else if (frameNum === 3) {
        frameNum = 2;
      }
    }
    const direction = typeof eventObj.direction === 'number' ? eventObj.direction : 0;
    const spriteFrames = typeof eventObj.spriteFrames === 'number' ? eventObj.spriteFrames : 1;
    const frame = sprite.getFrame(direction * spriteFrames + frameNum);
    if (!frame) {
      continue;
    }

    if (debugStr) {
      debugStr('[' + entry.id + ']', SHORT(eventObj.x) - viewportX, SHORT(eventObj.y) - viewportY, '#f00', 'middle', 'center', 24);
    }

    const screenX = SHORT(eventObj.x) - viewportX - ~~(frame.width / 2);
    if (screenX >= 320 || screenX < -frame.width) {
      continue;
    }
    const layerValue = eventObj.layer || 0;
    const screenY = SHORT(eventObj.y) - viewportY + layerValue * 8 + 9;
    const vy = screenY - frame.height - layerValue * 8 + 2;
    if (vy >= 200 || vy < -frame.height) {
      continue;
    }

    const spriteEntry = addToDrawList(frame, screenX, screenY, layerValue * 8 + 2);
    if (spriteEntry && calcCoverTiles) {
      calcCoverTiles(spriteEntry);
    }
  }
}
