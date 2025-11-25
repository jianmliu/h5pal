import '../js/pal/binary-helper.js';
import '../js/pal/pal-global.js';
import worldService from './world-service.ts';

const SSS_KEY = 'SSS';
const DATA_KEY = 'DATA';

const requiredChunks = [
  [SSS_KEY, 'eventObject'],
  [SSS_KEY, 'scene'],
  [SSS_KEY, 'object'],
  [SSS_KEY, 'scriptEntry'],
  [DATA_KEY, 'playerRoles']
];

function decodeBase64(data) {
  if (!data || typeof data !== 'string' || data.length === 0) {
    return null;
  }
  if (typeof atob === 'function') {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  if (typeof Buffer !== 'undefined' && Buffer.from) {
    const buffer = Buffer.from(data, 'base64');
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
  return null;
}

function getChunk(payload, fileKey, entryKey) {
  if (!payload || !payload.files) {
    return null;
  }
  const file = payload.files[fileKey];
  if (!file) {
    return null;
  }
  const entry = file[entryKey];
  if (!entry || typeof entry !== 'object' || entry.encoding !== 'base64') {
    return null;
  }
  return decodeBase64(entry.data);
}

export function hydrateGeneratedGameData(payload) {
  if (!payload || typeof payload !== 'object' || !payload.files) {
    return null;
  }
  for (let i = 0; i < requiredChunks.length; i++) {
    const [fileKey, entryKey] = requiredChunks[i];
    const bytes = getChunk(payload, fileKey, entryKey);
    if (!(bytes instanceof Uint8Array) || !bytes.length) {
      return null;
    }
  }

  const eventObjectsBytes = getChunk(payload, SSS_KEY, 'eventObject');
  const scenesBytes = getChunk(payload, SSS_KEY, 'scene');
  const objectsBytes = getChunk(payload, SSS_KEY, 'object');
  const scriptEntriesBytes = getChunk(payload, SSS_KEY, 'scriptEntry');
  const storeBytes = getChunk(payload, DATA_KEY, 'store');
  const enemyBytes = getChunk(payload, DATA_KEY, 'enemy');
  const enemyTeamBytes = getChunk(payload, DATA_KEY, 'enemyTeam');
  const magicBytes = getChunk(payload, DATA_KEY, 'magic');
  const battleFieldBytes = getChunk(payload, DATA_KEY, 'battleField');
  const levelUpMagicBytes = getChunk(payload, DATA_KEY, 'levelUpMagic');
  const battleEffectBytes = getChunk(payload, DATA_KEY, 'battleEffectIndex');
  const enemyPosBytes = getChunk(payload, DATA_KEY, 'enemyPos');
  const levelUpExpBytes = getChunk(payload, DATA_KEY, 'levelUpExp');
  const playerRolesBytes = getChunk(payload, DATA_KEY, 'playerRoles');

  const eventObjects = eventObjectsBytes ? readTypedArray(EventObject, eventObjectsBytes) : null;
  const scenes = scenesBytes ? readTypedArray(Scene, scenesBytes) : null;
  const objects = objectsBytes ? readTypedArray(ObjectUnion, objectsBytes) : null;
  const scriptEntries = scriptEntriesBytes ? readTypedArray(ScriptEntry, scriptEntriesBytes) : null;
  const store = storeBytes ? readTypedArray(Store, storeBytes) : null;
  const enemy = enemyBytes ? readTypedArray(Enemy, enemyBytes) : null;
  const enemyTeam = enemyTeamBytes ? readTypedArray(EnemyTeam, enemyTeamBytes) : null;
  const magic = magicBytes ? readTypedArray(Magic, magicBytes) : null;
  const battleField = battleFieldBytes ? readTypedArray(BattleField, battleFieldBytes) : null;
  const levelUpMagic = levelUpMagicBytes ? readTypedArray(LevelUpMagicAll, levelUpMagicBytes) : null;
  const battleEffectIndex = battleEffectBytes ? readArray2D(
    battleEffectBytes,
    10, 2, 2, 0
  ) : null;

  const result = {
    eventObjects,
    scenes,
    objects,
    scriptEntries,
    store,
    enemy,
    enemyTeam,
    magic,
    battleField,
    levelUpMagic,
    battleEffectIndex,
    enemyPos: enemyPosBytes ? new EnemyPos(enemyPosBytes) : null,
    levelUpExp: levelUpExpBytes ? readArray(levelUpExpBytes, Const.MAX_LEVELS, 2, 0) : null,
    playerRoles: playerRolesBytes ? new PlayerRoles(playerRolesBytes) : null
  };

  return result;
}

export function applyGeneratedGameData(payload, world = worldService) {
  const hydrated = hydrateGeneratedGameData(payload);
  if (!hydrated) {
    return false;
  }
  if (hydrated.eventObjects) {
    world.setEventObjectTable(hydrated.eventObjects);
  }
  if (hydrated.scenes) {
    world.setSceneTable(hydrated.scenes);
  }
  if (hydrated.objects) {
    world.setObjectTable(hydrated.objects);
  }
  if (hydrated.scriptEntries) {
    world.setScriptEntries(hydrated.scriptEntries);
  }
  if (hydrated.playerRoles) {
    world.setPlayerRoles(hydrated.playerRoles);
  }
  if (hydrated.store) {
    world.setStoreTable(hydrated.store);
  }
  if (hydrated.enemy) {
    world.setEnemyTable(hydrated.enemy);
  }
  if (hydrated.enemyTeam) {
    world.setEnemyTeamTable(hydrated.enemyTeam);
  }
  if (hydrated.magic) {
    world.setMagicTable(hydrated.magic);
  }
  if (hydrated.battleField) {
    world.setBattleFieldTable(hydrated.battleField);
  }
  if (hydrated.levelUpMagic) {
    world.setLevelUpMagicTable(hydrated.levelUpMagic);
  }
  if (hydrated.battleEffectIndex) {
    world.setBattleEffectIndexTable(hydrated.battleEffectIndex);
  }
  if (hydrated.enemyPos) {
    world.setEnemyPositionTable(hydrated.enemyPos);
  }
  if (hydrated.levelUpExp) {
    world.setLevelUpExpTable(hydrated.levelUpExp);
  }
  return true;
}
