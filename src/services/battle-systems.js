import EventBus from './event-bus.js';
import scriptService from './script-service.ts';
import worldService from './world-service.ts';
import sceneEventAdapter from './scene-event-adapter.js';
import partyTrailAdapter from './party-trail-adapter.js';
import {
  getPlayerStatusRow as getPlayerStatusRowSnapshot,
  getMaxPartyMemberIndex as getMaxPartyMemberIndexSnapshot,
  getPoisonStatusMatrix
} from './player-state-adapter.js';
import {
  getBattleStateSnapshot,
  isAutoBattleEnabled
} from './battle-state-adapter.js';
import { getBattleSpeed } from './game-flags-adapter.js';
import {
  BattleComponents,
  createQueueEntryComponent
} from '../ecs/index.js';
import input from '../js/pal/input.js';
import scene from '../js/pal/scene.js';

const DEFAULT_PIPELINE = [
  'time',
  'status',
  'ai',
  { phase: 'queue', generator: true },
  { phase: 'action', generator: true },
  'animation',
  'render'
];

function sortByActorIndexDescending(registry, entities) {
  return entities
    .map(function(entityId) {
      var actor = registry.getComponent(entityId, BattleComponents.BattleActor);
      return {
        id: entityId,
        actor: actor
      };
    })
    .filter(function(entry) {
      return entry.actor && typeof entry.actor.index === 'number';
    })
    .sort(function(a, b) {
      return b.actor.index - a.actor.index;
    });
}

function resolveEnemyEventObjectId(index) {
  if (!Number.isFinite(index)) {
    return index;
  }
  const resolved = typeof sceneEventAdapter.getEventObjectIdForRelativeIndex === 'function'
    ? sceneEventAdapter.getEventObjectIdForRelativeIndex(index)
    : null;
  return Number.isFinite(resolved) ? resolved : index;
}

function resolveEnemyScriptEntry(entry, enemyIndex) {
  if (Number.isFinite(entry) && entry > 0) {
    return entry;
  }
  if (entry === 0) {
    return 0;
  }
  const eventEntry = typeof sceneEventAdapter.getEventObjectEntryById === 'function'
    ? sceneEventAdapter.getEventObjectEntryById(resolveEnemyEventObjectId(enemyIndex))
    : null;
  const fallback = eventEntry && eventEntry.state ? eventEntry.state.triggerScript : null;
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}


function getGameData() {
  if (typeof globalThis !== 'undefined' && globalThis.GameData) {
    return globalThis.GameData;
  }
  if (typeof global !== 'undefined' && global.GameData) {
    return global.GameData;
  }
  return null;
}

function ensurePALX(pos) {
  if (typeof PAL_X === 'function') {
    return PAL_X(pos);
  }
  return pos & 0xFFFF;
}

function ensurePALY(pos) {
  if (typeof PAL_Y === 'function') {
    return PAL_Y(pos);
  }
  return (pos >> 16) & 0xFFFF;
}

function ensurePALXY(x, y) {
  if (typeof PAL_XY === 'function') {
    return PAL_XY(x, y);
  }
  return ((y & 0xFFFF) << 16) | (x & 0xFFFF);
}

function getRandomLong(min, max) {
  if (typeof randomLong === 'function') {
    return randomLong(min, max);
  }
  var range = (max || 0) - (min || 0);
  return (min || 0) + Math.floor(Math.random() * (range + 1));
}

var timeChargingUnit = 1;
var lastChargeTick = typeof hrtime === 'function' ? hrtime() : Date.now();

function getFrameTime() {
  if (typeof FrameTime === 'number' && !isNaN(FrameTime)) {
    return FrameTime;
  }
  return 1000 / 24;
}

function getBattleUIStateEnum() {
  if (typeof BattleUIState !== 'undefined' && BattleUIState) {
    return BattleUIState;
  }
  return {};
}

function getBattleMenuStateEnum() {
  if (typeof BattleMenuState !== 'undefined' && BattleMenuState) {
    return BattleMenuState;
  }
  return {};
}

function getFighterStateEnum() {
  if (typeof FighterState !== 'undefined' && FighterState) {
    return FighterState;
  }
  return {
    Wait: 0,
    Com: 1,
    Act: 2
  };
}

function getStatusCount() {
  if (typeof PlayerStatus !== 'undefined' &&
      PlayerStatus &&
      typeof PlayerStatus.All === 'number') {
    return PlayerStatus.All;
  }
  return 9;
}

function getPartyList() {
  var party = partyTrailAdapter.getPartyState();
  if (!Array.isArray(party)) {
    return [];
  }
  return party;
}

function getPartyEntry(index) {
  var party = getPartyList();
  if (index < 0 || index >= party.length) {
    return null;
  }
  return party[index] || null;
}

function getPlayerStatusRow(roleId) {
  if (typeof roleId !== 'number' || roleId < 0) {
    return null;
  }
  return getPlayerStatusRowSnapshot(roleId);
}

function safeGetPlayerDexterity(roleId) {
  if (typeof roleId !== 'number' || roleId < 0) {
    return 1;
  }
  try {
    var value = scriptService.getPlayerDexterity(roleId);
    if (typeof value === 'number' && !isNaN(value) && value > 0) {
      return value;
    }
  } catch (err) {
    if (typeof log !== 'undefined' && log && typeof log.warn === 'function') {
      log.warn('[BATTLE] getPlayerDexterity fallback', err);
    }
  }
  var gameData = getGameData();
  if (gameData && gameData.playerRoles && Array.isArray(gameData.playerRoles.dexterity)) {
    var fallback = gameData.playerRoles.dexterity[roleId];
    if (typeof fallback === 'number' && !isNaN(fallback) && fallback > 0) {
      return fallback;
    }
  }
  return 1;
}

export function recomputeTimeChargingUnit(context) {
  var primaryRole = 0;
  if (context && typeof context.primaryRole === 'number') {
    primaryRole = context.primaryRole;
  } else {
    var firstPartyEntry = getPartyEntry(0);
    if (firstPartyEntry && typeof firstPartyEntry.playerRole === 'number') {
      primaryRole = firstPartyEntry.playerRole;
    }
  }
  var baseDexterity = safeGetPlayerDexterity(primaryRole);
  if (!baseDexterity || baseDexterity <= 0) {
    baseDexterity = 1;
  }
  var unit = Math.pow(baseDexterity + 5, 0.3) / baseDexterity;
  var battleSpeed = getBattleSpeed() || 1;
  if (battleSpeed > 1) {
    unit /= (1 + (battleSpeed - 1) * 0.5);
  } else {
    unit /= 1.2;
  }
  timeChargingUnit = unit;
  lastChargeTick = typeof hrtime === 'function' ? hrtime() : Date.now();
  return timeChargingUnit;
}

function ensureTimeChargingUnit() {
  if (!timeChargingUnit || !isFinite(timeChargingUnit) || timeChargingUnit <= 0) {
    return recomputeTimeChargingUnit();
  }
  return timeChargingUnit;
}

