import worldService from './world-service.js';
import { playerStateSignals } from '../state/slices/player-state.js';
import { statusSignals } from '../state/slices/status-matrices.js';
import { viewportSignals } from '../state/slices/viewport.js';

const playerStateSlice = playerStateSignals();
const rolesSignal = playerStateSlice.roles;
const equipmentEffectSignal = playerStateSlice.equipmentEffect;

const statusSlice = statusSignals();
const playerStatusSignal = statusSlice.player;

const viewportSlice = viewportSignals();
const maxPartyIndexSignal = viewportSlice.maxPartyIndex;

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (ArrayBuffer.isView(value) && typeof value.slice === 'function') {
    return Array.from(value.slice());
  }
  return [];
}

function getRolesSnapshot() {
  const roles = rolesSignal.value;
  if (roles) {
    return roles;
  }
  return worldService.getPlayerRoles();
}

function getRoleArray(key) {
  const roles = getRolesSnapshot();
  if (!roles || typeof roles !== 'object') {
    return [];
  }
  return ensureArray(roles[key]);
}

function getRoleArrayValue(key, roleId, fallback = 0) {
  const arr = getRoleArray(key);
  if (roleId < 0 || roleId >= arr.length) {
    return fallback;
  }
  const value = arr[roleId];
  return typeof value === 'number' ? value : fallback;
}

function getEquipmentMatrix() {
  const effects = equipmentEffectSignal.value;
  if (effects) {
    return effects;
  }
  return worldService.getEquipmentEffects ? worldService.getEquipmentEffects() : [];
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
  const fallback = worldService.getPlayerRoles();
  if (fallback && Array.isArray(fallback.magic)) {
    return fallback.magic;
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
  return worldService.getPlayerStatusMatrix();
}

export function getMaxPartyMemberIndex() {
  const value = maxPartyIndexSignal.value;
  if (typeof value === 'number' && value >= -1) {
    return value;
  }
  return worldService.getMaxPartyMemberIndex();
}

export function getPlayerHP(roleId) {
  return getRoleArrayValue('HP', roleId, worldService.getPlayerHP(roleId));
}

export function getPlayerMaxHP(roleId) {
  return getRoleArrayValue('maxHP', roleId, worldService.getPlayerMaxHP(roleId));
}

export function getPlayerMP(roleId) {
  return getRoleArrayValue('MP', roleId, worldService.getPlayerMP(roleId));
}

export function getPlayerMaxMP(roleId) {
  return getRoleArrayValue('maxMP', roleId, worldService.getPlayerMaxMP(roleId));
}

export function getPlayerLevel(roleId) {
  return getRoleArrayValue('level', roleId, worldService.getPlayerLevel(roleId));
}

export function getPlayerNameId(roleId) {
  return getRoleArrayValue('name', roleId, worldService.getPlayerNameId(roleId));
}

export function getPlayerAttackStrength(roleId) {
  return getRoleArrayValue('attackStrength', roleId, worldService.getPlayerAttackStrength(roleId));
}

export function getPlayerMagicStrength(roleId) {
  return getRoleArrayValue('magicStrength', roleId, worldService.getPlayerMagicStrength(roleId));
}

export function getPlayerDefense(roleId) {
  return getRoleArrayValue('defense', roleId, worldService.getPlayerDefense(roleId));
}

export function getPlayerDexterity(roleId) {
  return getRoleArrayValue('dexterity', roleId, worldService.getPlayerDexterity(roleId));
}

export function getPlayerFleeRate(roleId) {
  return getRoleArrayValue('fleeRate', roleId, worldService.getPlayerFleeRate(roleId));
}

export function getPlayerAvatarId(roleId) {
  return getRoleArrayValue('avatar', roleId, worldService.getPlayerAvatarId(roleId));
}

export function getPlayerEquipment(partIndex, roleId) {
  const roles = getRolesSnapshot();
  if (roles && Array.isArray(roles.equipment)) {
    const part = roles.equipment[partIndex];
    if (part && typeof part[roleId] === 'number') {
      return part[roleId];
    }
  }
  return worldService.getPlayerEquipment(partIndex, roleId);
}

export function getPlayerMagicSlots(roleId) {
  const slots = getMagicSlots();
  if (!Array.isArray(slots) || slots.length === 0) {
    return worldService.getPlayerMagicSlots(roleId) || [];
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
  return worldService.getPlayerMagicAt(slotIndex, roleId);
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
  const fallback = worldService.getPlayerStatus(roleId);
  if (fallback) {
    const value = fallback[statusId];
    return typeof value === 'number' ? value : 0;
  }
  return 0;
}

export function getPlayerStatusRow(roleId) {
  const matrix = getPlayerStatusMatrix();
  if (Array.isArray(matrix) && matrix[roleId]) {
    return matrix[roleId];
  }
  return worldService.getPlayerStatus(roleId) || [];
}

export function getPlayerRolesSnapshot() {
  return getRolesSnapshot();
}

export function getPlayerRoleField(field) {
  return getRoleArray(field);
}

export function getPlayerRoleFieldValue(field, roleId, fallback = 0) {
  return getRoleArrayValue(field, roleId, fallback);
}

export function getPlayerMagicSound(roleId) {
  return getRoleArrayValue('magicSound', roleId, worldService.getPlayerMagicSound(roleId));
}

export function getPlayerAttackSound(roleId) {
  return getRoleArrayValue('attackSound', roleId, worldService.getPlayerAttackSound(roleId));
}

export function getPlayerCriticalSound(roleId) {
  return getRoleArrayValue('criticalSound', roleId, worldService.getPlayerCriticalSound(roleId));
}

export function getPlayerWeaponSound(roleId) {
  return getRoleArrayValue('weaponSound', roleId, worldService.getPlayerWeaponSound(roleId));
}

export function getPlayerCoverSound(roleId) {
  return getRoleArrayValue('coverSound', roleId, worldService.getPlayerCoverSound(roleId));
}

export function getPlayerDyingSound(roleId) {
  return getRoleArrayValue('dyingSound', roleId, worldService.getPlayerDyingSound(roleId));
}

export function getPlayerDeathSound(roleId) {
  return getRoleArrayValue('deathSound', roleId, worldService.getPlayerDeathSound(roleId));
}

export function getPlayerCoveredBy(roleId) {
  return getRoleArrayValue('coveredBy', roleId, worldService.getPlayerCoveredBy(roleId));
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
  getMaxPartyMemberIndex
};
