import utils from './utils';
import scene from './scene';
import Sprite from './sprite';
import input from './input';
import script from '../../services/script-service.js';
import music from './music';
import sound from './sound';
import resourceService from '../../services/resource-service.js';
import fight from './fight';
import ui from './ui';
import uibattle from './uibattle';
import battleService from '../../services/battle-service.js';
import sceneEventAdapter from '../../services/scene-event-adapter.js';
import createBattleSystemManager from '../../services/battle-systems.js';
import worldService from '../../services/world-service.js';
import gameDataAdapter from '../../services/game-data-adapter.js';
import scriptObjectAdapter from '../../services/script-object-adapter.js';
import { getSceneEventObjectRange as getSceneEventObjectRangeSnapshot } from '../../services/scene-data-adapter.js';
import partyTrailAdapter from '../../services/party-trail-adapter.js';
import {
  shouldFadeIn,
  getPaletteIdValue as getPaletteIdSnapshot,
  isNightPaletteEnabled,
  getScreenWaveValue as getScreenWaveSnapshot,
  getWaveProgressionValue as getWaveProgressionSnapshot
} from '../../services/environment-adapter.js';
import {
  getEquipmentEffectsMatrix,
  getEquipmentEffectAt,
  getMaxPartyMemberIndex as getCachedMaxPartyMemberIndex,
  getPlayerRoleFieldValue,
  getPlayerHP as getPlayerHPValue
} from '../../services/player-state-adapter.js';
import {
  getEnemyTeamEntry as getCachedEnemyTeamEntry,
  getEnemyFormationPosition as getCachedEnemyFormationPosition,
  getBattleFieldEntry as getCachedBattleFieldEntry,
  getBattleFieldId as getCachedBattleFieldId,
  getBattleMusicTrack as getCachedBattleMusicTrack,
  getMusicTrack as getCachedMusicTrack,
  isAutoBattleEnabled,
  getBattleStateSnapshot
} from '../../services/battle-state-adapter.js';

log.trace('battle module load');

var battle = {
  playerPos: [
    [[240, 170]],                         // one player
    [[200, 176], [256, 152]],             // two players
    [[180, 180], [234, 170], [270, 146]]  // three players
  ]
};

battleService.bindModule(battle);

function BATTLE() {
  const state = battleService.getState && battleService.getState();
  if (state) {
    return state;
  }
  return getBattleStateSnapshot() || {};
}

function resolveEnemyEventObjectId(index) {
  if (!Number.isFinite(index)) {
    return index;
  }
  if (typeof sceneEventAdapter.getEventObjectIdForRelativeIndex === 'function') {
    const mapped = sceneEventAdapter.getEventObjectIdForRelativeIndex(index);
    if (Number.isFinite(mapped)) {
      return mapped;
    }
  }
  const range = getSceneEventObjectRangeSnapshot();
  const rangeStart = range && Number.isFinite(range.start) ? Math.trunc(range.start) : null;
  if (!Number.isFinite(rangeStart)) {
    return Math.trunc(index) + 1;
  }
  return rangeStart + Math.trunc(index) + 1;
}

function getParty() {
  return partyTrailAdapter.getPartyState();
}

function hasScriptEntry(scriptEntry) {
  if (!Number.isFinite(scriptEntry) || scriptEntry <= 0) {
    return false;
  }
  if (typeof scriptObjectAdapter.getScriptEntry === 'function') {
    const resolved = scriptObjectAdapter.getScriptEntry(scriptEntry);
    return !!resolved;
  }
  return true;
}

function getTriggerModeEnum() {
  if (typeof TriggerMode !== 'undefined' && TriggerMode) {
    return TriggerMode;
  }
  if (typeof globalThis !== 'undefined' && globalThis.TriggerMode) {
    return globalThis.TriggerMode;
  }
  return {
    None: 0,
    SearchNear: 1,
    SearchNormal: 2,
    SearchFar: 3,
    TouchNear: 4,
    TouchNormal: 5,
    TouchFar: 6,
    TouchFarther: 7,
    TouchFarthest: 8
  };
}

function isSearchTriggerMode(triggerMode) {
  if (!Number.isFinite(triggerMode)) {
    return false;
  }
  const modes = getTriggerModeEnum();
  return triggerMode >= modes.SearchNear && triggerMode <= modes.SearchFar;
}

function resolveEnemyScriptEntry(entry, enemyIndex, fallbackKey = 'triggerScript') {
  if (Number.isFinite(entry) && entry > 0 && hasScriptEntry(entry)) {
    return entry;
  }

  if (entry === 0 && fallbackKey === 'triggerScript') {
    return 0;
  }

  const eventEntry = typeof sceneEventAdapter.getEventObjectEntryById === 'function'
    ? sceneEventAdapter.getEventObjectEntryById(resolveEnemyEventObjectId(enemyIndex))
    : null;
  if (!eventEntry || !eventEntry.state) {
    return Number.isFinite(entry) && entry > 0 ? entry : 0;
  }

  const fallbackKeys = [];
  if (fallbackKey && !fallbackKeys.includes(fallbackKey)) {
    fallbackKeys.push(fallbackKey);
  }
  if (!fallbackKeys.includes('triggerScript')) {
    fallbackKeys.push('triggerScript');
  }
  if (!fallbackKeys.includes('autoScript')) {
    fallbackKeys.push('autoScript');
  }
  ['enemyScript', 'battleScript'].forEach((key) => {
    if (!fallbackKeys.includes(key)) {
      fallbackKeys.push(key);
    }
  });

  for (let idx = 0; idx < fallbackKeys.length; idx++) {
    const candidate = eventEntry.state[fallbackKeys[idx]];
    if (Number.isFinite(candidate) && candidate > 0 && hasScriptEntry(candidate)) {
      return candidate;
    }
  }

  return Number.isFinite(entry) && entry > 0 ? entry : 0;
}

function getPartyMember(index) {
  const party = getParty();
  if (!Array.isArray(party)) {
    return null;
  }
  return party[index] || null;
}

function getMaxPartyMemberIndex() {
  const cached = getCachedMaxPartyMemberIndex();
  if (typeof cached === 'number' && cached >= -1) {
    return cached;
  }
  const partyState = getParty();
  return Array.isArray(partyState) ? partyState.length - 1 : -1;
}

function getEquipmentEffects() {
  return getEquipmentEffectsMatrix();
}

function getEquipmentEffect(index) {
  return getEquipmentEffectAt(index);
}