function isSubmenuActive(uiState) {
  if (!uiState) {
    return false;
  }
  var uiEnum = getBattleUIStateEnum();
  if (uiEnum && typeof uiEnum.SelectMove !== 'undefined' && uiState.state !== uiEnum.SelectMove) {
    return false;
  }
  if (!uiEnum || typeof uiEnum.SelectMove === 'undefined') {
    return false;
  }
  if (uiState.state !== uiEnum.SelectMove) {
    return false;
  }
  var menuEnum = getBattleMenuStateEnum();
  var mainValue = menuEnum && typeof menuEnum.Main !== 'undefined'
    ? menuEnum.Main
    : 0;
  if (typeof uiState.menuState === 'undefined') {
    return false;
  }
  return uiState.menuState !== mainValue;
}

function isMessageActive(uiState, now) {
  if (!uiState || !uiState.msgShowTime) {
    return false;
  }
  return uiState.msgShowTime > now;
}

function getTimeChargingSpeed(dexterity, uiState, now) {
  if (!dexterity || dexterity <= 0) {
    return 0;
  }
  if (isSubmenuActive(uiState)) {
    return 0;
  }
  if (isMessageActive(uiState, now)) {
    return 0;
  }
  var speed = ensureTimeChargingUnit() * dexterity;
  if (isAutoBattleEnabled()) {
    speed *= 3;
  }
  return speed;
}

export function timeChargeSystem(runtime) {
  var battleService = runtime && runtime.battleService;
  if (!battleService || typeof battleService.getRegistry !== 'function') {
    return;
  }
  var registry = battleService.getRegistry();
  var state = battleService.getState();
  if (!registry || !state) {
    return;
  }
  var party = getPartyList();

  ensureTimeChargingUnit();

  var frameTime = getFrameTime();
  var now = typeof hrtime === 'function' ? hrtime() : Date.now();
  var delta = now - lastChargeTick;
  if (delta < 0 || delta > 500) {
    delta = frameTime;
  }
  lastChargeTick = now;

  var step = frameTime > 0 ? delta / frameTime : 0;
  if (step <= 0) {
    return;
  }

  var uiState = state.UI || {};
  if (isSubmenuActive(uiState) || isMessageActive(uiState, now)) {
    return;
  }

  var entities = registry.iterateEntitiesWith([BattleComponents.BattleActor, BattleComponents.Time]);
  if (!entities.length) {
    return;
  }

  var fighterStateEnum = getFighterStateEnum();
  var waitState = typeof fighterStateEnum.Wait === 'number' ? fighterStateEnum.Wait : 0;
  var comState = typeof fighterStateEnum.Com === 'number' ? fighterStateEnum.Com : 1;
  var hidingTime = state.hidingTime || 0;
  var battleModule = runtime && runtime.battle;
  var autoBattleEnabled = !!isAutoBattleEnabled();

  for (var i = 0; i < entities.length; i++) {
    var entityId = entities[i];
    var actor = registry.getComponent(entityId, BattleComponents.BattleActor);
    var timeComponent = registry.getComponent(entityId, BattleComponents.Time);
    if (!actor || !timeComponent || !timeComponent.stateRef) {
      continue;
    }

    var timeState = timeComponent.stateRef;
    if (timeState.state !== waitState) {
      continue;
    }

    if (actor.type === 'player') {
      var roleId = actor.roleId;
      if (typeof roleId !== 'number' && typeof actor.index === 'number') {
        var partyEntry = getPartyEntry(actor.index);
        if (partyEntry && typeof partyEntry.playerRole === 'number') {
          roleId = partyEntry.playerRole;
        }
      }
      var dexterity = null;
      if (battleModule && typeof battleModule.getPlayerActualDexterity === 'function' && typeof roleId === 'number') {
        dexterity = battleModule.getPlayerActualDexterity(roleId);
      }
      if (!dexterity || dexterity <= 0) {
        dexterity = safeGetPlayerDexterity(roleId);
      }
      var modifier = timeState.timeSpeedModifier != null ? timeState.timeSpeedModifier : 1;
      var increment = getTimeChargingSpeed(dexterity, uiState, now) * modifier * step;
      if (increment > 0) {
        var nextValue = timeState.timeMeter + increment;
        if (nextValue > 120) {
          nextValue = 120;
        }
        timeState.timeMeter = nextValue;
      }
    } else if (actor.type === 'enemy') {
      var enemyDexterity = null;
      if (battleModule && typeof battleModule.getEnemyDexterity === 'function') {
        enemyDexterity = battleModule.getEnemyDexterity(actor.index);
      }
      if (!enemyDexterity || enemyDexterity < 0) {
        enemyDexterity = 0;
      }
      var enemyIncrement = getTimeChargingSpeed(enemyDexterity, uiState, now) * step;
      if (enemyIncrement > 0 && autoBattleEnabled) {
        enemyIncrement /= 2;
      }
      if (enemyIncrement > 0) {
        var nextEnemyValue = timeState.timeMeter + enemyIncrement;
        if (nextEnemyValue > 120) {
          nextEnemyValue = 120;
        }
        timeState.timeMeter = nextEnemyValue;
        if (nextEnemyValue >= 100) {
          if (hidingTime === 0) {
            timeState.state = comState;
          } else {
            timeState.timeMeter = 0;
          }
        }
      }
    }
  }
}

export function statusDecaySystem(runtime) {
  var battleService = runtime && runtime.battleService;
  if (!battleService || typeof battleService.getRegistry !== 'function') {
    return;
  }
  var registry = battleService.getRegistry();
  if (!registry) {
    return;
  }
  var entities = registry.iterateEntitiesWith([BattleComponents.BattleActor, BattleComponents.Status]);
  if (!entities.length) {
    return;
  }

  var statusCount = getStatusCount();
  var playerRoles = new Set();
  var enemyEntries = [];

  for (var i = 0; i < entities.length; i++) {
    var entityId = entities[i];
    var actor = registry.getComponent(entityId, BattleComponents.BattleActor);
    var statusComp = registry.getComponent(entityId, BattleComponents.Status);
    if (!actor || !statusComp) {
      continue;
    }
    if (actor.type === 'player' && typeof statusComp.roleId === 'number') {
      playerRoles.add(statusComp.roleId);
    } else if (actor.type === 'enemy' && typeof actor.index === 'number') {
      enemyEntries.push({
        enemyIndex: actor.index,
        statusRef: statusComp.statusRef || null
      });
    }
  }

  if (playerRoles.size > 0) {
    var rolesArray = Array.from(playerRoles);
    worldService.mutatePlayerStatus(function(statusMatrix) {
      if (!statusMatrix) {
        return statusMatrix;
      }
      for (var idx = 0; idx < rolesArray.length; idx++) {
        var roleId = rolesArray[idx];
        var row = statusMatrix[roleId];
        if (!row) {
          continue;
        }
        for (var j = 0; j < statusCount; j++) {
          if (row[j] > 0) {
            row[j] = (row[j] || 0) - 1;
          }
        }
      }
      return statusMatrix;
    });
  }

  for (var k = 0; k < enemyEntries.length; k++) {
    var entry = enemyEntries[k];
    if (!entry.statusRef) {
      continue;
    }
    for (var m = 0; m < statusCount; m++) {
      if (entry.statusRef[m] > 0) {
        battleService.setEnemyStatus(entry.enemyIndex, m, function(value) {
          return value > 0 ? value - 1 : value;
        });
      }
    }
  }
}

