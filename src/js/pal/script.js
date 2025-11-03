import scene from './scene';
import Palette from './palette';
import script_extras from './script-extras';
import scriptHelper from './script-helper';
import res from './res';
import rng from './rng';
import music from './music';
import sound from './sound';
import battleService from '../../services/battle-service.js';
import worldService from '../../services/world-service.js';
import stateService from '../../services/state-service.js';
import gameDataAdapter from '../../services/game-data-adapter.js';
import sceneEventAdapter from '../../services/scene-event-adapter.js';
import partyTrailAdapter from '../../services/party-trail-adapter.js';
import scriptObjectAdapter from '../../services/script-object-adapter.js';
import {
  getBattleStateSnapshot,
  subscribeBattleState
} from '../../services/battle-state-adapter.js';
import { inventorySignals } from '../../state/slices/inventory.js';
import { gameFlagSignals } from '../../state/slices/game-flags.js';
import { viewportSignals } from '../../state/slices/viewport.js';

log.trace('script module load');

let partyStateCache = [];
let trailStateCache = [];
let partyTrailUnsubscribe = null;
let battleStateCache = null;
let battleStateUnsubscribe = null;
const inventorySlice = inventorySignals();
const cashSignal = inventorySlice.cash;
const gameFlagSlice = gameFlagSignals();
const collectSignal = gameFlagSlice.collect;
const chaseRangeSignal = gameFlagSlice.chaseRange;
const chaseCyclesSignal = gameFlagSlice.chaseSpeedChangeCycles;
const battleSpeedSignal = gameFlagSlice.battleSpeed;
const viewportSlice = viewportSignals();
const viewportSignal = viewportSlice.viewport;
const partyOffsetSignal = viewportSlice.partyOffset;
const partyDirectionSignal = viewportSlice.partyDirection;

function handlePartyTrailUpdate(event) {
  if (!event) {
    return;
  }
  switch (event.type) {
    case 'snapshot':
      partyStateCache = Array.isArray(event.party) ? event.party : partyStateCache;
      trailStateCache = Array.isArray(event.trail) ? event.trail : trailStateCache;
      break;
    case 'party':
      partyStateCache = Array.isArray(event.value) ? event.value : partyStateCache;
      break;
    case 'trail':
      trailStateCache = Array.isArray(event.value) ? event.value : trailStateCache;
      break;
    case 'disposed':
      if (typeof partyTrailUnsubscribe === 'function') {
        partyTrailUnsubscribe();
      }
      partyTrailUnsubscribe = null;
      partyStateCache = [];
      trailStateCache = [];
      break;
    default:
      break;
  }
}

function ensurePartyTrailBinding() {
  if (partyTrailUnsubscribe) {
    return;
  }
  partyTrailUnsubscribe = partyTrailAdapter.subscribe(handlePartyTrailUpdate);
}

function handleBattleStateUpdate(event) {
  if (!event) {
    return;
  }
  if (event.type === 'disposed') {
    battleStateCache = null;
    return;
  }
  if (event.state) {
    battleStateCache = event.state;
  }
}

function ensureBattleStateBinding() {
  if (battleStateUnsubscribe) {
    return;
  }
  battleStateCache = getBattleStateSnapshot() || {};
  battleStateUnsubscribe = subscribeBattleState(handleBattleStateUpdate);
}

function BATTLE() {
  ensureBattleStateBinding();
  if (battleService && typeof battleService.getState === 'function') {
    const proxyState = battleService.getState();
    if (proxyState) {
      battleStateCache = proxyState;
      return proxyState;
    }
  }
  if (!battleStateCache) {
    battleStateCache = getBattleStateSnapshot() || {};
  }
  return battleStateCache;
}


function getViewportValue() {
  const value = viewportSignal.value;
  if (Number.isFinite(value)) {
    return value;
  }
  return worldService.getViewport();
}

function setViewportValue(value) {
  return worldService.setViewport(value);
}

function getPartyOffsetValue() {
  const value = partyOffsetSignal.value;
  if (Number.isFinite(value)) {
    return value;
  }
  return worldService.getPartyOffset();
}

function setPartyOffsetValue(value) {
  return worldService.setPartyOffset(value);
}

function mutateTrailValue(mutator) {
  return worldService.mutateTrail(mutator);
}

function getTrailValue() {
  ensurePartyTrailBinding();
  if (!Array.isArray(trailStateCache)) {
    trailStateCache = partyTrailAdapter.getTrailState();
  }
  return trailStateCache;
}

function getPlayerEquipmentValue(slot, roleId) {
  return worldService.getPlayerEquipment(slot, roleId);
}

function setPlayerEquipmentValue(slot, roleId, value) {
  return worldService.setPlayerEquipment(slot, roleId, value);
}

function adjustPlayerRoleWordValue(fieldIndex, roleId, delta) {
  return worldService.adjustPlayerRoleWord(fieldIndex, roleId, delta);
}

function setPlayerRoleWordValue(fieldIndex, roleId, value) {
  return worldService.setPlayerRoleWord(fieldIndex, roleId, value);
}

function setEquipmentEffectWordValue(part, fieldIndex, roleId, value) {
  return worldService.setEquipmentEffectWord(part, fieldIndex, roleId, value);
}

function setEnemyMagicValue(enemyIndex, value, options) {
  if (typeof battleService.setEnemyMagic === 'function') {
    return battleService.setEnemyMagic(enemyIndex, value, options);
  }
  if (typeof battleService.updateEnemy === 'function') {
    return battleService.updateEnemy(enemyIndex, function(enemy) {
      if (!enemy || !enemy.e) {
        return enemy;
      }
      enemy.e.magic = typeof value === 'function' ? value(enemy.e.magic) : value;
      return enemy;
    }, options);
  }
  const battleState = BATTLE();
  if (battleState && Array.isArray(battleState.enemy) && battleState.enemy[enemyIndex] && battleState.enemy[enemyIndex].e) {
    const enemy = battleState.enemy[enemyIndex];
    enemy.e.magic = typeof value === 'function' ? value(enemy.e.magic) : value;
    if (typeof battleService.emitStateChanged === 'function') {
      battleService.emitStateChanged({
        segments: [['enemy', enemyIndex, 'e', 'magic']]
      });
    }
    return enemy;
  }
  return null;
}

function setEnemyMagicRateValue(enemyIndex, value, options) {
  if (typeof battleService.setEnemyMagicRate === 'function') {
    return battleService.setEnemyMagicRate(enemyIndex, value, options);
  }
  if (typeof battleService.updateEnemy === 'function') {
    return battleService.updateEnemy(enemyIndex, function(enemy) {
      if (!enemy || !enemy.e) {
        return enemy;
      }
      enemy.e.magicRate = typeof value === 'function' ? value(enemy.e.magicRate) : value;
      return enemy;
    }, options);
  }
  const battleState = BATTLE();
  if (battleState && Array.isArray(battleState.enemy) && battleState.enemy[enemyIndex] && battleState.enemy[enemyIndex].e) {
    const enemy = battleState.enemy[enemyIndex];
    enemy.e.magicRate = typeof value === 'function' ? value(enemy.e.magicRate) : value;
    if (typeof battleService.emitStateChanged === 'function') {
      battleService.emitStateChanged({
        segments: [['enemy', enemyIndex, 'e', 'magicRate']]
      });
    }
    return enemy;
  }
  return null;
}

function normalizeEventIndex(eventId) {
  var numericId = Number(eventId);
  if (!isFinite(numericId) || numericId <= 0) {
    return null;
  }
  var index = numericId - 1;
  return index >= 0 ? index : null;
}

function getEventObjectById(eventId) {
  var index = normalizeEventIndex(eventId);
  if (index == null) {
    return null;
  }
  var entry = sceneEventAdapter.getEventObjectEntryById(eventId);
  if (entry && entry.state) {
    return entry.state;
  }
  var stateByIndex = sceneEventAdapter.getEventObjectStateByIndex(index);
  if (stateByIndex) {
    return stateByIndex;
  }
  var gameData = stateService.getGameData('eventObject');
  if (Array.isArray(gameData) && gameData[index]) {
    return gameData[index];
  }
  return null;
}

function mutateEventObjectById(eventId, mutator) {
  if (typeof mutator !== 'function') {
    return null;
  }
  return worldService.mutateEventObjectById(eventId, mutator);
}

function resolveEventTarget(operand, fallbackId) {
  if (typeof operand !== 'number' || operand === 0 || operand === 0xFFFF || operand < 0) {
    var fallbackResolved = (typeof fallbackId === 'number' && fallbackId > 0) ? fallbackId : null;
    return {
      id: fallbackResolved,
      object: fallbackResolved ? getEventObjectById(fallbackResolved) : null
    };
  }
  var targetId = operand;
  var index = targetId - 1;
  if (index > 0x9000) {
    index -= 0x9000;
    targetId = index + 1;
  }
  if (index < 0) {
    return {
      id: null,
      object: null
    };
  }
  var resolvedObject = getEventObjectById(targetId);
  return {
    id: resolvedObject ? targetId : null,
    object: resolvedObject
  };
}

function setPlayerActionTypeSafe(index, actionType, options) {
  if (!battleService) {
    return null;
  }
  var previousAction = null;
  if (typeof battleService.getPlayer === 'function') {
    var playerState = battleService.getPlayer(index);
    previousAction = playerState && playerState.action ? playerState.action : null;
  }
  if (!previousAction && typeof BATTLE === 'function') {
    var battleSnapshot = BATTLE();
    var snapshotPlayer = battleSnapshot && battleSnapshot.player ? battleSnapshot.player[index] : null;
    previousAction = snapshotPlayer && snapshotPlayer.action ? snapshotPlayer.action : null;
  }
  var previousActionType = previousAction ? previousAction.actionType : undefined;
  var resolvedActionType = typeof actionType === 'function' ? actionType(previousActionType) : actionType;
  var ensureAction = function(player) {
    if (!player) {
      return player;
    }
    if (!player.action) {
      if (previousAction) {
        player.action = Object.assign({}, previousAction);
      } else {
        player.action = {
          actionType: typeof resolvedActionType !== 'undefined' ? resolvedActionType : 0,
          actionID: 0,
          target: -1
        };
      }
    }
    if (typeof resolvedActionType !== 'undefined') {
      player.action.actionType = resolvedActionType;
    }
    return player;
  };
  if (typeof battleService.setPlayer === 'function') {
    battleService.setPlayer(index, ensureAction, options);
  } else if (typeof battleService.updatePlayer === 'function') {
    battleService.updatePlayer(index, ensureAction, options);
  } else {
    var legacyBattle = typeof BATTLE === 'function' ? BATTLE() : null;
    if (legacyBattle && legacyBattle.player && legacyBattle.player[index]) {
      legacyBattle.player[index] = ensureAction(legacyBattle.player[index]);
    }
  }
  if (typeof battleService.setPlayerActionType === 'function') {
    return battleService.setPlayerActionType(index, resolvedActionType, options);
  }
  if (typeof battleService.emitStateChanged === 'function') {
    battleService.emitStateChanged({
      segments: [['player', index, 'action', 'actionType']]
    });
  }
  return resolvedActionType;
}

function getSceneEventObjects() {
  var party = getPartyState();
  if (!party || !party.length) {
    return [];
  }
  var range = getSceneEventRange();
  var eventObjects = sceneEventAdapter.getEventObjects();
  return eventObjects.filter(function(entry) {
    return entry.index >= range.startIndex && entry.index < range.endIndex;
  });
}

function getEventObjectPosition(id) {
  var eventObject = getEventObjectById(id);
  if (!eventObject) {
    return null;
  }
  return {
    x: eventObject.x,
    y: eventObject.y,
    layer: eventObject.layer
  };
}

function setSpritePosition(sprite, pos) {
  if (!sprite) {
    return;
  }
  var target = sprite.sprite;
  if (!target) {
    target = sprite.sprite = {};
  }
  target.pos = pos;
}

function getEventObjectMapObject(eventObjectId) {
  var targetId = eventObjectId > 0 ? eventObjectId : worldService.getLastEventObjectId();
  if (!targetId || targetId <= 0) {
    return null;
  }
  var resolvedObject = getEventObjectById(targetId);
  return resolvedObject || null;
}

function cloneEventObjectById(targetId, index) {
  if (index < 0) {
    return {
      id: null,
      object: null
    };
  }
  var resolvedObject = getEventObjectById(targetId);
  return {
    id: resolvedObject ? targetId : null,
    object: resolvedObject
  };
}

function getPartyState() {
  ensurePartyTrailBinding();
  if (!Array.isArray(partyStateCache)) {
    partyStateCache = partyTrailAdapter.getPartyState();
  }
  return partyStateCache;
}

function getPartyMember(index) {
  return worldService.getPartyMember(index);
}

function getMaxPartyMemberIndex() {
  return worldService.getMaxPartyMemberIndex();
}

function getSceneIdValue() {
  return worldService.getSceneId();
}

function getChaseRangeValue() {
  const value = chaseRangeSignal.value;
  return Number.isFinite(value) ? value : worldService.getChaseRange();
}

function getCollectValue() {
  const value = collectSignal.value;
  return Number.isFinite(value) ? value : worldService.getCollectValue();
}

function getCurPlayingRNGValue() {
  return worldService.getCurPlayingRng();
}

function getFrameCounter() {
  return worldService.getFrameCount();
}

function isInBattle() {
  return worldService.isInBattle();
}

function getCurrentSaveSlot() {
  return worldService.getCurrentSaveSlot();
}

function getPaletteNumber() {
  return worldService.getPaletteId();
}

function getNightPaletteFlag() {
  return worldService.getNightPaletteFlag();
}

function warnLog(message) {
  if (log && typeof log.warning === 'function') {
    log.warning(message);
    return;
  }
  if (log && typeof log.warn === 'function') {
    log.warn(message);
    return;
  }
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(message);
  }
}

function getScriptEntrySafe(scriptEntry, eventObjectID, context) {
  if (!Number.isFinite(scriptEntry)) {
    script.scriptSuccess = false;
    warnLog('[SCRIPT] ' + (context || 'script') +
      ' invalid script index ' + scriptEntry +
      ' (event ' + (eventObjectID || 0) + ')');
    return null;
  }
  var sc = scriptObjectAdapter.getScriptEntry(scriptEntry);
  if (!sc) {
    warnLog('[SCRIPT] ' + (context || 'script') +
      ' missing script entry ' + scriptEntry +
      ' (event ' + (eventObjectID || 0) + ')');
    script.scriptSuccess = false;
    return null;
  }
  if (!sc.operand || typeof sc.operand.length !== 'number') {
    sc.operand = [0, 0, 0, 0];
  }
  if (typeof sc.operation !== 'number') {
    warnLog('[SCRIPT] ' + (context || 'script') +
      ' invalid operation at entry ' + scriptEntry +
      ' (event ' + (eventObjectID || 0) + ')');
    script.scriptSuccess = false;
    return null;
  }
  return sc;
}