function getExpState() {
  return battleService.getExpState() || {};
}

function mutatePlayerRoles(mutator) {
  return battleService.mutatePlayerRoles(function(playerRoles) {
    if (playerRoles && typeof mutator === 'function') {
      mutator(playerRoles);
    }
    return playerRoles;
  });
}

function mutateExp(mutator) {
  return battleService.mutateExpState(function(exp) {
    if (exp && typeof mutator === 'function') {
      mutator(exp);
    }
    return exp;
  });
}

global.BattleResult = {
  Won:        3,      // player won the battle
  Lost:       1,      // player lost the battle
  Fleed:      0xFFFF, // player fleed from the battle
  Terminated: 0,      // battle terminated with scripts
  OnGoing:    1000,   // the battle is ongoing
  PreBattle:  1001,   // running pre-battle scripts
  Pause:      1002    // battle pause
};

global.FighterState = {
 Wait:        0,  // waiting time
 Com:         1,  // accepting command
 Act:         2   // doing the actual move
};

global.BattleActionType = {
  Pass:       0,   // do nothing
  Defend:     1,   // defend
  Attack:     2,   // physical attack
  Magic:      3,   // use magic
  CoopMagic:  4,   // use cooperative magic
  Flee:       5,   // flee from the battle
  ThrowItem:  6,   // throw item onto enemy
  UseItem:    7,   // use item
  AttackMate: 8    // attack teammate (confused only)
};

var BattleAction = battle.BattleAction = function() {
  this.reset();
};
BattleAction.prototype.reset = function(actionType, actionID, target, remainingTime) {
  this.actionType = actionType || BattleActionType.Pass;
  this.actionID = actionID || 0;
  this.target = target || 0;
  this.remainingTime = remainingTime || 0.0;

  return this;
};

var BattleEnemy = battle.BattleEnemy = function() {
  this.reset();
};
BattleEnemy.prototype.reset = function(
  objectID,
  e,
  status,
  timeMeter,
  poisons,
  sprite,
  pos,
  originalPos,
  currentFrame,
  state,
  turnStart,
  firstMoveDone,
  dualMove,
  scriptOnTurnStart,
  scriptOnBattleEnd,
  scriptOnReady,
  prevHP,
  colorShift
  ) {
  this.objectID = objectID || 0;
  this.e = e || null;
  if (this.status) {
    for (var i = 0; i < this.status.length; ++i) {
      this.status[i] = 0;
    }
  } else {
    this.status = status || new Array(PlayerStatus.All);
  }
  this.timeMeter = timeMeter || 0.0;
  if (this.poisons) {
    for (var i = 0; i < this.poisons.length; ++i) {
      memset(this.poisons[i].uint8Array, 0, PoisonStatus.size);
    }
  } else {
    this.poisons = poisons || utils.initArray(PoisonStatus, Const.MAX_POISONS);
  }
  this.sprite = sprite || null;
  this.pos = pos || 0;
  this.originalPos = originalPos || 0;
  this.currentFrame = currentFrame || 0;
  this.state = state || FighterState.Wait;
  this.turnStart = turnStart || false;
  this.firstMoveDone = firstMoveDone || false;
  this.dualMove = dualMove || false;
  this.scriptOnTurnStart = scriptOnTurnStart || 0;
  this.scriptOnBattleEnd = scriptOnBattleEnd || 0;
  this.scriptOnReady = scriptOnReady || 0;
  this.prevHP = prevHP || 0;
  this.colorShift = colorShift || 0;

  return this;
};

var BattlePlayer = battle.BattlePlayer = function() {
  this.reset();
};
BattlePlayer.prototype.reset = function(
  colorShift,
  timeMeter,
  timeSpeedModifier,
  hidingTime,
  sprite,
  pos,
  originalPos,
  currentFrame,
  state,
  action,
  defending,
  prevHP,
  prevMP) {
  this.colorShift = colorShift || 0;
  this.timeMeter = timeMeter || 0.0;
  this.timeSpeedModifier = (typeof timeSpeedModifier === 'number') ? timeSpeedModifier : 1.0;
  this.hidingTime = hidingTime || 0;
  this.sprite = sprite || 0;
  this.pos = pos || 0;
  this.originalPos = originalPos || 0;
  this.state = state || FighterState.Wait;
  this.action = (this.action ?
                 this.action.reset() :
                 (action || (new BattleAction())));
  this.defending = defending || false;
  this.prevHP = prevHP || 0;
  this.prevMP = prevMP || 0;

  return this;
};

var Summon = battle.Summon = function() {
  this.reset();
};
Summon.prototype.reset = function(currentFrame) {
  this.currentFrame = currentFrame || 0;

  return this;
};

var MAX_BATTLE_ACTIONS = 256;
var MAX_BATTLE_ENEMIES = 256;

global.BattlePhase = {
  SelectAction:  0,
  PerformAction: 1
};

var ActionQueue = battle.ActionQueue = function() {
  this.reset();
};
ActionQueue.prototype.reset = function(isEnemy, dexterity, index) {
  this.isEnemy = isEnemy || false;
  this.dexterity = dexterity || 0;
  this.index = index || 0;

  return this;
};

Const.MAX_ACTIONQUEUE_ITEMS = (Const.MAX_PLAYERS_IN_PARTY + Const.MAX_ENEMIES_IN_TEAM * 2);

var Battle = battle.Battle = function() {
  this.player = utils.initArray(BattlePlayer, Const.MAX_PLAYERS_IN_PARTY);
  this.enemy = utils.initArray(BattleEnemy, Const.MAX_ENEMIES_IN_TEAM);
  this.maxEnemyIndex = 0;
  this.sceneBuf = null;
  this.background = null;
  this.backgroundColorShift = 0;
  this.summonSprite = null;
  this.summonPos = 0;
  this.summonFrame = 0;
  this.expGained = 0;
  this.cashGained = 0;
  this.isBoss = false;
  this.enemyCleared = false;
  this.battleResult = BattleResult.Terminated;
  this.UI = new uibattle.BattleUI();
  this.effectSprite = new Sprite(Files.DATA.readChunk(10));
  this.enemyMoving = false;
  this.hidingTime = 0;
  this.movingPlayerIndex = 0;
  this.blow = 0;
  this.phase = BattlePhase.SelectAction;
  this.actionQueue = utils.initArray(ActionQueue, Const.MAX_ACTIONQUEUE_ITEMS);
  this.curAction = 0;
  this.repeat = false;
  this.force = false;
  this.flee = false;
};