export function aiPreparationSystem(runtime) {
  var battle = runtime && runtime.battle;
  if (!battle || typeof battle.playerCheckReady !== 'function') {
    return;
  }
  battle.playerCheckReady();
}

function getBattleState(battleService) {
  if (!battleService || typeof battleService.getState !== 'function') {
    return null;
  }
  var state = battleService.getState();
  if (state) {
    return state;
  }
  return getBattleStateSnapshot();
}

function setBattleFieldValue(battleService, field, value) {
  if (!battleService || typeof battleService.set !== 'function') {
    return null;
  }
  return battleService.set([field], value);
}

function mutateBattleFieldValue(battleService, field, mutator) {
  if (!battleService || typeof battleService.set !== 'function') {
    return null;
  }
  return battleService.set([field], function(current) {
    if (typeof mutator === 'function') {
      return mutator(current);
    }
    return mutator;
  });
}

function mutatePlayerState(battleService, index, mutator) {
  if (!battleService || typeof battleService.setPlayer !== 'function') {
    return null;
  }
  return battleService.setPlayer(index, function(player) {
    if (!player) {
      return player;
    }
    if (typeof mutator === 'function') {
      mutator(player);
    }
    return player;
  });
}

function mutateEnemyState(battleService, index, mutator) {
  if (!battleService || typeof battleService.updateEnemy !== 'function') {
    return null;
  }
  return battleService.updateEnemy(index, function(enemy) {
    if (!enemy) {
      return enemy;
    }
    if (typeof mutator === 'function') {
      mutator(enemy);
    }
    return enemy;
  });
}

function mutateUIState(battleService, mutator) {
  if (!battleService || typeof battleService.updateUI !== 'function') {
    return null;
  }
  return battleService.updateUI(function(uiState) {
    if (!uiState) {
      return uiState;
    }
    if (typeof mutator === 'function') {
      mutator(uiState);
    }
    return uiState;
  });
}

function getUIProperty(battleService, prop, fallback) {
  if (!battleService) {
    return typeof fallback === 'undefined' ? null : fallback;
  }
  var component = typeof battleService.getUIComponent === 'function'
    ? battleService.getUIComponent()
    : null;
  if (!component) {
    var state = getBattleState(battleService);
    if (state && state.UI && Object.prototype.hasOwnProperty.call(state.UI, prop)) {
      return state.UI[prop];
    }
    return typeof fallback === 'undefined' ? null : fallback;
  }
  if (prop === 'autoAttack' && typeof component.autoBattle !== 'undefined') {
    return component.autoBattle;
  }
  var uiState = component.stateRef || null;
  if (uiState && Object.prototype.hasOwnProperty.call(uiState, prop)) {
    return uiState[prop];
  }
  if (component && Object.prototype.hasOwnProperty.call(component, prop)) {
    return component[prop];
  }
  return typeof fallback === 'undefined' ? null : fallback;
}

function ensureActionQueueEntry(state, index) {
  if (!state || !Array.isArray(state.actionQueue)) {
    return null;
  }
  if (!state.actionQueue[index]) {
    state.actionQueue[index] = {
      index: 0xFFFF,
      dexterity: 0xFFFF,
      isEnemy: false
    };
  }
  var entry = state.actionQueue[index];
  if (typeof entry.index !== 'number') {
    entry.index = 0xFFFF;
  }
  if (typeof entry.dexterity !== 'number') {
    entry.dexterity = 0xFFFF;
  }
  if (typeof entry.isEnemy === 'undefined') {
    entry.isEnemy = false;
  }
  return entry;
}

function syncQueueEntryComponent(battleService, index, entry) {
  if (!battleService || typeof battleService.getRegistry !== 'function') {
    return;
  }
  var registry = battleService.getRegistry();
  if (!registry) {
    return;
  }
  var entityId = battleService.getQueueEntity ? battleService.getQueueEntity(index) : null;
  if (!entityId) {
    entityId = registry.createEntity();
    registry.addComponent(entityId, BattleComponents.QueueEntry, createQueueEntryComponent({
      index: index,
      entryRef: entry,
      actorEntity: entry && entry.isEnemy
        ? (battleService.getEnemyEntity ? battleService.getEnemyEntity(entry.index) : null)
        : (battleService.getPlayerEntity ? battleService.getPlayerEntity(entry.index) : null),
      actorType: entry ? (entry.isEnemy ? 'enemy' : 'player') : null,
      isEnemy: entry ? !!entry.isEnemy : false
    }));
    if (battleService.entityMaps && battleService.entityMaps.queue) {
      battleService.entityMaps.queue.set(index, entityId);
    }
    return;
  }
  var component = registry.getComponent(entityId, BattleComponents.QueueEntry);
  if (!component) {
    registry.addComponent(entityId, BattleComponents.QueueEntry, createQueueEntryComponent({
      index: index,
      entryRef: entry
    }));
    return;
  }
  component.index = index;
  component.entryRef = entry || null;
  component.isEnemy = entry ? !!entry.isEnemy : false;
  component.actorEntity = entry
    ? (entry.isEnemy
        ? (battleService.getEnemyEntity ? battleService.getEnemyEntity(entry.index) : null)
        : (battleService.getPlayerEntity ? battleService.getPlayerEntity(entry.index) : null))
    : null;
  component.actorType = entry ? (entry.isEnemy ? 'enemy' : 'player') : null;
}

function mutateInventory(mutator) {
  return worldService.mutateInventory(function(inventory) {
    if (!inventory || typeof mutator !== 'function') {
      return inventory;
    }
    mutator(inventory);
    return inventory;
  });
}

