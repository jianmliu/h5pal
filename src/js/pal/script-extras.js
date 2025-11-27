import traceModuleLoad from './util-trace';
import worldService from '../../services/world-service.ts';
import partyTrailAdapter from '../../services/party-trail-adapter.ts';
import scriptObjectAdapter from '../../services/script-object-adapter.ts';
import { inventorySignals } from '../../state/slices/inventory.ts';
import {
  getPlayerRolesSnapshot,
  getPlayerRoleFieldValue,
  getPlayerHP as getPlayerHPValue,
  getPlayerMaxHP as getPlayerMaxHPValue,
  getPlayerMP as getPlayerMPValue,
  getPlayerMaxMP as getPlayerMaxMPValue,
  getPlayerAttackStrength as getPlayerAttackValue,
  getPlayerMagicStrength as getPlayerMagicValue,
  getPlayerDefense as getPlayerDefenseValue,
  getPlayerDexterity as getPlayerDexterityValue,
  getPlayerFleeRate as getPlayerFleeRateValue,
  getEquipmentEffectScalar as getEquipmentEffectScalarFromAdapter,
  getEquipmentEffectElemental as getEquipmentEffectElementalFromAdapter,
  getPlayerStatusValue as getPlayerStatusValueFromAdapter,
  getPlayerEquipment as getPlayerEquipmentValue,
  getPlayerMagicSlots as getPlayerMagicSlotsValue,
  getPlayerLevel as getPlayerLevelValue,
  getPoisonStatusMatrix as getPoisonStatusMatrixValue,
  getEquipmentEffect as getEquipmentEffectValue,
  findPlayerMagicSlot as findPlayerMagicSlotValue,
  getMaxPartyMemberIndex as getMaxPartyMemberIndexValue
} from '../../services/player-state-adapter.ts';
traceModuleLoad('script_extras module load');

var surface = null
var abs = Math.abs;
var floor = Math.floor;

const inventorySlice = inventorySignals();
const inventoryItemsSignal = inventorySlice.items;
const inventoryCapacitySignal = inventorySlice.capacity;
const cashSignal = inventorySlice.cash;

const getEquipmentEffectScalar = getEquipmentEffectScalarFromAdapter;
const getEquipmentEffectElemental = getEquipmentEffectElementalFromAdapter;
const getPlayerStatusValue = getPlayerStatusValueFromAdapter;
const getPoisonStatusMatrix = getPoisonStatusMatrixValue;
const getEquipmentEffect = getEquipmentEffectValue;
const findPlayerMagicSlot = findPlayerMagicSlotValue;
const getMaxPartyMemberIndex = getMaxPartyMemberIndexValue;

function getInventoryList() {
  const items = inventoryItemsSignal.value;
  return Array.isArray(items) ? items : [];
}

function getInventorySlotFromSignal(index) {
  const items = inventoryItemsSignal.value;
  return (index >= 0 && index < items.length) ? items[index] : null;
}

function getInventoryCapacityFromSignal() {
  const value = inventoryCapacitySignal.value;
  if (Number.isFinite(value) && value > 0) {
    return value;
  }
  return Const.MAX_INVENTORY;
}

function getCashValue() {
  const value = cashSignal.value;
  return Number.isFinite(value) ? value : 0;
}

var script_extras = {};
var script = null;

function getPartyIndexByRole(role) {
  var party = worldService.getParty && worldService.getParty();
  if (!Array.isArray(party) || party.length === 0) {
    party = partyTrailAdapter.getPartyState();
  }
  for (var i = 0; i < party.length; i++) {
    if (party[i] && party[i].playerRole === role) {
      return i;
    }
  }
  return -1;
}

function setPlayerStatusValue(role, statusID, value) {
  worldService.mutatePlayerStatusEntry(role, function(statusRow) {
    if (statusRow) {
      statusRow[statusID] = value;
    }
    return statusRow;
  });
}