var surface = null
var systemManager = null;

battle.init = function*(surf) {
  log.debug('[BATTLE] init');
  global.battle = battle;
  surface = surf;

  yield resourceService.loadMKF('DATA', 'FBP', 'ABC', 'F');
  Files.DATA = resourceService.getMKF('DATA');
  Files.FBP = resourceService.getMKF('FBP');
  Files.ABC = resourceService.getMKF('ABC');
  Files.F = resourceService.getMKF('F');

  yield fight.init(surf, battle);
  yield uibattle.init(surf, battle, ui);

  battleService.replaceState(new Battle());
  systemManager = createBattleSystemManager({
    battleService: battleService,
    surface: surf,
    battle: battle
  });
  battle.systemManager = systemManager;
  if (typeof battleService.setSystemManager === 'function') {
    battleService.setSystemManager(systemManager);
  }
};

/**
 * Generate the battle scene into the scene buffer.
 */
battle.makeScene = function() {
  if (battleService && typeof battleService.runSystems === 'function') {
    battleService.runSystems('render', { surface: surface, battle: battle });
    return;
  }
  if (systemManager) {
    systemManager.run('render', { surface: surface, battle: battle });
  }
};

/**
 * Backup the scene buffer.
 */
battle.backupScene = function() {
  battleService.setSceneBuffer(surface.getRect(0, 0, 320, 200));
};

/**
 * Fade in the scene of battle.
 */
battle.fadeScene = function*() {
  var indices = [0, 3, 1, 5, 2, 4];

  var backup = surface.backup;
  var screen = surface.byteBuffer;

  for (var i = 0; i < 12; i++) {
    for (var j = 0; j < 6; j++) {
      // Blend the pixels in the 2 buffers, and put the result into the
      // backup buffer
      for (var k = indices[j]; k < surface.pitch * surface.height; k += 6) {
        var battleState = BATTLE();
        var a = battleState.sceneBuf[k];
        var b = backup[k];

        if (i > 0) {
          if ((a & 0x0F) > (b & 0x0F))
          {
            b++;
          }
          else if ((a & 0x0F) < (b & 0x0F)) {
            b--;
          }
        }

        backup[k] = ((a & 0xF0) | (b & 0x0F));
      }

      // Draw the backup buffer to the screen
      surface.blitSurface(backup, null, screen, null);

      yield uibattle.update();
      surface.updateScreen(null);

      yield sleep(8); // 16
    }
  }

  // Draw the result buffer to the screen as the final step
  var battleState = BATTLE();
  surface.blitSurface(battleState.sceneBuf, null, screen, null);
  yield uibattle.update();
  surface.updateScreen(null);
};

/**
 * The main battle routine.
 * @yield {BattleResult} The result of the battle.
 */
battle.main = function*() {
  surface.backupScreen();
  var screen = surface.byteBuffer;
  var sceneBuf = BATTLE().sceneBuf;

  // Generate the scene and draw the scene to the screen buffer
  battle.makeScene();
  surface.blitSurface(sceneBuf, null, screen, null);

  // Fade out the music and delay for a while
  music.play(0, false, 1);
  yield sleep(100); // 200

  // Switch the screen
  yield surface.switchScreen(5);

  // Play the battle music
  music.play(getCachedBattleMusicTrack(), true, 0);

  // Fade in the screen when needed
  if (shouldFadeIn()) {
    yield surface.fadeIn(
      getPaletteIdSnapshot(),
      !!isNightPaletteEnabled(),
      1
    );
    worldService.setNeedToFadeIn(false);
  }

  // Run the pre-battle scripts for each enemies
  var battleState = BATTLE();
  for (var i = 0; i <= battleState.maxEnemyIndex; i++) {
    var enemyState = battleState.enemy[i];
    var eventId = resolveEnemyEventObjectId(i);
    var startScript = resolveEnemyScriptEntry(enemyState ? enemyState.scriptOnTurnStart : null, i, 'triggerScript');
    if (!Number.isFinite(startScript) || startScript <= 0) {
      continue;
    }
    var nextEntry = yield script.runTriggerScript(startScript, eventId);
    battleService.setEnemy(i, function(current) {
      if (!current) return current;
      current.scriptOnTurnStart = Number.isFinite(nextEntry) && nextEntry > 0 ? nextEntry : startScript;
      return current;
    });

    if (battleState.battleResult != BattleResult.PreBattle) {
      break;
    }
  }

  if (battleState.battleResult == BattleResult.PreBattle) {
    battleService.setBattleResult(BattleResult.OnGoing);
  }

  input.clear();

  // Run the main battle loop.
  while (true) {
    // Break out if the battle ended.
    if (battleState.battleResult != BattleResult.OnGoing) {
      break;
    }

    // Run the main frame routine.
    yield battle.startFrame();

    // Update the screen.
    surface.updateScreen(null);

    yield sleepByFrame(1);
  }

  // Return the battle result
  var battleState = BATTLE();
  return battleState ? battleState.battleResult : BattleResult.Terminated;
};

/**
 * Free all the loaded sprites.
 */
battle.freeBattleSprites = function() {
  log.debug('[BATTLE] freeBattleSprites');
  // Free all the loaded sprites
  battleService.withState(function(state) {
    if (!state) {
      return state;
    }

    var maxPartyIndex = getMaxPartyMemberIndex();
    for (var i = 0; i <= maxPartyIndex; i++) {
      var playerState = state.player && state.player[i];
      if (playerState) {
        playerState.sprite = null;
      }
    }

    for (var j = 0; j <= state.maxEnemyIndex; j++) {
      var enemyState = state.enemy && state.enemy[j];
      if (enemyState) {
        enemyState.sprite = null;
      }
    }

    state.summonSprite = null;
    return state;
  });
};

/**
 * Get player's battle sprite.
 * @param  {Number} playerRole the player role ID.
 * @return {Number}            Number of the player's battle sprite.
 */