export function selectActionQueueSystem(runtime) {
  var battleService = runtime && runtime.battleService;
  var battle = runtime && runtime.battle;
  var onPlayerReady = runtime && runtime.onPlayerReady;
  if (!battleService) {
    return;
  }
  var state = getBattleState(battleService);
  if (!state || state.phase !== BattlePhase.SelectAction) {
    return;
  }

  if (getUIProperty(battleService, 'state', BattleUIState.Wait) != BattleUIState.Wait) {
    return;
  }

  var party = getPartyList();
  var partyLength = party.length;
  var rawMaxPartyIndex = getMaxPartyMemberIndexSnapshot();
  if (!Number.isFinite(rawMaxPartyIndex) || rawMaxPartyIndex < 0) {
    rawMaxPartyIndex = partyLength - 1;
  }
  var maxPartyIndex = Math.max(-1, Math.min(rawMaxPartyIndex, partyLength - 1));
  if (maxPartyIndex < 0) {
    return;
  }

  var playerRolesData = (typeof GameData !== 'undefined' && GameData) ? GameData.playerRoles : null;

  var i;
  for (i = 0; i <= maxPartyIndex; i++) {
    var partyEntry = party[i];
    if (!partyEntry) {
      continue;
    }
    var playerRole = partyEntry.playerRole;
    if (playerRole == null) {
      continue;
    }
    var statusRow = getPlayerStatusRow(playerRole);
    var hpZero = playerRolesData && playerRolesData.HP ? playerRolesData.HP[playerRole] == 0 : false;
    var asleep = statusRow && PlayerStatus && typeof PlayerStatus.Sleep === 'number'
      ? statusRow[PlayerStatus.Sleep] > 0
      : false;
    var confused = statusRow && PlayerStatus && typeof PlayerStatus.Confused === 'number'
      ? statusRow[PlayerStatus.Confused] > 0
      : false;
    var paralyzed = statusRow && PlayerStatus && typeof PlayerStatus.Paralyzed === 'number'
      ? statusRow[PlayerStatus.Paralyzed] > 0
      : false;
    if (hpZero || asleep || confused || paralyzed) {
      continue;
    }
    var playerState = state.player && state.player[i];
    if (playerState && playerState.state == FighterState.Wait) {
      setBattleFieldValue(battleService, 'movingPlayerIndex', i);
      mutatePlayerState(battleService, i, function(player) {
        player.state = FighterState.Com;
        player.defending = false;
        return player;
      });
      if (typeof onPlayerReady === 'function') {
        onPlayerReady(i);
      }
      break;
    } else if (playerState &&
               playerState.action &&
               playerState.action.actionType == BattleActionType.CoopMagic) {
      i = maxPartyIndex + 1;
      break;
    }
  }

  if (i <= maxPartyIndex) {
    return;
  }

  setBattleFieldValue(battleService, 'repeat', false);
  setBattleFieldValue(battleService, 'force', false);
  setBattleFieldValue(battleService, 'flee', false);
  setBattleFieldValue(battleService, 'curAction', 0);

  var queueLength = Const.MAX_ACTIONQUEUE_ITEMS;
  for (var resetIndex = 0; resetIndex < queueLength; resetIndex++) {
    var resetEntry = ensureActionQueueEntry(state, resetIndex);
    if (resetEntry) {
      resetEntry.index = 0xFFFF;
      resetEntry.dexterity = 0xFFFF;
      resetEntry.isEnemy = false;
      syncQueueEntryComponent(battleService, resetIndex, resetEntry);
    }
  }

  var queueCursor = 0;

  for (var enemyIndex = 0; enemyIndex <= state.maxEnemyIndex; enemyIndex++) {
    var enemyState = state.enemy && state.enemy[enemyIndex];
    if (!enemyState || enemyState.objectID == 0) {
      continue;
    }
    var enemyDexterity = (battle && typeof battle.getEnemyDexterity === 'function'
      ? battle.getEnemyDexterity(enemyIndex)
      : 0) * randomFloat(0.9, 1.1);
    var enemyEntry = ensureActionQueueEntry(state, queueCursor);
    if (enemyEntry) {
      enemyEntry.isEnemy = true;
      enemyEntry.index = enemyIndex;
      enemyEntry.dexterity = enemyDexterity;
      syncQueueEntryComponent(battleService, queueCursor, enemyEntry);
      queueCursor++;
    }

    if (enemyState.e &&
        enemyState.e.dualMove * 50 + randomLong(0, 100) > 100) {
      var extraDexterity = (battle && typeof battle.getEnemyDexterity === 'function'
        ? battle.getEnemyDexterity(enemyIndex)
        : 0) * randomFloat(0.9, 1.1);
      var extraEntry = ensureActionQueueEntry(state, queueCursor);
      if (extraEntry) {
        extraEntry.isEnemy = true;
        extraEntry.index = enemyIndex;
        extraEntry.dexterity = extraDexterity;
        syncQueueEntryComponent(battleService, queueCursor, extraEntry);
        queueCursor++;
      }
    }
  }

  for (var playerIndex = 0; playerIndex <= maxPartyIndex; playerIndex++) {
    var partyMember = party[playerIndex];
    if (!partyMember) {
      continue;
    }
    var roleId = partyMember.playerRole;
    var playerState = state.player && state.player[playerIndex];
    if (!playerState || !playerState.action) {
      continue;
    }
    var statusRowForRole = getPlayerStatusRow(roleId);
    var nextActionType = playerState.action.actionType;
    var nextState = playerState.state;
    var queueDexterity = 0;

    if ((playerRolesData && playerRolesData.HP ? playerRolesData.HP[roleId] == 0 : false) ||
        (statusRowForRole && PlayerStatus && typeof PlayerStatus.Sleep === 'number' ? statusRowForRole[PlayerStatus.Sleep] > 0 : false) ||
        (statusRowForRole && PlayerStatus && typeof PlayerStatus.Paralyzed === 'number' ? statusRowForRole[PlayerStatus.Paralyzed] > 0 : false)) {
      nextActionType = BattleActionType.Attack;
      nextState = FighterState.Act;
      queueDexterity = 0;
    } else {
      var dexterity = (battle && typeof battle.getPlayerActualDexterity === 'function')
        ? battle.getPlayerActualDexterity(roleId)
        : 0;
      if (!dexterity || dexterity <= 0) {
        dexterity = safeGetPlayerDexterity(roleId);
      }
      if (statusRowForRole && PlayerStatus && typeof PlayerStatus.Confused === 'number' && statusRowForRole[PlayerStatus.Confused] > 0) {
        nextActionType = BattleActionType.Attack;
        nextState = FighterState.Act;
      }
      switch (nextActionType) {
        case BattleActionType.CoopMagic:
          dexterity *= 10;
          break;
        case BattleActionType.Defend:
          dexterity *= 5;
          break;
        case BattleActionType.Magic:
          if ((GameData.object[playerState.action.actionID].magic.flags & MagicFlag.UsableToEnemy) == 0) {
            dexterity *= 3;
          }
          break;
        case BattleActionType.Flee:
          dexterity /= 2;
          break;
        case BattleActionType.UseItem:
          dexterity *= 3;
          break;
        default:
          break;
      }
      if (battle && typeof battle.isPlayerDying === 'function' &&
          battle.isPlayerDying(roleId)) {
        dexterity /= 2;
      }
      dexterity *= randomFloat(0.9, 1.1);
      queueDexterity = dexterity;
    }

    var playerEntry = ensureActionQueueEntry(state, queueCursor);
    if (playerEntry) {
      playerEntry.isEnemy = false;
      playerEntry.index = playerIndex;
      playerEntry.dexterity = queueDexterity;
      syncQueueEntryComponent(battleService, queueCursor, playerEntry);
    }

    mutatePlayerState(battleService, playerIndex, function(player) {
      player.action.actionType = nextActionType;
      player.state = nextState;
      return player;
    });

    queueCursor++;
  }

  if (Array.isArray(state.actionQueue)) {
    state.actionQueue.sort(function(a, b) {
      if (a.dexterity === 0xFFFF) return 1;
      if (b.dexterity === 0xFFFF) return -1;
      return -(a.dexterity - b.dexterity);
    });
    for (var syncIndex = 0; syncIndex < state.actionQueue.length; syncIndex++) {
      syncQueueEntryComponent(battleService, syncIndex, state.actionQueue[syncIndex]);
    }
  }

  setBattleFieldValue(battleService, 'phase', BattlePhase.PerformAction);
}

