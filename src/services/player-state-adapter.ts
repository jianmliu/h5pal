// @ts-nocheck

import stateService from './state-service.js';
import reactiveContext from '../state/reactive-context.js';
import { playerStateSignals, updatePlayerRolesValue } from '../state/slices/player-state.js';
import { statusSignals } from '../state/slices/status-matrices.js';
import { viewportSignals } from '../state/slices/viewport.js';
import { createAdapterObservable } from './adapter-helpers.js';

const playerStateSlice = playerStateSignals();
const rolesSignal = playerStateSlice.roles;
const equipmentEffectSignal = playerStateSlice.equipmentEffect;

const statusSlice = statusSignals();
const playerStatusSignal = statusSlice.player;

const viewportSlice = viewportSignals();
const maxPartyIndexSignal = viewportSlice.maxPartyIndex;

const playerRolesStream = reactiveContext.signalToObservable(rolesSignal, () => getRolesSnapshot());
const equipmentEffectsStream = reactiveContext.signalToObservable(
  equipmentEffectSignal,
  () => getEquipmentMatrix()
);
const playerStatusStream = reactiveContext.signalToObservable(
  playerStatusSignal,
  () => getPlayerStatusMatrix()
);
const poisonStatusStream = reactiveContext.signalToObservable(
  statusSlice.poison,
  () => getPoisonStatusMatrix()
);
const maxPartyIndexStream = reactiveContext.signalToObservable(
  maxPartyIndexSignal,
  () => getMaxPartyMemberIndex()
);

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    const view = toUint8Array(value);
    return Array.from(view);
  }
  return [];
}

function toUint8Array(view) {
  if (view instanceof Uint8Array) return view;
  return new Uint8Array(view.buffer, view.byteOffset || 0, view.byteLength || view.length || 0);
}

function toUnsignedWord(highByte, lowByte) {
  const hi = typeof highByte === 'number' ? highByte & 0xFF : 0;
  const lo = typeof lowByte === 'number' ? lowByte & 0xFF : 0;
  return (hi << 8) | lo;
}

function resolveMaxRoles(snapshot) {
  if (snapshot) {
    if (Array.isArray(snapshot.level)) {
      return snapshot.level.length;
    }
    if (Array.isArray(snapshot.HP)) {
      return snapshot.HP.length;
    }
    if (Array.isArray(snapshot.avatar)) {
      return snapshot.avatar.length;
    }
  }
  if (typeof Const !== 'undefined' && Const && typeof Const.MAX_PLAYER_ROLES === 'number') {
    return Const.MAX_PLAYER_ROLES;
  }
  const globalRoles = stateService.getGlobal('playerRoles');
  if (globalRoles && Array.isArray(globalRoles.level)) {
    return globalRoles.level.length;
  }
  if (globalRoles && Array.isArray(globalRoles.HP)) {
    return globalRoles.HP.length;
  }
  return 0;
}

function getRolesSnapshot() {
  const roles = rolesSignal.value;
  if (roles) {
    return roles;
  }
  const globalRoles = stateService.getGlobal('playerRoles');
  if (globalRoles) {
    return globalRoles;
  }
  const gameDataRoles = stateService.getGameData('playerRoles');
  if (gameDataRoles) {
    updatePlayerRolesValue(gameDataRoles, { emitEvent: false, source: 'player-state-adapter:fallback-gameData' });
    return gameDataRoles;
  }
  const store = typeof GameData !== 'undefined' && GameData ? GameData : null;
  if (store && store.playerRoles) {
    updatePlayerRolesValue(store.playerRoles, { emitEvent: false, source: 'player-state-adapter:fallback-GameData' });
    return store.playerRoles;
  }
  return null;
}

function getPlayerRolesBuffer(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }
  if (snapshot.uint8Array) {
    return snapshot.uint8Array;
  }
  if (Array.isArray(snapshot.buffer)) {
    return snapshot.buffer;
  }
  return null;
}