battle.getPlayerBattleSprite = function(playerRole) {
  log.trace(['[BATTLE] getPlayerBattleSprite', playerRole].join(' '));
  var w = getPlayerRoleFieldValue('spriteNumInBattle', playerRole, undefined);
  if (typeof w !== 'number') {
    w = getPlayerRoleFieldValue('spriteNum', playerRole, 0);
  }

  var equipmentEffects = getEquipmentEffects();
  var limit = Math.min(
    Array.isArray(equipmentEffects) ? equipmentEffects.length : 0,
    Const.MAX_PLAYER_EQUIPMENTS + 1
  );
  for (var i = 0; i < limit; i++) {
    var effect = equipmentEffects[i];
    if (!effect || !effect.spriteNumInBattle) {
      continue;
    }
    var overrideSource = effect.spriteNumInBattle;
    var overrideSprite = overrideSource && overrideSource[playerRole] !== undefined
      ? overrideSource[playerRole]
      : 0;
    if (overrideSprite) {
      w = overrideSprite;
    }
  }

  return w;
};

/**
 * Load all the loaded sprites.
 */
battle.loadBattleSprites = function() {
  log.debug('[BATTLE] loadBattleSprites');
  battle.freeBattleSprites();

  battleService.withState(function(state) {
    if (!state) {
      return state;
    }

    // Load battle sprites for players
    var party = getParty();
    var maxPartyIndex = getMaxPartyMemberIndex();
    var positionSet = battle.playerPos[Math.min(Math.max(maxPartyIndex, 0), battle.playerPos.length - 1)] || [];
    for (var i = 0; i <= maxPartyIndex; i++) {
      var playerState = state.player && state.player[i];
      var partyMember = party[i];
      if (!playerState || !partyMember) {
        continue;
      }

      var spriteNum = battle.getPlayerBattleSprite(partyMember.playerRole);
      playerState.sprite = new Sprite(Files.F.decompressChunk(spriteNum));

      // Set the default position for this player
      var positionEntry = positionSet[i] || positionSet[positionSet.length - 1] || [0, 0];
      var x = positionEntry[0];
      var y = positionEntry[1];
      var position = PAL_XY(x, y);
      playerState.originalPos = position;
      playerState.pos = position;
    }

    // Load battle sprites for enemies
    for (var enemyIndex = 0; enemyIndex < Const.MAX_ENEMIES_IN_TEAM; enemyIndex++) {
      var enemyState = state.enemy && state.enemy[enemyIndex];
      if (!enemyState || enemyState.objectID == 0) {
        continue;
      }

      var enemyDefinition = scriptObjectAdapter.getObjectEntry(enemyState.objectID);
      var enemyConfig = enemyDefinition && enemyDefinition.enemy ? enemyDefinition.enemy : null;
      var enemyID = enemyConfig ? enemyConfig.enemyID : 0;
      enemyState.sprite = new Sprite(Files.ABC.decompressChunk(enemyID));

      // Set the default position for this enemy
      var formationPos = getCachedEnemyFormationPosition(enemyIndex, state.maxEnemyIndex);
      var posX = formationPos ? formationPos.x : 0;
      var posYBase = formationPos ? formationPos.y : 0;
      var posY = posYBase + (enemyState.e ? enemyState.e.yPosOffset : 0);
      var enemyPosition = PAL_XY(posX, posY);

      enemyState.originalPos = enemyPosition;
      enemyState.pos = enemyPosition;
    }

    return state;
  });
};

/**
 * Clone an existing enemy entry into another slot.
 * @param {Number} targetIndex index of the enemy slot to populate.
 * @param {Number} sourceIndex index of the source enemy slot.
 * @param {Object} [options]   additional options {timeMeter, colorShift}.
 * @return {BattleEnemy}
 */
battle.cloneEnemy = function(targetIndex, sourceIndex, options) {
  var source = battleService.getEnemy(sourceIndex);
  options = options || {};

  return battleService.setEnemy(targetIndex, function(target) {
    if (!target) {
      return target;
    }
    target.reset();
    if (source) {
      target.objectID = source.objectID;
      target.e = source.e ? source.e.copy() : null;
      target.scriptOnTurnStart = source.scriptOnTurnStart;
      target.scriptOnBattleEnd = source.scriptOnBattleEnd;
      target.scriptOnReady = source.scriptOnReady;
    } else {
      target.objectID = 0;
      target.e = null;
      target.scriptOnTurnStart = 0;
      target.scriptOnBattleEnd = 0;
      target.scriptOnReady = 0;
    }
    target.state = FighterState.Wait;
    target.timeMeter = options.timeMeter != null ? options.timeMeter : 0;
    target.colorShift = options.colorShift != null ? options.colorShift : 0;
    return target;
  });
};

/**
 * Spawn an enemy from object definition into a slot.
 * @param {Number} targetIndex index of the enemy slot.
 * @param {Number} objectID    object id describing the enemy.
 * @param {Object} [options]   additional options {timeMeter, colorShift}.
 * @return {BattleEnemy}
 */
battle.spawnEnemy = function(targetIndex, objectID, options) {
  options = options || {};

  return battleService.setEnemy(targetIndex, function(enemy) {
    if (!enemy) {
      return enemy;
    }

    enemy.reset();
    enemy.objectID = objectID;

    if (objectID && objectID !== 0xFFFF) {
      var objectEntry = scriptObjectAdapter.getObjectEntry(objectID);
      var objectEnemy = objectEntry && objectEntry.enemy ? objectEntry.enemy : null;
      if (objectEnemy) {
        enemy.e = worldService.copyEnemyTemplate(objectEnemy.enemyID);
        enemy.scriptOnTurnStart = resolveEnemyScriptEntry(objectEnemy.scriptOnTurnStart, targetIndex, 'triggerScript');
        enemy.scriptOnBattleEnd = Number.isFinite(objectEnemy.scriptOnBattleEnd) ? objectEnemy.scriptOnBattleEnd : 0;
        enemy.scriptOnReady = resolveEnemyScriptEntry(objectEnemy.scriptOnReady, targetIndex, 'autoScript');
      } else {
        enemy.e = null;
        enemy.scriptOnTurnStart = 0;
        enemy.scriptOnBattleEnd = 0;
        enemy.scriptOnReady = 0;
      }
    } else {
      enemy.e = null;
      enemy.scriptOnTurnStart = 0;
      enemy.scriptOnBattleEnd = 0;
      enemy.scriptOnReady = 0;
    }

    enemy.state = FighterState.Wait;
    enemy.timeMeter = options.timeMeter != null ? options.timeMeter : 0;
    enemy.colorShift = options.colorShift != null ? options.colorShift : 0;
    return enemy;
  });
};

/**
 * Recalculate the highest occupied enemy index.
 * @return {Number} the new max enemy index.
 */
