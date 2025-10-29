import reactiveContext from '../reactive-context.js';

const ENEMY_TEAM_KEY = 'world.battle.enemyTeam';
const ENEMY_POSITION_KEY = 'world.battle.enemyPositions';
const BATTLE_FIELD_KEY = 'world.battle.battleFields';

function normaliseArray(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value.length === 'number') {
    return value;
  }
  return [];
}

function setSignalValue(key, value, options = {}) {
  const previous = reactiveContext.getSignal(key, value);
  const signal = reactiveContext.ensureSignal(key, previous);
  if (signal.value !== value) {
    reactiveContext.setSignal(key, value);
    if (options.emitEvent !== false) {
      reactiveContext.rootEvent$.next({
        type: `world/battle/${key}/changed`,
        value,
        previous,
        source: options.source || 'worldService'
      });
    }
  }
  return value;
}

export function battleFormationSignals() {
  return {
    enemyTeam: reactiveContext.ensureSignal(ENEMY_TEAM_KEY, []),
    enemyPositions: reactiveContext.ensureSignal(ENEMY_POSITION_KEY, null),
    battleFields: reactiveContext.ensureSignal(BATTLE_FIELD_KEY, [])
  };
}

export function updateEnemyTeamValue(value, options = {}) {
  return setSignalValue(ENEMY_TEAM_KEY, normaliseArray(value), options);
}

export function updateEnemyPositionValue(value, options = {}) {
  return setSignalValue(ENEMY_POSITION_KEY, value || null, options);
}

export function updateBattleFieldValue(value, options = {}) {
  return setSignalValue(BATTLE_FIELD_KEY, normaliseArray(value), options);
}

export function resetBattleFormationSlice() {
  reactiveContext.setSignal(ENEMY_TEAM_KEY, []);
  reactiveContext.setSignal(ENEMY_POSITION_KEY, null);
  reactiveContext.setSignal(BATTLE_FIELD_KEY, []);
}