function getRoleArray(key) {
  const roles = getRolesSnapshot();
  if (!roles || typeof roles !== 'object') {
    return [];
  }
  return ensureArray(roles[key]);
}

function getRoleArrayValue(key, roleId, fallback) {
  const arr = getRoleArray(key);
  const hasExplicitFallback = arguments.length >= 3 && typeof fallback !== 'undefined';
  const resolvedFallback = hasExplicitFallback ? fallback : 0;
  if (roleId < 0 || roleId >= arr.length) {
    return resolvedFallback;
  }
  const value = arr[roleId];
  return typeof value === 'number' ? value : resolvedFallback;
}

function getEquipmentMatrix() {
  const effects = equipmentEffectSignal.value;
  if (effects) {
    return effects;
  }
  return [];
}

export function getEquipmentEffectsMatrix() {
  const matrix = getEquipmentMatrix();
  return Array.isArray(matrix) ? matrix : [];
}

export function getEquipmentEffectAt(index) {
  const matrix = getEquipmentMatrix();
  if (!Array.isArray(matrix)) {
    return null;
  }
  return matrix[index] || null;
}

function getMagicSlots() {
  const roles = getRolesSnapshot();
  if (roles && Array.isArray(roles.magic)) {
    return roles.magic;
  }
  return [];
}

export function getPlayerMagicSlotCount() {
  const slots = getMagicSlots();
  return Array.isArray(slots) ? slots.length : 0;
}

export function getPlayerStatusMatrix() {
  const matrix = playerStatusSignal.value;
  if (matrix) {
    return matrix;
  }
  const globalMatrix = stateService.getGlobal('playerStatus');
  return Array.isArray(globalMatrix) ? globalMatrix : [];
}

export function getPoisonStatusMatrix() {
  const matrix = statusSlice.poison.value;
  if (Array.isArray(matrix) && matrix.length > 0) {
    return matrix;
  }
  const globalMatrix = stateService.getGlobal('poisonStatus');
  return Array.isArray(globalMatrix) ? globalMatrix : [];
}

export function getMaxPartyMemberIndex() {
  const legacyGlobal = (typeof globalThis !== 'undefined' && /** @type {any} */ (globalThis).Global)
    ? /** @type {any} */ (globalThis).Global
    : (typeof global !== 'undefined' ? /** @type {any} */ (global).Global : null);
  if (legacyGlobal && typeof legacyGlobal.maxPartyMemberIndex === 'number') {
    return legacyGlobal.maxPartyMemberIndex;
  }
  const value = maxPartyIndexSignal.value;
  if (typeof value === 'number' && value >= -1) {
    return value;
  }
  const globalMax = stateService.getGlobal('maxPartyMemberIndex');
  if (typeof globalMax === 'number' && globalMax >= 0) {
    return globalMax;
  }
  return -1;
}

export function getPlayerHP(roleId) {
  return getRoleArrayValue('HP', roleId, 0);
}

export function getPlayerMaxHP(roleId) {
  return getRoleArrayValue('maxHP', roleId, 0);
}

export function getPlayerMP(roleId) {
  return getRoleArrayValue('MP', roleId, 0);
}

export function getPlayerMaxMP(roleId) {
  return getRoleArrayValue('maxMP', roleId, 0);
}

export const playerRoles$ = createAdapterObservable({
  name: 'playerState.roles',
  observe: () => playerRolesStream,
  getValue: getPlayerRolesSnapshot
});

export const equipmentEffects$ = createAdapterObservable({
  name: 'playerState.equipmentEffects',
  observe: () => equipmentEffectsStream,
  getValue: getEquipmentEffectsMatrix
});

export const playerStatus$ = createAdapterObservable({
  name: 'playerState.status',
  observe: () => playerStatusStream,
  getValue: getPlayerStatusMatrix
});

export const poisonStatus$ = createAdapterObservable({
  name: 'playerState.poisonStatus',
  observe: () => poisonStatusStream,
  getValue: getPoisonStatusMatrix
});

