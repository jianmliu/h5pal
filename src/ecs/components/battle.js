export const COMPONENTS = Object.freeze({
  BattleActor: 'battleActor',
  Time: 'time',
  Stats: 'stats',
  Status: 'status',
  Position: 'position',
  Sprite: 'sprite',
  Animation: 'animation',
  Command: 'command',
  QueueEntry: 'queueEntry',
  UIState: 'uiState'
});

export const TAGS = Object.freeze({
  Player: 'player',
  Enemy: 'enemy'
});

export function createBattleActorComponent(options = {}) {
  return {
    type: options.type || 'unknown',
    index: typeof options.index === 'number' ? options.index : -1,
    roleId: typeof options.roleId === 'number' ? options.roleId : null,
    objectId: options.objectId != null ? options.objectId : null
  };
}

export function createTimeComponent(stateRef) {
  return {
    stateRef: stateRef || null
  };
}

export function createStatsComponent(options = {}) {
  return {
    type: options.type || 'unknown',
    actorIndex: typeof options.actorIndex === 'number' ? options.actorIndex : null,
    roleId: typeof options.roleId === 'number' ? options.roleId : null,
    statsRef: options.statsRef || null,
    extra: options.extra || null
  };
}

export function createStatusComponent(options = {}) {
  return {
    type: options.type || 'unknown',
    roleId: typeof options.roleId === 'number' ? options.roleId : null,
    playerIndex: typeof options.playerIndex === 'number' ? options.playerIndex : null,
    enemyIndex: typeof options.enemyIndex === 'number' ? options.enemyIndex : null,
    statusRef: options.statusRef || null
  };
}

export function createCommandComponent(options = {}) {
  return {
    type: options.type || 'unknown',
    commandRef: options.commandRef || null
  };
}

export function createPositionComponent(options = {}) {
  return {
    type: options.type || 'unknown',
    actorIndex: typeof options.actorIndex === 'number' ? options.actorIndex : null,
    stateRef: options.stateRef || null,
    current: options.current != null ? options.current : null,
    original: options.original != null ? options.original : null
  };
}

export function createSpriteComponent(options = {}) {
  return {
    type: options.type || 'unknown',
    actorIndex: typeof options.actorIndex === 'number' ? options.actorIndex : null,
    spriteRef: options.spriteRef || null,
    paletteRef: options.paletteRef || null,
    colorShiftRef: options.colorShiftRef || null
  };
}

export function createAnimationComponent(options = {}) {
  return {
    type: options.type || 'unknown',
    actorIndex: typeof options.actorIndex === 'number' ? options.actorIndex : null,
    stateRef: options.stateRef || null,
    currentFrame: options.currentFrame != null ? options.currentFrame : null,
    speedRef: options.speedRef || null,
    frameCount: options.frameCount != null ? options.frameCount : null,
    metadata: options.metadata || null
  };
}

export function createQueueEntryComponent(options = {}) {
  return {
    index: typeof options.index === 'number' ? options.index : -1,
    entryRef: options.entryRef || null,
    actorEntity: options.actorEntity || null,
    isEnemy: Boolean(options.isEnemy),
    actorType: options.actorType || null
  };
}

export function createUIStateComponent(options = {}) {
  var uiState = options.stateRef || null;
  return {
    stateRef: uiState,
    state: options.state != null ? options.state : (uiState ? uiState.state : null),
    menuState: options.menuState != null ? options.menuState : (uiState ? uiState.menuState : null),
    currentPlayer: options.currentPlayer != null ? options.currentPlayer : (uiState ? uiState.curPlayerIndex : null),
    selectedAction: options.selectedAction != null ? options.selectedAction : (uiState ? uiState.selectedAction : null),
    selectedIndex: options.selectedIndex != null ? options.selectedIndex : (uiState ? uiState.selectedIndex : null),
    autoBattle: options.autoBattle != null ? options.autoBattle : (uiState ? uiState.autoAttack : false)
  };
}