battle.recalculateMaxEnemyIndex = function() {
  var state = battleService.getState();
  if (!state || !Array.isArray(state.enemy)) {
    battleService.set('maxEnemyIndex', 0);
    return 0;
  }
  var maxIndex = 0;
  for (var i = 0; i < Const.MAX_ENEMIES_IN_TEAM && i < state.enemy.length; i++) {
    if (state.enemy[i] && state.enemy[i].objectID != 0) {
      maxIndex = i;
    }
  }
  battleService.set('maxEnemyIndex', maxIndex);
  return maxIndex;
};

/**
 * Load the screen background picture of the battle.
 */
battle.loadBattleBackground = function() {
  log.debug('[BATTLE] loadBattleBackground');
  // Create the surface
  var background = surface.getRect(0, 0, 320, 200);
  battleService.setBackground(background);

  // Load the picture
  var buf = Files.FBP.decompressChunk(getCachedBattleFieldId() || 0);

  // Draw the picture to the surface.
  surface.blit(buf, background);
};

/**
 * Show the "you win" message and add the experience points for players.
 */
battle.won = function*() {
  var rect = new RECT(65, 60, 200, 100);
  var rect1 = new RECT(80, 0, 180, 200);

  var battleState = battleService.getState() || {};
  var expGained = Number(battleState.expGained) || 0;
  var cashGained = Number(battleState.cashGained) || 0;
  battleService.set(['expGained'], expGained);
  battleService.set(['cashGained'], cashGained);
  var isBossBattle = !!battleState.isBoss;

  if (expGained > 0 || cashGained > 0) {
    music.play(isBossBattle ? 2 : 3, false, 0);

    ui.createSingleLineBox(PAL_XY(83, 60), 8, false);
    ui.createSingleLineBox(PAL_XY(65, 105), 10, false);

    ui.drawText(ui.getWord(ui.BATTLEWIN_GETEXP_LABEL), PAL_XY(95, 70), 0, false, false);
    ui.drawText(ui.getWord(ui.BATTLEWIN_BEATENEMY_LABEL), PAL_XY(77, 115), 0, false, false);
    ui.drawText(ui.getWord(ui.BATTLEWIN_DOLLAR_LABEL), PAL_XY(197, 115), 0, false, false);

    ui.drawNumber(expGained, 5, PAL_XY(182, 74), NumColor.Yellow, NumAlign.Right);
    ui.drawNumber(cashGained, 5, PAL_XY(162, 119), NumColor.Yellow, NumAlign.Mid);

    surface.updateScreen(rect);
    yield input.waitForKey(isBossBattle ? 5500 : 3000);
  }

  worldService.adjustCash(cashGained);

  var party = getParty();
  var maxPartyIndex = getMaxPartyMemberIndex();
  var snapshots = {};

  for (var i = 0; i <= maxPartyIndex; i++) {
    var initialMember = party[i];
    if (!initialMember) continue;
    snapshots[initialMember.playerRole] = battleService.getPlayerSnapshot(initialMember.playerRole);
  }

  var awardSummaries = {};
  for (var awardIndex = 0; awardIndex <= maxPartyIndex; awardIndex++) {
    var awardMember = party[awardIndex];
    if (!awardMember) continue;
    awardSummaries[awardMember.playerRole] = battleService.awardExp(awardMember.playerRole, expGained);
  }

  var levelUpMagicTable = gameDataAdapter.getLevelUpMagicTable() || [];

  function* showHiddenIncrease(afterStats, labelId, delta) {
    if (!delta || delta <= 0) {
      return;
    }
    ui.createSingleLineBox(PAL_XY(83, 60), 8, false);
    ui.drawText(ui.getWord(afterStats.nameId || 0), PAL_XY(95, 70), 0, false, false);
    ui.drawText(ui.getWord(labelId), PAL_XY(143, 70), 0, false, false);
    ui.drawText(ui.getWord(ui.BATTLEWIN_LEVELUP_LABEL), PAL_XY(175, 70), 0, false, false);
    ui.drawNumber(delta, 5, PAL_XY(188, 74), NumColor.Yellow, NumAlign.Right);
    surface.updateScreen(rect);
    yield input.waitForKey(3000);
  }

  for (var partyIndex = 0; partyIndex <= maxPartyIndex; partyIndex++) {
    var partyMember = party[partyIndex];
    if (!partyMember) continue;

    var roleId = partyMember.playerRole;
    var summary = awardSummaries[roleId] || { before: snapshots[roleId], after: snapshots[roleId], levelUp: false };
    var beforeStats = summary.before || snapshots[roleId] || battleService.getPlayerSnapshot(roleId);
    var afterStats = summary.after || battleService.getPlayerSnapshot(roleId);
    if (!beforeStats || !afterStats) {
      continue;
    }

    if (summary.levelUp) {
      ui.createSingleLineBox(PAL_XY(80, 0), 10, false);
      ui.createBox(PAL_XY(82, 32), 7, 8, 1, false);

      ui.drawText(ui.getWord(afterStats.nameId || 0), PAL_XY(110, 10), 0, false, false);
      ui.drawText(ui.getWord(ui.STATUS_LABEL_LEVEL), PAL_XY(110 + 16 * 3, 10), 0, false, false);
      ui.drawText(ui.getWord(ui.BATTLEWIN_LEVELUP_LABEL), PAL_XY(110 + 16 * 5, 10), 0, false, false);

      for (var arrowIndex = 0; arrowIndex < 8; arrowIndex++) {
        var arrowFrame = ui.sprite.getFrame(ui.SPRITENUM_ARROW);
        surface.blitRLE(arrowFrame, PAL_XY(183, 48 + 18 * arrowIndex));
      }

      ui.drawText(ui.getWord(ui.STATUS_LABEL_LEVEL), PAL_XY(100, 44), ui.BATTLEWIN_LEVELUP_LABEL_COLOR, true, false);
      ui.drawText(ui.getWord(ui.STATUS_LABEL_HP), PAL_XY(100, 62), ui.BATTLEWIN_LEVELUP_LABEL_COLOR, true, false);
      ui.drawText(ui.getWord(ui.STATUS_LABEL_MP), PAL_XY(100, 80), ui.BATTLEWIN_LEVELUP_LABEL_COLOR, true, false);
      ui.drawText(ui.getWord(ui.STATUS_LABEL_ATTACKPOWER), PAL_XY(100, 98), ui.BATTLEWIN_LEVELUP_LABEL_COLOR, true, false);
      ui.drawText(ui.getWord(ui.STATUS_LABEL_MAGICPOWER), PAL_XY(100, 116), ui.BATTLEWIN_LEVELUP_LABEL_COLOR, true, false);
      ui.drawText(ui.getWord(ui.STATUS_LABEL_RESISTANCE), PAL_XY(100, 134), ui.BATTLEWIN_LEVELUP_LABEL_COLOR, true, false);
      ui.drawText(ui.getWord(ui.STATUS_LABEL_DEXTERITY), PAL_XY(100, 152), ui.BATTLEWIN_LEVELUP_LABEL_COLOR, true, false);
      ui.drawText(ui.getWord(ui.STATUS_LABEL_FLEERATE), PAL_XY(100, 170), ui.BATTLEWIN_LEVELUP_LABEL_COLOR, true, false);

      ui.drawNumber(beforeStats.level, 4, PAL_XY(133, 47), NumColor.Yellow, NumAlign.Right);
      ui.drawNumber(afterStats.level, 4, PAL_XY(195, 47), NumColor.Yellow, NumAlign.Right);

      ui.drawNumber(beforeStats.hp, 4, PAL_XY(133, 64), NumColor.Yellow, NumAlign.Right);
      ui.drawNumber(beforeStats.maxHP, 4, PAL_XY(154, 68), NumColor.Blue, NumAlign.Right);
      surface.blitRLE(ui.sprite.getFrame(ui.SPRITENUM_SLASH), PAL_XY(156, 66));
      ui.drawNumber(afterStats.hp, 4, PAL_XY(195, 64), NumColor.Yellow, NumAlign.Right);
      ui.drawNumber(afterStats.maxHP, 4, PAL_XY(216, 68), NumColor.Blue, NumAlign.Right);
      surface.blitRLE(ui.sprite.getFrame(ui.SPRITENUM_SLASH), PAL_XY(218, 66));

      ui.drawNumber(beforeStats.mp, 4, PAL_XY(133, 82), NumColor.Yellow, NumAlign.Right);
      ui.drawNumber(beforeStats.maxMP, 4, PAL_XY(154, 86), NumColor.Blue, NumAlign.Right);
      surface.blitRLE(ui.sprite.getFrame(ui.SPRITENUM_SLASH), PAL_XY(156, 84));
      ui.drawNumber(afterStats.mp, 4, PAL_XY(195, 82), NumColor.Yellow, NumAlign.Right);
      ui.drawNumber(afterStats.maxMP, 4, PAL_XY(216, 86), NumColor.Blue, NumAlign.Right);
      surface.blitRLE(ui.sprite.getFrame(ui.SPRITENUM_SLASH), PAL_XY(218, 84));

      ui.drawNumber(beforeStats.attackStrength, 4, PAL_XY(133, 101), NumColor.Yellow, NumAlign.Right);
      ui.drawNumber(afterStats.attackStrength, 4, PAL_XY(195, 101), NumColor.Yellow, NumAlign.Right);

      ui.drawNumber(beforeStats.magicStrength, 4, PAL_XY(133, 119), NumColor.Yellow, NumAlign.Right);
      ui.drawNumber(afterStats.magicStrength, 4, PAL_XY(195, 119), NumColor.Yellow, NumAlign.Right);

      ui.drawNumber(beforeStats.defense, 4, PAL_XY(133, 137), NumColor.Yellow, NumAlign.Right);
      ui.drawNumber(afterStats.defense, 4, PAL_XY(195, 137), NumColor.Yellow, NumAlign.Right);

      ui.drawNumber(beforeStats.dexterity, 4, PAL_XY(133, 155), NumColor.Yellow, NumAlign.Right);
      ui.drawNumber(afterStats.dexterity, 4, PAL_XY(195, 155), NumColor.Yellow, NumAlign.Right);

      ui.drawNumber(beforeStats.fleeRate, 4, PAL_XY(133, 173), NumColor.Yellow, NumAlign.Right);
      ui.drawNumber(afterStats.fleeRate, 4, PAL_XY(195, 173), NumColor.Yellow, NumAlign.Right);

      surface.updateScreen(rect1);
      yield input.waitForKey(3000);
    }

    yield* showHiddenIncrease(afterStats, ui.STATUS_LABEL_HP, afterStats.maxHP - beforeStats.maxHP);
    yield* showHiddenIncrease(afterStats, ui.STATUS_LABEL_MP, afterStats.maxMP - beforeStats.maxMP);
    yield* showHiddenIncrease(afterStats, ui.STATUS_LABEL_ATTACKPOWER, afterStats.attackStrength - beforeStats.attackStrength);
    yield* showHiddenIncrease(afterStats, ui.STATUS_LABEL_MAGICPOWER, afterStats.magicStrength - beforeStats.magicStrength);
    yield* showHiddenIncrease(afterStats, ui.STATUS_LABEL_RESISTANCE, afterStats.defense - beforeStats.defense);
    yield* showHiddenIncrease(afterStats, ui.STATUS_LABEL_DEXTERITY, afterStats.dexterity - beforeStats.dexterity);
    yield* showHiddenIncrease(afterStats, ui.STATUS_LABEL_FLEERATE, afterStats.fleeRate - beforeStats.fleeRate);

    for (var magicIndex = 0; magicIndex < levelUpMagicTable.length; ++magicIndex) {
      var magicLevelEntry = levelUpMagicTable[magicIndex];
      if (!magicLevelEntry || !Array.isArray(magicLevelEntry.m)) {
        continue;
      }
      var levelEntry = magicLevelEntry.m[roleId];
      if (!levelEntry) {
        continue;
      }
      var requiredLevel = levelEntry.level;
      var magicId = levelEntry.magic;
      if (!magicId || requiredLevel > afterStats.level) {
        continue;
      }
      if (script.addMagic(roleId, magicId)) {
        ui.createSingleLineBox(PAL_XY(65, 105), 10, false);
        ui.drawText(ui.getWord(afterStats.nameId || 0), PAL_XY(75, 115), 0, false, false);
        ui.drawText(ui.getWord(ui.BATTLEWIN_ADDMAGIC_LABEL), PAL_XY(75 + 16 * 3, 115), 0, false, false);
        ui.drawText(ui.getWord(magicId), PAL_XY(75 + 16 * 5, 115), 0x1B, false, false);
        surface.updateScreen(rect);
        yield input.waitForKey(3000);
      }
    }
  }

  battleState = BATTLE();
  for (var enemyIndex = 0; enemyIndex <= battleState.maxEnemyIndex; enemyIndex++) {
    var eventId = resolveEnemyEventObjectId(enemyIndex);
    var battleEndScript = resolveEnemyScriptEntry(battleState.enemy[enemyIndex] ? battleState.enemy[enemyIndex].scriptOnBattleEnd : null, enemyIndex, 'triggerScript');
    if (Number.isFinite(battleEndScript) && battleEndScript > 0) {
      yield script.runTriggerScript(battleEndScript, eventId);
    }
  }

  var postBattleParty = getParty();
  var postBattleMaxIndex = getMaxPartyMemberIndex();
  for (var recoverIndex = 0; recoverIndex <= postBattleMaxIndex; recoverIndex++) {
    var recoverEntry = postBattleParty[recoverIndex];
    if (!recoverEntry) continue;
    var recoverRole = recoverEntry.playerRole;
    var stats = battleService.getPlayerSnapshot(recoverRole);
    if (!stats) continue;
    var newHP = stats.hp + Math.floor((stats.maxHP - stats.hp) / 2);
    var newMP = stats.mp + Math.floor((stats.maxMP - stats.mp) / 2);
    newHP = Math.min(newHP, stats.maxHP);
    newMP = Math.min(newMP, stats.maxMP);
    battleService.setPlayerHP(recoverRole, newHP);
    battleService.setPlayerMP(recoverRole, newMP);
  }
};