script_extras.init = function*(surf, _script) {
  log.debug('[SCRIPT] init extras');
  script = _script;
  surface = surf;

  script.updateEquipments = function*() {
    worldService.resetEquipmentEffects();
    for (var i=0; i<Const.MAX_PLAYER_ROLES; ++i) {
      for (var j=0; j<Const.MAX_PLAYER_EQUIPMENTS; ++j) {
        var w = getPlayerEquipmentValue(j, i);
        if (w != 0) {
          var obj = scriptObjectAdapter.getObjectEntry(w);
          if (!obj || !obj.item) {
            continue;
          }
          var nextScript = yield script.runTriggerScript(obj.item.scriptOnEquip, i);
          worldService.mutateObjectEntry(w, function(entry) {
            if (entry && entry.item) {
              entry.item.scriptOnEquip = nextScript;
            }
            return entry;
          });
        }
      }
    }
  };

  script.removeEquipmentEffect = function(role, part) {
    worldService.clearEquipmentEffect(part, role);
    if (part === BodyPart.Hand) {
      setPlayerStatusValue(role, PlayerStatus.DualAttack, 0);
    } else if (part === BodyPart.Wear) {
      var partyIndex = getPartyIndexByRole(role);
      if (partyIndex >= 0) {
        worldService.mutatePoisonStatus(function(poisonStatus) {
          if (!Array.isArray(poisonStatus)) {
            return poisonStatus;
          }
          for (var poisonIndex = 0; poisonIndex < poisonStatus.length; poisonIndex++) {
            var row = poisonStatus[poisonIndex];
            if (!row || !row[partyIndex]) {
              continue;
            }
            var entry = row[partyIndex];
            var poisonId = entry.poisonID;
            if (!poisonId) {
              continue;
            }
            var data = scriptObjectAdapter.getObjectEntry(poisonId);
            var level = data && data.poison ? data.poison.poisonLevel : 0;
            if (level < 99) {
              entry.poisonID = 0;
              entry.poisonScript = 0;
            }
          }
          return poisonStatus;
        });
      }
    }
  };

  script.setPlayerStatus = function(role, statusID, numRound) {
    function setStatusValue(targetRole, index, value) {
      worldService.mutatePlayerStatusEntry(targetRole, function(statusRow) {
        if (statusRow) {
          statusRow[index] = value;
        }
        return statusRow;
      });
    }

    var currentHP = getPlayerHPValue(role);
    var currentValue = getPlayerStatusValue(role, statusID);
    var hasteValue = getPlayerStatusValue(role, PlayerStatus.Haste);
    var slowValue = getPlayerStatusValue(role, PlayerStatus.Slow);

    if (PAL_CLASSIC) {
      if (statusID == PlayerStatus.Slow &&
          hasteValue > 0) {
        // Remove the haste status
        script.removePlayerStatus(role, PlayerStatus.Haste);
        return;
      }
      if (statusID == PlayerStatus.Haste &&
          slowValue > 0) {
        // Remove the haste status
        script.removePlayerStatus(role, PlayerStatus.Slow);
        return;
      }
    }
    switch (statusID) {
      case PlayerStatus.Confused:
      case PlayerStatus.Sleep:
      case PlayerStatus.Silence:
      //ifdef PAL_CLASSIC
      case PlayerStatus.Paralyzed:
      //else
      case PlayerStatus.Slow:
      //endif
        // for "bad" statuses, don't set the status when we already have it
        if (currentHP != 0 && currentValue == 0) {
          setStatusValue(role, statusID, numRound);
        }
        break;
      case PlayerStatus.Puppet:
        // only allow dead players for "puppet" status
        if (currentHP == 0 && currentValue < numRound) {
          setStatusValue(role, statusID, numRound);
        }
        break;
      case PlayerStatus.Bravery:
      case PlayerStatus.Protect:
      case PlayerStatus.DualAttack:
      case PlayerStatus.Haste:
        // for "good" statuses, reset the status if the status to be set lasts longer
        if (currentHP != 0 && currentValue < numRound) {
           setStatusValue(role, statusID, numRound);
        }
        break;
      default:
        game.error('[SCRIPT] 未知statusID: %d', statusID);
        break;
    }
  };

  script.removePlayerStatus = function(role, statusID) {
    // Don't remove effects of equipments
    if (getPlayerStatusValue(role, statusID) <= 999) {
      worldService.mutatePlayerStatusEntry(role, function(statusRow) {
        if (statusRow) {
          statusRow[statusID] = 0;
        }
        return statusRow;
      });
    }
  };

  script.clearAllPlayerStatus = function() {
    worldService.mutatePlayerStatus(function(statusMatrix) {
      if (!statusMatrix) {
        return statusMatrix;
      }
      for (var i = 0; i < Const.MAX_PLAYER_ROLES; ++i) {
        var statusRow = statusMatrix[i];
        if (!statusRow) {
          continue;
        }
        for (var j = 0; j < PlayerStatus.All; ++j) {
          // Don't remove effects of equipments
          if (statusRow[j] <= 999) {
            statusRow[j] = 0;
          }
        }
      }
      return statusMatrix;
    });
  };

  script.addItemToInventory = function(objectID, num) {
    if (objectID == 0) {
      return false;
    }
    if (num == 0) {
      num = 1;
    }

    var success = false;
    worldService.mutateInventory(function(inventory) {
      var capacity = getInventoryCapacityFromSignal();
      var index = 0;
      var found = false;
      while (index < capacity) {
        var slot = inventory[index];
        if (!slot) {
          break;
        }
        if (slot.item === objectID) {
          found = true;
          break;
        }
        if (slot.item === 0) {
          break;
        }
        index++;
      }

      if (num > 0) {
        if (index >= capacity) {
          return inventory;
        }
        var target = inventory[index];
        if (!target) {
          return inventory;
        }
        if (found) {
          target.amount += num;
          if (target.amount > 99) {
            target.amount = 99;
          }
        } else {
          target.item = objectID;
          target.amount = Math.min(num, 99);
        }
        success = true;
        return inventory;
      }

      if (!found) {
        success = false;
        return inventory;
      }

      var removal = num * -1;
      var removalTarget = inventory[index];
      if (!removalTarget) {
        success = false;
        return inventory;
      }
      if (removalTarget.amount < removal) {
        removalTarget.amount = 0;
        success = false;
        return inventory;
      }
      removalTarget.amount -= removal;
      success = true;
      return inventory;
    });

    return success;
  };

  script.getItemAmount = function(item) {
    var inventory = getInventoryList();
    for (var i = 0; i < inventory.length; ++i) {
      var slot = inventory[i];
      if (!slot) {
        continue;
      }
      if (slot.item === 0) {
        return 0;
      }
      if (slot.item === item) {
        return slot.amount;
      }
    }
    return 0;
  };

  script.compressInventory = function() {
    worldService.mutateInventory(function(inventory) {
      if (!inventory) {
        return inventory;
      }
      var j = 0;
      var capacity = getInventoryCapacityFromSignal();
      for (var i = 0; i < capacity; ++i) {
        var slot = inventory[i];
        if (!slot || slot.item == 0) {
          break;
        }
        if (slot.amount > 0) {
          var target = inventory[j];
          if (target && target !== slot) {
            memcpy(target.uint8Array, slot.uint8Array, target.uint8Array.length);
          }
          j++;
        }
      }
      for (; j < capacity; ++j) {
        if (inventory[j]) {
          memset(inventory[j].uint8Array, 0, inventory[j].uint8Array.length);
        }
      }
      return inventory;
    });
  };

  script.increaseHPMP = function(role, HP, MP) {
    var currentHP = getPlayerHPValue(role);
    if (currentHP <= 0) {
      return false;
    }

    var maxHP = getPlayerMaxHPValue(role);
    var nextHP = currentHP + HP;
    if (nextHP < 0) {
      nextHP = 0;
    } else if (maxHP && nextHP > maxHP) {
      nextHP = maxHP;
    }
    worldService.setPlayerHP(role, nextHP);

    var currentMP = getPlayerMPValue(role);
    var maxMP = getPlayerMaxMPValue(role);
    var nextMP = currentMP + MP;
    if (nextMP < 0) {
      nextMP = 0;
    } else if (maxMP && nextMP > maxMP) {
      nextMP = maxMP;
    }
    worldService.setPlayerMP(role, nextMP);

    return true;
  };

  script.addPoisonForPlayer = function(role, poisonID) {
    var index = findIndexByPlayerRole(role);
    if (index < 0) return;

    worldService.mutatePoisonStatus(function(poisonStatus) {
      if (!poisonStatus) {
        return poisonStatus;
      }
      var slotIndex = 0;
      for (slotIndex = 0; slotIndex < Const.MAX_POISONS; ++slotIndex) {
        var row = poisonStatus[slotIndex];
        if (!row) {
          continue;
        }
        var entry = row[index];
        if (!entry) {
          continue;
        }
        if (entry.poisonID == 0) {
          break;
        }
        if (entry.poisonID == poisonID) {
          return poisonStatus;
        }
      }
      if (slotIndex < Const.MAX_POISONS) {
        var targetRow = poisonStatus[slotIndex];
        if (targetRow && targetRow[index]) {
          var poisonObject = scriptObjectAdapter.getObjectEntry(poisonID);
          var poisonData = poisonObject && poisonObject.poison ? poisonObject.poison : null;
          targetRow[index].poisonID = poisonID;
          targetRow[index].poisonScript = poisonData ? poisonData.playerScript : 0;
        }
      }
      return poisonStatus;
    });
  };

  script.curePoisonByKind = function(role, poisonID) {
    var index = findIndexByPlayerRole(role);
    if (index < 0) return;

    worldService.mutatePoisonStatus(function(poisonStatus) {
      if (!poisonStatus) {
        return poisonStatus;
      }
      for (var i = 0; i < Const.MAX_POISONS; ++i) {
        var row = poisonStatus[i];
        if (!row || !row[index]) {
          continue;
        }
        var entry = row[index];
        if (entry.poisonID == poisonID) {
          entry.poisonID = 0;
          entry.poisonScript = 0;
        }
      }
      return poisonStatus;
    });
  };

  script.curePoisonByLevel = function(role, maxLevel) {
    var index = findIndexByPlayerRole(role);
    if (index < 0) return;

    worldService.mutatePoisonStatus(function(poisonStatus) {
      if (!poisonStatus) {
        return poisonStatus;
      }
      for (var i = 0; i < Const.MAX_POISONS; ++i) {
        var row = poisonStatus[i];
        if (!row || !row[index]) {
          continue;
        }
        var entry = row[index];
        var poisonId = entry.poisonID;
        if (poisonId == 0) {
          continue;
        }
        var data = scriptObjectAdapter.getObjectEntry(poisonId);
        var poisonData = data && data.poison ? data.poison : null;
        if (poisonData && poisonData.poisonLevel <= maxLevel) {
          entry.poisonID = 0;
          entry.poisonScript = 0;
        }
      }
      return poisonStatus;
    });
  };

  script.isPlayerPoisonedByLevel = function(role, minLevel) {
    var index = findIndexByPlayerRole(role);
    if (index < 0) return false;

    var poisonStatus = getPoisonStatusMatrix();
    for (var i=0; i<Const.MAX_POISONS; ++i) {
      var row = poisonStatus[i];
      if (!row || !row[index]) {
        continue;
      }
      var p = row[index];
      var data = scriptObjectAdapter.getObjectEntry(p.poisonID);
      var poisonInfo = data && data.poison ? data.poison : null;
      var w = poisonInfo ? poisonInfo.poisonLevel : 0;
      if (w >= 99) {
        // Ignore poisons which has a level of 99 (usually effect of equipment)
        continue;
      }
      if (w >= minLevel) {
        return true;
      }
    }
    return false;
  };

  script.isPlayerPoisonedByKind = function(role, poisonID) {
    var index = findIndexByPlayerRole(role);
    if (index < 0) return false;

    var poisonStatus = getPoisonStatusMatrix();
    for (var i=0; i<Const.MAX_POISONS; ++i) {
      var row = poisonStatus[i];
      if (!row || !row[index]) {
        continue;
      }
      if (row[index].poisonID == poisonID) {
        return true;
      }
    }
    return false;
  };

  script.getPlayerAttackStrength = function(role) {
    var w = getPlayerAttackValue(role);
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      w += getEquipmentEffectScalar(i, 'attackStrength', role);
    }
    return w;
  };

  script.getPlayerMagicStrength = function(role) {
    var w = getPlayerMagicValue(role);
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      w += getEquipmentEffectScalar(i, 'magicStrength', role);
    }
    return w;
  };

  script.getPlayerDefense = function(role) {
    var w = getPlayerDefenseValue(role);
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      w += getEquipmentEffectScalar(i, 'defense', role);
    }
    return w;
  };

  script.getPlayerDexterity = function(role) {
    var w = getPlayerDexterityValue(role);
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      w += getEquipmentEffectScalar(i, 'dexterity', role);
    }
    return w;
  };

  script.getPlayerFleeRate = function(role) {
    var w = getPlayerFleeRateValue(role);
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      w += getEquipmentEffectScalar(i, 'fleeRate', role);
    }
    return w;
  };

  script.getPlayerPoisonResistance = function(role) {
    var roles = getPlayerRolesSnapshot();
    var w = roles && roles.poisonResistance ? roles.poisonResistance[role] || 0 : 0;
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      w += getEquipmentEffectScalar(i, 'poisonResistance', role);
    }
    return w;
  };

  script.getPlayerElementalResistance = function(role, attr) {
    var base = getPlayerRolesSnapshot();
    var w = base && base.elementalResistance && base.elementalResistance[attr]
      ? base.elementalResistance[attr][role] || 0
      : 0;
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      w += getEquipmentEffectElemental(i, attr, role);
    }
    if (w > 100) {
      w = 100;
    }

    return w;
  };

  script.getPlayerBattleSprite = function(role) {
    var roles = getPlayerRolesSnapshot();
    var w = roles && roles.spriteNumInBattle ? roles.spriteNumInBattle[role] || 0 : 0;
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      var effect = getEquipmentEffect(i);
      var x = effect && effect.spriteNumInBattle ? effect.spriteNumInBattle[role] || 0 : 0;
      if (x != 0) {
        w = x;
      }
    }

    return w;
  };

  script.getPlayerCooperativeMagic = function(role) {
    var roles = getPlayerRolesSnapshot();
    var w = roles && roles.cooperativeMagic ? roles.cooperativeMagic[role] || 0 : 0;
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      var effect = getEquipmentEffect(i);
      var x = effect && effect.cooperativeMagic ? effect.cooperativeMagic[role] || 0 : 0;
      if (x != 0) {
        w = x;
      }
    }

    return w;
  };

  script.playerCanAttackAll = function(role) {
    for (var i = 0; i < Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      var effect = getEquipmentEffect(i);
      if (effect && effect.attackAll && effect.attackAll[role] != 0){
        return true;
      }
    }

    return false;
  };

  script.addMagic = function(role, magic) {
    if (findPlayerMagicSlot(role, magic) >= 0) {
      // already have this magic
      return false;
    }

    var slots = getPlayerMagicSlotsValue(role);
    var targetSlot = -1;
    for (var i = 0; i < Const.MAX_PLAYER_MAGICS && i < slots.length; ++i) {
      if (!slots[i]) {
        targetSlot = i;
        break;
      }
    }
    if (targetSlot < 0) {
      // Not enough slots
      return false;
    }

    worldService.setPlayerMagicSlot(role, targetSlot, magic);

    return true;
  };

  script.removeMagic = function(role, magic) {
    var slotIndex = findPlayerMagicSlot(role, magic);
    if (slotIndex >= 0) {
      worldService.setPlayerMagicSlot(role, slotIndex, 0);
    }
  };

  script.playerLevelUp = function(role, level) {
    var requestedLevels = Math.max(0, level | 0);
    var currentLevel = getPlayerLevelValue(role);
    var targetLevel = currentLevel + requestedLevels;
    if (targetLevel > Const.MAX_LEVELS) {
      targetLevel = Const.MAX_LEVELS;
    }
    var actualGain = targetLevel - currentLevel;
    if (actualGain <= 0) {
      return;
    }

    worldService.setPlayerLevel(role, targetLevel);

    var maxHP = getPlayerMaxHPValue(role);
    var maxMP = getPlayerMaxMPValue(role);
    var attack = getPlayerAttackValue(role);
    var magic = getPlayerMagicValue(role);
    var defense = getPlayerDefenseValue(role);
    var dexterity = getPlayerDexterityValue(role);
    var flee = getPlayerFleeRateValue(role);

    for (var i = 0; i < actualGain; i++) {
      // Increase player's stats
      maxHP      += 10 + randomLong(0, 8);
      maxMP      +=  8 + randomLong(0, 6);
      attack     +=  4 + randomLong(0, 1);
      magic      +=  4 + randomLong(0, 1);
      defense    +=  2 + randomLong(0, 1);
      dexterity  +=  2 + randomLong(0, 1);
      flee       +=  2;
    }

    function stat_limit(t) {
      return t > 999 ? 999 : t;
    }

    worldService.setPlayerMaxHP(role, stat_limit(maxHP));
    worldService.setPlayerMaxMP(role, stat_limit(maxMP));
    worldService.setPlayerAttackStrength(role, stat_limit(attack));
    worldService.setPlayerMagicStrength(role, stat_limit(magic));
    worldService.setPlayerDefense(role, stat_limit(defense));
    worldService.setPlayerDexterity(role, stat_limit(dexterity));
    worldService.setPlayerFleeRate(role, stat_limit(flee));

    // Reset experience points to zero
    worldService.mutateExpState(function(expState) {
      if (expState && expState.primaryExp && expState.primaryExp[role]) {
        expState.primaryExp[role].exp = 0;
        expState.primaryExp[role].level = targetLevel;
      }
      return expState;
    });
  };

  function findIndexByPlayerRole(role) {
    var maxPartyMemberIndex = getMaxPartyMemberIndex();
    var party = partyTrailAdapter.getPartyState();
    for (var i=0; i<=maxPartyMemberIndex; ++i) {
      if (party[i] && party[i].playerRole == role) {
        return i;
      }
    }
    return -1;
  };
};

export default script_extras;