export function* performActionPhaseSystem(runtime) {
  var battleService = runtime && runtime.battleService;
  var battle = runtime && runtime.battle;
  var onlyPuppet = runtime && runtime.onlyPuppet;
  if (!battleService) {
    return;
  }
  var state = getBattleState(battleService);
  if (!state || state.phase !== BattlePhase.PerformAction) {
    return;
  }

  var partyEntries = getPartyList();
  var rawMaxPartyIndexPerform = getMaxPartyMemberIndexSnapshot();
  if (!Number.isFinite(rawMaxPartyIndexPerform) || rawMaxPartyIndexPerform < 0) {
    rawMaxPartyIndexPerform = partyEntries.length - 1;
  }
  var maxPartyMemberIndex = Math.max(-1, Math.min(rawMaxPartyIndexPerform, partyEntries.length - 1));
  var playerRolesData = (typeof GameData !== 'undefined' && GameData) ? GameData.playerRoles : null;

  var actionQueue = Array.isArray(state.actionQueue) ? state.actionQueue : [];
  var curActionIndex = state.curAction || 0;
  var queueEntry = actionQueue[curActionIndex];

  if (curActionIndex >= Const.MAX_ACTIONQUEUE_ITEMS ||
      !queueEntry ||
      queueEntry.dexterity == 0xFFFF) {
    for (var i = 0; i <= maxPartyMemberIndex; i++) {
      mutatePlayerState(battleService, i, function(player) {
        if (player) {
          player.defending = false;
        }
        return player;
      });
    }

    if (battle && typeof battle.backupStat === 'function') {
      battle.backupStat();
    }

    for (var partyIndex = 0; partyIndex <= maxPartyMemberIndex; partyIndex++) {
      var partyInfo = partyEntries[partyIndex];
      if (!partyInfo) {
        continue;
      }
      var partyRole = partyInfo.playerRole;
      for (var poisonSlot = 0; poisonSlot < Const.MAX_POISONS; poisonSlot++) {
        var poisonMatrix = getPoisonStatusMatrix();
        var poisonRow = poisonMatrix ? poisonMatrix[poisonSlot] : null;
        var poisonEntry = poisonRow ? poisonRow[partyIndex] : null;
        if (poisonEntry && poisonEntry.poisonID !== 0) {
          if (typeof poisonEntry.poisonScript === 'undefined') {
            console.warn('[BATTLE] player poison missing script', {
              partyIndex,
              partyRole,
              poisonSlot,
              entry: poisonEntry
            });
          }
          var nextScriptEntry = yield* scriptService.runTriggerScript(
            poisonEntry.poisonScript,
            partyRole
          );
          worldService.mutatePoisonStatus(function(currentMatrix) {
            var row = currentMatrix && currentMatrix[poisonSlot];
            if (row && row[partyIndex]) {
              row[partyIndex].poisonScript = nextScriptEntry;
            }
            return currentMatrix;
          });
        }
      }
    }

    for (var enemyIndex = 0; enemyIndex <= state.maxEnemyIndex; enemyIndex++) {
      var enemyState = state.enemy && state.enemy[enemyIndex];
      if (!enemyState) {
        continue;
      }
      for (var enemyPoison = 0; enemyPoison < Const.MAX_POISONS; enemyPoison++) {
        var enemySlot = enemyState.poisons ? enemyState.poisons[enemyPoison] : null;
        if (enemySlot && enemySlot.poisonID != 0) {
          if (typeof enemySlot.poisonScript === 'undefined') {
            console.warn('[BATTLE] enemy poison missing script', {
              enemyIndex,
              poisonSlot: enemyPoison,
              slot: enemySlot
            });
          }
          var nextEnemyScript = yield* scriptService.runTriggerScript(
            enemySlot.poisonScript,
            resolveEnemyEventObjectId(enemyIndex)
          );
          battleService.setEnemyPoison(enemyIndex, enemyPoison, function(slot) {
            slot.poisonScript = nextEnemyScript;
            return slot;
          });
        }
      }
    }

    battleService.runSystems('status', { battle: battle });
    if (battle && typeof battle.postActionCheck === 'function') {
      yield* battle.postActionCheck(false);
    }
    if (battle && typeof battle.displayStatChange === 'function' && battle.displayStatChange()) {
      if (battle.delay) {
        yield* battle.delay(8, 0, true);
      }
    }

    var hidingTime = state.hidingTime || 0;
    if (hidingTime > 0) {
      hidingTime--;
      battleService.setHidingTime(hidingTime);
      if (hidingTime == 0) {
        if (battle && typeof battle.backupScene === 'function') {
          battle.backupScene();
        }
        if (battle && typeof battle.makeScene === 'function') {
          battle.makeScene();
        }
        if (battle && typeof battle.fadeScene === 'function') {
          yield* battle.fadeScene();
        }
      }
    }

    if ((state.hidingTime || 0) == 0) {
      for (var enemyIdx = 0; enemyIdx <= state.maxEnemyIndex; enemyIdx++) {
        var enemyTurnState = state.enemy && state.enemy[enemyIdx];
        if (!enemyTurnState || enemyTurnState.objectID == 0 || !enemyTurnState.scriptOnTurnStart) {
          continue;
        }
        if (typeof enemyTurnState.scriptOnTurnStart === 'undefined') {
          console.warn('[BATTLE] enemy turn start script undefined', {
            enemyIndex: enemyIdx,
            enemyTurnState
          });
        }
        var enemyTurnEventId = resolveEnemyEventObjectId(enemyIdx);
        var initialTurnScript = resolveEnemyScriptEntry(enemyTurnState.scriptOnTurnStart, enemyIdx, 'triggerScript');
        if (Number.isFinite(initialTurnScript) && initialTurnScript > 0) {
          var turnStartResult = yield* scriptService.runTriggerScript(
            initialTurnScript,
            enemyTurnEventId
          );
          mutateEnemyState(battleService, enemyIdx, function(enemy) {
            enemy.scriptOnTurnStart = Number.isFinite(turnStartResult) && turnStartResult > 0
              ? turnStartResult
              : initialTurnScript;
            return enemy;
          });
        }
      }
    }

    mutateInventory(function(inventory) {
      if (!Array.isArray(inventory)) {
        return inventory;
      }
      for (var idx = 0; idx < Const.MAX_INVENTORY && idx < inventory.length; idx++) {
        var slot = inventory[idx];
        if (slot) {
          slot.amountInUse = 0;
        }
      }
      return inventory;
    });

    setBattleFieldValue(battleService, 'phase', BattlePhase.SelectAction);
    return;
  }

  var isEnemy = !!queueEntry.isEnemy;
  var actionIndex = queueEntry.index;

  if (isEnemy) {
    var actingEnemy = state.enemy && state.enemy[actionIndex];
      if ((state.hidingTime || 0) === 0 &&
          !onlyPuppet &&
          actingEnemy &&
          actingEnemy.objectID != 0) {
        if (actingEnemy.scriptOnReady) {
          if (typeof actingEnemy.scriptOnReady === 'undefined') {
            console.warn('[BATTLE] enemy ready script undefined', {
              enemyIndex: actionIndex,
              actingEnemy
            });
          }
          var readyEventId = resolveEnemyEventObjectId(actionIndex);
          var readyScript = resolveEnemyScriptEntry(actingEnemy.scriptOnReady, actionIndex, 'autoScript');
          if (Number.isFinite(readyScript) && readyScript > 0) {
            var readyScriptResult = yield* scriptService.runTriggerScript(
              readyScript,
              readyEventId
            );
            mutateEnemyState(battleService, actionIndex, function(enemy) {
              enemy.scriptOnReady = readyScriptResult;
              return enemy;
            });
          }
        }

      setBattleFieldValue(battleService, 'enemyMoving', true);
      if (battle && typeof battle.enemyPerformAction === 'function') {
        yield* battle.enemyPerformAction(actionIndex);
      }
      setBattleFieldValue(battleService, 'enemyMoving', false);
    }
  } else {
    var playerState = state.player && state.player[actionIndex];
    if (playerState && playerState.state == FighterState.Act) {
      var partyEntryForAction = partyEntries[actionIndex];
      var playerRole = partyEntryForAction ? partyEntryForAction.playerRole : null;
      var updatedActionType = null;

      var statusRowAction = playerRole != null ? getPlayerStatusRow(playerRole) : null;
      if (playerRole != null && playerRolesData && playerRolesData.HP && playerRolesData.HP[playerRole] == 0) {
        if (!statusRowAction || !statusRowAction[PlayerStatus.Puppet]) {
          updatedActionType = BattleActionType.Pass;
        }
      } else if (
        (statusRowAction && PlayerStatus && typeof PlayerStatus.Sleep === 'number' && statusRowAction[PlayerStatus.Sleep] > 0) ||
        (statusRowAction && PlayerStatus && typeof PlayerStatus.Paralyzed === 'number' && statusRowAction[PlayerStatus.Paralyzed] > 0)
      ) {
        updatedActionType = BattleActionType.Pass;
      } else if (statusRowAction && PlayerStatus && typeof PlayerStatus.Confused === 'number' && statusRowAction[PlayerStatus.Confused] > 0) {
        updatedActionType = BattleActionType.AttackMate;
      }

      if (updatedActionType !== null) {
        mutatePlayerState(battleService, actionIndex, function(player) {
          player.action.actionType = updatedActionType;
          return player;
        });
      }

      setBattleFieldValue(battleService, 'movingPlayerIndex', actionIndex);
      if (battle && typeof battle.playerPerformAction === 'function') {
        yield* battle.playerPerformAction(actionIndex);
      }
    }
  }

  mutateBattleFieldValue(battleService, 'curAction', function(value) {
    return (value || 0) + 1;
  });

  var menuState = getUIProperty(battleService, 'menuState', BattleMenuState.Main);
  var uiState = getUIProperty(battleService, 'state', BattleUIState.Wait);
  if (menuState == BattleMenuState.Main &&
      uiState == BattleUIState.SelectMove) {
    if (input.isKeyPressed && input.isKeyPressed(Key.ForceRepeat)) {
      setBattleFieldValue(battleService, 'repeat', true);
    } else if (input.isKeyPressed && input.isKeyPressed(Key.Force)) {
      setBattleFieldValue(battleService, 'force', true);
    }
  }

  var latestState = getBattleState(battleService);
  if (latestState.repeat) {
    input.keyPress = Key.Repeat;
  } else if (latestState.force) {
    input.keyPress = Key.Force;
  } else if (latestState.flee) {
    input.keyPress = Key.Flee;
  }
}

