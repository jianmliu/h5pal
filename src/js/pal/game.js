import utils from './utils';
import ui from './ui';
import uigame from './uigame';
import input from './input';
import play from './play';
import script from '../../services/script-service.js';
import res from './res';
import resourceService from '../../services/resource-service.js';
import storageService from '../../services/storage-service.js';
import worldService from '../../services/world-service.js';
import {
  getMusicTrack as getCachedMusicTrack,
  getBattleMusicTrack as getCachedBattleMusicTrack,
  getBattleFieldId as getCachedBattleFieldId
} from '../../services/battle-state-adapter.js';

log.trace('game module load');

var game = {};

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
  worldService.setEventObjectTable(readTypedArray(EventObject, Files.SSS.readChunk(0)));
  worldService.setSceneTable(readTypedArray(Scene, Files.SSS.readChunk(1)));
  worldService.setObjectTable(readTypedArray(ObjectUnion, Files.SSS.readChunk(2)));
  worldService.setPlayerRoles(new PlayerRoles(Files.DATA.readChunk(3)));
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
    const roles = worldService.getPlayerRoles();
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
  // MKF bundles are preloaded during startup via the resource service.
  worldService.setScriptEntries(readTypedArray(ScriptEntry, Files.SSS.readChunk(4)));
  worldService.setStoreTable(readTypedArray(Store, Files.DATA.readChunk(0)));
  worldService.setEnemyTable(readTypedArray(Enemy, Files.DATA.readChunk(1)));
  worldService.setEnemyTeamTable(readTypedArray(EnemyTeam, Files.DATA.readChunk(2)));
  worldService.setMagicTable(readTypedArray(Magic, Files.DATA.readChunk(4)));
  worldService.setBattleFieldTable(readTypedArray(BattleField, Files.DATA.readChunk(5)));
  worldService.setLevelUpMagicTable(readTypedArray(LevelUpMagicAll, Files.DATA.readChunk(6)));
  worldService.setBattleEffectIndexTable(readArray2D(
    Files.DATA.readChunk(11),
    10, 2, 2, 0
  ));
  worldService.setEnemyPositionTable(new EnemyPos(Files.DATA.readChunk(13)));
  worldService.setLevelUpExpTable(readArray(Files.DATA.readChunk(14), Const.MAX_LEVELS, 2, 0));
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
    var buf = new Uint8Array(buffer);
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

  var viewport = worldService.getViewport();
  saveData.viewportX = PAL_X(viewport);
  saveData.viewportY = PAL_Y(viewport);
  saveData.numPartyMember = worldService.getMaxPartyMemberIndex();
  saveData.numScene = worldService.getSceneId();
  saveData.paletteOffset = worldService.getNightPaletteFlag() ? 0x180 : 0;
  saveData.partyDirection = worldService.getPartyDirection();
  saveData.numMusic = getCachedMusicTrack();
  saveData.numBattleMusic = getCachedBattleMusicTrack();
  saveData.numBattleField = getCachedBattleFieldId();
  saveData.screenWave = worldService.getScreenWave();
  saveData.collectValue = worldService.getCollectValue();
  saveData.layer = worldService.getLayer();
  saveData.chaseRange = worldService.getChaseRange();
  saveData.chaseSpeedChangeCycles = worldService.getChaseSpeedChangeCycles();
  saveData.numFollower = worldService.getFollowerCount();
  saveData.cash = worldService.getCash();
  if (!PAL_CLASSIC) {
    saveData.battleSpeed = worldService.getBattleSpeed();
    if (saveData.battleSpeed > 5 || saveData.battleSpeed == 0) {
      saveData.battleSpeed = 2;
    }
  }
  var partyStruct = worldService.getPartyStruct();
  if (partyStruct && partyStruct.uint8Array) {
    saveData.party.uint8Array.set(partyStruct.uint8Array);
  }
  var trailStruct = worldService.getTrailStruct();
  if (trailStruct && trailStruct.uint8Array) {
    saveData.trail.uint8Array.set(trailStruct.uint8Array);
  }
  var expStruct = worldService.getExpState();
  if (expStruct && expStruct.uint8Array) {
    saveData.exp.uint8Array.set(expStruct.uint8Array);
  }
  const playerRoles = worldService.getPlayerRoles();
  if (playerRoles && playerRoles.uint8Array) {
    memcpy(saveData.playerRoles.uint8Array, playerRoles.uint8Array, saveData.playerRoles.uint8Array.length);
  }
  var poisonStruct = worldService.getPoisonStatusStruct();
  if (poisonStruct && poisonStruct.uint8Array) {
    saveData.poisonStatus.uint8Array.set(poisonStruct.uint8Array);
  }
  var inventoryStruct = worldService.getInventoryStruct();
  if (inventoryStruct && inventoryStruct.uint8Array) {
    saveData.inventory.uint8Array.set(inventoryStruct.uint8Array);
  }
  const sceneTable = worldService.getSceneTable();
  if (sceneTable && sceneTable.uint8Array) {
    memcpy(saveData.scene.uint8Array, sceneTable.uint8Array, saveData.scene.uint8Array.length);
  }
  const objectTable = worldService.getObjectTable();
  if (objectTable && objectTable.uint8Array) {
    memcpy(saveData.object.uint8Array, objectTable.uint8Array, saveData.object.uint8Array.length);
  }
  const eventObjectTable = worldService.getEventObjectTable();
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
  slot = slot || worldService.getCurrentSaveSlot() || 1;
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
  var slot = yield uigame.openingMenu(); // 主菜单
  //var slot = 5;
  worldService.setCurrentSaveSlot(slot);
  yield game.initGameData(slot); // 加载游戏

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
