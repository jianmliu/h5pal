import utils from './utils';
import ui from './ui';
import uigame from './uigame';
import input from './input';
import play from './play';
import dialogService from '../../services/dialog-service.js';
import script from '../../services/script-service.ts';
import res from './res';
import resourceService from '../../services/resource-service.js';
import storageService from '../../services/storage-service.js';
import worldService from '../../services/world-service.js';
import partyTrailAdapter from '../../services/party-trail-adapter.js';
import overviewController from './overview-controller';
import panoramaRenderer from './panorama-renderer';
import panoramaControls from './panorama-controls';
import panoramaDialog from './panorama-dialog';
import config from './config';
import {
  getPlayerRolesSnapshot,
  getMaxPartyMemberIndex as getMaxPartyMemberIndexValue
} from '../../services/player-state-adapter.js';
import scriptObjectAdapter from '../../services/script-object-adapter.js';
import { inventorySignals } from '../../state/slices/inventory.js';
import { hydrateGeneratedGameData } from '../../services/generated-game-data.js';
import debugUtils from './debug-utils';
import {
  getMusicTrack as getCachedMusicTrack,
  getBattleMusicTrack as getCachedBattleMusicTrack,
  getBattleFieldId as getCachedBattleFieldId
} from '../../services/battle-state-adapter.js';
import {
  getCollectValue as getCollectValueFlagValue,
  getChaseRange as getChaseRangeFlagValue,
  getChaseSpeedChangeCycles as getChaseSpeedCyclesFlagValue,
  getBattleSpeed as getBattleSpeedFlagValue
} from '../../services/game-flags-adapter.js';
import {
  getViewportValue as getViewportSnapshot,
  getPaletteIdValue as getPaletteIdSnapshot,
  getPartyDirectionValue as getPartyDirectionSnapshot,
  getCurrentSaveSlotValue,
  isNightPaletteEnabled,
  getScreenWaveValue as getScreenWaveSnapshot,
  getLayerValue as getLayerSnapshot
} from '../../services/environment-adapter.js';
import { getSceneIdValue as getSceneIdSnapshot } from '../../services/scene-state-adapter.js';
import {
  getPartyStructSnapshot,
  getTrailStructSnapshot,
  getExpStructSnapshot,
  getPoisonStructSnapshot,
  getInventoryStructSnapshot
} from '../../services/save-data-adapter.js';

log.trace('game module load');

var game = {};

const inventorySlice = inventorySignals();
const cashSignal = inventorySlice.cash;
const overlayDefaultMode = config.enablePanorama ? 'panorama' : 'off';
let overlayCurrentMode = overlayDefaultMode;
function setOverlayMode(mode) {
  const normalized = mode === 'panorama' ? 'panorama' : 'off';
  if (overlayCurrentMode === normalized) {
    return normalized;
  }
  if (panoramaRenderer && typeof panoramaRenderer.setMode === 'function') {
    panoramaRenderer.setMode(normalized);
  }
  if (panoramaControls && typeof panoramaControls.setMode === 'function') {
    panoramaControls.setMode(normalized);
  }
  if (panoramaDialog && typeof panoramaDialog.setMode === 'function') {
    panoramaDialog.setMode(normalized);
  }
  overlayCurrentMode = normalized;
  return normalized;
}

function normaliseSaveBuffer(buffer) {
  var size = (typeof SaveData !== 'undefined' && SaveData && typeof SaveData.size === 'number')
    ? SaveData.size
    : 0;
  var result = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0);
  if (!size || result.length === size) {
    return result;
  }
  if (result.length < size) {
    var padded = new Uint8Array(size);
    padded.set(result);
    return padded;
  }
  return result.subarray(0, size);
}
let generatedGameDataFallback = null;

if (typeof globalThis !== 'undefined') {
  globalThis.debugUtils = debugUtils;
} else if (typeof window !== 'undefined') {
  window.debugUtils = debugUtils;
} else if (typeof global !== 'undefined') {
  global.debugUtils = debugUtils;
}