export const maxPartyIndex$ = createAdapterObservable({
  name: 'playerState.maxPartyIndex',
  observe: () => maxPartyIndexStream,
  getValue: getMaxPartyMemberIndex
});

export function getPlayerLevel(roleId) {
  return getRoleArrayValue('level', roleId, 0);
}

export function getPlayerNameId(roleId) {
  return getRoleArrayValue('name', roleId, 0);
}

export function getPlayerAttackStrength(roleId) {
  return getRoleArrayValue('attackStrength', roleId, 0);
}

export function getPlayerMagicStrength(roleId) {
  return getRoleArrayValue('magicStrength', roleId, 0);
}

export function getPlayerDefense(roleId) {
  return getRoleArrayValue('defense', roleId, 0);
}

export function getPlayerDexterity(roleId) {
  return getRoleArrayValue('dexterity', roleId, 0);
}

export function getPlayerFleeRate(roleId) {
  return getRoleArrayValue('fleeRate', roleId, 0);
}

export function getPlayerAvatarId(roleId) {
  return getRoleArrayValue('avatar', roleId, 0);
}

export function getPlayerEquipment(partIndex, roleId) {
  const roles = getRolesSnapshot();
  if (roles && Array.isArray(roles.equipment)) {
    const part = roles.equipment[partIndex];
    if (part && typeof part[roleId] === 'number') {
      return part[roleId];
    }
  }
  return 0;
}

export function getPlayerMagicSlots(roleId) {
  const slots = getMagicSlots();
  if (!Array.isArray(slots) || slots.length === 0) {
    return [];
  }
  const result = [];
  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index];
    result.push(slot && typeof slot[roleId] === 'number' ? slot[roleId] : 0);
  }
  return result;
}

export function getPlayerMagicAt(slotIndex, roleId) {
  const slots = getMagicSlots();
  if (Array.isArray(slots)) {
    const slot = slots[slotIndex];
    if (slot && typeof slot[roleId] === 'number') {
      return slot[roleId];
    }
  }
  return 0;
}

export function getEquipmentEffectScalar(part, field, roleId) {
  const effects = getEquipmentMatrix();
  const effect = effects && effects[part];
  if (!effect || !effect[field]) {
    return 0;
  }
  const collection = effect[field];
  if (!collection) {
    return 0;
  }
  const value = collection[roleId];
  return typeof value === 'number' ? value : 0;
}

export function getEquipmentEffectElemental(part, attr, roleId) {
  const effects = getEquipmentMatrix();
  const effect = effects && effects[part];
  if (!effect || !effect.elementalResistance) {
    return 0;
  }
  const row = effect.elementalResistance[attr];
  if (!row) {
    return 0;
  }
  const value = row[roleId];
  return typeof value === 'number' ? value : 0;
}

export function getPlayerStatusValue(roleId, statusId) {
  const matrix = getPlayerStatusMatrix();
  if (Array.isArray(matrix) && matrix[roleId]) {
    const row = matrix[roleId];
    if (row && typeof row === 'object') {
      if (row.uint8Array) {
        return row.uint8Array[statusId] || 0;
      }
      const value = row[statusId];
      return typeof value === 'number' ? value : 0;
    }
  }
  return 0;
}

export function getPlayerStatusRow(roleId) {
  const matrix = getPlayerStatusMatrix();
  if (Array.isArray(matrix) && matrix[roleId]) {
    return matrix[roleId];
  }
  const globalMatrix = stateService.getGlobal('playerStatus');
  if (Array.isArray(globalMatrix) && globalMatrix[roleId]) {
    return globalMatrix[roleId];
  }
  return [];
}

export function getPlayerRolesSnapshot() {
  return getRolesSnapshot();
}

export function getPlayerRoleField(field) {
  return getRoleArray(field);
}

export function getPlayerRoleFieldValue(field, roleId, fallback) {
  if (arguments.length >= 3 && typeof fallback !== 'undefined') {
    return getRoleArrayValue(field, roleId, fallback);
  }
  return getRoleArrayValue(field, roleId);
}

