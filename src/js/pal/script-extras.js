import worldService from '../../services/world-service.js';

console.trace('script_extras module load');

var surface = null
var abs = Math.abs;
var floor = Math.floor;

var script_extras = {};
var script = null;

function getPartyIndexByRole(role) {
  var party = worldService.getParty();
  for (var i = 0; i < party.length; i++) {
    if (party[i] && party[i].playerRole === role) {
      return i;
    }
  }
  return -1;
}

function getPlayerStatusValue(role, statusID) {
  var row = worldService.getPlayerStatus(role);
  return row && row[statusID] ? row[statusID] : 0;
}

function setPlayerStatusValue(role, statusID, value) {
  worldService.mutatePlayerStatusEntry(role, function(statusRow) {
    if (statusRow) {
      statusRow[statusID] = value;
    }
    return statusRow;
  });
}

function getEquipmentEffectScalar(part, field, role) {
  var effect = worldService.getEquipmentEffect(part);
  if (!effect || !effect[field]) {
    return 0;
  }
  var collection = effect[field];
  if (!collection) {
    return 0;
  }
  return collection[role] || 0;
}

function getEquipmentEffectElemental(part, attr, role) {
  var effect = worldService.getEquipmentEffect(part);
  if (!effect || !effect.elementalResistance) {
    return 0;
  }
  var row = effect.elementalResistance[attr];
  if (!row) {
    return 0;
  }
  return row[role] || 0;
}

script_extras.init = function*(surf, _script) {
  log.debug('[SCRIPT] init extras');
  script = _script;
  surface = surf;

  script.updateEquipments = function*() {
    worldService.resetEquipmentEffects();
    for (var i=0; i<Const.MAX_PLAYER_ROLES; ++i) {
      for (var j=0; j<Const.MAX_PLAYER_EQUIPMENTS; ++j) {
        var w = worldService.getPlayerEquipment(j, i);
        if (w != 0) {
          var obj = worldService.getObjectEntry(w);
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
            var data = worldService.getObjectEntry(poisonId);
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

    var currentHP = worldService.getPlayerHP(role);
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
      var capacity = worldService.getInventoryCapacity() || Const.MAX_INVENTORY;
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
    var inventory = worldService.getInventory();
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
      var capacity = worldService.getInventoryCapacity() || Const.MAX_INVENTORY;
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
    var currentHP = worldService.getPlayerHP(role);
    if (currentHP <= 0) {
      return false;
    }

    var maxHP = worldService.getPlayerMaxHP(role);
    var nextHP = currentHP + HP;
    if (nextHP < 0) {
      nextHP = 0;
    } else if (maxHP && nextHP > maxHP) {
      nextHP = maxHP;
    }
    worldService.setPlayerHP(role, nextHP);

    var currentMP = worldService.getPlayerMP(role);
    var maxMP = worldService.getPlayerMaxMP(role);
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
          var poisonObject = worldService.getObjectEntry(poisonID);
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
        var data = worldService.getObjectEntry(poisonId);
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

    var poisonStatus = worldService.getPoisonStatusMatrix();
    for (var i=0; i<Const.MAX_POISONS; ++i) {
      var row = poisonStatus[i];
      if (!row || !row[index]) {
        continue;
      }
      var p = row[index];
      var data = worldService.getObjectEntry(p.poisonID);
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

    var poisonStatus = worldService.getPoisonStatusMatrix();
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
    var w = worldService.getPlayerAttackStrength(role);
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      w += getEquipmentEffectScalar(i, 'attackStrength', role);
    }
    return w;
  };

  script.getPlayerMagicStrength = function(role) {
    var w = worldService.getPlayerMagicStrength(role);
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      w += getEquipmentEffectScalar(i, 'magicStrength', role);
    }
    return w;
  };

  script.getPlayerDefense = function(role) {
    var w = worldService.getPlayerDefense(role);
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      w += getEquipmentEffectScalar(i, 'defense', role);
    }
    return w;
  };

  script.getPlayerDexterity = function(role) {
    var w = worldService.getPlayerDexterity(role);
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      w += getEquipmentEffectScalar(i, 'dexterity', role);
    }
    return w;
  };

  script.getPlayerFleeRate = function(role) {
    var w = worldService.getPlayerFleeRate(role);
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      w += getEquipmentEffectScalar(i, 'fleeRate', role);
    }
    return w;
  };

  script.getPlayerPoisonResistance = function(role) {
    var roles = worldService.getPlayerRoles();
    var w = roles && roles.poisonResistance ? roles.poisonResistance[role] || 0 : 0;
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      w += getEquipmentEffectScalar(i, 'poisonResistance', role);
    }
    return w;
  };

  script.getPlayerElementalResistance = function(role, attr) {
    var base = worldService.getPlayerRoles();
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
    var roles = worldService.getPlayerRoles();
    var w = roles && roles.spriteNumInBattle ? roles.spriteNumInBattle[role] || 0 : 0;
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      var effect = worldService.getEquipmentEffect(i);
      var x = effect && effect.spriteNumInBattle ? effect.spriteNumInBattle[role] || 0 : 0;
      if (x != 0) {
        w = x;
      }
    }

    return w;
  };

  script.getPlayerCooperativeMagic = function(role) {
    var roles = worldService.getPlayerRoles();
    var w = roles && roles.cooperativeMagic ? roles.cooperativeMagic[role] || 0 : 0;
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      var effect = worldService.getEquipmentEffect(i);
      var x = effect && effect.cooperativeMagic ? effect.cooperativeMagic[role] || 0 : 0;
      if (x != 0) {
        w = x;
      }
    }

    return w;
  };

  script.playerCanAttackAll = function(role) {
    for (var i = 0; i < Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      var effect = worldService.getEquipmentEffect(i);
      if (effect && effect.attackAll && effect.attackAll[role] != 0){
        return true;
      }
    }

    return false;
  };

  script.addMagic = function(role, magic) {
    if (worldService.findPlayerMagicSlot(role, magic) >= 0) {
      // already have this magic
      return false;
    }

    var slots = worldService.getPlayerMagicSlots(role);
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
    var slotIndex = worldService.findPlayerMagicSlot(role, magic);
    if (slotIndex >= 0) {
      worldService.setPlayerMagicSlot(role, slotIndex, 0);
    }
  };

  script.playerLevelUp = function(role, level) {
    var requestedLevels = Math.max(0, level | 0);
    var currentLevel = worldService.getPlayerLevel(role);
    var targetLevel = currentLevel + requestedLevels;
    if (targetLevel > Const.MAX_LEVELS) {
      targetLevel = Const.MAX_LEVELS;
    }
    var actualGain = targetLevel - currentLevel;
    if (actualGain <= 0) {
      return;
    }

    worldService.setPlayerLevel(role, targetLevel);

    var maxHP = worldService.getPlayerMaxHP(role);
    var maxMP = worldService.getPlayerMaxMP(role);
    var attack = worldService.getPlayerAttackStrength(role);
    var magic = worldService.getPlayerMagicStrength(role);
    var defense = worldService.getPlayerDefense(role);
    var dexterity = worldService.getPlayerDexterity(role);
    var flee = worldService.getPlayerFleeRate(role);

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
    var maxPartyMemberIndex = worldService.getMaxPartyMemberIndex();
    var party = worldService.getParty();
    for (var i=0; i<=maxPartyMemberIndex; ++i) {
      if (party[i] && party[i].playerRole == role) {
        return i;
      }
    }
    return -1;
  };
};

export default script_extras;