export class BattleSystemManager extends EventBus {
  constructor(battleService, baseContext) {
    super();
    this.battleService = battleService;
    this._systems = new Map();
    this._generatorSystems = new Map();
    this._context = baseContext || {};
    this._pipeline = [];
  }

  setContext(context) {
    this._context = context || {};
  }

  _normalizePipelineEntry(entry) {
    if (typeof entry === 'string') {
      return { phase: entry, generator: null };
    }
    if (entry && typeof entry.phase === 'string') {
      return {
        phase: entry.phase,
        generator: typeof entry.generator === 'undefined' || entry.generator === null
          ? null
          : Boolean(entry.generator)
      };
    }
    throw new Error('Invalid pipeline entry');
  }

  setPipeline(phases) {
    if (!Array.isArray(phases)) {
      throw new Error('pipeline must be an array');
    }
    var normalized = phases.map((entry) => this._normalizePipelineEntry(entry));
    var seen = Object.create(null);
    for (var i = 0; i < normalized.length; i++) {
      var phase = normalized[i].phase;
      if (seen[phase]) {
        throw new Error('Duplicate pipeline phase: ' + phase);
      }
      seen[phase] = true;
    }
    this._pipeline = normalized;
  }

  getPipeline() {
    return this._pipeline.slice();
  }

  register(phase, systemFn) {
    if (!phase || typeof systemFn !== 'function') {
      throw new Error('phase and system function are required');
    }
    var list = this._systems.get(phase);
    if (!list) {
      list = [];
      this._systems.set(phase, list);
    }
    list.push(systemFn);
  }

  registerGenerator(phase, systemFn) {
    if (!phase || typeof systemFn !== 'function') {
      throw new Error('phase and generator system function are required');
    }
    var list = this._generatorSystems.get(phase);
    if (!list) {
      list = [];
      this._generatorSystems.set(phase, list);
    }
    list.push(systemFn);
  }

  run(phase, context) {
    var systems = this._systems.get(phase);
    if (!systems || systems.length === 0) {
      return;
    }
    var runtime = Object.assign({}, this._context, context, {
      phase: phase,
      battleService: this.battleService
    });
    for (var i = 0; i < systems.length; i++) {
      var system = systems[i];
      this.fire('beforeSystem', { phase: phase, system: system.name || 'anonymous', context: runtime });
      system(runtime);
      this.fire('afterSystem', { phase: phase, system: system.name || 'anonymous', context: runtime });
    }
    this.fire('afterPhase', { phase: phase, context: runtime });
  }

  runPipeline(phases, context) {
    if (!Array.isArray(phases)) {
      phases = [phases];
    }
    for (var i = 0; i < phases.length; i++) {
      this.run(phases[i], context);
    }
  }

  *_runTickPhase(entry, context) {
    if (!entry || !entry.phase) {
      return;
    }
    var useGenerator = entry.generator;
    if (useGenerator === null) {
      useGenerator = this._generatorSystems.has(entry.phase);
    }
    if (useGenerator) {
      yield* this.runGenerator(entry.phase, context);
    } else {
      this.run(entry.phase, context);
    }
  }

  *_effectivePipeline(context) {
    var pipeline = this._pipeline && this._pipeline.length
      ? this._pipeline
      : DEFAULT_PIPELINE.map((entry) => this._normalizePipelineEntry(entry));
    for (var i = 0; i < pipeline.length; i++) {
      yield* this._runTickPhase(pipeline[i], context);
    }
  }

  *runTick(context) {
    yield* this._effectivePipeline(context);
  }

  onStateMutated(event) {
    this.fire('stateMutated', event);
  }

  onStateChanged(event) {
    this.fire('stateChanged', event);
  }