export function getPlayerMagicSound(roleId) {
  return getRoleArrayValue('magicSound', roleId, 0);
}

export function getPlayerAttackSound(roleId) {
  return getRoleArrayValue('attackSound', roleId, 0);
}

export function getPlayerCriticalSound(roleId) {
  return getRoleArrayValue('criticalSound', roleId, 0);
}

export function getPlayerWeaponSound(roleId) {
  return getRoleArrayValue('weaponSound', roleId, 0);
}

export function getPlayerCoverSound(roleId) {
  return getRoleArrayValue('coverSound', roleId, 0);
}

export function getPlayerDyingSound(roleId) {
  return getRoleArrayValue('dyingSound', roleId, 0);
}

export function getPlayerDeathSound(roleId) {
  return getRoleArrayValue('deathSound', roleId, 0);
}

export function getPlayerCoveredBy(roleId) {
  return getRoleArrayValue('coveredBy', roleId, 0);
}

export function getPlayerRoleWord(fieldIndex, roleId, fallback = 0) {
  if (typeof fieldIndex !== 'number' || typeof roleId !== 'number') {
    return fallback;
  }
  const snapshot = getRolesSnapshot();
  const maxRoles = resolveMaxRoles(snapshot);
  const buffer = getPlayerRolesBuffer(snapshot);
  if (buffer && maxRoles > 0) {
    const offset = (fieldIndex * maxRoles + roleId) * 2;
    if (ArrayBuffer.isView(buffer)) {
      const viewArray = toUint8Array(buffer);
      const byteLength = viewArray.byteLength;
      if (offset >= 0 && offset + 2 <= byteLength) {
        try {
          const view = new DataView(viewArray.buffer, viewArray.byteOffset, byteLength);
          return view.getUint16(offset, false);
        } catch (err) {
          // fall through to array read
        }
      }
    }
    if (Array.isArray(buffer) && offset >= 0 && offset + 1 < buffer.length) {
      return toUnsignedWord(buffer[offset], buffer[offset + 1]);
    }
  }
  return fallback;
}

export function getEquipmentEffect(partIndex) {
  const matrix = getEquipmentMatrix();
  if (Array.isArray(matrix)) {
    return matrix[partIndex] || null;
  }
  return null;
}

export function findPlayerMagicSlot(roleId, magicId) {
  if (!Number.isFinite(roleId) || !Number.isFinite(magicId)) {
    return -1;
  }
  const slots = getPlayerMagicSlots(roleId);
  if (Array.isArray(slots)) {
    for (let index = 0; index < slots.length; index++) {
      if (slots[index] === magicId) {
        return index;
      }
    }
  }
  return -1;
}

export default {
  getPlayerRolesSnapshot,
  getPlayerHP,
  getPlayerMaxHP,
  getPlayerMP,
  getPlayerMaxMP,
  getPlayerLevel,
  getPlayerNameId,
  getPlayerAttackStrength,
  getPlayerMagicStrength,
  getPlayerDefense,
  getPlayerDexterity,
  getPlayerFleeRate,
  getPlayerAvatarId,
  getPlayerEquipment,
  getPlayerMagicSlotCount,
  getPlayerMagicSlots,
  getPlayerMagicAt,
  getEquipmentEffectScalar,
  getEquipmentEffectElemental,
  getPlayerStatusValue,
  getPlayerStatusMatrix,
  getPlayerRoleField,
  getPlayerRoleFieldValue,
  getPlayerMagicSound,
  getPlayerAttackSound,
  getPlayerCriticalSound,
  getPlayerWeaponSound,
  getPlayerCoverSound,
  getPlayerDyingSound,
  getPlayerDeathSound,
  getPlayerCoveredBy,
  getPlayerRoleWord,
  getMaxPartyMemberIndex,
  getEquipmentEffect,
  findPlayerMagicSlot,
  playerRoles$,
  equipmentEffects$,
  playerStatus$,
  poisonStatus$,
  maxPartyIndex$
};
