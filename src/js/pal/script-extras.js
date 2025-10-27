import stateService from '../../services/state-service.js';

console.trace('script_extras module load');

var surface = null
var abs = Math.abs;
var floor = Math.floor;

var script_extras = {};
var script = null;

function mutateGlobalValue(key, mutator) {
  return stateService.mutateGlobal(key, function(current) {
    if (typeof mutator !== 'function') {
      return current;
    }
    const result = mutator(current);
    return typeof result === 'undefined' ? current : result;
  });
}

function mutateGlobalEntry(key, index, mutator) {
  return mutateGlobalValue(key, function(collection) {
    if (!collection || typeof mutator !== 'function') {
      return collection;
    }
    const numericIndex = Number(index);
    if (Number.isNaN(numericIndex) || collection[numericIndex] == null) {
      return collection;
    }
    mutator(collection[numericIndex], collection, numericIndex);
    return collection;
  });
}

function mutateGameDataValue(key, mutator) {
  return stateService.mutateGameData(key, function(current) {
    if (typeof mutator !== 'function') {
      return current;
    }
    const result = mutator(current);
    return typeof result === 'undefined' ? current : result;
  });
}

script_extras.init = function*(surf, _script) {
  log.debug('[SCRIPT] init extras');
  script = _script;
  surface = surf;

  script.updateEquipments = function*() {
    var playerRoles = GameData.playerRoles;
    memset(Global.equipmentEffect.uint8Array, 0, Global.equipmentEffect.uint8Array.length);
    for (var i=0; i<Const.MAX_PLAYER_ROLES; ++i) {
      for (var j=0; j<Const.MAX_PLAYER_EQUIPMENTS; ++j) {
        var w = playerRoles.equipment[j][i];
        if (w != 0) {
          var obj = GameData.object[w];
          obj.item.scriptOnEquip = yield script.runTriggerScript(obj.item.scriptOnEquip, i);
        }
      }
    }
  };

  script.removeEquipmentEffect = function(role, part) {
    var playerRoles = Global.equipmentEffect[part];
    var reader = new BinaryReader(playerRoles.uint8Array); // HACKHACK
    for (var i=0; i<PlayerRoles.size/(Const.MAX_PLAYER_ROLES*2); ++i) {
      var offset = (i * Const.MAX_PLAYER_ROLES + role) * 2;
      reader.setInt16(offset, 0);
    }
    // Reset some parameters to default when appropriate
    if (part == BodyPart.Hand) {
      // reset the dual attack status
      mutateGlobalEntry('playerStatus', role, function(statusRow) {
        if (statusRow) {
          statusRow[PlayerStatus.DualAttack] = 0;
        }
      });
    } else if (part == BodyPart.Wear) {
      // Remove all poisons leveled 99
      var partyIndex = role;
      for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
        if (Global.party[i].playerRole == role){
          partyIndex = i;
          break;
        }
      }

      if (i <= Global.maxPartyMemberIndex) {
        mutateGlobalValue('poisonStatus', function(poisonStatus) {
          if (!poisonStatus) {
            return poisonStatus;
          }
          var j = 0;
          for (var poisonIndex = 0; poisonIndex < Const.MAX_POISONS; poisonIndex++) {
            var entry = poisonStatus[poisonIndex] && poisonStatus[poisonIndex][partyIndex];
            var poisonId = entry ? entry.poisonID : 0;
            if (poisonId === 0) {
              break;
            }
            if (GameData.object[poisonId].poison.poisonLevel < 99) {
              poisonStatus[j][partyIndex] = poisonStatus[poisonIndex][partyIndex];
              j++;
            }
          }
          while (j < Const.MAX_POISONS) {
            var target = poisonStatus[j] && poisonStatus[j][partyIndex];
            if (target) {
              target.poisonID = 0;
              target.poisonScript = 0;
            }
            j++;
          }
          return poisonStatus;
        });
      }
    }
  };

  script.setPlayerStatus = function(role, statusID, numRound) {
    function setStatusValue(targetRole, index, value) {
      mutateGlobalEntry('playerStatus', targetRole, function(statusRow) {
        if (statusRow) {
          statusRow[index] = value;
        }
      });
    }
    if (PAL_CLASSIC) {
      if (statusID == PlayerStatus.Slow &&
          Global.playerStatus[role][PlayerStatus.Haste] > 0) {
        // Remove the haste status
        script.removePlayerStatus(role, PlayerStatus.Haste);
        return;
      }
      if (statusID == PlayerStatus.Haste &&
          Global.playerStatus[role][PlayerStatus.Slow] > 0) {
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
        if (GameData.playerRoles.HP[role] != 0 &&
            Global.playerStatus[role][statusID] == 0) {
          setStatusValue(role, statusID, numRound);
        }
        break;
      case PlayerStatus.Puppet:
        // only allow dead players for "puppet" status
        if (GameData.playerRoles.HP[role] == 0 &&
            Global.playerStatus[role][statusID] < numRound) {
          setStatusValue(role, statusID, numRound);
        }
        break;
      case PlayerStatus.Bravery:
      case PlayerStatus.Protect:
      case PlayerStatus.DualAttack:
      case PlayerStatus.Haste:
        // for "good" statuses, reset the status if the status to be set lasts longer
        if (GameData.playerRoles.HP[role] != 0 &&
            Global.playerStatus[role][statusID] < numRound) {
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
    if (Global.playerStatus[role][statusID] <= 999) {
      mutateGlobalEntry('playerStatus', role, function(statusRow) {
        if (statusRow) {
          statusRow[statusID] = 0;
        }
      });
    }
  };

  script.clearAllPlayerStatus = function() {
    mutateGlobalValue('playerStatus', function(statusMatrix) {
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
    mutateGlobalValue('inventory', function(inventory) {
      if (!inventory) {
        return inventory;
      }
      var index = 0;
      var found = false;
      while (index < Const.MAX_INVENTORY) {
        var slot = inventory[index];
        if (!slot) {
          break;
        }
        if (slot.item == objectID) {
          found = true;
          break;
        } else if (slot.item == 0) {
          break;
        }
        index++;
      }

      if (num > 0) {
        if (index >= Const.MAX_INVENTORY) {
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
          if (num > 99) {
            num = 99;
          }
          target.amount = num;
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
    var inventory = Global.inventory;
    for (var i=0; i<Const.MAX_INVENTORY; ++i) {
      var inv = inventory[i];
      if (inv.item === 0) {
        return 0;
      }
      if (inv.item === item) {
        return inv.amount;
      }
    }
    return 0;
  };

  script.compressInventory = function() {
    mutateGlobalValue('inventory', function(inventory) {
      if (!inventory) {
        return inventory;
      }
      var j = 0;
      for (var i = 0; i < Const.MAX_INVENTORY; ++i) {
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
      for (; j < Const.MAX_INVENTORY; ++j) {
        if (inventory[j]) {
          memset(inventory[j].uint8Array, 0, inventory[j].uint8Array.length);
        }
      }
      return inventory;
    });
  };

  script.increaseHPMP = function(role, HP, MP) {
    var success = false;
    mutateGameDataValue('playerRoles', function(playerRoles) {
      if (!playerRoles || !playerRoles.HP || !playerRoles.MP) {
        return playerRoles;
      }
      if (playerRoles.HP[role] > 0) {
        playerRoles.HP[role] += HP;
        if (playerRoles.HP[role] < 0) {
          playerRoles.HP[role] = 0;
        } else if (playerRoles.maxHP && playerRoles.HP[role] > playerRoles.maxHP[role]) {
          playerRoles.HP[role] = playerRoles.maxHP[role];
        }
        playerRoles.MP[role] += MP;
        if (playerRoles.MP[role] < 0) {
          playerRoles.MP[role] = 0;
        } else if (playerRoles.maxMP && playerRoles.MP[role] > playerRoles.maxMP[role]) {
          playerRoles.MP[role] = playerRoles.maxMP[role];
        }
        success = true;
      }
      return playerRoles;
    });
    return success;
  };

  script.addPoisonForPlayer = function(role, poisonID) {
    var index = findIndexByPlayerRole(role);
    if (index < 0) return;

    mutateGlobalValue('poisonStatus', function(poisonStatus) {
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
          targetRow[index].poisonID = poisonID;
          targetRow[index].poisonScript = GameData.object[poisonID].poison.playerScript;
        }
      }
      return poisonStatus;
    });
  };

  script.curePoisonByKind = function(role, poisonID) {
    var index = findIndexByPlayerRole(role);
    if (index < 0) return;

    mutateGlobalValue('poisonStatus', function(poisonStatus) {
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

    mutateGlobalValue('poisonStatus', function(poisonStatus) {
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
        var data = GameData.object[poisonId];
        if (data && data.poison && data.poison.poisonLevel <= maxLevel) {
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

    var poisonStatus = Global.poisonStatus;
    for (var i=0; i<Const.MAX_POISONS; ++i) {
      var p = poisonStatus[i][index];
      var w = GameData.object[p.poisonID].poison.poisonLevel;
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

    var poisonStatus = Global.poisonStatus;
    for (var i=0; i<Const.MAX_POISONS; ++i) {
      if (poisonStatus[i][index].poisonID == poisonID) {
        return true;
      }
    }
    return false;
  };

  script.getPlayerAttackStrength = function(role) {
    var w = GameData.playerRoles.attackStrength[role];
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      w += Global.equipmentEffect[i].attackStrength[role];
    }

    return w;
  };

  script.getPlayerMagicStrength = function(role) {
    var w = GameData.playerRoles.magicStrength[role];
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      w += Global.equipmentEffect[i].magicStrength[role];
    }

    return w;
  };

  script.getPlayerDefense = function(role) {
    var w = GameData.playerRoles.defense[role];
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      w += Global.equipmentEffect[i].defense[role];
    }

    return w;
  };

  script.getPlayerDexterity = function(role) {
    var w = GameData.playerRoles.dexterity[role];
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      w += Global.equipmentEffect[i].dexterity[role];
    }

    return w;
  };

  script.getPlayerFleeRate = function(role) {
    var w = GameData.playerRoles.fleeRate[role];
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      w += Global.equipmentEffect[i].fleeRate[role];
    }

    return w;
  };

  script.getPlayerPoisonResistance = function(role) {
    var w = GameData.playerRoles.poisonResistance[role];
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      w += Global.equipmentEffect[i].poisonResistance[role];
    }

    return w;
  };

  script.getPlayerElementalResistance = function(role, attr) {
    var w = GameData.playerRoles.elementalResistance[attr][role];
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      w += Global.equipmentEffect[i].elementalResistance[attr][role];
    }
    if (w > 100) {
      w = 100;
    }

    return w;
  };

  script.getPlayerBattleSprite = function(role) {
    var w = GameData.playerRoles.spriteNumInBattle[role];
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      var x = Global.equipmentEffect[i].spriteNumInBattle[role];
      if (x != 0) {
        w = x;
      }
    }

    return w;
  };

  script.getPlayerCooperativeMagic = function(role) {
    var w = GameData.playerRoles.cooperativeMagic[role];
    for (var i=0; i<Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      var x = Global.equipmentEffect[i].cooperativeMagic[role];
      if (x != 0) {
        w = x;
      }
    }

    return w;
  };

  script.playerCanAttackAll = function(role) {
    for (var i = 0; i < Const.MAX_PLAYER_EQUIPMENTS; ++i) {
      if (Global.equipmentEffect[i].attackAll[role] != 0){
        return true;
      }
    }

    return false;
  };

  script.addMagic = function(role, magic) {
    var i;
    for (i = 0; i < Const.MAX_PLAYER_MAGICS; ++i) {
      if (GameData.playerRoles.magic[i][role] == magic) {
        // already have this magic
        return false;
      }
    }
    for (i = 0; i < Const.MAX_PLAYER_MAGICS; ++i) {
      if (GameData.playerRoles.magic[i][role] == 0) {
        break;
      }
    }
    if (i >= Const.MAX_PLAYER_MAGICS) {
      // Not enough slots
      return false;
    }

    mutateGameDataValue('playerRoles', function(playerRoles) {
      if (playerRoles && playerRoles.magic && playerRoles.magic[i]) {
        playerRoles.magic[i][role] = magic;
      }
      return playerRoles;
    });

    return true;
  };

  script.removeMagic = function(role, magic) {
    var magics = GameData.playerRoles.magic;
    for (var i=0; i<Const.MAX_PLAYER_MAGICS; ++i) {
      var m = magics[i];
      if (m[role] == magic){
        m[role] = 0;
        break;
      }
    }
  };

  script.playerLevelUp = function(role, level) {
    var playerRoles = GameData.playerRoles;
    // Add the level
    playerRoles.level[role] += level;
    if (playerRoles.level[role] > Const.MAX_LEVELS) {
      playerRoles.level[role] = Const.MAX_LEVELS;
    }

    for (var i = 0; i < level; i++) {
      // Increase player's stats
      playerRoles.maxHP[role]          += 10 + randomLong(0, 8);
      playerRoles.maxMP[role]          +=  8 + randomLong(0, 6);
      playerRoles.attackStrength[role] +=  4 + randomLong(0, 1);
      playerRoles.magicStrength[role]  +=  4 + randomLong(0, 1);
      playerRoles.defense[role]        +=  2 + randomLong(0, 1);
      playerRoles.dexterity[role]      +=  2 + randomLong(0, 1);
      playerRoles.fleeRate[role]       +=  2;
    }

    function stat_limit(t) {
      return t > 999 ? 999 : t;
    }

    playerRoles.maxHP[role]          = stat_limit(playerRoles.maxHP[role]);
    playerRoles.maxMP[role]          = stat_limit(playerRoles.maxMP[role]);
    playerRoles.attackStrength[role] = stat_limit(playerRoles.attackStrength[role]);
    playerRoles.magicStrength[role]  = stat_limit(playerRoles.magicStrength[role]);
    playerRoles.defense[role]        = stat_limit(playerRoles.defense[role]);
    playerRoles.dexterity[role]      = stat_limit(playerRoles.dexterity[role]);
    playerRoles.fleeRate[role]       = stat_limit(playerRoles.fleeRate[role]);

    // Reset experience points to zero
    mutateGlobalValue('exp', function(expState) {
      if (expState && expState.primaryExp && expState.primaryExp[role]) {
        expState.primaryExp[role].exp = 0;
        expState.primaryExp[role].level = playerRoles.level[role];
      }
      return expState;
    });
  };

  function findIndexByPlayerRole(role) {
    for (var i=0; i<=Global.maxPartyMemberIndex; ++i) {
      if (Global.party[i].playerRole == role) {
        return i;
      }
    }
    return -1;
  };
};

export default script_extras;