  *runGenerator(phase, context) {
    var systems = this._generatorSystems.get(phase);
    if (!systems || systems.length === 0) {
      return;
    }
    var runtime = Object.assign({}, this._context, context, {
      phase: phase,
      battleService: this.battleService
    });
    for (var i = 0; i < systems.length; i++) {
      var system = systems[i];
      this.fire('beforeSystem', { phase: phase, system: system.name || 'anonymous', context: runtime });
      var result = system(runtime);
      if (result && typeof result.next === 'function') {
        var step = result.next();
        while (!step.done) {
          yield step.value;
          step = result.next();
        }
      }
      this.fire('afterSystem', { phase: phase, system: system.name || 'anonymous', context: runtime });
    }
    this.fire('afterPhase', { phase: phase, context: runtime });
  }

  *runGeneratorPipeline(phases, context) {
    if (!Array.isArray(phases)) {
      phases = [phases];
    }
    for (var i = 0; i < phases.length; i++) {
      yield* this.runGenerator(phases[i], context);
    }
  }
}

export function idleAnimationSystem(runtime) {
  var battleService = runtime.battleService;
  var registry = battleService.getRegistry();
  var state = battleService.getState();
  if (!registry || !state) {
    return;
  }

  var gameData = getGameData();
  var battleRuntime = runtime && runtime.battle;
  var party = getPartyList();

  var playerEntities = registry.iterateEntitiesWith([
    BattleComponents.BattleActor,
    BattleComponents.Position,
    BattleComponents.Animation
  ]);

  for (var p = 0; p < playerEntities.length; p++) {
    var playerEntity = playerEntities[p];
    var actorComp = registry.getComponent(playerEntity, BattleComponents.BattleActor);
    if (!actorComp || actorComp.type !== 'player') {
      continue;
    }
    var playerState = state.player && state.player[actorComp.index];
    if (!playerState) {
      continue;
    }
    var positionComp = registry.getComponent(playerEntity, BattleComponents.Position);
    var animationComp = registry.getComponent(playerEntity, BattleComponents.Animation);
    var spriteComp = registry.getComponent(playerEntity, BattleComponents.Sprite);
    var statsComp = registry.getComponent(playerEntity, BattleComponents.Stats);

    var originalPos = positionComp && positionComp.original != null
      ? positionComp.original
      : playerState.originalPos;
    playerState.pos = originalPos;
    if (positionComp) {
      positionComp.current = originalPos;
      positionComp.stateRef = playerState;
    }

    playerState.colorShift = 0;
    if (spriteComp) {
      spriteComp.colorShiftRef = playerState;
    }

    var roleId = null;
    if (statsComp && typeof statsComp.roleId === 'number') {
      roleId = statsComp.roleId;
    } else if (party && party[actorComp.index]) {
      roleId = party[actorComp.index].playerRole;
    }

    var nextFrame = playerState.currentFrame || 0;
    var statusRow = statsComp && statsComp.extra ? statsComp.extra.statusRef : null;
    if (!statusRow && roleId != null) {
      statusRow = getPlayerStatusRow(roleId);
    }

    if (roleId != null && gameData && gameData.playerRoles && gameData.playerRoles.HP) {
      var currentHP = gameData.playerRoles.HP[roleId];
      if (currentHP === 0) {
        var puppet = statusRow && statusRow[PlayerStatus.Puppet] ? statusRow[PlayerStatus.Puppet] : 0;
        nextFrame = puppet === 0 ? 2 : 0;
      } else {
        var isDying = battleRuntime && typeof battleRuntime.isPlayerDying === 'function'
          ? battleRuntime.isPlayerDying(roleId)
          : false;
        if ((statusRow && statusRow[PlayerStatus.Sleep] !== 0) || isDying) {
          nextFrame = 1;
        } else if (playerState.defending && !state.enemyCleared) {
          nextFrame = 3;
        } else {
          nextFrame = 0;
        }
      }
    }

    playerState.currentFrame = nextFrame;
    if (animationComp) {
      animationComp.currentFrame = nextFrame;
      animationComp.stateRef = playerState;
    }
  }

  var enemyEntities = registry.iterateEntitiesWith([
    BattleComponents.BattleActor,
    BattleComponents.Position,
    BattleComponents.Animation
  ]);

  for (var e = 0; e < enemyEntities.length; e++) {
    var enemyEntity = enemyEntities[e];
    var enemyActor = registry.getComponent(enemyEntity, BattleComponents.BattleActor);
    if (!enemyActor || enemyActor.type !== 'enemy') {
      continue;
    }
    var enemyState = state.enemy && state.enemy[enemyActor.index];
    if (!enemyState || enemyState.objectID === 0) {
      continue;
    }
    var enemyPosition = registry.getComponent(enemyEntity, BattleComponents.Position);
    var enemyAnimation = registry.getComponent(enemyEntity, BattleComponents.Animation);
    var enemySprite = registry.getComponent(enemyEntity, BattleComponents.Sprite);

    var originalEnemyPos = enemyPosition && enemyPosition.original != null
      ? enemyPosition.original
      : enemyState.originalPos;
    enemyState.pos = originalEnemyPos;
    if (enemyPosition) {
      enemyPosition.current = originalEnemyPos;
      enemyPosition.stateRef = enemyState;
    }

    enemyState.colorShift = 0;
    if (enemySprite) {
      enemySprite.colorShiftRef = enemyState;
    }

    if (enemyState.status[PlayerStatus.Sleep] > 0 || enemyState.status[PlayerStatus.Paralyzed] > 0) {
      enemyState.currentFrame = 0;
      if (enemyAnimation) {
        enemyAnimation.currentFrame = 0;
        enemyAnimation.stateRef = enemyState;
      }
      continue;
    }

    if (enemyState.e) {
      var idleSpeed = enemyState.e.idleAnimSpeed != null ? enemyState.e.idleAnimSpeed : 0;
      idleSpeed = Math.max(idleSpeed - 1, 0);
      if (idleSpeed <= 0) {
        enemyState.currentFrame += 1;
        var gameDataStore = getGameData();
        var enemyObject = gameDataStore && gameDataStore.object ? gameDataStore.object[enemyState.objectID] : null;
        var enemyMeta = enemyObject && gameDataStore && gameDataStore.enemy
          ? gameDataStore.enemy[enemyObject.enemy.enemyID]
          : null;
        idleSpeed = enemyMeta && enemyMeta.idleAnimSpeed ? enemyMeta.idleAnimSpeed : 1;
      }
      enemyState.e.idleAnimSpeed = idleSpeed;
    }

    if (enemyState.e && enemyState.e.idleFrames != null && enemyState.currentFrame >= enemyState.e.idleFrames) {
      enemyState.currentFrame = 0;
    }

    if (enemyAnimation) {
      enemyAnimation.currentFrame = enemyState.currentFrame;
      enemyAnimation.stateRef = enemyState;
    }
  }

  if (typeof battleService.syncActorComponents === 'function') {
    battleService.syncActorComponents();
  }
}