/**
 * Enemy flee the battle.
 */
battle.enemyEscape = function*() {
  sound.play(45);

  var battleState = BATTLE();
  var f = true;
  // Show the animation
  while (f) {
    f = false;

    for (j = 0; j <= battleState.maxEnemyIndex; j++) {
      var enemy = battleState.enemy[j];
      if (enemy.objectID == 0) {
        continue;
      }

      var x = PAL_X(enemy.pos) - 5;
      var y = PAL_Y(enemy.pos);

      enemy.pos = PAL_XY(x, y);

      var frame = enemy.sprite.getFrame(0);
      var w = frame.width;

      if (x + w > 0) {
        f = true;
      }
    }

    battle.makeScene();
    surface.blitSurface(battleState.sceneBuf, null, surface.byteBuffer, null);
    surface.updateScreen(null);

    yield sleep(10);
  }

  yield sleep(500)
  battleService.setBattleResult(BattleResult.Terminated);
};

/**
 * Player flee the battle.
 */
battle.playerEscape = function*() {
  sound.play(45);

  var battleState = BATTLE();
  battle.updateFighters();
  var playerRole;

  var escapeParty = getParty();
  var escapeMaxIndex = getMaxPartyMemberIndex();
  for (var i = 0; i <= escapeMaxIndex; i++) {
    var escapeMember = escapeParty[i];
    if (!escapeMember) {
      continue;
    }
    playerRole = escapeMember.playerRole;

    if (getPlayerHPValue(playerRole) > 0) {
      battleService.setPlayer(i, function(playerState) {
        if (!playerState) return playerState;
        playerState.currentFrame = 0;
        return playerState;
      });
    }
  }

  for (var i = 0; i < 16; i++) {
    for (var j = 0; j <= escapeMaxIndex; j++) {
      var movingMember = escapeParty[j];
      if (!movingMember) {
        continue;
      }
      playerRole = movingMember.playerRole;
      var player = battleState.player[j];

      if (getPlayerHPValue(playerRole) > 0) {
        // TODO: This is still not the same as the original game
        switch (j) {
          case 0:
            if (escapeMaxIndex > 0) {
              player.pos = PAL_XY(PAL_X(player.pos) + 4, PAL_Y(player.pos) + 6);
              break;
            }

          case 1:
            player.pos = PAL_XY(PAL_X(player.pos) + 4, PAL_Y(player.pos) + 4);
            break;

          case 2:
            player.pos = PAL_XY(PAL_X(player.pos) + 6, PAL_Y(player.pos) + 3);
            break;

          default:
            throw 'should not be here';
        }
      }
    }

    yield battle.delay(1, 0, false);
  }

  // Remove all players from the screen
  for (var i = 0; i <= escapeMaxIndex; i++) {
    battleService.setPlayer(i, function(playerState) {
      if (!playerState) {
        return playerState;
      }
      playerState.pos = PAL_XY(9999, 9999);
      return playerState;
    });
  }

  yield battle.delay(1, 0, false);

  battleService.setBattleResult(BattleResult.Fleed);
};