function getCashValue() {
  const value = cashSignal.value;
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

function mutateExp(mutator) {
  return worldService.mutateExpState(function(exp) {
    if (exp && typeof mutator === 'function') {
      mutator(exp);
    }
    return exp;
  });
}

function encodeSavePayload(saveData, savedTimes, timestamp) {
  var buf = saveData.uint8Array;
  var arr = new Array(buf.length);
  for (var i = 0; i < buf.length; ++i) {
    arr[i] = buf[i];
  }
  return {
    version: 1,
    savedTimes: savedTimes || 0,
    timestamp: timestamp || Date.now(),
    bytes: arr
  };
}

function getGameDataTable(key) {
  if (typeof GameData !== 'undefined' && GameData && GameData[key]) {
    return GameData[key];
  }
  return null;
}

function readStorageSlot(slot) {
  var entry = storageService.readSlot(slot);
  if (!entry && slot == 1 && storageService.isAvailable() && storageService.storage) {
    var legacyRaw = storageService.storage.getItem('PAL-SAVE');
    if (legacyRaw) {
      try {
        entry = JSON.parse(legacyRaw);
      } catch (ex) {
        entry = null;
      }
    }
  }
  if (!entry) return null;
  var parsed = entry;
  var bytes = null;
  if (Array.isArray(parsed)) {
    bytes = parsed;
    parsed = { bytes: bytes };
  } else if (parsed && parsed.bytes) {
    bytes = parsed.bytes;
  }
  if (!bytes || !bytes.length) {
    return null;
  }
  var buf = new Uint8Array(bytes.length);
  for (var i = 0; i < bytes.length; ++i) {
    buf[i] = bytes[i] & 0xFF;
  }
  buf = normaliseSaveBuffer(buf);
  var saveData = new SaveData(buf);
  var savedTimes = 0;
  if (parsed.savedTimes != null) {
    savedTimes = parsed.savedTimes;
    saveData.savedTimes = savedTimes;
  } else if (typeof saveData.savedTimes === 'number') {
    savedTimes = saveData.savedTimes;
  }
  return {
    saveData: saveData,
    savedTimes: savedTimes,
    timestamp: parsed.timestamp || 0
  };
}

game.init = function*(surf) {
  log.debug('[Game] init');
  global.game = game;
  yield play.init(surf);
};

game.clearPlayerStatus = function() {
  //Global.playerStatus = initTypedArray(PlayerStatus, Const.MAX_PLAYER_ROLES);
  var arr = [];
  for (var i=0; i<Const.MAX_PLAYER_ROLES; ++i) {
    var st = [];
    for (var j=0; j<PlayerStatus.All; ++j) {
      st[j] = 0;
    }
    arr.push(st);
  }
  worldService.setPlayerStatusStruct(arr);
};

game.loadDefaultGame = function*() {
  // Load the default data from the game data files.
  if (Files.SSS && Files.DATA) {
    worldService.setEventObjectTable(readTypedArray(EventObject, Files.SSS.readChunk(0)));
    worldService.setSceneTable(readTypedArray(Scene, Files.SSS.readChunk(1)));
    worldService.setObjectTable(readTypedArray(ObjectUnion, Files.SSS.readChunk(2)));
    worldService.setScriptEntries(readTypedArray(ScriptEntry, Files.SSS.readChunk(4)));
    worldService.setPlayerRoles(new PlayerRoles(Files.DATA.readChunk(3)));
  } else if (generatedGameDataFallback) {
    if (generatedGameDataFallback.eventObjects) {
      worldService.setEventObjectTable(generatedGameDataFallback.eventObjects);
    }
    if (generatedGameDataFallback.scenes) {
      worldService.setSceneTable(generatedGameDataFallback.scenes);
    }
    if (generatedGameDataFallback.objects) {
      worldService.setObjectTable(generatedGameDataFallback.objects);
    }
    if (generatedGameDataFallback.playerRoles) {
      worldService.setPlayerRoles(generatedGameDataFallback.playerRoles);
    }
  } else {
    throw new Error('Default game data is unavailable: missing SSS.MKF/DATA.MKF and generated fallback data');
  }
  // Set some other default data.
  worldService.setCash(0);
  worldService.setMusicTrack(0);
  worldService.setPaletteId(0);
  worldService.setSceneId(1);
  worldService.setCollectValue(0);
  worldService.setNightPaletteFlag(false);
  worldService.setMaxPartyMemberIndex(0);
  worldService.setViewport(PAL_XY(0, 0));
  worldService.setLayer(0);
  worldService.setChaseRange(1);
  if (!PAL_CLASSIC) {
    worldService.setBattleSpeed(2);
  }
  worldService.setEnteringScene(true);
  //utils.extend(Global, {
  //  inventory: initTypedArray(Inventory, Const.MAX_INVENTORY),
  //  poisonStatus: [],
  //  party: initTypedArray(Party, Const.MAX_PLAYABLE_PLAYER_ROLES),
  //  trail: initTypedArray(Trail, Const.MAX_PLAYABLE_PLAYER_ROLES),
  //  exp: new AllExperience(null),
  //  enteringScene: true
  //});
  //for (var i=0; i<Const.MAX_POISONS; ++i){
  //  Global.poisonStatus[i] = initTypedArray(PoisonStatus, Const.MAX_PLAYABLE_PLAYER_ROLES);
  //}
  mutateExp(function(exp) {
    if (!exp) return exp;
    const roles = getPlayerRolesSnapshot();
    const levels = roles && roles.level ? roles.level : null;
    for (var i = 0; i < Const.MAX_PLAYER_ROLES; ++i) {
      AllExperience.types.forEach(function(name) {
        if (exp[name] && exp[name][i] && levels) {
          exp[name][i].level = levels[i];
        }
      });
    }
    return exp;
  });
};

/**
 * Initialize global game data.
 */
game.initGlobalGameData = function*() {
  if (!Files.SSS || !Files.DATA || true) {
    const generatedPayload = yield resourceService.loadGeneratedGameData();
    generatedGameDataFallback = generatedPayload ? hydrateGeneratedGameData(generatedPayload) : null;
    if (generatedGameDataFallback) {
      // Apply immediately so the world-service caches (script/object tables, etc.) stay in sync.
      worldService.setEventObjectTable(generatedGameDataFallback.eventObjects || []);
      worldService.setSceneTable(generatedGameDataFallback.scenes || []);
      worldService.setObjectTable(generatedGameDataFallback.objects || []);
      if (generatedGameDataFallback.playerRoles) {
        worldService.setPlayerRoles(generatedGameDataFallback.playerRoles);
      }
      if (generatedGameDataFallback.scriptEntries) {
        worldService.setScriptEntries(generatedGameDataFallback.scriptEntries);
      }
      if (generatedGameDataFallback.store) {
        worldService.setStoreTable(generatedGameDataFallback.store);
      }
      if (generatedGameDataFallback.enemy) {
        worldService.setEnemyTable(generatedGameDataFallback.enemy);
      }
      if (generatedGameDataFallback.enemyTeam) {
        worldService.setEnemyTeamTable(generatedGameDataFallback.enemyTeam);
      }
      if (generatedGameDataFallback.magic) {
        worldService.setMagicTable(generatedGameDataFallback.magic);
      }
      if (generatedGameDataFallback.battleField) {
        worldService.setBattleFieldTable(generatedGameDataFallback.battleField);
      }
      if (generatedGameDataFallback.levelUpMagic) {
        worldService.setLevelUpMagicTable(generatedGameDataFallback.levelUpMagic);
      }
      if (generatedGameDataFallback.battleEffectIndex) {
        worldService.setBattleEffectIndexTable(generatedGameDataFallback.battleEffectIndex);
      }
      if (generatedGameDataFallback.enemyPos) {
        worldService.setEnemyPositionTable(generatedGameDataFallback.enemyPos);
      }
      if (generatedGameDataFallback.levelUpExp) {
        worldService.setLevelUpExpTable(generatedGameDataFallback.levelUpExp);
      }
      if (console && console.debug) {
        console.debug('[Game] loaded generated fallback', {
          scenes: generatedGameDataFallback.scenes && generatedGameDataFallback.scenes.length,
          eventObjects: generatedGameDataFallback.eventObjects && generatedGameDataFallback.eventObjects.length,
          scriptEntries: generatedGameDataFallback.scriptEntries && generatedGameDataFallback.scriptEntries.length
        });
      }
    } else if (console && console.warn) {
      console.warn('[Game] generated fallback game-data missing or invalid');
    }
  } else {
    generatedGameDataFallback = null;
  }

  // MKF bundles are preloaded during startup via the resource service.
  if (generatedGameDataFallback && generatedGameDataFallback.scriptEntries) {
    worldService.setScriptEntries(generatedGameDataFallback.scriptEntries);
  } else if (Files.SSS) {
    worldService.setScriptEntries(readTypedArray(ScriptEntry, Files.SSS.readChunk(4)));
  } else {
    throw new Error('Generated game data fallback is unavailable and SSS.MKF is missing');
  }

  if (generatedGameDataFallback) {
    if (generatedGameDataFallback.store) {
      worldService.setStoreTable(generatedGameDataFallback.store);
    }
    if (generatedGameDataFallback.enemy) {
      worldService.setEnemyTable(generatedGameDataFallback.enemy);
    }
    if (generatedGameDataFallback.enemyTeam) {
      worldService.setEnemyTeamTable(generatedGameDataFallback.enemyTeam);
    }
    if (generatedGameDataFallback.magic) {
      worldService.setMagicTable(generatedGameDataFallback.magic);
    }
    if (generatedGameDataFallback.battleField) {
      worldService.setBattleFieldTable(generatedGameDataFallback.battleField);
    }
    if (generatedGameDataFallback.levelUpMagic) {
      worldService.setLevelUpMagicTable(generatedGameDataFallback.levelUpMagic);
    }
    if (generatedGameDataFallback.battleEffectIndex) {
      worldService.setBattleEffectIndexTable(generatedGameDataFallback.battleEffectIndex);
    }
    if (generatedGameDataFallback.enemyPos) {
      worldService.setEnemyPositionTable(generatedGameDataFallback.enemyPos);
    }
    if (generatedGameDataFallback.levelUpExp) {
      worldService.setLevelUpExpTable(generatedGameDataFallback.levelUpExp);
    }
  } else {
    throw new Error('Generated game data fallback is unavailable and DATA.MKF is missing');
  }
};

game.loadGame = function*(slot) {
  var entry = readStorageSlot(slot);
  if (entry) {
    return game._loadGame(entry.saveData);
  }
  // Try to open the specified file
  // Read all data from the file and close.
  try {
    var buffer = yield resourceService.loadFiles(slot + '.RPG');
    var buf = normaliseSaveBuffer(new Uint8Array(buffer));
    var s = (new SaveData(buf)).copy();
  } catch(ex) {
    return false;
  }
  return game._loadGame(s);
};

game._loadGame = function(s) {
  // Adjust endianness
  //DO_BYTESWAP(&s, sizeof(SAVEDGAME));

  // Cash amount is in DWORD, so do a wordswap in Big-Endian.
  //#if SDL_BYTEORDER == SDL_BIG_ENDIAN
  //s.dwCash = ((s.dwCash >> 16) | (s.dwCash << 16));
  //#endif

  // Get all the data from the saved game struct.
  worldService.setViewport(PAL_XY(s.viewportX, s.viewportY));
  worldService.setMaxPartyMemberIndex(s.numPartyMember);
  worldService.setSceneId(s.numScene);
  worldService.setNightPaletteFlag(s.paletteOffset !== 0);
  worldService.setPartyDirection(s.partyDirection);
  worldService.setMusicTrack(s.numMusic);
  worldService.setBattleMusicTrack(s.numBattleMusic);
  worldService.setBattleFieldId(s.numBattleField);
  worldService.setScreenWave(s.screenWave);
  worldService.setWaveProgression(0);
  worldService.setCollectValue(s.collectValue);
  worldService.setLayer(s.layer);
  worldService.setChaseRange(s.chaseRange);
  worldService.setChaseSpeedChangeCycles(s.chaseSpeedChangeCycles);
  worldService.setFollowerCount(s.numFollower);
  worldService.setCash(s.cash);
  if (!PAL_CLASSIC) {
    var nextBattleSpeed = s.battleSpeed;
    if (nextBattleSpeed > 5 || nextBattleSpeed == 0) {
      nextBattleSpeed = 2;
    }
    worldService.setBattleSpeed(nextBattleSpeed);
  }
  worldService.setPartyStruct(s.party);
  worldService.setTrailStruct(s.trail);
  worldService.setExpStruct(s.exp);
  worldService.setPlayerRoles(s.playerRoles);
  worldService.setPoisonStatusStruct(s.poisonStatus);
  worldService.setInventoryStruct(s.inventory);
  worldService.setSceneTable(s.scene);
  worldService.setObjectTable(s.object);
  worldService.setEventObjectTable(s.eventObject);
  worldService.setEnteringScene(false);

  //PAL_CompressInventory();
  script.compressInventory();

  // Success
  return true;
};

game._saveGame = function() {
  var saveData = new SaveData();

  var viewport = getViewportSnapshot();
  saveData.viewportX = PAL_X(viewport);
  saveData.viewportY = PAL_Y(viewport);
  var maxPartyIndexSnapshot = getMaxPartyMemberIndexValue();
  saveData.numPartyMember = Number.isFinite(maxPartyIndexSnapshot)
    ? maxPartyIndexSnapshot
    : worldService.getMaxPartyMemberIndex();
  saveData.numScene = getSceneIdSnapshot();
  saveData.paletteOffset = isNightPaletteEnabled() ? 0x180 : 0;
  saveData.partyDirection = getPartyDirectionSnapshot();
  saveData.numMusic = getCachedMusicTrack();
  saveData.numBattleMusic = getCachedBattleMusicTrack();
  saveData.numBattleField = getCachedBattleFieldId();
  saveData.screenWave = getScreenWaveSnapshot();
  saveData.collectValue = getCollectValueFlagValue();
  saveData.layer = getLayerSnapshot();
  saveData.chaseRange = getChaseRangeFlagValue();
  saveData.chaseSpeedChangeCycles = getChaseSpeedCyclesFlagValue();
  saveData.numFollower = partyTrailAdapter.getFollowerCount();
  saveData.cash = getCashValue();
  if (!PAL_CLASSIC) {
    saveData.battleSpeed = getBattleSpeedFlagValue();
    if (saveData.battleSpeed > 5 || saveData.battleSpeed == 0) {
      saveData.battleSpeed = 2;
    }
  }
  var partyStruct = getPartyStructSnapshot();
  if (partyStruct && partyStruct.uint8Array) {
    saveData.party.uint8Array.set(partyStruct.uint8Array);
  }
  var trailStruct = getTrailStructSnapshot();
  if (trailStruct && trailStruct.uint8Array) {
    saveData.trail.uint8Array.set(trailStruct.uint8Array);
  }
  var expStruct = getExpStructSnapshot();
  if (expStruct && expStruct.uint8Array) {
    saveData.exp.uint8Array.set(expStruct.uint8Array);
  }
  const playerRoles = getPlayerRolesSnapshot();
  if (playerRoles && playerRoles.uint8Array) {
    memcpy(saveData.playerRoles.uint8Array, playerRoles.uint8Array, saveData.playerRoles.uint8Array.length);
  }
  var poisonStruct = getPoisonStructSnapshot();
  if (poisonStruct && poisonStruct.uint8Array) {
    saveData.poisonStatus.uint8Array.set(poisonStruct.uint8Array);
  }
  var inventoryStruct = getInventoryStructSnapshot();
  if (inventoryStruct && inventoryStruct.uint8Array) {
    saveData.inventory.uint8Array.set(inventoryStruct.uint8Array);
  }
  const sceneTable = getGameDataTable('scene');
  if (sceneTable && sceneTable.uint8Array) {
    memcpy(saveData.scene.uint8Array, sceneTable.uint8Array, saveData.scene.uint8Array.length);
  }
  const objectTable = scriptObjectAdapter.getObjectTable();
  if (objectTable && objectTable.uint8Array) {
    memcpy(saveData.object.uint8Array, objectTable.uint8Array, saveData.object.uint8Array.length);
  }
  const eventObjectTable = getGameDataTable('eventObject');
  if (eventObjectTable && eventObjectTable.uint8Array) {
    memcpy(saveData.eventObject.uint8Array, eventObjectTable.uint8Array, saveData.eventObject.uint8Array.length);
  }

  return saveData;
};

game.getSaveSlotMeta = function(slot) {
  var entry = readStorageSlot(slot);
  if (!entry) return null;
  return {
    savedTimes: entry.savedTimes || 0,
    timestamp: entry.timestamp || 0
  };
};

game.saveGame = function(slot) {
  slot = slot || getCurrentSaveSlotValue() || 1;
  var existing = readStorageSlot(slot);
  var saveData = game._saveGame();
  var nextSavedTimes = (existing ? existing.savedTimes : (saveData.savedTimes || 0)) + 1;
  saveData.savedTimes = nextSavedTimes & 0xFFFF;
  var payload = encodeSavePayload(saveData, nextSavedTimes & 0xFFFF, Date.now());
  var ok = storageService.writeSlot(slot, payload);
  if (!ok) {
    console.warn('Failed to persist save data');
  }
  return ok;
};

game.initGameData = function*(slot) {
  yield game.initGlobalGameData();

  worldService.setCurrentSaveSlot(slot);

  // try loading from the saved game file.
  if (slot == 0 || !(yield game.loadGame(slot))) {
    // Cannot load the saved game file. Load the defaults.
    yield game.loadDefaultGame();
  }

  worldService.setGameStart(true);
  worldService.setNeedToFadeIn(false);
  worldService.setInventoryMenuIndex(0);
  worldService.setInBattle(false);

  worldService.resetPlayerStatusMatrix();
  yield script.updateEquipments();
};

game._initGameData = function*(s) {
  yield game.initGlobalGameData();

  game._loadGame(s);

  worldService.setGameStart(true);
  worldService.setNeedToFadeIn(false);
  worldService.setInventoryMenuIndex(0);
  worldService.setInBattle(false);

  worldService.resetPlayerStatusMatrix();
  yield script.updateEquipments();
};

/**
 * Do some initialization work when game starts (new game or load game).
 */
game.start = function*() {
  res.setLoadFlags(LoadFlag.Scene | LoadFlag.PlayerSprite);
  if (!worldService.isEnteringScene()) {
    // pal.music.play(Global.musicNum, true, 1);
  }
  worldService.setNeedToFadeIn(true);
  worldService.setFrameCount(0);

  input.init();
  input.clear();
};

/**
 * The game entry routine.
 */
game.main = function*() {
  const overlayPreference = overlayDefaultMode;
  if (overlayPreference === 'panorama') {
    setOverlayMode('off');
  }
  var slot = yield uigame.openingMenu(); // 主菜单
  //var slot = 5;
  worldService.setCurrentSaveSlot(slot);
  yield game.initGameData(slot); // 加载游戏
  if (overlayPreference !== 'off') {
    setOverlayMode(overlayPreference);
  }

  if (slot === 0) {
    dialogService.setAwaitingInput(true, { reason: 'intro' });
  }

  while (true) {
    if (worldService.isGameStart()) {
      yield game.start();
      worldService.setGameStart(false);
    }
    yield res.loadResources();
    input.clear();
    yield sleepByFrame(1);
    //try {
      yield play.startFrame();
    //} catch(ex) {
    //  log.warning('[GAME] play.startFrame() error `' + ex + '`');
    //  console.log(ex);
    //}
  }
};

game.shutdown = function() {
  console.log('over了...');
};

export default game;