function getSceneEventRange() {
  var sceneId = getSceneIdValue();
  var currentScene = worldService.getSceneEntry(sceneId);
  var nextScene = worldService.getSceneEntry(sceneId + 1);
  var startIndex = currentScene && typeof currentScene.eventObjectIndex === 'number'
    ? currentScene.eventObjectIndex
    : 0;
  var totalObjects = sceneEventAdapter.getEventObjectIds().length;
  var endIndex = nextScene && typeof nextScene.eventObjectIndex === 'number'
    ? nextScene.eventObjectIndex
    : totalObjects;
  return {
    sceneId: sceneId,
    startIndex: startIndex,
    endIndex: endIndex
  };
}

function getViewportX() {
  return PAL_X(getViewportValue());
}

function getViewportY() {
  return PAL_Y(getViewportValue());
}

function getPartyOffsetX() {
  return PAL_X(getPartyOffsetValue());
}

function getPartyOffsetY() {
  return PAL_Y(getPartyOffsetValue());
}

function getCashValue() {
  const value = cashSignal.value;
  return Number.isFinite(value) ? value : 0;
}

function getPartyDirection() {
  const value = partyDirectionSignal.value;
  if (Number.isFinite(value)) {
    return value;
  }
  return worldService.getPartyDirection();
}

function setPartyDirection(value) {
  return worldService.setPartyDirection(value);
}

function forEachPartyMember(callback) {
  if (typeof callback !== 'function') {
    return;
  }
  var party = getPartyState();
  if (!Array.isArray(party) || !party.length) {
    return;
  }
  var maxIndex = getMaxPartyMemberIndex();
  for (var i = 0; i <= maxIndex && i < party.length; i++) {
    var member = party[i];
    if (!member) continue;
    callback(member, i);
  }
}

function mutatePlayerRoles(mutator) {
  return worldService.mutatePlayerRoles(mutator);
}

function mutateMagic(mutator) {
  return worldService.mutateMagicTable(mutator);
}

function getObjectEntry(objectId) {
  return scriptObjectAdapter.getObjectEntry(objectId) || null;
}

function getEnemyEntry(enemyId) {
  if (typeof enemyId !== 'number') {
    return null;
  }
  return gameDataAdapter.getEnemyEntry(enemyId);
}

function getEnemyIdFromObject(objectId) {
  var entry = getObjectEntry(objectId);
  return entry && entry.enemy ? entry.enemy.enemyID : null;
}

function getObjectEnemyResistance(objectId) {
  var entry = getObjectEntry(objectId);
  return entry && entry.enemy ? entry.enemy.resistanceToSorcery : 0;
}

function getObjectPoisonEnemyScript(objectId) {
  var entry = getObjectEntry(objectId);
  return entry && entry.poison ? entry.poison.enemyScript : 0;
}

function getMagicNumberFromObject(objectId) {
  var entry = getObjectEntry(objectId);
  return entry && entry.magic ? entry.magic.magicNumber : 0;
}

function copyEnemyTemplate(enemyId) {
  return worldService.copyEnemyTemplate(enemyId);
}

function getStoreItemId(storeId, index) {
  var storeEntry = gameDataAdapter.getStoreEntry(storeId);
  if (!storeEntry || !Array.isArray(storeEntry.items)) {
    return 0;
  }
  return storeEntry.items[index] || 0;
}

var script = {
  curEquipPart: -1,
  scriptSuccess: true
};

var surface = null
var abs = Math.abs;
var floor = Math.floor;

script.debug = function() {
  return;
  var args = toArray(arguments);
  if (log.level >= LogLevel.Debug) {
    log.debug.apply(log, args);
  }
}

var traceScript = function(){};
if (scriptHelper && typeof scriptHelper.debug === 'function') {
  traceScript = scriptHelper.debug.bind(scriptHelper);
  if (typeof window !== 'undefined') {
    window.scriptHelper = scriptHelper;
  }
  if (typeof global !== 'undefined') {
    global.scriptHelper = scriptHelper;
  }
}

script.init = function*(surf) {
  log.debug('[SCRIPT] init');
  global.script = script;
  surface = surf;
  yield script_extras.init(surf, script);
};

/**
 * Move and animate the specified event object (NPC).
 * @param {Number} eventObjectID the event object to move.
 * @param {Number} speed         speed of the movement.
 */
script.NPCWalkOneStep = function(eventObjectID, speed) {
  var eventIndex = normalizeEventIndex(eventObjectID);
  if (eventIndex == null) {
    return;
  }
  var evtObj = getEventObjectById(eventObjectID);
  if (!evtObj) {
    return;
  }

  var moveSpeed = (typeof speed === 'number' && isFinite(speed) && speed !== 0)
    ? Math.abs(speed)
    : 1;
  var direction = typeof evtObj.direction === 'number'
    ? evtObj.direction
    : Direction.South;
  var dx = ((direction === Direction.West || direction === Direction.South) ? -2 : 2) * moveSpeed;
  var dy = ((direction === Direction.West || direction === Direction.North) ? -1 : 1) * moveSpeed;

  var prevX = evtObj.x;
  var prevY = evtObj.y;

  worldService.enqueueMoveRequest({
    eventObjectId: eventObjectID,
    eventIndex: eventIndex,
    dx: dx,
    dy: dy,
    direction: direction,
    speed: moveSpeed,
    spriteFrames: evtObj.spriteFrames,
    spriteFramesAuto: evtObj.spriteFramesAuto,
    origin: 'script'
  });

  worldService.runSystems(['collision', 'movement'], {
    mapCache: scene.mapCache,
    Files: typeof Files !== 'undefined' ? Files : null,
    viewportComponent: worldService.getViewportComponent(),
    sceneEventObjects: sceneEventAdapter.getEventObjects()
  });

  var movedState = getEventObjectById(eventObjectID);
  if (movedState && movedState.x === prevX && movedState.y === prevY) {
    // ECS move did not apply; fallback to legacy immediate movement
    var targetPos = PAL_XY(prevX + dx, prevY + dy);
    if (!scene.checkObstacle(targetPos, true, eventObjectID)) {
      mutateEventObjectById(eventObjectID, function(current) {
        if (!current) {
          return current;
        }
        current.x = prevX + dx;
        current.y = prevY + dy;
        current.direction = direction;
        var spriteFrames = current.spriteFrames || evtObj.spriteFrames || 0;
        var spriteFramesAuto = current.spriteFramesAuto || evtObj.spriteFramesAuto || 0;
        if (spriteFrames > 0) {
          var cycle = spriteFrames === 3 ? 4 : spriteFrames;
          current.currentFrameNum = (current.currentFrameNum + 1) % cycle;
        } else if (spriteFramesAuto > 0) {
          current.currentFrameNum = (current.currentFrameNum + 1) % spriteFramesAuto;
        }
        return current;
      });
    }
  }
};

/**
 * Make the specified event object walk to the map position specified by (x, y, h)
   at the speed of iSpeed.
 *
 * @param {Number} eventObjectID the event object to move.
 * @param {Number} x             Column number of the tile.
 * @param {Number} y             Line number in the map.
 * @param {Number} h             Each line in the map has two lines of tiles, 0 and 1.
 * @param {Number} speed         the speed to move.
 * @return {Boolean} TRUE if the event object has successfully moved to the specified position,
                     FALSE if still need more moving.
 */
script.NPCWalkTo = function(eventObjectID, x, y, h, speed) {
  log.trace('[SCRIPT] NPCWalkTo(%d, %d, %d, %d)', eventObjectID, x, y, speed);
  var eventIndex = normalizeEventIndex(eventObjectID);
  if (eventIndex == null) {
    return false;
  }
  var evtObj = getEventObjectById(eventObjectID);
  if (!evtObj) {
    return false;
  }
  var targetX = x * 32 + h * 16;
  var targetY = y * 16 + h * 8;
  var offsetX = targetX - evtObj.x;
  var offsetY = targetY - evtObj.y;
  var moveSpeed = (typeof speed === 'number' && isFinite(speed) && speed !== 0)
    ? Math.abs(speed)
    : 1;
  var nextDirection = (offsetY < 0)
    ? (offsetX < 0 ? Direction.West : Direction.North)
    : (offsetX < 0 ? Direction.South : Direction.East);

  mutateEventObjectById(eventObjectID, function(current) {
    if (!current) {
      return current;
    }
    current.direction = nextDirection;
    return current;
  });

  if (abs(offsetX) < moveSpeed * 2 || abs(offsetY) < moveSpeed * 2) {
    mutateEventObjectById(eventObjectID, function(current) {
      if (!current) {
        return current;
      }
      current.x = targetX;
      current.y = targetY;
      current.currentFrameNum = 0;
      return current;
    });
  } else {
    script.NPCWalkOneStep(eventObjectID, moveSpeed);
  }

  var updated = getEventObjectById(eventObjectID);
  if (updated && updated.x === targetX && updated.y === targetY) {
    mutateEventObjectById(eventObjectID, function(current) {
      if (!current) {
        return current;
      }
      current.currentFrameNum = 0;
      return current;
    });
    return true;
  }

  return false;
};

/**
 * Make the party walk to the map position specified by (x, y, h)
   at the speed of iSpeed.
 *
 * @param {Number} x             Column number of the tile.
 * @param {Number} y             Line number in the map.
 * @param {Number} h             Each line in the map has two lines of tiles, 0 and 1.
 * @param {Number} speed         the speed to move.
 */
script.partyWalkTo = function*(x, y, h, speed) {
  log.trace('[SCRIPT] partyWalkTo(%d, %d, %d)', x, y, speed);
  var trail = getTrailValue();
  if (!Array.isArray(trail) || trail.length === 0) {
    return;
  }
  var viewport = getViewportValue();
  var partyOffset = getPartyOffsetValue();
  var offsetX = (x * 32 + h * 16) - PAL_X(viewport) - PAL_X(partyOffset);
  var offsetY = (y * 16 + h * 8) - PAL_Y(viewport) - PAL_Y(partyOffset);

  while (offsetX !== 0 || offsetY !== 0) {
    var currentDirection = getPartyDirection();
    mutateTrailValue(function(trailState) {
      if (!Array.isArray(trailState) || trailState.length === 0) {
        return trailState;
      }
      for (var i = 3; i >= 0; i--) {
        trailState[i + 1] = trailState[i];
      }
      trailState[0] = trailState[0] || {};
      trailState[0].direction = currentDirection;
      trailState[0].x = PAL_X(viewport) + PAL_X(partyOffset);
      trailState[0].y = PAL_Y(viewport) + PAL_Y(partyOffset);
      return trailState;
    });

    var nextDirection = (offsetY < 0)
      ? (offsetX < 0 ? Direction.West : Direction.North)
      : (offsetX < 0 ? Direction.South : Direction.East);
    setPartyDirection(nextDirection);

    var dx = PAL_X(viewport);
    var dy = PAL_Y(viewport);
    if (abs(offsetX) <= speed * 2) {
      dx += offsetX;
    } else {
      dx += speed * (offsetX < 0 ? -2 : 2);
    }
    if (abs(offsetY) <= speed) {
      dy += offsetY;
    } else {
      dy += speed * (offsetY < 0 ? -1 : 1);
    }

    log.trace('[SCRIPT] Move the viewport');
    viewport = setViewportValue(PAL_XY(dx, dy));

    scene.updatePartyGestures(true);
    yield play.update(false);
    yield scene.makeScene();
    surface.updateScreen(null);

    offsetX = (x * 32 + h * 16) - PAL_X(viewport) - PAL_X(partyOffset);
    offsetY = (y * 16 + h * 8) - PAL_Y(viewport) - PAL_Y(partyOffset);

    yield sleepByFrame(1);
  }

  scene.updatePartyGestures(false);
};

/**
 * Move the party to the specified position, riding the specified event object.
 *
 * @param {Number} eventObjectID the event object to be ridden.
 * @param {Number} x             Column number of the tile.
 * @param {Number} y             Line number in the map.
 * @param {Number} h             Each line in the map has two lines of tiles, 0 and 1.
 * @param {Number} speed         the speed to move.
 */
script.partyRideEventObject = function*(eventObjectID, x, y, h, speed) {
  log.trace('[SCRIPT] partyRideEventObject(%d, %d, %d, %d)', eventObjectID, x, y, speed);
  var trail = getTrailValue();
  if (!Array.isArray(trail) || trail.length === 0) {
    return;
  }
  var eventIndex = normalizeEventIndex(eventObjectID);
  if (eventIndex == null) {
    return;
  }
  var targetX = x * 32 + h * 16;
  var targetY = y * 16 + h * 8;
  var viewport = getViewportValue();
  var partyOffset = getPartyOffsetValue();
  var currentEvent = getEventObjectById(eventObjectID);
  if (!currentEvent) {
    return;
  }
  var offsetX = targetX - currentEvent.x;
  var offsetY = targetY - currentEvent.y;

  while (offsetX !== 0 || offsetY !== 0) {
    var nextDirection = (offsetY < 0)
      ? (offsetX < 0 ? Direction.West : Direction.North)
      : (offsetX < 0 ? Direction.South : Direction.East);
    setPartyDirection(nextDirection);

    var dx;
    var dy;
    if (abs(offsetX) > speed * 2) {
      dx = speed * (offsetX < 0 ? -2 : 2);
    } else {
      dx = offsetX;
    }
    if (abs(offsetY) > speed) {
       dy = speed * (offsetY < 0 ? -1 : 1);
    } else {
       dy = offsetY;
    }

    // Store trail
    var previousDirection = getPartyDirection();
    mutateTrailValue(function(trailState) {
      if (!Array.isArray(trailState) || trailState.length === 0) {
        return trailState;
      }
      for (var i = 3; i >= 0; i--) {
        trailState[i + 1] = trailState[i];
      }
      trailState[0] = trailState[0] || {};
      trailState[0].direction = previousDirection;
      trailState[0].x = PAL_X(viewport) + dx + PAL_X(partyOffset);
      trailState[0].y = PAL_Y(viewport) + dy + PAL_Y(partyOffset);
      return trailState;
    });

    // Move the viewport
    viewport = setViewportValue(PAL_XY(
      PAL_X(viewport) + dx,
      PAL_Y(viewport) + dy
    ));

    mutateEventObjectById(eventObjectID, function(current) {
      if (!current) {
        return current;
      }
      current.x += dx;
      current.y += dy;
      return current;
    });

    yield play.update(false);
    yield scene.makeScene();
    surface.updateScreen(null);
    currentEvent = getEventObjectById(eventObjectID);
    if (!currentEvent) {
      break;
    }
    offsetX = targetX - currentEvent.x;
    offsetY = targetY - currentEvent.y;

    yield sleepByFrame(1);
  }
};