export function renderSceneSystem(runtime) {
  var battleService = runtime.battleService;
  var surface = runtime.surface;
  if (!battleService || !surface) {
    return;
  }
  var registry = battleService.getRegistry();
  var state = battleService.getState();
  if (!registry || !state) {
    return;
  }

  var battleState = state;
  var background = battleState.background;
  var sceneBuf = battleState.sceneBuf;

  if (!background || !sceneBuf) {
    return;
  }

  var srcOffset = 0;
  var dstOffset = 0;
  for (var i = 0; i < surface.pitch * surface.height; i++) {
    var value = background[srcOffset] & 0x0F;
    value += battleState.backgroundColorShift;

    if (value & 0x80) {
      value = 0;
    } else if (value & 0x70) {
      value = 0x0F;
    }

    sceneBuf[dstOffset] = (value | (background[srcOffset] & 0xF0));
    srcOffset++;
    dstOffset++;
  }

  scene.applyWave(sceneBuf);

  var enemies = sortByActorIndexDescending(registry, registry.iterateEntitiesWith([
    BattleComponents.BattleActor,
    BattleComponents.Position,
    BattleComponents.Sprite,
    BattleComponents.Animation
  ])).filter(function(entry) {
    return entry.actor.type === 'enemy';
  });

  for (var eIndex = 0; eIndex < enemies.length; eIndex++) {
    var entry = enemies[eIndex];
    var enemyState = state.enemy && state.enemy[entry.actor.index];
    if (!enemyState || enemyState.objectID === 0 || !enemyState.sprite) {
      continue;
    }
    var pos = enemyState.pos;
    if (enemyState.status[PlayerStatus.Confused] > 0 &&
        enemyState.status[PlayerStatus.Sleep] == 0 &&
        enemyState.status[PlayerStatus.Paralyzed] == 0) {
      pos = ensurePALXY(ensurePALX(pos) + getRandomLong(-1, 1), ensurePALY(pos));
    }
    var frame = enemyState.sprite.getFrame(enemyState.currentFrame);
    var drawPos = ensurePALXY(
      ensurePALX(pos) - Math.floor(frame.width / 2),
      ensurePALY(pos) - frame.height
    );

    if (enemyState.colorShift && enemyState.colorShift !== 0) {
      surface.blitRLEWithColorShift(frame, drawPos, enemyState.colorShift, sceneBuf);
    } else {
      surface.blitRLE(frame, drawPos, sceneBuf);
    }
  }

  if (battleState.summonSprite) {
    var summonFrame = battleState.summonSprite.getFrame(battleState.summonFrame);
    var summonPos = ensurePALXY(
      ensurePALX(battleState.summonPos) - Math.floor(summonFrame.width / 2),
      ensurePALY(battleState.summonPos) - summonFrame.height
    );
    surface.blitRLE(summonFrame, summonPos, sceneBuf);
  } else {
    var players = sortByActorIndexDescending(registry, registry.iterateEntitiesWith([
      BattleComponents.BattleActor,
      BattleComponents.Position,
      BattleComponents.Sprite,
      BattleComponents.Animation,
      BattleComponents.Stats
    ])).filter(function(entry) {
      return entry.actor.type === 'player';
    });

    for (var pIndex = 0; pIndex < players.length; pIndex++) {
      var playerEntry = players[pIndex];
      var playerState = state.player && state.player[playerEntry.actor.index];
      if (!playerState || !playerState.sprite) {
        continue;
      }
      var statsComp = registry.getComponent(playerEntry.id, BattleComponents.Stats);
      var statusRow = statsComp && statsComp.extra ? statsComp.extra.statusRef : null;
    var roleId = statsComp && typeof statsComp.roleId === 'number'
      ? statsComp.roleId
      : (party && party[playerEntry.actor.index]
            ? party[playerEntry.actor.index].playerRole
            : null);
    if (!statusRow && roleId != null) {
      statusRow = getPlayerStatusRow(roleId);
    }
      var hpTable = getGameData() && getGameData().playerRoles ? getGameData().playerRoles.HP : null;

      if (statusRow &&
          statusRow[PlayerStatus.Confused] != 0 &&
          statusRow[PlayerStatus.Sleep] == 0 &&
          statusRow[PlayerStatus.Paralyzed] == 0 &&
          hpTable &&
          roleId != null &&
          hpTable[roleId] > 0) {
        continue;
      }

      var frame = playerState.sprite.getFrame(playerState.currentFrame);
      var drawPos = ensurePALXY(
        ensurePALX(playerState.pos) - Math.floor(frame.width / 2),
        ensurePALY(playerState.pos) - frame.height
      );

      if (playerState.colorShift && playerState.colorShift !== 0) {
        surface.blitRLEWithColorShift(frame, drawPos, playerState.colorShift, sceneBuf);
      } else if (battleState.hidingTime === 0) {
        surface.blitRLE(frame, drawPos, sceneBuf);
      }
    }

    for (var cpIndex = 0; cpIndex < players.length; cpIndex++) {
      var confusedEntry = players[cpIndex];
      var confusedState = state.player && state.player[confusedEntry.actor.index];
      if (!confusedState || !confusedState.sprite) {
        continue;
      }
      var stats = registry.getComponent(confusedEntry.id, BattleComponents.Stats);
      var statusRowConf = stats && stats.extra ? stats.extra.statusRef : null;
      var roleIdConf = stats && typeof stats.roleId === 'number'
        ? stats.roleId
        : (party && party[confusedEntry.actor.index]
            ? party[confusedEntry.actor.index].playerRole
            : null);
      if (!statusRowConf && roleIdConf != null) {
        statusRowConf = getPlayerStatusRow(roleIdConf);
      }
      var hpTableConf = getGameData() && getGameData().playerRoles ? getGameData().playerRoles.HP : null;

      if (!(statusRowConf &&
          statusRowConf[PlayerStatus.Confused] != 0 &&
          statusRowConf[PlayerStatus.Sleep] == 0 &&
          statusRowConf[PlayerStatus.Paralyzed] == 0 &&
          hpTableConf &&
          roleIdConf != null &&
          hpTableConf[roleIdConf] > 0)) {
        continue;
      }

      var confusedFrame = confusedState.sprite.getFrame(confusedState.currentFrame);
      var jitterPos = ensurePALXY(
        ensurePALX(confusedState.pos),
        ensurePALY(confusedState.pos) + getRandomLong(-1, 1)
      );
      var confusedDrawPos = ensurePALXY(
        ensurePALX(jitterPos) - Math.floor(confusedFrame.width / 2),
        ensurePALY(jitterPos) - confusedFrame.height
      );

      if (confusedState.colorShift && confusedState.colorShift !== 0) {
        surface.blitRLEWithColorShift(confusedFrame, confusedDrawPos, confusedState.colorShift, sceneBuf);
      } else if (battleState.hidingTime === 0) {
        surface.blitRLE(confusedFrame, confusedDrawPos, sceneBuf);
      }
    }
  }
}

export default function createBattleSystemManager(options) {
  var battleService = options && options.battleService;
  var surface = options && options.surface;
  var battle = options && options.battle;
  if (!battleService) {
    throw new Error('battleService is required to create a system manager');
  }
  var manager = new BattleSystemManager(battleService, { surface: surface, battle: battle });
  manager.register('time', timeChargeSystem);
  manager.register('status', statusDecaySystem);
  manager.register('ai', aiPreparationSystem);
  manager.register('animation', idleAnimationSystem);
  manager.register('render', renderSceneSystem);
  manager.registerGenerator('queue', selectActionQueueSystem);
  manager.registerGenerator('action', performActionPhaseSystem);
  manager.setPipeline(DEFAULT_PIPELINE);
  return manager;
}
