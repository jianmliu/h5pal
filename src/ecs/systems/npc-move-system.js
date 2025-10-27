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

export default function npcMoveSystem(context = {}) {
  const world = context.worldService || context.world;
  if (!world || typeof world.drainMoveRequests !== 'function') {
    return;
  }

  const requests = world.drainMoveRequests();
  if (!requests || requests.length === 0) {
    return;
  }

  const collisionState = world.getCollisionState();
  const isBlocked = collisionState && typeof collisionState.isBlocked === 'function'
    ? collisionState.isBlocked
    : null;

  for (let i = 0; i < requests.length; i++) {
    const request = requests[i];
    const eventIndex = typeof request.eventIndex === 'number'
      ? request.eventIndex
      : (typeof request.eventObjectId === 'number' ? request.eventObjectId - 1 : null);
    if (eventIndex == null) {
      continue;
    }
    const eventComponent = world.getEventObjectComponent(eventIndex);
    const npcState = typeof world.getNpcStateByEventId === 'function'
      ? world.getNpcStateByEventId(eventIndex)
      : null;
    const stateRef = (npcState && npcState.stateRef) || (eventComponent && eventComponent.stateRef);
    if (!stateRef) {
      continue;
    }

    const dx = typeof request.dx === 'number' ? request.dx : 0;
    const dy = typeof request.dy === 'number' ? request.dy : 0;
    const nextX = stateRef.x + dx;
    const nextY = stateRef.y + dy;

    if (isBlocked && isBlocked({ x: nextX, y: nextY }, { selfEventIndex: eventIndex, checkEventObjects: true })) {
      continue;
    }

    stateRef.x = nextX;
    stateRef.y = nextY;
    if (typeof request.direction === 'number') {
      stateRef.direction = request.direction;
    }
    const spriteFrames = stateRef.spriteFrames || request.spriteFrames || 0;
    const spriteFramesAuto = stateRef.spriteFramesAuto || request.spriteFramesAuto || 0;
    if (spriteFrames > 0) {
      const cycle = spriteFrames === 3 ? 4 : spriteFrames;
      stateRef.currentFrameNum = (stateRef.currentFrameNum + 1) % cycle;
    } else if (spriteFramesAuto > 0) {
      stateRef.currentFrameNum = (stateRef.currentFrameNum + 1) % spriteFramesAuto;
    }

    if (npcState) {
      npcState.position = {
        x: stateRef.x,
        y: stateRef.y,
        layer: stateRef.layer || 0
      };
      npcState.direction = stateRef.direction;
      npcState.currentFrame = stateRef.currentFrameNum;
    }

    world.setMoveIntent(eventIndex, {
      id: eventIndex,
      dx,
      dy,
      direction: stateRef.direction,
      speed: request.speed || 0,
      origin: request.origin || 'script'
    });
  }
}