/**
 * Make the specified event object chase the players.
 *
 * @param  {Number}  eventObjectID the event object ID of the monster.
 * @param  {Number}  speed         the speed of chasing.
 * @param  {Number}  chaseRange    sensitive range of the monster.
 * @param  {Boolean} floating      [TRUE if monster is floating (i.e., ignore the obstacles)
 */
script.monsterChasePlayer = function(eventObjectID, speed, chaseRange, floating) {
  log.trace('[SCRIPT] monsterChasePlayer(%d, %d, %d)', eventObjectID, speed, chaseRange);
  var eventIndex = normalizeEventIndex(eventObjectID);
  if (eventIndex == null) {
    script.NPCWalkOneStep(eventObjectID, 0);
    return;
  }
  var evtObj = getEventObjectById(eventObjectID);
  if (!evtObj) {
    script.NPCWalkOneStep(eventObjectID, 0);
    return;
  }
  var monsterSpeed = 0;
  var posX = evtObj.x;
  var posY = evtObj.y;
  var direction = typeof evtObj.direction === 'number' ? evtObj.direction : Direction.South;
  var chaseRangeModifier = getChaseRangeValue();
  if (chaseRangeModifier !== 0) {
    var viewport = getViewportValue();
    var partyOffset = getPartyOffsetValue();
    var relativeX = PAL_X(viewport) + PAL_X(partyOffset) - posX;
    var relativeY = PAL_Y(viewport) + PAL_Y(partyOffset) - posY;

    if (relativeX === 0) {
      relativeX = randomLong(0, 1) ? -1 : 1;
    }
    if (relativeY === 0) {
      relativeY = randomLong(0, 1) ? -1 : 1;
    }
    var prevx = posX;
    var prevy = posY;
    var i = prevx % 32;
    var j = prevy % 16;
    prevx = ~~(prevx / 32);
    prevy = ~~(prevy / 16);
    var l = 0;
    if (i + j * 2 >= 16) {
      if (i + j * 2 >= 48) {
        prevx++;
        prevy++;
      } else if (32 - i + j * 2 < 16) {
        prevx++;
      } else if (32 - i + j * 2 < 48) {
        l = 1;
      } else {
        prevy++;
      }
    }
    prevx = prevx * 32 + l * 16;
    prevy = prevy * 16 + l * 8;

    // Is the party near to the event object?
    if (abs(relativeX) + abs(relativeY) * 2 < chaseRange * 32 * chaseRangeModifier) {
      if (relativeX < 0) {
        direction = (relativeY < 0) ? Direction.West : Direction.South;
      } else {
        direction = (relativeY < 0) ? Direction.North : Direction.East;
      }

      var targetX = posX;
      var targetY = posY;
      if (relativeX !== 0) {
        targetX = posX + ~~(relativeX / abs(relativeX)) * 16;
      }
      if (relativeY !== 0) {
        targetY = posY + ~~(relativeY / abs(relativeY)) * 8;
      }

      if (floating) {
        monsterSpeed = speed;
      } else {
        var adjustedX = posX;
        var adjustedY = posY;
        if (!scene.checkObstacle(PAL_XY(targetX, targetY), true, eventObjectID)) {
          monsterSpeed = speed;
        } else {
          adjustedX = prevx;
          adjustedY = prevy;
        }
        for (l = 0; l < 4; l++) {
          var testX = adjustedX;
          var testY = adjustedY;
          switch (l) {
            case 0:
              testX -= 4;
              testY += 2;
              break;
            case 1:
              testX -= 4;
              testY -= 2;
              break;
            case 2:
              testX += 4;
              testY -= 2;
              break;
            case 3:
              testX += 4;
              testY += 2;
              break;
          }
          if (scene.checkObstacle(PAL_XY(testX, testY), false, 0)) {
            testX = prevx;
            testY = prevy;
          }
          adjustedX = testX;
          adjustedY = testY;
        }
        posX = adjustedX;
        posY = adjustedY;
      }
    }
  }

  mutateEventObjectById(eventObjectID, function(current) {
    if (!current) {
      return current;
    }
    current.direction = direction;
    current.x = posX;
    current.y = posY;
    return current;
  });
  script.NPCWalkOneStep(eventObjectID, monsterSpeed);
};

/**
 * Interpret and execute one instruction in the script.
 *
 * @param {Number} scriptEntry   The script entry to execute.
 * @param {Number} eventObjectID The event object ID which invoked the script.
 * @yield {Number} The address of the next script instruction to execute.
 */