/**
 * Start a battle.
 * @param {Number}  enemyTeam     the number of the enemy team.
 * @param {Boolean} isBoss        true for boss fight (not allowed to flee).
 * @yield {BattleResult}  The result of the battle.
 */
battle.start = function*(enemyTeam, isBoss) {
  log.debug(['[BATTLE] start', enemyTeam, isBoss].join(' '));
  // Set the screen waving effects
  var prevWaveLevel = getScreenWaveSnapshot() || 0;
  var prevWaveProgression = getWaveProgressionSnapshot() || 0;

  worldService.setWaveProgression(0);
  var battleFieldIndex = getCachedBattleFieldId() || 0;
  var battleFieldConfig = getCachedBattleFieldEntry(battleFieldIndex);
  worldService.setScreenWave(battleFieldConfig ? battleFieldConfig.screenWave : 0);

  var party = getParty();
  var maxPartyIndex = getMaxPartyMemberIndex();

  // Make sure everyone in the party is alive, also clear all hidden
  // EXP count records
  for (var i = 0; i <= maxPartyIndex; i++) {
    var partyMember = party[i];
    if (!partyMember) {
      continue;
    }
    var w = partyMember.playerRole;
    var roleIndex = w;

    if (getPlayerHPValue(w) === 0) {
      worldService.setPlayerHP(w, 1);
      worldService.mutatePlayerStatusEntry(w, function(row) {
        if (row) {
          row[PlayerStatus.Puppet] = 0;
        }
        return row;
      });
    }

    battleService.mutateExpState(function(exp) {
      if (!exp) return exp;
      exp.healthExp[roleIndex].count = 0;
      exp.magicExp[roleIndex].count = 0;
      exp.attackExp[roleIndex].count = 0;
      exp.magicPowerExp[roleIndex].count = 0;
      exp.defenseExp[roleIndex].count = 0;
      exp.dexterityExp[roleIndex].count = 0;
      exp.fleeExp[roleIndex].count = 0;
      return exp;
    });
  }

  // Clear all item-using records
  worldService.mutateInventory(function(inventory) {
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

  battleService.withState(function(state) {
    if (!state) {
      return state;
    }

    var computedMaxEnemyIndex = -1;
    var enemyTeamEntry = getCachedEnemyTeamEntry(enemyTeam);
    var rawEnemyTeam = enemyTeamEntry ? enemyTeamEntry.enemy : null;
    var enemyTeamConfig;
    if (Array.isArray(rawEnemyTeam)) {
      enemyTeamConfig = rawEnemyTeam;
    } else if (rawEnemyTeam && ArrayBuffer.isView(rawEnemyTeam)) {
      enemyTeamConfig = Array.prototype.slice.call(rawEnemyTeam);
    } else {
      enemyTeamConfig = [];
    }

    for (var enemyIndex = 0; enemyIndex < Const.MAX_ENEMIES_IN_TEAM; enemyIndex++) {
      var enemyState = state.enemy && state.enemy[enemyIndex];
      if (!enemyState) {
        break;
      }

      enemyState.reset();
      var enemyObjectId = enemyTeamConfig[enemyIndex];

      if (typeof enemyObjectId === 'undefined' || enemyObjectId === 0 || enemyObjectId === 0xFFFF) {
        break;
      }

      var objectEntry = scriptObjectAdapter.getObjectEntry(enemyObjectId);
      var enemyDefinition = objectEntry && objectEntry.enemy ? objectEntry.enemy : null;
      enemyState.e = enemyDefinition ? worldService.copyEnemyTemplate(enemyDefinition.enemyID) : null;
      enemyState.objectID = enemyObjectId;
      enemyState.state = FighterState.Wait;
      enemyState.scriptOnTurnStart = enemyDefinition ? enemyDefinition.scriptOnTurnStart : 0;
      enemyState.scriptOnBattleEnd = enemyDefinition ? enemyDefinition.scriptOnBattleEnd : 0;
      enemyState.scriptOnReady = enemyDefinition ? enemyDefinition.scriptOnReady : 0;
      enemyState.colorShift = 0;

      computedMaxEnemyIndex = enemyIndex;
    }

    state.maxEnemyIndex = computedMaxEnemyIndex;

    for (var playerIndex = 0; playerIndex <= maxPartyIndex; playerIndex++) {
      var playerState = state.player && state.player[playerIndex];
      if (!playerState) {
        continue;
      }
      playerState.timeMeter = 15.0;
      playerState.hidingTime = 0;
      playerState.state = FighterState.Wait;
      if (playerState.action) {
        playerState.action.target = -1;
      }
      playerState.defending = false;
      playerState.currentFrame = 0;
      playerState.colorShift = false;
    }

    return state;
  });

  // Load sprites and background
  battle.loadBattleSprites();
  battle.loadBattleBackground();

  // Create the surface for scene buffer
  var sceneSurface = surface.getRect(0, 0, 320, 200);
  battleService.setSceneBuffer(sceneSurface);

  yield script.updateEquipments();

  battleService.withState(function(state) {
    if (!state) {
      return state;
    }

    state.expGained = 0;
    state.cashGained = 0;
    state.isBoss = isBoss;
    state.enemyCleared = false;
    state.enemyMoving = false;
    state.hidingTime = 0;
    state.movingPlayerIndex = 0;

    if (state.UI) {
      state.UI.msg = [];
      state.UI.nextMsg = [];
      state.UI.msgShowTime = 0;
      state.UI.state = BattleUIState.Wait;
      state.UI.autoAttack = isAutoBattleEnabled();
      state.UI.selectedIndex = 0;
      state.UI.prevEnemyTarget = 0;
      if (Array.isArray(state.UI.showNum)) {
        state.UI.showNum.forEach(function(sn) {
          if (sn && typeof sn.reset === 'function') {
            sn.reset();
          }
        });
      }
    }

    state.summonSprite = null;
    state.backgroundColorShift = 0;
    state.battleResult = BattleResult.PreBattle;
    state.phase = BattlePhase.SelectAction;
    state.repeat = false;
    state.force = false;
    state.flee = false;

    return state;
  });

  if (typeof battleService.initialiseBattleEntities === 'function') {
    battleService.initialiseBattleEntities();
  }

  if (typeof fight.updateTimeChargingUnit === 'function') {
    fight.updateTimeChargingUnit();
  }

  worldService.setInBattle(true);

  battle.updateFighters();

  // Load the battle effect sprite.
  //Global.battle.effectSprite = Files.DATA.readChunk(10);

  //#ifdef PAL_ALLOW_KEYREPEAT
  //SDL_EnableKeyRepeat(120, 75);
  //#endif

  // Run the main battle routine.
  try {
  var result = yield battle.main();
} catch(ex) {
  log.fatal(['BATTLE exception during battle', ex, 'skip this battle'].join(' '));
  var result = BattleResult.Won;
}

  //#ifdef PAL_ALLOW_KEYREPEAT
  //SDL_EnableKeyRepeat(0, 0);
  //PAL_ClearKeyState();
  //g_InputState.prevdir = kDirUnknown;
  //#endif

  if (result == BattleResult.Won) {
    // Player won the battle. Add the Experience points.
    yield battle.won();
  }

  // Clear all item-using records
  worldService.mutateInventory(function(inventory) {
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

  // Clear all player status, poisons and temporary effects
  script.clearAllPlayerStatus();
  //PAL_ClearAllPlayerStatus();
  for (var w = 0; w < Const.MAX_PLAYER_ROLES; w++) {
    script.curePoisonByLevel(w, 3);
    script.removeEquipmentEffect(w, BodyPart.Extra);
  }

  // Free all the battle sprites
  //PAL_FreeBattleSprites();
  //free(Global.battle.lpEffectSprite);

  // Free the surfaces for the background picture and scene buffer
  battleService.setBackground(null);
  battleService.setSceneBuffer(null);
  //SDL_FreeSurface(Global.battle.lpBackground);
  //SDL_FreeSurface(Global.battle.lpSceneBuf);

  if (uibattle && typeof uibattle.dispose === 'function') {
    uibattle.dispose();
  }

  worldService.setInBattle(false);

  music.play(getCachedMusicTrack(), true, 1);

  // Restore the screen waving effects
  worldService.setWaveProgression(prevWaveProgression);
  worldService.setScreenWave(prevWaveLevel);

  return result;
}

export default battle;