script.interpretInstruction = function*(scriptEntry, eventObjectID) {
  var sc = getScriptEntrySafe(scriptEntry, eventObjectID, 'interpretInstruction');
  if (!sc) {
    return scriptEntry + 1;
  }
  var baseEventId = (typeof eventObjectID === 'number' && eventObjectID > 0) ? eventObjectID : null;
  var evtObj = baseEventId ? getEventObjectById(baseEventId) : null;
  var targetInfo = resolveEventTarget(sc.operand[0], baseEventId);
  var curEventObjectID = targetInfo.id != null ? targetInfo.id : (baseEventId || 0);
  var current = targetInfo.object || (targetInfo.id === baseEventId ? evtObj : null);
  var playerRole, i, j, x, y, w;
  var party = getPartyState();
  var partyIndex = sc.operand[0];
  var partyMember = null;
  if (party.length) {
    if (partyIndex >= 0 && partyIndex < party.length) {
      partyMember = party[partyIndex];
    } else if (partyIndex < Const.MAX_PLAYABLE_PLAYER_ROLES) {
      var clamped = Math.min(Math.max(partyIndex, 0), party.length - 1);
      partyMember = party[clamped];
    }
    if (!partyMember) {
      partyMember = party[0];
    }
  }
  playerRole = partyMember && typeof partyMember.playerRole !== 'undefined'
    ? partyMember.playerRole
    : 0;
  log.trace('[SCRIPT] interpretInstruction %d: (%d(0x%.4x) - %d, %d, %d)',
    scriptEntry, sc.operation, sc.operation,
    sc.operand[0], sc.operand[1],
    sc.operand[2], sc.operand[3]
  );

  switch (sc.operation) {
    case 0x000B:
    case 0x000C:
    case 0x000D:
    case 0x000E:
      script.debug('[SCRIPT] walk one step');
      if (baseEventId) {
        mutateEventObjectById(baseEventId, function(target) {
          if (!target) {
            return target;
          }
          target.direction = sc.operation - 0x000B;
          return target;
        });
      }
      script.NPCWalkOneStep(eventObjectID, 2);
      break;
    case 0x000F:
      script.debug('[SCRIPT] Set the direction and/or gesture for event object');
      if (baseEventId) {
        mutateEventObjectById(baseEventId, function(target) {
          if (!target) {
            return target;
          }
          if (sc.operand[0] !== 0xFFFF) {
            target.direction = sc.operand[0];
          }
          if (sc.operand[1] !== 0xFFFF) {
            target.currentFrameNum = sc.operand[1];
          }
          return target;
        });
      }
      break;
    case 0x0010:
      script.debug('[SCRIPT] Walk straight to the specified position');
      var ret = script.NPCWalkTo(eventObjectID, sc.operand[0], sc.operand[1], sc.operand[2], 3);
      if (!ret) scriptEntry--;
      break;
    case 0x0011:
      script.debug('[SCRIPT] Walk straight to the specified position, at a lower speed');
      if ((eventObjectID & 1) ^ (getFrameCounter() & 1)) {
        var ret = script.NPCWalkTo(eventObjectID, sc.operand[0], sc.operand[1], sc.operand[2], 2);
        if (!ret) {
          scriptEntry--;
        }
      } else {
        scriptEntry--;
      }
      break;
    case 0x0012:
      script.debug('[SCRIPT] Set the position of the event object, relative to the party');
      if (curEventObjectID > 0) {
        mutateEventObjectById(curEventObjectID, function(target) {
          if (!target) {
            return target;
          }
          target.x = sc.operand[1] + getViewportX() + getPartyOffsetX();
          target.y = sc.operand[2] + getViewportY() + getPartyOffsetY();
          return target;
        });
      }
      break;
    case 0x0013:
      script.debug('[SCRIPT] Set the position of the event object');
      if (curEventObjectID > 0) {
        mutateEventObjectById(curEventObjectID, function(target) {
          if (!target) {
            return target;
          }
          target.x = sc.operand[1];
          target.y = sc.operand[2];
          return target;
        });
      }
      break;
    case 0x0014:
      script.debug('[SCRIPT] Set the gesture of the event object');
      if (baseEventId) {
        mutateEventObjectById(baseEventId, function(target) {
          if (!target) {
            return target;
          }
          target.currentFrameNum = sc.operand[0];
          target.direction = Direction.South;
          return target;
        });
      }
      break;
    case 0x0015:
      script.debug('[SCRIPT] Set the direction and gesture for a party member');
      var partyDirection = sc.operand[0];
      setPartyDirection(partyDirection);
      worldService.mutatePartyMember(sc.operand[2], function(member) {
        if (!member) {
          return member;
        }
        member.frame = partyDirection * 3 + sc.operand[1];
        return member;
      });
      break;
    case 0x0016:
      script.debug('[SCRIPT] Set the direction and gesture for an event object');
      if (sc.operand[0] !== 0 && curEventObjectID > 0) {
        mutateEventObjectById(curEventObjectID, function(target) {
          if (!target) {
            return target;
          }
          target.direction = sc.operand[1];
          target.currentFrameNum = sc.operand[2];
          return target;
        });
      }
      break;
    case 0x0017:
      script.debug('[SCRIPT] set the player\'s extra attribute');
      i = sc.operand[0] - 0xB;
      setEquipmentEffectWordValue(i, sc.operand[1], eventObjectID, SHORT(sc.operand[2]));
      break;
    case 0x0018:
      script.debug('[SCRIPT] Equip the selected item');
      i = sc.operand[0] - 0x0B;
      script.curEquipPart = i;
      // The eventObjectID parameter here should indicate the player role
      script.removeEquipmentEffect(eventObjectID, i);
      var currentEquipment = getPlayerEquipmentValue(i, eventObjectID);
      if (currentEquipment !== sc.operand[1]) {
        w = currentEquipment;
        setPlayerEquipmentValue(i, eventObjectID, sc.operand[1]);
        script.addItemToInventory(sc.operand[1], -1);
        if (w !== 0) {
          script.addItemToInventory(w, 1);
        }
        worldService.setLastUnequippedItem(w);
      }
      break;
    case 0x0019:
      script.debug('[SCRIPT] Increase/decrease the player\'s attribute');
      /*{
         WORD *p = (WORD *)(&GameData.playerRoles); // HACKHACK

         if (sc.operand[2] == 0)
         {
            playerRole = eventObjectID;
         }
         else
         {
            playerRole = sc.operand[2] - 1;
         }

         p[sc.operand[0] * MAX_PLAYER_ROLES + playerRole] +=
            (SHORT)sc.operand[1];
      }*/
      // WARNING HACK
      var playerRole = (sc.operand[2] === 0 ? eventObjectID : (sc.operand[2] - 1));
      adjustPlayerRoleWordValue(sc.operand[0], playerRole, SHORT(sc.operand[1]));
      break;
    case 0x001A:
      script.debug('[SCRIPT] Set player\'s stat');
      /*{
         WORD *p = (WORD *)(&GameData.playerRoles); // HACKHACK

         if (g_iCurEquipPart != -1)
         {
            // In the progress of equipping items
            p = (WORD *)&(Global.equipmentEffect[g_iCurEquipPart]);
         }

         if (sc.operand[2] == 0)
         {
            // Apply to the current player. The eventObjectID should
            // indicate the player role.
            playerRole = eventObjectID;
         }
         else
         {
            playerRole = sc.operand[2] - 1;
         }

         p[sc.operand[0] * MAX_PLAYER_ROLES + playerRole] =
            (SHORT)sc.operand[1];
      }*/
      // WARNING HACK
      var playerRole;
      if (sc.operand[2] === 0) {
        // Apply to the current player. The eventObjectID should
        // indicate the player role.
        playerRole = eventObjectID;
      } else {
        playerRole = sc.operand[2] - 1;
      }
      if (script.curEquipPart !== -1) {
        // In the progress of equipping items
        setEquipmentEffectWordValue(script.curEquipPart, sc.operand[0], playerRole, SHORT(sc.operand[1]));
      } else {
        setPlayerRoleWordValue(sc.operand[0], playerRole, SHORT(sc.operand[1]));
      }
      break;
    case 0x001B:
      script.debug('[SCRIPT] Increase/decrease player\'s HP');
      if (sc.operand[0]) {
        // Apply to everyone
        forEachPartyMember(function(member) {
          script.increaseHPMP(member.playerRole, SHORT(sc.operand[1]), 0);
        });
      } else {
        // Apply to one player. The eventObjectID parameter should indicate the player role.
        if (!script.increaseHPMP(eventObjectID, SHORT(sc.operand[1]), 0)) {
          script.scriptSuccess = false;
        }
      }
      break;
    case 0x001C:
      script.debug('[SCRIPT] Increase/decrease player\'s MP');
      if (sc.operand[0]) {
        // Apply to everyone
        forEachPartyMember(function(member) {
          script.increaseHPMP(member.playerRole, 0, SHORT(sc.operand[1]));
        });
      } else {
        // Apply to one player. The eventObjectID parameter should indicate the player role.
        if (!script.increaseHPMP(eventObjectID, 0, SHORT(sc.operand[1]))) {
          script.scriptSuccess = false;
        }
      }
      break;
    case 0x001D:
      script.debug('[SCRIPT] Increase/decrease player\'s HP and MP');
      if (sc.operand[0]) {
        // Apply to everyone
        forEachPartyMember(function(member) {
          script.increaseHPMP(member.playerRole, SHORT(sc.operand[1]), SHORT(sc.operand[1]));
        });
      } else {
        // Apply to one player. The eventObjectID parameter should indicate the player role.
        if (!script.increaseHPMP(eventObjectID, SHORT(sc.operand[1]), SHORT(sc.operand[1]))) {
          script.scriptSuccess = false;
        }
      }
      break;
    case 0x001E:
      script.debug('[SCRIPT] Increase or decrease cash by the specified amount');
      if (SHORT(sc.operand[0]) < 0 && getCashValue() < -SHORT(sc.operand[0])) {
        // not enough cash
        scriptEntry = sc.operand[1] - 1;
      } else {
        worldService.adjustCash(SHORT(sc.operand[0]));
      }
      break;
    case 0x001F:
      script.debug('[SCRIPT] Add item to inventory');
      script.addItemToInventory(sc.operand[0], SHORT(sc.operand[1]));
      break;
    case 0x0020:
      script.debug('[SCRIPT] Remove item from inventory');
      if (!script.addItemToInventory(sc.operand[0], -(sc.operand[1] === 0 ? 1 : sc.operand[1]))) {
        // Try removing equipped item
        x = sc.operand[1];
        if (x === 0) {
          x = 1;
        }
        (function() {
          var party = getPartyState();
          var maxIndex = getMaxPartyMemberIndex();
          for (var partyIndex = 0; partyIndex <= maxIndex && partyIndex < party.length; partyIndex++) {
            var member = party[partyIndex];
            if (!member) continue;
            var roleId = member.playerRole;
            for (var equipIndex = 0; equipIndex < Const.MAX_PLAYER_EQUIPMENTS; equipIndex++) {
              if (getPlayerEquipmentValue(equipIndex, roleId) === sc.operand[0]) {
                script.removeEquipmentEffect(roleId, equipIndex);
                setPlayerEquipmentValue(equipIndex, roleId, 0);
                x--;
                if (x === 0) {
                  return;
                }
              }
            }
          }
        })();
        if (x > 0 && sc.operand[2] !== 0) {
          scriptEntry = sc.operand[2] - 1;
        }
      }
      break;
    case 0x0021:
      script.debug('[SCRIPT] Inflict damage to the enemy');
      if (sc.operand[0]) {
        // Inflict damage to all enemies
        for (i = 0; i <= BATTLE().maxEnemyIndex; i++) {
          var enemy = BATTLE().enemy[i];
          if (enemy && enemy.objectID != 0) {
            battleService.setEnemyHealth(i, function(health) {
              return (health || 0) - sc.operand[1];
            });
          }
        }
      } else {
        // Inflict damage to one enemy
        battleService.setEnemyHealth(eventObjectID, function(health) {
          return (health || 0) - sc.operand[1];
        });
      }
      break;
    case 0x0022:
      script.debug('[SCRIPT] Revive player');
      if (sc.operand[0]) {
        // Apply to everyone
        script.scriptSuccess = false;
        forEachPartyMember(function(member) {
          var roleIndex = member.playerRole;
          if (worldService.getPlayerHP(roleIndex) === 0) {
            var revivedHP = Math.floor(worldService.getPlayerMaxHP(roleIndex) * sc.operand[1] / 10);
            worldService.setPlayerHP(roleIndex, revivedHP);
            script.curePoisonByLevel(roleIndex, 3);
            for (x = 0; x < PlayerStatus.All; x++) {
              script.removePlayerStatus(roleIndex, x);
            }
            script.scriptSuccess = true;
          }
        });
      } else {
        // Apply to one player
        if (worldService.getPlayerHP(eventObjectID) === 0) {
          var revivedHP = Math.floor(worldService.getPlayerMaxHP(eventObjectID) * sc.operand[1] / 10);
          worldService.setPlayerHP(eventObjectID, revivedHP);
          script.curePoisonByLevel(eventObjectID, 3);
          for (x = 0; x < PlayerStatus.All; x++) {
            script.removePlayerStatus(eventObjectID, x);
          }
        } else {
          script.scriptSuccess = false;
        }
      }
      break;
    case 0x0023:
      script.debug('[SCRIPT] Remove equipment from the specified player');
      if (sc.operand[1] === 0) {
        // Remove all equipments
        for (i = 0; i < Const.MAX_PLAYER_EQUIPMENTS; i++) {
          w = getPlayerEquipmentValue(i, playerRole);
          if (w !== 0) {
            script.addItemToInventory(w, 1);
            setPlayerEquipmentValue(i, playerRole, 0);
          }
          script.removeEquipmentEffect(playerRole, i);
        }
      } else {
        w = getPlayerEquipmentValue(sc.operand[1] - 1, playerRole);
        if (w !== 0) {
          script.removeEquipmentEffect(playerRole, sc.operand[1] - 1);
          script.addItemToInventory(w, 1);
          setPlayerEquipmentValue(sc.operand[1] - 1, playerRole, 0);
        }
      }
      break;
    case 0x0024:
      script.debug('[SCRIPT] Set the autoscript entry address for an event object');
      if (sc.operand[0] !== 0 && curEventObjectID > 0) {
        var nextAutoScript = Number.isFinite(sc.operand[1]) ? sc.operand[1] : 0;
        mutateEventObjectById(curEventObjectID, function(target) {
          if (!target) {
            return target;
          }
          target.autoScript = nextAutoScript;
          return target;
        });
        if (current) {
          current.autoScript = nextAutoScript;
        }
      }
      break;
    case 0x0025:
      script.debug('[SCRIPT] Set the trigger sc entry address for an event object');
      if (sc.operand[0] !== 0 && curEventObjectID > 0) {
        var nextTriggerScript = Number.isFinite(sc.operand[1]) ? sc.operand[1] : 0;
        mutateEventObjectById(curEventObjectID, function(target) {
          if (!target) {
            return target;
          }
          target.triggerScript = nextTriggerScript;
          return target;
        });
        if (current) {
          current.triggerScript = nextTriggerScript;
        }
      }
      break;
    case 0x0026:
      script.debug('[SCRIPT] Show the buy item menu');
      yield scene.makeScene();
      surface.updateScreen(null);
      yield uigame.buyMenu(sc.operand[0]);
      break;
    case 0x0027:
      script.debug('[SCRIPT] Show the sell item menu');
      yield scene.makeScene();
      surface.updateScreen(null);
      yield uigame.sellMenu();
      break;
    case 0x0028:
      script.debug('[SCRIPT] Apply poison to enemy');
      if (sc.operand[0]) {
        // Apply to everyone
        for (i = 0; i <= BATTLE().maxEnemyIndex; i++) {
          var targetEnemy = BATTLE().enemy[i];
          if (!targetEnemy || targetEnemy.objectID === 0) {
            continue;
          }
          var resistance = getObjectEnemyResistance(targetEnemy.objectID);
          if (randomLong(0, 9) >= resistance) {
            for (j = 0; j < Const.MAX_POISONS; j++) {
              if (targetEnemy.poisons[j].poisonID === sc.operand[1]) {
                break;
              }
            }
            if (j >= Const.MAX_POISONS) {
              for (j = 0; j < Const.MAX_POISONS; j++) {
                if (targetEnemy.poisons[j].poisonID === 0) {
                  battleService.setEnemyPoison(i, j, poison => {
                    poison.poisonID = sc.operand[1];
                    return poison;
                  });
                  var poisonScript = getObjectPoisonEnemyScript(sc.operand[1]);
                  if (typeof poisonScript === 'undefined' || poisonScript === null) {
                    poisonScript = 0;
                  }
                  var ret = yield script.runTriggerScript(poisonScript, eventObjectID);
                  battleService.setEnemyPoison(i, j, poison => {
                    poison.poisonScript = ret;
                    return poison;
                  });
                  break;
                }
              }
            }
          }
        }
      } else {
        // Apply to one enemy
        var singleEnemy = BATTLE().enemy[eventObjectID];
        if (singleEnemy) {
          var enemyObjectId = singleEnemy.objectID;
          var singleResistance = getObjectEnemyResistance(enemyObjectId);
          if (randomLong(0, 9) >= singleResistance) {
            for (j = 0; j < Const.MAX_POISONS; j++) {
              if (singleEnemy.poisons[j].poisonID == sc.operand[1]) {
                break;
              }
            }
            if (j >= Const.MAX_POISONS) {
              for (j = 0; j < Const.MAX_POISONS; j++) {
                if (singleEnemy.poisons[j].poisonID == 0) {
                  battleService.setEnemyPoison(eventObjectID, j, poison => {
                    poison.poisonID = sc.operand[1];
                    return poison;
                  });
                  var singlePoisonScript = getObjectPoisonEnemyScript(sc.operand[1]);
                  if (typeof singlePoisonScript === 'undefined' || singlePoisonScript === null) {
                    singlePoisonScript = 0;
                  }
                  var singleRet = yield script.runTriggerScript(singlePoisonScript, eventObjectID);
                  battleService.setEnemyPoison(eventObjectID, j, poison => {
                    poison.poisonScript = singleRet;
                    return poison;
                  });
                  break;
                }
              }
            }
          }
        }
      }
      break;
    case 0x0029:
      script.debug('[SCRIPT] Apply poison to player');
      if (sc.operand[0]) {
        // Apply to everyone
        forEachPartyMember(function(member) {
          var roleId = member.playerRole;
          if (randomLong(1, 100) > script.getPlayerPoisonResistance(roleId)) {
            script.addPoisonForPlayer(roleId, sc.operand[1]);
          }
        });
      } else {
        // Apply to one player
        if (randomLong(1, 100) > script.getPlayerPoisonResistance(eventObjectID)) {
          script.addPoisonForPlayer(eventObjectID, sc.operand[1]);
        }
      }
      break;
    case 0x002A:
      script.debug('[SCRIPT] Cure poison by object ID for enemy');
      if (sc.operand[0]) {
        // Apply to all enemies
        for (i = 0; i <= BATTLE().maxEnemyIndex; i++) {
          if (BATTLE().enemy[i].objectID === 0){
            continue;
          }
          for (j = 0; j < Const.MAX_POISONS; j++) {
            if (BATTLE().enemy[i].poisons[j].poisonID === sc.operand[1]) {
              battleService.clearEnemyPoison(i, j);
              break;
            }
          }
        }
      } else {
        // Apply to one enemy
        for (j = 0; j < Const.MAX_POISONS; j++) {
          if (BATTLE().enemy[eventObjectID].poisons[j].poisonID == sc.operand[1]) {
            battleService.clearEnemyPoison(eventObjectID, j);
            break;
          }
        }
      }
      break;
    case 0x002B:
      script.debug('[SCRIPT] Cure poison by object ID for player');
      if (sc.operand[0]) {
        forEachPartyMember(function(member) {
          script.curePoisonByKind(member.playerRole, sc.operand[1]);
        });
      } else {
        script.curePoisonByKind(eventObjectID, sc.operand[1]);
      }
      break;
    case 0x002C:
      script.debug('[SCRIPT] Cure poisons by level');
      if (sc.operand[0]) {
        forEachPartyMember(function(member) {
          script.curePoisonByLevel(member.playerRole, sc.operand[1]);
        });
      } else {
        script.curePoisonByLevel(eventObjectID, sc.operand[1]);
      }
      break;
    case 0x002D:
      script.debug('[SCRIPT] Set the status for player');
      script.setPlayerStatus(eventObjectID, sc.operand[0], sc.operand[1]);
      break;
    case 0x002E:
      script.debug('[SCRIPT] Set the status for enemy');
      w = BATTLE().enemy[eventObjectID].objectID;
      if (PAL_CLASSIC) {
        i = 9;
      } else {
        i = ((sc.operand[0] === PlayerStatus.Slow) ? 14 : 9);
      }
      var enemyResistance = getObjectEnemyResistance(w);
      if (randomLong(0, i) >= enemyResistance &&
          BATTLE().enemy[eventObjectID].status[sc.operand[0]] === 0) {
        battleService.setEnemyStatus(eventObjectID, sc.operand[0], sc.operand[1]);
      } else {
        scriptEntry = sc.operand[2] - 1;
      }
      break;
    case 0x002F:
      script.debug('[SCRIPT] Remove player\'s status')
      script.removePlayerStatus(eventObjectID, sc.operand[0]);
      break;
    case 0x0030:
      script.debug('[SCRIPT] Increase player\'s stat temporarily by percent');
      /*{
         WORD *p = (WORD *)(&gpGlobals->rgEquipmentEffect[kBodyPartExtra]); // HACKHACK
         WORD *p1 = (WORD *)(&gpGlobals->g.PlayerRoles);

         if (pScript->rgwOperand[2] == 0)
         {
            iPlayerRole = wEventObjectID;
         }
         else
         {
            iPlayerRole = pScript->rgwOperand[2] - 1;
         }

         p[pScript->rgwOperand[0] * MAX_PLAYER_ROLES + iPlayerRole] =
            p1[pScript->rgwOperand[0] * MAX_PLAYER_ROLES + iPlayerRole] *
               (SHORT)pScript->rgwOperand[1] / 100;
      }*/
      // WARNING HACK
      if (sc.operand[2] === 0) {
        playerRole = eventObjectID;
      } else {
        playerRole = sc.operand[2] - 1;
      }
      var baseValue = worldService.getPlayerRoleWord(sc.operand[0], playerRole) || 0;
      var val = baseValue * floor(SHORT(sc.operand[1]) / 100);
      setEquipmentEffectWordValue(BodyPart.Extra, sc.operand[0], playerRole, val);
      break;
    case 0x0031:
      script.debug('[SCRIPT] Change battle sprite temporarily for player');
      worldService.mutateEquipmentEffect(BodyPart.Extra, function(effect) {
        if (effect && effect.spriteNumInBattle) {
          effect.spriteNumInBattle[eventObjectID] = sc.operand[0];
        }
        return effect;
      });
      break;
    case 0x0033:
      script.debug('[SCRIPT] collect the enemy for items');
      if (BATTLE().enemy[eventObjectID].e.collectValue !== 0) {
        worldService.adjustCollectValue(BATTLE().enemy[eventObjectID].e.collectValue);
      } else {
        scriptEntry = sc.operand[0] - 1;
      }
      break;
    case 0x0034:
      script.debug('[SCRIPT] Transform collected enemies into items');
      var collectValue = getCollectValue();
      if (collectValue > 0) {
        if (PAL_CLASSIC) {
          i = randomLong(1, collectValue);
          if (i > 9) {
            i = 9;
          }
        } else {
          i = randomLong(1, 9);
          if (i > collectValue) {
            i = collectValue;
          }
        }
        worldService.adjustCollectValue(-i);
        i--;
        var storeItemId = getStoreItemId(0, i);
        if (storeItemId) {
          script.addItemToInventory(storeItemId, 1);
        }
        ui.startDialog(DialogPosition.CenterWindow, 0, 0, false);
        var s = ui.getWord(42);
        if (storeItemId) {
          s = s.concat(ui.getWord(storeItemId));
        }
        ui.showDialogText(s);
      } else {
        scriptEntry = sc.operand[0] - 1;
      }
      break;
    case 0x0035:
      script.debug('[SCRIPT] Shake the screen');
      i = sc.operand[1];
      if (i === 0) {
         i = 4;
      }
      yield surface.shakeScreen(sc.operand[0], i);
      if (!sc.operand[0]) {
         surface.updateScreen(null);
      }
      break;
    case 0x0036:
      script.debug('[SCRIPT] Set the current playing RNG animation');
      worldService.setCurPlayingRng(sc.operand[0]);
      break;
    case 0x0037:
      script.debug('[SCRIPT] Play RNG animation');
      yield rng.play(
        getCurPlayingRNGValue(),
        sc.operand[0],
        sc.operand[1] > 0 ? sc.operand[1] : 999,
        sc.operand[2] > 0 ? sc.operand[2] : 16
      );
      break;
    case 0x0038:
      script.debug('[SCRIPT] Teleport the party out of the scene');
      var sceneId = getSceneIdValue();
      var currentScene = worldService.getSceneEntry(sceneId);
      if (!isInBattle() && currentScene && currentScene.scriptOnTeleport !== 0) {
        var ret = yield script.runTriggerScript(currentScene.scriptOnTeleport, 0xFFFF);
        worldService.mutateSceneEntry(sceneId, function(entry) {
          entry.scriptOnTeleport = ret;
          return entry;
        });
      } else {
        // failed
        script.scriptSuccess = false;
        scriptEntry = sc.operand[0] - 1;
      }
      break;
    case 0x0039:
      script.debug('[SCRIPT] Drain HP from enemy');
      var movingMember = getPartyMember(BATTLE().movingPlayerIndex);
      w = movingMember ? movingMember.playerRole : 0;
      battleService.updateEnemy(eventObjectID, enemy => {
        if (!enemy) return enemy;
        enemy.e.health -= sc.operand[0];
        return enemy;
      });
      mutatePlayerRoles(function(playerRoles) {
        playerRoles.HP[w] += sc.operand[0];
        if (playerRoles.HP[w] > playerRoles.maxHP[w]) {
          playerRoles.HP[w] = playerRoles.maxHP[w];
        }
      });
      break;
    case 0x003A:
      script.debug('[SCRIPT] Player flee from the battle');
      if (BATTLE().isBoss) {
        // Cannot flee from bosses
        scriptEntry = sc.operand[0] - 1;
      } else {
        yield battle.playerEscape();
      }
      break;
    case 0x003F:
      script.debug('[SCRIPT] Ride the event object to the specified position, at a low speed');
      yield script.partyRideEventObject(eventObjectID, sc.operand[0], sc.operand[1], sc.operand[2], 2)
      break;
    case 0x0040:
      script.debug('[SCRIPT] set the trigger method for a event object');
      if (sc.operand[0] != 0) {
        current.triggerMode = sc.operand[1];
      }
      break;
    case 0x0041:
      script.debug('[SCRIPT] Mark the sc as failed');
      script.scriptSuccess = false;
      break;
    case 0x0042:
      script.debug('[SCRIPT] Simulate a magic for player');
      i = SHORT(sc.operand[2]) - 1;
      if (i < 0) {
        i = eventObjectID;
      }
      yield battle.simulateMagic(i, sc.operand[0], sc.operand[1]);
      break;
    case 0x0043:
      script.debug('[SCRIPT] Set background music');
      worldService.setMusicTrack(sc.operand[0]);
      music.play(sc.operand[0], (sc.operand[0] != 0x3D), sc.operand[1]);
      break;
    case 0x0044:
      script.debug('[SCRIPT] Ride the event object to the specified position, at the normal speed');
      yield script.partyRideEventObject(eventObjectID, sc.operand[0], sc.operand[1], sc.operand[2], 4);
      break;
    case 0x0045:
      script.debug('[SCRIPT] Set battle music');
      worldService.setBattleMusicTrack(sc.operand[0]);
      break;
    case 0x0046:
      script.debug('[SCRIPT] Set the party position on the map');
      var offsetX, offsetY, x, y;

      var currentDirection = getPartyDirection();
      offsetX = ((currentDirection === Direction.West || currentDirection === Direction.South) ? 16 : -16);
      offsetY = ((currentDirection === Direction.West || currentDirection === Direction.North) ? 8 : -8);
      x = sc.operand[0] * 32 + sc.operand[2] * 16;
      y = sc.operand[1] * 16 + sc.operand[2] * 8;
      x -= getPartyOffsetX();
      y -= getPartyOffsetY();
      var viewportPos = PAL_XY(x, y);
      setViewportValue(viewportPos);
      var partyStartX = getPartyOffsetX();
      var partyStartY = getPartyOffsetY();
      var viewportX = PAL_X(viewportPos);
      var viewportY = PAL_Y(viewportPos);
      var direction = getPartyDirection();
      worldService.mutateParty(function(party) {
        mutateTrailValue(function(trail) {
          var currentX = partyStartX;
          var currentY = partyStartY;
          for (var idx = 0; idx < Const.MAX_PLAYABLE_PLAYER_ROLES; idx++) {
            var member = party && party[idx];
            if (member) {
              member.x = currentX;
              member.y = currentY;
            }
            var trailEntry = trail && trail[idx];
            if (trailEntry) {
              trailEntry.x = currentX + viewportX;
              trailEntry.y = currentY + viewportY;
              trailEntry.direction = direction;
            }
            currentX += offsetX;
            currentY += offsetY;
          }
          return trail;
        });
        return party;
      });
      break;
    case 0x0047:
      script.debug('[SCRIPT] Play sound effect');
      sound.play(sc.operand[0]);
      break;
    case 0x0049:
      script.debug('[SCRIPT] Set the state of event object');
      if (current) {
        // WARNING 这里有一个BUG，在京城云姨家茅山道士施法之后，从刘晋元房间出来，current为空
        current.state = sc.operand[1];
      }
      break;
    case 0x004A:
      script.debug('[SCRIPT] Set the current battlefield');
      worldService.setBattleFieldId(sc.operand[0]);
      break;
    case 0x004B:
      script.debug('[SCRIPT] Nullify the event object for a short while');
      evtObj.vanishTime = -15;
      break;
    case 0x004C:
      script.debug('[SCRIPT] chase the player');
      i = sc.operand[0]; // max. distance
      j = sc.operand[1]; // speed
      if (i === 0) {
        i = 8;
      }
      if (j === 0) {
        j = 4;
      }
      script.monsterChasePlayer(eventObjectID, j, i, sc.operand[2]);
      break;
    case 0x004D:
      script.debug('[SCRIPT] wait for any key');
      yield input.waitForKey(0);
      break;
    case 0x004E:
      script.debug('[SCRIPT] Load the last saved game');
      yield surface.fadeOut(1);
      yield game.initGameData(getCurrentSaveSlot());
      return 0; // don't go further
    case 0x004F:
      script.debug('[SCRIPT] Fade the screen to red color (game over)');
      yield surface.fadeToRed();
      break;
    case 0x0050:
      script.debug('[SCRIPT] screen fade out');
      surface.updateScreen(null);
      yield surface.fadeOut((sc.operand[0] ? sc.operand[0] : 1));
      worldService.setNeedToFadeIn(true);
      break;
    case 0x0051:
      script.debug('[SCRIPT] screen fade in')
      surface.updateScreen(null);
      var time = SHORT(sc.operand[0]);
      yield surface.fadeIn(getPaletteNumber(), getNightPaletteFlag(), (time > 0 ? time : 1));
      worldService.setNeedToFadeIn(false);
      break;
    case 0x0052:
      script.debug('[SCRIPT] hide the event object for a while, default 800 frames');
      evtObj.state *= -1;
      evtObj.vanishTime = (sc.operand[0] ? sc.operand[0] : 800);
      break;
    case 0x0053:
      script.debug('[SCRIPT] use the day palette');
      worldService.setNightPaletteFlag(false);
      break;
    case 0x0054:
      script.debug('[SCRIPT] use the night palette');
      worldService.setNightPaletteFlag(true);
      break;
    case 0x0055:
      script.debug('[SCRIPT] Add magic to a player');
      i = sc.operand[1];
      if (i === 0) {
        i = eventObjectID;
      } else {
        i--;
      }
      script.addMagic(i, sc.operand[0]);
      break;
    case 0x0056:
      script.debug('[SCRIPT] Remove magic from a player');
      i = sc.operand[1];
      if (i === 0) {
        i = eventObjectID;
      } else {
        i--;
      }
      script.removeMagic(i, sc.operand[0]);
      break;
    case 0x0057:
      script.debug('[SCRIPT] Set the base damage of magic according to MP value'); // 酒神吧大概是
      i = ((sc.operand[1] === 0) ? 8 : sc.operand[1]);
      j = getMagicNumberFromObject(sc.operand[0]);
      var mpValue = worldService.getPlayerMP(eventObjectID);
      mutateMagic(function(magicData) {
        if (magicData && magicData[j]) {
          magicData[j].baseDamage = mpValue * i;
        }
      });
      worldService.setPlayerMP(eventObjectID, 0);
      break;
    case 0x0058:
      script.debug('[SCRIPT] Jump if there is less than the specified number of the specified items in the inventory');
      if (script.getItemAmount(sc.operand[0]) < SHORT(sc.operand[1])) {
         scriptEntry = sc.operand[2] - 1;
      }
      break;
    case 0x0059:
      script.debug('[SCRIPT] Change to the specified scene');
      if (sc.operand[0] > 0 && sc.operand[0] <= Const.MAX_SCENES && getSceneIdValue() !== sc.operand[0]) {
        // Set data to load the scene in the next frame
        worldService.setSceneId(sc.operand[0]);
        res.setLoadFlags(LoadFlag.Scene);
        worldService.setEnteringScene(true);
        worldService.setLayer(0);
      }
      break;
    case 0x005A:
      script.debug('[SCRIPT] Halve the player\'s HP');
      // The eventObjectID parameter here should indicate the player role
      var currentHP = worldService.getPlayerHP(eventObjectID);
      worldService.setPlayerHP(eventObjectID, Math.floor(currentHP / 2));
      break;
    case 0x005B:
      script.debug('[SCRIPT] Halve the enemy\'s HP');
      w = ~~(BATTLE().enemy[eventObjectID].e.health / 2) + 1;
      if (w > sc.operand[0]) {
        w = sc.operand[0];
      }
      battleService.updateEnemy(eventObjectID, enemy => {
        if (!enemy) return enemy;
        enemy.e.health -= w;
        return enemy;
      });
      break;
    case 0x005C:
      script.debug('[SCRIPT] Hide for a while'); // 隐蛊吧大概是
        // WARNING 转换位INT类型
      battleService.setHidingTime(-sc.operand[0]);
      break;
    case 0x005D:
      script.debug('[SCRIPT] Jump if player doesn\'t have the specified poison');
      if (!script.isPlayerPoisonedByKind(eventObjectID, sc.operand[0])) {
        scriptEntry = sc.operand[1] - 1;
      }
      break;
    case 0x005E:
      script.debug('[SCRIPT] Jump if enemy doesn\'t have the specified poison');
      for (i = 0; i < Const.MAX_POISONS; i++) {
        if (BATTLE().enemy[eventObjectID].poisons[i].poisonID == sc.operand[0]) {
          break;
        }
      }
      if (i >= Const.MAX_POISONS) {
        scriptEntry = sc.operand[1] - 1;
      }
      break;
    case 0x005F:
      script.debug('[SCRIPT] Kill the player immediately');
      // The eventObjectID parameter here should indicate the player role
      mutatePlayerRoles(function(playerRoles) {
        playerRoles.HP[eventObjectID] = 0;
      });
      break;
    case 0x0060:
      script.debug('[SCRIPT] Immediate KO of the enemy');
      battleService.setEnemyHealth(eventObjectID, 0);
      break;
    case 0x0061:
      script.debug('[SCRIPT] Jump if player is not poisoned');
      if (!script.isPlayerPoisonedByLevel(eventObjectID, 1)) {
        scriptEntry = sc.operand[0] - 1;
      }
      break;
    case 0x0062:
      script.debug('[SCRIPT] Pause enemy chasing for a while');
      worldService.setChaseSpeedChangeCycles(sc.operand[0]);
      worldService.setChaseRange(0);
      break;
    case 0x0063:
      script.debug('[SCRIPT] Speed up enemy chasing for a while');
      worldService.setChaseSpeedChangeCycles(sc.operand[0]);
      worldService.setChaseRange(3);
      break;
    case 0x0064:
      script.debug('[SCRIPT] Jump if enemy\'s HP is more than the specified percentage');
      var enemyState = BATTLE().enemy[eventObjectID];
      if (enemyState) {
        var enemyId = getEnemyIdFromObject(enemyState.objectID);
        var enemyTemplate = getEnemyEntry(enemyId);
        var enemyMaxHealth = enemyTemplate && typeof enemyTemplate.health === 'number' ? enemyTemplate.health : 0;
        if (enemyMaxHealth > 0 && enemyState.e.health * 100 > enemyMaxHealth * sc.operand[0]) {
          scriptEntry = sc.operand[1] - 1;
        }
      }
      break;
    case 0x0065:
      script.debug('[SCRIPT] Set the player\'s sprite');
      mutatePlayerRoles(function(playerRoles) {
        playerRoles.spriteNum[sc.operand[0]] = sc.operand[1];
      });
      if (!isInBattle() && sc.operand[2]) {
        res.setLoadFlags(LoadFlag.PlayerSprite);
        yield res.loadResources();
      }
      break;
    case 0x0066:
      script.debug('[SCRIPT] Throw weapon to enemy');
      w = sc.operand[1] * 5;
      var attackingMember = getPartyMember(BATTLE().movingPlayerIndex);
      var attackingRole = attackingMember ? attackingMember.playerRole : 0;
      w += worldService.getPlayerAttackStrength(attackingRole);
      w += randomLong(0, 4);
      yield battle.simulateMagic(SHORT(eventObjectID), sc.operand[0], w);
      break;
    case 0x0067:
      script.debug('[SCRIPT] Enemy use magic');
      //debugger;
      setEnemyMagicValue(eventObjectID, sc.operand[0]);
      setEnemyMagicRateValue(eventObjectID, (sc.operand[1] == 0) ? 10 : sc.operand[1]);
      break;
    case 0x0068:
      script.debug('[SCRIPT] Jump if it\'s enemy\'s turn');
      if (BATTLE().enemyMoving) {
        scriptEntry = sc.operand[0] - 1;
      }
      break;
    case 0x0069:
      script.debug('[SCRIPT] Enemy escape in battle');
      yield battle.enemyEscape();
      break;
    case 0x006A:
      script.debug('[SCRIPT] Steal from the enemy');
      yield battle.stealFromEnemy(eventObjectID, sc.operand[0]);
      break;
    case 0x006B:
      script.debug('[SCRIPT] Blow away enemies');
      battleService.setBattleBlow(SHORT(sc.operand[0]));
      break;
    case 0x006C:
      script.debug('[SCRIPT] Walk the NPC in one step');
      current.x += SHORT(sc.operand[1]);
      current.y += SHORT(sc.operand[2]);
      script.NPCWalkOneStep(curEventObjectID, 0);
      break;
    case 0x006D:
      script.debug('[SCRIPT] Set the enter sc and teleport sc for a scene');
      if (sc.operand[0]) {
        worldService.mutateSceneEntry(sc.operand[0], function(sceneEntry) {
          if (!sceneEntry) {
            return sceneEntry;
          }
          if (sc.operand[1]) {
            sceneEntry.scriptOnEnter = sc.operand[1];
          }
          if (sc.operand[2]) {
            sceneEntry.scriptOnTeleport = sc.operand[2];
          }
          if (sc.operand[1] === 0 && sc.operand[2] === 0) {
            sceneEntry.scriptOnEnter = 0;
            sceneEntry.scriptOnTeleport = 0;
          }
          return sceneEntry;
        });
      }
      break;
    case 0x006E:
      script.debug('[SCRIPT] Move the player to the specified position in one step');
      var currentViewport = getViewportValue();
      var partyOffset = getPartyOffsetValue();
      var currentDirection = getPartyDirection();
      mutateTrailValue(function(trail) {
        if (!Array.isArray(trail) || trail.length === 0) {
          return trail;
        }
        for (var idx = 3; idx >= 0; idx--) {
          trail[idx + 1] = trail[idx];
        }
        trail[0] = trail[0] || {};
        trail[0].direction = currentDirection;
        trail[0].x = PAL_X(currentViewport) + PAL_X(partyOffset);
        trail[0].y = PAL_Y(currentViewport) + PAL_Y(partyOffset);
        return trail;
      });
      var newViewport = PAL_XY(
        PAL_X(currentViewport) + SHORT(sc.operand[0]),
        PAL_Y(currentViewport) + SHORT(sc.operand[1])
      );
      setViewportValue(newViewport);
      worldService.setLayer(sc.operand[2] * 8);
      if (sc.operand[0] !== 0 || sc.operand[1] !== 0){
        scene.updatePartyGestures(true);
      }
      break;
    case 0x006F:
      script.debug('[SCRIPT] Sync the state of current event object with another event object');
      if (current.state === SHORT(sc.operand[1])) {
        evtObj.state = SHORT(sc.operand[1]);
      }
      break;
    case 0x0070:
      script.debug('[SCRIPT] Walk the party to the specified position');
      yield script.partyWalkTo(sc.operand[0], sc.operand[1], sc.operand[2], 2);
      break;
    case 0x0071:
      script.debug('[SCRIPT] Wave the screen');
      worldService.setScreenWave(sc.operand[0]);
      worldService.setWaveProgression(SHORT(sc.operand[1]));
      break;
    case 0x0072:
      script.debug('[SCRIPT] unknown 0x0072');
      // WARNING Unknown
      //throw 'unknown';
      break;
    case 0x0073:
      script.debug('[SCRIPT] Fade the screen to scene');
      surface.backupScreen();
      yield scene.makeScene();
      yield surface.fadeScreen(sc.operand[0]);
      break;
    case 0x0074:
      script.debug('[SCRIPT] Jump if not all players are full HP');
      (function() {
        var shouldJump = false;
        forEachPartyMember(function(member) {
          var roleId = member.playerRole;
          if (worldService.getPlayerHP(roleId) < worldService.getPlayerMaxHP(roleId)) {
            shouldJump = true;
          }
        });
        if (shouldJump) {
          scriptEntry = sc.operand[0] - 1;
        }
      })();
      break;
    case 0x0075:
      script.debug('[SCRIPT] Set the player party');
      worldService.setMaxPartyMemberIndex(0);
      var assignedCount = 0;
      worldService.mutateParty(function(party) {
        if (!party) {
          return party;
        }
        for (var idx = 0; idx < 3; idx++) {
          if (sc.operand[idx] != 0) {
            var member = party[assignedCount];
            if (member) {
              member.playerRole = sc.operand[idx] - 1;
            }
            setPlayerActionTypeSafe(assignedCount, BattleActionType.Attack);
            assignedCount++;
          }
        }
        if (assignedCount === 0 && party[0]) {
          // HACK for Dream 2.11
          party[0].playerRole = 0;
          assignedCount = 1;
        }
        return party;
      });
      worldService.setMaxPartyMemberIndex(assignedCount > 0 ? assignedCount - 1 : 0);
      // Reload the player sprites
      res.setLoadFlags(LoadFlag.PlayerSprite);
      yield res.loadResources();
      worldService.resetPoisonStatusMatrix();
      yield script.updateEquipments();
      break;
    case 0x0076:
      script.debug('[SCRIPT] Show FBP picture');
      ending.setEffectSprite(0);
      yield ending.showFBP(sc.operand[0], sc.operand[1]);
      break;
    case 0x0077:
      script.debug('[SCRIPT] Stop current playing music');
      // WARNING TODO
      // yield music.play(0, false, (sc.operand[0] == 0) ? 2.0 : sc.operand[0] * 2);
      worldService.setMusicTrack(0);
      break;
    case 0x0078:
      script.debug('[SCRIPT] unknown 0x0078')
      // FIXME: ???
      // throw 'unknown';
      break;
    case 0x0079:
      script.debug('[SCRIPT] Jump if the specified player is in the party');
      (function() {
        var party = getPartyState();
        var maxIndex = getMaxPartyMemberIndex();
        for (var partyIndex = 0; partyIndex <= maxIndex && partyIndex < party.length; partyIndex++) {
          var member = party[partyIndex];
          if (!member) continue;
          if (worldService.getPlayerNameId(member.playerRole) === sc.operand[0]) {
            scriptEntry = sc.operand[1] - 1;
            return;
          }
        }
      })();
      break;
    case 0x007A:
      script.debug('[SCRIPT] Walk the party to the specified position, at a higher speed');
      yield script.partyWalkTo(sc.operand[0], sc.operand[1], sc.operand[2], 4);
      break;
    case 0x007B:
      script.debug('[SCRIPT] Walk the party to the specified position, at the highest speed');
      yield script.partyWalkTo(sc.operand[0], sc.operand[1], sc.operand[2], 8);
      break;
    case 0x007C:
      script.debug('[SCRIPT] Walk straight to the specified position');
      if ((eventObjectID & 1) ^ (getFrameCounter() & 1)) {
        var ret = script.NPCWalkTo(eventObjectID, sc.operand[0], sc.operand[1], sc.operand[2], 4);
        if (!ret){
          scriptEntry--;
        }
      } else {
        scriptEntry--;
      }
      break;
    case 0x007D:
      script.debug('[SCRIPT] Move the event object');
      current.x += SHORT(sc.operand[1]);
      current.y += SHORT(sc.operand[2]);
      break;
    case 0x007E:
      script.debug('[SCRIPT] Set the layer of event object');
      current.layer = SHORT(sc.operand[1]);
      break;
    case 0x007F:
      script.debug('[SCRIPT] Move the viewport');
      if (sc.operand[0] === 0 && sc.operand[1] === 0) {
        // Move the viewport back to normal state
        var leader = getPartyMember(0);
        var maxPartyIndex = getMaxPartyMemberIndex();
        if (!leader) {
          break;
        }
        var deltaX = leader.x - 160;
        var deltaY = leader.y - 112;
        var normalizedViewport = PAL_XY(getViewportX() + deltaX, getViewportY() + deltaY);
        setViewportValue(normalizedViewport);
        setPartyOffsetValue(PAL_XY(160, 112));
        worldService.mutateParty(function(party) {
          for (var partyIdx = 0; partyIdx <= maxPartyIndex; partyIdx++) {
            var member = party[partyIdx];
            if (member) {
              member.x -= deltaX;
              member.y -= deltaY;
            }
          }
          return party;
        });
        if (sc.operand[2] !== 0xFFFF) {
          yield scene.makeScene();
          surface.updateScreen(null);
        }
      } else {
        i = 0;
        var stepX = SHORT(sc.operand[0]);
        var stepY = SHORT(sc.operand[1]);
        do {
          var maxPartyIndex = getMaxPartyMemberIndex();
          if (sc.operand[2] === 0xFFFF) {
            var previousViewportX = getViewportX();
            var previousViewportY = getViewportY();
            var targetViewport = PAL_XY(sc.operand[0] * 32 - 160, sc.operand[1] * 16 - 112);
            setViewportValue(targetViewport);
            var deltaViewportX = previousViewportX - PAL_X(targetViewport);
            var deltaViewportY = previousViewportY - PAL_Y(targetViewport);
            worldService.mutateParty(function(party) {
              for (var partyIdx = 0; partyIdx <= maxPartyIndex; partyIdx++) {
                var member = party[partyIdx];
                if (member) {
                  member.x += deltaViewportX;
                  member.y += deltaViewportY;
                }
              }
              return party;
            });
            // WARNING 这里sdlpal里没有跳出，那岂不是死循环了？
            //break;
          } else {
            var incrementalViewport = PAL_XY(getViewportX() + stepX, getViewportY() + stepY);
            setViewportValue(incrementalViewport);
            var currentPartyOffset = getPartyOffsetValue();
            var updatedPartyOffset = PAL_XY(PAL_X(currentPartyOffset) - stepX, PAL_Y(currentPartyOffset) - stepY);
            setPartyOffsetValue(updatedPartyOffset);
            worldService.mutateParty(function(party) {
              for (var partyIdx = 0; partyIdx <= maxPartyIndex; partyIdx++) {
                var member = party[partyIdx];
                if (member) {
                  member.x -= stepX;
                  member.y -= stepY;
                }
              }
              return party;
            });
          }
          if (sc.operand[2] !== 0xFFFF){
            yield play.update(false);
          }

          yield scene.makeScene();
          surface.updateScreen(null);

          // Delay for one frame
          yield sleepByFrame(1);
        } while (++i < SHORT(sc.operand[2]));
      }
      break;
    case 0x0080:
      script.debug('[SCRIPT] Toggle day/night palette');
      var toggledNightPalette = !getNightPaletteFlag();
      worldService.setNightPaletteFlag(toggledNightPalette);
      yield surface.paletteFade(getPaletteNumber(), toggledNightPalette, !sc.operand[0]);
      break;
    case 0x0081:
      script.debug('[SCRIPT] Jump if the player is not facing the specified event object');
      var eventRange = getSceneEventRange();
      if (sc.operand[0] <= eventRange.startIndex
          || sc.operand[0] > eventRange.endIndex) {
         // The event object is not in the current scene
         scriptEntry = sc.operand[2] - 1;
         script.scriptSuccess = false;
         break;
      }
      x = current.x;
      y = current.y;
      var partyDir = getPartyDirection();
      x += ((partyDir == Direction.West || partyDir == Direction.South) ? 16 : -16);
      y += ((partyDir == Direction.West || partyDir == Direction.North) ? 8 : -8);
      x -= getViewportX() + getPartyOffsetX();
      y -= getViewportY() + getPartyOffsetY();
      if (abs(x) + abs(y * 2) < sc.operand[1] * 32 + 16) {
        if (sc.operand[1] > 0) {
          // Change the trigger mode so that the object can be triggered in next frame
          current.triggerMode = TriggerMode.TouchNormal + sc.operand[1];
        }
      } else {
        scriptEntry = sc.operand[2] - 1;
        script.scriptSuccess = false;
      }
      break;
    case 0x0082:
      script.debug('[SCRIPT] Walk straight to the specified position, at a high speed');
      var ret = script.NPCWalkTo(eventObjectID, sc.operand[0], sc.operand[1], sc.operand[2], 8);
      if (!ret) scriptEntry--;
      break;
    case 0x0083:
      script.debug('[SCRIPT] Jump if event object is not in the specified zone of the current event object');
      var zoneEventRange = getSceneEventRange();
      if (sc.operand[0] <= zoneEventRange.startIndex
          || sc.operand[0] > zoneEventRange.endIndex) {
        // The event object is not in the current scene
        scriptEntry = sc.operand[2] - 1;
        script.scriptSuccess = false;
        break;
      }
      x = evtObj.x - current.x;
      y = evtObj.y - current.y;
      if (abs(x) + abs(y * 2) >= sc.operand[1] * 32 + 16) {
         scriptEntry = sc.operand[2] - 1;
         script.scriptSuccess = false;
      }
      break;
    case 0x0084:
      script.debug('[SCRIPT] Place the item which player used as an event object to the scene');
      var placementEventRange = getSceneEventRange();
      if (sc.operand[0] <= placementEventRange.startIndex
          || sc.operand[0] > placementEventRange.endIndex) {
        // The event object is not in the current scene
        scriptEntry = sc.operand[2] - 1;
        script.scriptSuccess = false;
        break;
      }
      x = getViewportX() + getPartyOffsetX();
      y = getViewportY() + getPartyOffsetY();
      var partyDirPlacement = getPartyDirection();
      x += ((partyDirPlacement == Direction.West || partyDirPlacement == Direction.South) ? -16 : 16);
      y += ((partyDirPlacement == Direction.West || partyDirPlacement == Direction.North) ? -8 : 8);
      if (scene.checkObstacle(PAL_XY(x, y), false, 0)) {
        scriptEntry = sc.operand[2] - 1;
        script.scriptSuccess = false;
      } else {
        current.x = x;
        current.y = y;
        current.state = SHORT(sc.operand[1]);
      }
      break;
    case 0x0085:
      script.debug('[SCRIPT] Delay for a period');
      yield sleep(sc.operand[0] * 80); // WARNING param normalize
      break;
    case 0x0086:
      script.debug('[SCRIPT] Jump if the specified item is not equipped');
      y = false;
      (function() {
        var party = getPartyState();
        var maxIndex = getMaxPartyMemberIndex();
        for (var partyIndex = 0; partyIndex <= maxIndex && partyIndex < party.length; partyIndex++) {
          var member = party[partyIndex];
          if (!member) continue;
          var roleId = member.playerRole;
          for (var slot = 0; slot < Const.MAX_PLAYER_EQUIPMENTS; slot++) {
            if (getPlayerEquipmentValue(slot, roleId) == sc.operand[0]) {
              y = true;
              return;
            }
          }
        }
      })();
      if (!y) {
        scriptEntry = sc.operand[2] - 1;
      }
      break;
    case 0x0087:
      script.debug('[SCRIPT] Animate the event object');
      script.NPCWalkOneStep(curEventObjectID, 0);
      break;
    case 0x0088:
      script.debug('[SCRIPT] Set the base damage of magic according to amount of money'); // 扔钱。。
      var currentCash = getCashValue();
      i = (currentCash > 5000) ? 5000 : currentCash;
      worldService.adjustCash(-i);
      j = getMagicNumberFromObject(sc.operand[0]);
      mutateMagic(function(magicData) {
        if (magicData && magicData[j]) {
          magicData[j].baseDamage = ~~(i * 2 / 5);
        }
      });
      break;
    case 0x0089:
      script.debug('[SCRIPT] Set the battle result');
      battleService.setBattleResult(sc.operand[0]);
      break;
    case 0x008A:
      script.debug('[SCRIPT] Enable Auto-Battle for next battle');
      worldService.setAutoBattle(true);
      break;
    case 0x008B:
      script.debug('[SCRIPT] change the current palette');
      worldService.setPaletteId(sc.operand[0]);
      if (!worldService.getNeedToFadeIn()) {
        var palette = Palette.get(getPaletteNumber(), false);
        surface.setPalette(palette);
      }
      break;
    case 0x008C:
      script.debug('[SCRIPT] Fade from/to color');
      yield surface.colorFade(sc.operand[1], sc.operand[0], sc.operand[2]); // WARNING param normalize
      worldService.setNeedToFadeIn(false);
      break;
    case 0x008D:
      script.debug('[SCRIPT] Increase player\'s level');
      script.playerLevelUp(eventObjectID, sc.operand[0]);
      break;
    case 0x008F:
      script.debug('[SCRIPT] Halve the cash amount');
      var halvedCash = Math.trunc(getCashValue() / 2);
      worldService.setCash(halvedCash);
      break;
    case 0x0090:
      script.debug('[SCRIPT] Set the object script');
      worldService.setObjectScriptValue(sc.operand[0], 2 + sc.operand[2], sc.operand[1]);
      break;
    case 0x0091:
      script.debug('[SCRIPT] Jump if the enemy is not alone');
      if (isInBattle()) {
        for (i = 0; i <= battle.maxEnemyIndex; i++) {
          if (i != eventObjectID && BATTLE().enemy[i].objectID === BATTLE().enemy[eventObjectID].objectID) {
            scriptEntry = sc.operand[0] - 1;
            break;
          }
        }
      }
      break;
    case 0x0092:
      script.debug('[SCRIPT] Show a magic-casting animation for a player in battle');
      if (isInBattle()) {
        if (sc.operand[0] !== 0) {
          const playerIndex = sc.operand[0] - 1;
          yield battle.battleShowPlayerPreMagicAnim(playerIndex, false);
          battleService.setPlayer(playerIndex, function(player) {
            if (player) {
              player.currentFrameNum = 6;
            }
            return player;
          });
        }

        for (i = 0; i < 5; i++) {
          var partyMax = getMaxPartyMemberIndex();
          for (j = 0; j <= partyMax; j++) {
            battleService.setPlayerColorShift(j, i * 2);
          }
          yield battle.delay(1, 0, true); // WARNING param normalize
        }
        battle.backupScreen();
        battle.updateFighters();
        battle.makeScene();
        yield battle.fadeScene();
      }
      break;
    case 0x0093:
      script.debug('[SCRIPT] Fade the screen. Update scene in the process.');
      var time = SHORT(sc.operand[0]);
      yield surface.fadeIn(getPaletteNumber(), getNightPaletteFlag(), (time > 0 ? time : 1));
      worldService.setNeedToFadeIn((SHORT(sc.operand[0]) < 0));
      break;
    case 0x0094:
      script.debug('[SCRIPT] Jump if the state of event object is the specified one');
      if (current.state === sc.operand[1]) {
         scriptEntry = sc.operand[2] - 1;
      }
      break;
    case 0x0095:
      script.debug('[SCRIPT] Jump if the current scene is the specified one');
      if (getSceneIdValue() === SHORT(sc.operand[0])) {
        scriptEntry = sc.operand[1] - 1;
      }
      break;
    case 0x0096:
      script.debug('[SCRIPT] Show the ending animation');
      yield ending.endingAnimation();
      break;
    case 0x0097:
      script.debug('[SCRIPT] Ride the event object to the specified position, at a higher speed');
      yield script.partyRideEventObject(eventObjectID, sc.operand[0], sc.operand[1], sc.operand[2], 8)
      break;
    case 0x0098:
      script.debug('[SCRIPT] Set follower of the party');
      if (sc.operand[0] > 0) {
        worldService.setFollowerCount(1);
        var followerIndex = getMaxPartyMemberIndex() + 1;
        worldService.mutatePartyMember(followerIndex, function(member) {
          if (!member) {
            return member;
          }
          member.playerRole = sc.operand[0];
          return member;
        });
        res.setLoadFlags(LoadFlag.PlayerSprite);
        yield res.loadResources();
        // Update the position and gesture for the follower
        worldService.mutatePartyMember(followerIndex, function(member) {
          if (!member) {
            return member;
          }
          var trailState = getTrailValue();
          var followerTrail = trailState && trailState.length > 3 ? trailState[3] : (trailState && trailState[trailState.length - 1]);
          if (!followerTrail) {
            return member;
          }
          member.x = followerTrail.x - getViewportX();
          member.y = followerTrail.y - getViewportY();
          member.frame = followerTrail.direction * 3;
          return member;
        });
      } else {
        worldService.setFollowerCount(0);
      }
      break;
    case 0x0099:
      script.debug('[SCRIPT] Change the map for the specified scene');
      if (sc.operand[0] == 0xFFFF) {
        var currentSceneId = getSceneIdValue();
        worldService.mutateSceneEntry(currentSceneId, function(entry) {
          if (entry) {
            entry.mapNum = sc.operand[1];
          }
          return entry;
        });
        res.setLoadFlags(LoadFlag.Scene);
        yield res.loadResources();
      } else {
        worldService.mutateSceneEntry(sc.operand[0], function(entry) {
          if (entry) {
            entry.mapNum = sc.operand[1];
          }
          return entry;
        });
      }
      break;
    case 0x009A:
      script.debug('[SCRIPT] Set the state for multiple event objects');
      if (!Number.isFinite(sc.operand[0]) || !Number.isFinite(sc.operand[1])) {
        break;
      }
      var startId = Math.trunc(sc.operand[0]);
      var endId = Math.trunc(sc.operand[1]);
      if (endId < startId) {
        break;
      }
      for (var rangeId = startId; rangeId <= endId; rangeId++) {
        if (rangeId <= 0) {
          continue;
        }
        worldService.mutateEventObjectById(rangeId, function(target) {
          if (!target) {
            return target;
          }
          target.state = sc.operand[2];
          return target;
        });
      }
      break;
    case 0x009B:
      script.debug('[SCRIPT] Fade to the current scene');
      // FIXME: This is obviously wrong
      surface.backupScreen();
      yield scene.makeScene();
      yield surface.fadeScreen(2);
      break;
    case 0x009C:
      script.debug('[SCRIPT] Enemy duplicate itself');
      w = 0;
      for (i = 0; i <= BATTLE().maxEnemyIndex; i++) {
        if (BATTLE().enemy[i].objectID != 0) {
          w++;
        }
      }
      var sourceEnemy = battleService.getEnemy(eventObjectID);
      if (w !== 1 || !sourceEnemy || !sourceEnemy.e || sourceEnemy.e.health <= 1) {
        // Duplication is only possible when only 1 enemy left with enough HP.
        if (sc.operand[1] !== 0) {
          scriptEntry = sc.operand[1] - 1;
        }
        break;
      }

      var duplicateCount = sc.operand[0];
      if (duplicateCount === 0) {
        duplicateCount = 1;
      }
      var denominator = duplicateCount + 1;
      var rounding = duplicateCount;
      var splitHealth = ~~((sourceEnemy.e.health + rounding) / denominator);
      if (splitHealth < 1) {
        splitHealth = 1;
      }

      var clonesRemaining = duplicateCount;
      for (i = 0; i < Const.MAX_ENEMIES_IN_TEAM && clonesRemaining > 0; i++) {
        var cloneCandidate = battleService.getEnemy(i);
        if (cloneCandidate && cloneCandidate.objectID != 0) {
          continue;
        }
        if (BATTLE().enemy[i].objectID == 0) {
          var clone = battle.cloneEnemy(i, eventObjectID, { timeMeter: 50 });
          battleService.setEnemy(i, function(enemy) {
            if (enemy && enemy.e) {
              enemy.e.health = splitHealth;
            }
            return enemy;
          });
          clonesRemaining--;
        }
      }

      battleService.setEnemyHealth(eventObjectID, splitHealth);
      battle.recalculateMaxEnemyIndex();
      battle.loadBattleSprites();

      var refreshedSource = battleService.getEnemy(eventObjectID);
      var cloneOriginPos = refreshedSource ? refreshedSource.pos : null;

      for (i = 0; i <= BATTLE().maxEnemyIndex; i++) {
        var enemyOnField = battleService.getEnemy(i);
        if (!enemyOnField || enemyOnField.objectID === 0 || cloneOriginPos === null) {
          continue;
        }
        battleService.setEnemyPosition(i, cloneOriginPos);
      }
      for (i = 0; i < 10; i++) {
        for (j = 0; j <= BATTLE().maxEnemyIndex; j++) {
          var enemyForSpread = battleService.getEnemy(j);
          if (!enemyForSpread) {
            continue;
          }
          x = floor((PAL_X(enemyForSpread.pos) + PAL_X(enemyForSpread.originalPos)) / 2);
          y = floor((PAL_Y(enemyForSpread.pos) + PAL_Y(enemyForSpread.originalPos)) / 2);
          battleService.setEnemyPosition(j, PAL_XY(x, y));
        }
        yield battle.delay(1, 0, true);
      }
      battle.updateFighters();
      yield battle.delay(1, 0, true);
      break;
    case 0x009E:
      script.debug('[SCRIPT] Enemy summons another monster');
      x = 0;
      w = sc.operand[0];
      y = (SHORT(sc.operand[1]) <= 0 ? 1 : SHORT(sc.operand[1]));
      if (w === 0 || w === 0xFFFF) {
        w = BATTLE().enemy[eventObjectID].objectID;
      }
      for (i = 0; i <= BATTLE().maxEnemyIndex; i++) {
        if (BATTLE().enemy[i].objectID == 0){
          x++;
        }
      }
      if (x < y || BATTLE().hidingTime > 0 ||
          BATTLE().enemy[eventObjectID].status[PlayerStatus.Sleep] !== 0 ||
          BATTLE().enemy[eventObjectID].status[PlayerStatus.Paralyzed] !== 0 ||
          BATTLE().enemy[eventObjectID].status[PlayerStatus.Confused] !== 0) {
        if (sc.operand[2] != 0) {
          scriptEntry = sc.operand[2] - 1;
        }
      } else {
        for (i = 0; i <= BATTLE().maxEnemyIndex; i++) {
          if (BATTLE().enemy[i].objectID === 0){
            battle.spawnEnemy(i, w, { timeMeter: 50, colorShift: 8 });
            // spawnEnemy copies enemy stats with full HP; leave as-is.
            y--;
            if (y <= 0) {
              break;
            }
          }
        }
        battle.recalculateMaxEnemyIndex();
        yield battle.delay(2, 0, true);
        battle.backupScene();
        battle.loadBattleSprites();
        battle.makeScene();
        sound.play(212);
        yield battle.fadeScene();

        for (i = 0; i <= BATTLE().maxEnemyIndex; i++) {
          battleService.setEnemyColorShift(i, 0);
        }

        battle.backupScene();
        battle.makeScene();
        yield battle.fadeScene();
      }
      break;
    case 0x009F:
      script.debug('[SCRIPT] Enemy transforms into something else');
      if (BATTLE().hidingTime <= 0 &&
          BATTLE().enemy[eventObjectID].status[PlayerStatus.Sleep] === 0 &&
          BATTLE().enemy[eventObjectID].status[PlayerStatus.Paralyzed] === 0 &&
          BATTLE().enemy[eventObjectID].status[PlayerStatus.Confused] === 0){
        var transformingEnemy = battleService.getEnemy(eventObjectID);
        w = transformingEnemy && transformingEnemy.e ? transformingEnemy.e.health : 0;
        battleService.setEnemyObject(eventObjectID, sc.operand[0]);
        var transformEnemyId = getEnemyIdFromObject(sc.operand[0]);
        var transformedEnemy = copyEnemyTemplate(transformEnemyId);
        if (transformedEnemy) {
          transformedEnemy.health = w;
        }
        battleService.setEnemy(eventObjectID, function(enemyState) {
          if (!enemyState) {
            return enemyState;
          }
          if (transformedEnemy) {
            enemyState.e = transformedEnemy;
          }
          enemyState.wCurrentFrame = 0;
          return enemyState;
        });
        for (i = 0; i < 6; i++) {
          battleService.setEnemyColorShift(eventObjectID, i);
          yield battle.delay(1, 0, false); // WARNING param normalize
        }
        battleService.setEnemyColorShift(eventObjectID, 0);

        battle.backupScene();
        battle.loadBattleSprites();
        battle.makeScene();
        yield battle.fadeScene();
      }
      break;
    case 0x00A0:
      script.debug('[SCRIPT] Quit game');
      //yield script.additionalCredits();
      return game.shutdown();
      break;
    case 0x00A1:
      script.debug('[SCRIPT] Set the positions of all party members to the same as the first one');
      var leader = getPartyMember(0);
      if (leader) {
        var partyDirection = getPartyDirection();
        var viewport = getViewportValue();
        var viewportX = PAL_X(viewport);
        var viewportY = PAL_Y(viewport);
        var leaderWorldX = leader.x + viewportX;
        var leaderWorldY = leader.y + viewportY;
        mutateTrailValue(function(trailState) {
          if (!trailState) {
            return trailState;
          }
          for (var trailIndex = 0; trailIndex < Const.MAX_PLAYABLE_PLAYER_ROLES; trailIndex++) {
            var trailEntry = trailState[trailIndex];
            if (!trailEntry) {
              continue;
            }
            trailEntry.direction = partyDirection;
            trailEntry.x = leaderWorldX;
            trailEntry.y = leaderWorldY;
          }
          return trailState;
        });
        var leaderX = leader.x;
        var leaderY = leader.y;
        var maxPartyIndex = getMaxPartyMemberIndex();
        for (var partyIndex = 1; partyIndex <= maxPartyIndex; partyIndex++) {
          worldService.mutatePartyMember(partyIndex, function(member) {
            if (!member) {
              return member;
            }
            member.x = leaderX;
            member.y = leaderY - 1;
            return member;
          });
        }
      }
      scene.updatePartyGestures(false);
      break;
    case 0x00A2:
      script.debug('[SCRIPT] Jump to one of the following instructions randomly');
      scriptEntry += randomLong(0, sc.operand[0] - 1);
      break;
    case 0x00A3:
      script.debug('[SCRIPT] Play CD music. Use the RIX music for fallback.');
      //var ret = yield sound.playCDA(sc.operand[0]);
      //yield music.play(sc.operand[1], true, 0);
      break;
    case 0x00A4:
      script.debug('[SCRIPT] Scroll FBP to the screen');
      if (sc.operand[0] == 0x44) {
        // 68号位图 拜月魔兽
        // 69号位图 洪水
        // HACKHACK: to make the ending picture show correctly
        yield ending.showFBP(0x45, 0);
        yield ending.scrollFBP(sc.operand[0], sc.operand[2], true);
      } else {
        yield ending.scrollFBP(sc.operand[0], sc.operand[2], sc.operand[1]);
      }
      break;
    case 0x00A5:
      script.debug('[SCRIPT] Show FBP picture with sprite effects');
      if (sc.operand[1] != 0xFFFF) {
        ending.setEffectSprite(sc.operand[1]);
      }
      yield ending.showFBP(sc.operand[0], sc.operand[2]);
      break;
    case 0x00A6:
      script.debug('[SCRIPT] backup screen');
      surface.backupScreen();
      break;
    default:
      game.error('[SCRIPT] Invalid Instruction at %d: (%d(%.4x) - %.4x, %.4x, %.4x)',
        scriptEntry, sc.operation, sc.operation,
        sc.operand[0], sc.operand[1], sc.operand[2]
      );
      break;
  }

  return scriptEntry + 1;
};

/**
 * Runs a trigger script.
 *
 * @param {Number} scriptEntry   The script entry to execute.
 * @param {Number} eventObjectID The event object ID which invoked the script.
 * @yield {Number} The entry point of the script.
 */
script.runTriggerScript = function*(scriptEntry, eventObjectID) {
  if (typeof scriptEntry !== 'number' || Number.isNaN(scriptEntry)) {
    warnLog('[SCRIPT] runTriggerScript received invalid entry ' + scriptEntry +
      ' (event ' + (eventObjectID || 0) + ')');
    script.scriptSuccess = false;
    return 0;
  }
  if (scriptEntry <= 0 || !scriptObjectAdapter.getScriptEntry(scriptEntry)) {
    log.trace(
      '[SCRIPT] runTriggerScript skipped missing entry ' + scriptEntry +
      ' (event ' + (eventObjectID || 0) + ')'
    );
    script.scriptSuccess = false;
    return 0;
  }
  var lastEventObjectID = worldService.getLastEventObjectId(),
      nextScriptEntry = scriptEntry,
      ended = false,
      sc,
      //evtObj = Global.EventObjecs[eventObjectID - 1],
      evtObj = null;
  var i;

  var updatedInBattle = false; // HACKHACK

  if (eventObjectID == 0xFFFF) {
    eventObjectID = lastEventObjectID;
  }

  worldService.setLastEventObjectId(eventObjectID);

  if (eventObjectID !== 0) {
    evtObj = getEventObjectById(eventObjectID);
  }
  script.scriptSuccess = true;

  // Set the default dialog speed.
  ui.setDialogDelayTime(3);

  while (scriptEntry !== 0 && !ended) {
    sc = getScriptEntrySafe(scriptEntry, eventObjectID, 'runTriggerScript');
    if (!sc) {
      scriptEntry = 0;
      break;
    }

    log.trace('[SCRIPT] runTriggerScript %d: (%d(0x%.4x) - %d, %d, %d)',
      scriptEntry, sc.operation, sc.operation,
      sc.operand[0], sc.operand[1],
      sc.operand[2], sc.operand[3]
    );

    switch (sc.operation) {
      case 0x0000:
        //script.debug('[SCRIPT] Stop running');
        ended = true;
        break;
      case 0x0001:
        //script.debug('[SCRIPT] Stop running and replace the entry with the next line');
        ended = true;
        nextScriptEntry = scriptEntry + 1;
        break;
      case 0x0002:
        //script.debug('[SCRIPT] Stop running and replace the entry with the specified one');
        if (!evtObj) {
          //debugger;
        }
        evtObj.scriptIdleFrame++;
        if (sc.operand[1] === 0 || evtObj.scriptIdleFrame < sc.operand[1]) {
          ended = true;
          nextScriptEntry = sc.operand[0];
        } else {
          // failed
          evtObj.scriptIdleFrame = 0;
          scriptEntry++;
        }
        break;
      case 0x0003:
        script.debug('[SCRIPT] unconditional jump');
        try {
          if (sc.operand[1] === 0 || ++(evtObj.scriptIdleFrame) < sc.operand[1]) {
            scriptEntry = sc.operand[0];
          } else {
            // failed
            evtObj.scriptIdleFrame = 0;
            scriptEntry++;
          }
        } catch (ex) {
          // WARNING TODO 求雨情节剧情完了以后，这里会有一个evtObj为null的问题，不知道是从哪引进来的
          //debugger;
          scriptEntry++;
        }
        break;
      case 0x0004:
        script.debug('[SCRIPT] Call script');
        yield script.runTriggerScript(sc.operand[0], ((sc.operand[1] == 0) ? eventObjectID : sc.operand[1]));
        scriptEntry++;
        break;
      case 0x0005:
        script.debug('[SCRIPT] Redraw screen');
        yield ui.clearDialog(true);

        if (false && ui.dialogIsPlayingRNG()) {
          // WARNING TODO
          surface.restoreScreen();
        } else if (isInBattle()) {
          // WARNING TODO
          battle.makeScene();
          surface.blit(BATTLE().sceneBuf);
          surface.updateScreen(null);
        } else {
          if (sc.operand[2]){
             scene.updatePartyGestures(false);
          }

          yield scene.makeScene();
          surface.updateScreen(null);

          yield sleep((sc.operand[1] === 0) ? 60 : (sc.operand[1] * 60))
        }
        scriptEntry++;
        break;
      case 0x0006:
        script.debug('[SCRIPT] Jump to the specified address by the specified rate', sc.operand.join(','));
        if (randomLong(1, 100) >= sc.operand[0]) {
          scriptEntry = sc.operand[1];
          continue;
        } else {
          scriptEntry++;
        }
        break;
      case 0x0007:
        script.debug('[SCRIPT] Start battle');
        var ret = yield battle.start(sc.operand[0], !sc.operand[2]);

        if (ret == BattleResult.Lost && sc.operand[1] != 0) {
          scriptEntry = sc.operand[1];
        } else if (ret == BattleResult.Fleed && sc.operand[2] != 0) {
          scriptEntry = sc.operand[2];
        } else {
          scriptEntry++;
        }
        worldService.setAutoBattle(false);
        break;
      case 0x0008:
        script.debug('[SCRIPT] Replace the entry with the next instruction');
        scriptEntry++;
        nextScriptEntry = scriptEntry;
        break;
      case 0x0009:
        script.debug('[SCRIPT] wait for the specified number of frames');
        yield ui.clearDialog(true);
        var len = sc.operand[0] ? sc.operand[0] : 1;
        for (i = 0; i < len; i++){
          if (sc.operand[2]) {
            scene.updatePartyGestures(false);
          }

          yield play.update(sc.operand[1] ? true : false);
          yield scene.makeScene();
          surface.updateScreen(null);

          yield sleepByFrame(1);
        }
        scriptEntry++;
        break;
      case 0x000A:
        script.debug('[SCRIPT] Goto the specified address if player selected no');
        yield ui.clearDialog(false);
        var ret = yield uigame.confirmMenu();
        if (!ret) {
          scriptEntry = sc.operand[0];
        } else {
          scriptEntry++;
        }
        break;
      case 0x003B:
        script.debug('[SCRIPT] Show dialog in the middle part of the screen');
        yield ui.clearDialog(true);
        ui.startDialog(DialogPosition.Center, sc.operand[0], 0, sc.operand[2] ? true : false);
        scriptEntry++;
        break;
      case 0x003C:
        script.debug('[SCRIPT] Show dialog in the upper part of the screen');
        yield ui.clearDialog(true);
        ui.startDialog(DialogPosition.Upper, sc.operand[1], sc.operand[0], sc.operand[2] ? true : false);
        scriptEntry++;
        break;
      case 0x003D:
        script.debug('[SCRIPT] Show dialog in the lower part of the screen');
        yield ui.clearDialog(true);
        ui.startDialog(DialogPosition.Lower, sc.operand[1], sc.operand[0], sc.operand[2] ? true : false);
        scriptEntry++;
        break;
      case 0x003E:
        script.debug('[SCRIPT] Show text in a window at the center of the screen');
        yield ui.clearDialog(true);
        ui.startDialog(DialogPosition.CenterWindow, sc.operand[0], 0, false);
        scriptEntry++;
        break;
      case 0x008E:
        script.debug('[SCRIPT] Restore the screen');
        yield ui.clearDialog(true);
        surface.restoreScreen();
        surface.updateScreen(null);
        scriptEntry++;
        break;
      case 0xFFFF:
        script.debug('[SCRIPT] Print dialog text');
        var msg = ui.getMsg(sc.operand[0]);
        yield ui.showDialogText(msg);
        scriptEntry++;
        break;
      default:
        yield ui.clearDialog(true);
        scriptEntry = yield script.interpretInstruction(scriptEntry, eventObjectID);
        break;
    }

    //yield sleep(FrameTime);
  };

  yield ui.endDialog();
  script.curEquipPart = -1;

  if (!Number.isFinite(nextScriptEntry) || nextScriptEntry < 0) {
    nextScriptEntry = 0;
  }
  return nextScriptEntry;
};

script.runAutoScript = function*(scriptEntry, eventObjectID) {
  var sc = getScriptEntrySafe(scriptEntry, eventObjectID, 'runAutoScript');
  if (!sc) {
    return scriptEntry;
  }
  var evtObj = getEventObjectById(eventObjectID);

  traceScript(scriptEntry, sc, eventObjectID);

  log.trace('[SCRIPT] runAutoScript %d: (%d(0x%.4x) - %d, %d, %d)',
    scriptEntry, sc.operation, sc.operation,
    sc.operand[0], sc.operand[1],
    sc.operand[2], sc.operand[3]
  );

  // For autoscript, we should interpret one instruction per frame (except
  // jumping) and save the address of next instruction.
  switch (sc.operation) {
    case 0x0000:
      script.debug('[SCRIPT] Stop running');
      break;
    case 0x0001:
      script.debug('[SCRIPT] Stop running and replace the entry with the next line');
      scriptEntry++;
      break;
    case 0x0002:
      script.debug('[SCRIPT] Stop running and replace the entry with the specified one');
      if (sc.operand[1] === 0 || (++evtObj.scriptIdleFrameCountAuto) < sc.operand[1]) {
        scriptEntry = sc.operand[0];
      } else {
        evtObj.scriptIdleFrameCountAuto = 0;
        scriptEntry++;
      }
      break;
    case 0x0003:
      script.debug('[SCRIPT] unconditional jump');
      if (sc.operand[1] === 0 || (++evtObj.scriptIdleFrameCountAuto) < sc.operand[1]) {
        scriptEntry = sc.operand[0];
        //goto begin
        return yield script.runAutoScript(scriptEntry, eventObjectID);
      } else {
        evtObj.scriptIdleFrameCountAuto = 0;
        scriptEntry++;
      }
      break;
    case 0x0004:
      script.debug('[SCRIPT] Call subroutine');
      yield script.runTriggerScript(sc.operand[0], sc.operand[1] ? sc.operand[1] : eventObjectID);
      scriptEntry++;
      break;
    case 0x0006:
      script.debug('[SCRIPT] jump to the specified address by the specified rate');
      if (randomLong(1, 100) >= sc.operand[0] && sc.operand[1] != 0) {
        scriptEntry = sc.operand[1];
        //goto begin;
        return yield script.runAutoScript(scriptEntry, eventObjectID);
      } else {
        scriptEntry++;
      }
      break;
    case 0x0009:
      script.debug('[SCRIPT] Wait for a certain number of frames');
      if ((++evtObj.scriptIdleFrameCountAuto) >= sc.operand[0]) {
         // waiting ended; go further
         evtObj.scriptIdleFrameCountAuto = 0;
         scriptEntry++;
      }
      break;
    case 0xFFFF:
      scriptEntry++;
      break;
    default:
      //// Other operations
      scriptEntry = yield script.interpretInstruction(scriptEntry, eventObjectID);
      break;
  }

  return scriptEntry;
};

export default script;
