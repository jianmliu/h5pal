import input from './input';
import script from '../../services/script-service.js';
import Sprite from './sprite';
import uibattle from './uibattle';
import sound from './sound';
import resourceService from '../../services/resource-service.js';
import utils from './utils';
import battleService from '../../services/battle-service.js';

log.trace('fight module load');

var fight = {};

function BATTLE() {
  const state = battleService.getState();
  if (state) return state;
  if (typeof Global !== 'undefined' && Global && Global.battle) return Global.battle;
  return {};
}

function withBattle(fn, options) {
  return battleService.withState(fn, options);
}

function setBattleField(field, value) {
  return battleService.set([field], value);
}

function mutatePlayer(index, mutator) {
  return battleService.setPlayer(index, function(player) {
    if (!player) {
      return player;
    }
    mutator(player);
    return player;
  });
}

function mutateEnemy(index, mutator) {
  return battleService.updateEnemy(index, function(enemy) {
    if (!enemy) {
      return enemy;
    }
    mutator(enemy);
    return enemy;
  });
}

function mutateUI(mutator) {
  return battleService.setUI(function(uiState) {
    if (!uiState) {
      return uiState;
    }
    mutator(uiState);
    return uiState;
  });
}

function mutateActionQueue(index, mutator) {
  return battleService.setActionQueue(index, function(entry) {
    if (!entry) {
      return entry;
    }
    mutator(entry);
    return entry;
  });
}

function setPlayerPosition(index, position) {
  return mutatePlayer(index, function(player) {
    if (typeof position === 'function') {
      player.pos = position(player.pos);
    } else {
      player.pos = position;
    }
    return player;
  });
}

function setPlayerFrame(index, frame) {
  return mutatePlayer(index, function(player) {
    player.currentFrame = typeof frame === 'function' ? frame(player.currentFrame) : frame;
    return player;
  });
}

function mutatePlayerAction(index, mutator) {
  return mutatePlayer(index, function(player) {
    if (player && player.action) {
      mutator(player.action, player);
    }
    return player;
  });
}

var surface = null
var battle = null;

fight.init = function*(surf, _battle) {
  log.debug('[BATTLE] init fight');
  surface = surf;
  battle = _battle;

  yield resourceService.loadMKF('FIRE', 'F');
  Files.FIRE = resourceService.getMKF('FIRE');
  Files.F = resourceService.getMKF('F');

  /**
   * Pick an enemy target automatically.
   * @return {Number}
   */
  battle.selectAutoTarget = function() {
    var i = BATTLE().UI.prevEnemyTarget;

    if (i >= 0 && i <= BATTLE().maxEnemyIndex &&
        BATTLE().enemy[i].objectID != 0 &&
        BATTLE().enemy[i].e.health > 0) {
      return i;
    }

    for (i = 0; i <= BATTLE().maxEnemyIndex; i++) {
      if (BATTLE().enemy[i].objectID != 0 &&
          BATTLE().enemy[i].e.health > 0) {
        return i;
      }
    }

    return -1;
  };

  /**
   * Delay a while during battle.
   * @param {Number} duration      Number of frames of the delay.
   * @param {Number} objectID      The object ID to be displayed during the delay.
   * @param {Boolean} updateGesture true if update the gesture for enemies, false if not.
   */
  battle.delay = function*(duration, objectID, updateGesture) {
    var sceneBuf = BATTLE().sceneBuf;
    var screen = surface.byteBuffer;
    for (var i = 0; i < duration; i++) {
      if (updateGesture) {
        // Update the gesture of enemies.
        for (var j = 0; j <= BATTLE().maxEnemyIndex; j++) {
          var enemy = BATTLE().enemy[j];
          if (enemy.objectID == 0 ||
              enemy.status[PlayerStatus.Sleep] != 0 ||
              enemy.status[PlayerStatus.Paralyzed] != 0) {
            continue;
          }

          if (--enemy.e.idleAnimSpeed == 0) {
            enemy.currentFrame++;
            enemy.e.idleAnimSpeed = GameData.enemy[GameData.object[enemy.objectID].enemy.enemyID].idleAnimSpeed;
          }

          if (enemy.currentFrame >= enemy.e.idleFrames) {
            enemy.currentFrame = 0;
          }
        }
      }

      battle.makeScene();
      surface.blitSurface(sceneBuf, null, screen, null);
      yield uibattle.update();

      if (objectID != 0) {
        if (objectID == ui.BATTLE_LABEL_ESCAPEFAIL) {
          // HACKHACK
          ui.drawText(ui.getWord(objectID), PAL_XY(130, 75), 15, true, false);
        } else if (SHORT(objectID) < 0) {
          ui.drawText(ui.getWord(-SHORT(objectID)), PAL_XY(170, 45), ui.DESCTEXT_COLOR, true, false);
        } else {
          ui.drawText(ui.getWord(objectID), PAL_XY(210, 50), 15, true, false);
        }
      }

      surface.updateScreen(null);

      yield sleepByFrame(1);
    }
  };

  /**
   * Update players' and enemies' gestures and locations in battle.
   */
  battle.updateFighters = function() {
    log.trace('[BATTLE] updateFighters');
    withBattle(function(state) {
      for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
        var playerRole = Global.party[i].playerRole;
        var player = state.player[i];
        if (!player) continue;

        player.pos = player.originalPos;
        player.colorShift = 0;

        if (GameData.playerRoles.HP[playerRole] == 0) {
          player.currentFrame = (Global.playerStatus[playerRole][PlayerStatus.Puppet] == 0) ? 2 : 0;
        } else {
          if (Global.playerStatus[playerRole][PlayerStatus.Sleep] != 0 || battle.isPlayerDying(playerRole)) {
            player.currentFrame = 1;
          } else if (player.defending && !state.enemyCleared) {
            player.currentFrame = 3;
          } else {
            player.currentFrame = 0;
          }
        }
      }

      for (var j = 0; j <= state.maxEnemyIndex; j++) {
        var enemy = state.enemy[j];
        if (!enemy || enemy.objectID == 0) {
          continue;
        }

        enemy.pos = enemy.originalPos;
        enemy.colorShift = 0;

        if (enemy.status[PlayerStatus.Sleep] > 0 || enemy.status[PlayerStatus.Paralyzed] > 0) {
          enemy.currentFrame = 0;
          continue;
        }

        if (--enemy.e.idleAnimSpeed == 0) {
          enemy.currentFrame++;
          enemy.e.idleAnimSpeed = GameData.enemy[GameData.object[enemy.objectID].enemy.enemyID].idleAnimSpeed;
        }

        if (enemy.currentFrame >= enemy.e.idleFrames) {
          enemy.currentFrame = 0;
        }
      }
    });
  };

  /**
   * Check if there are player who is ready.
   */
  battle.playerCheckReady = function() {
    log.trace('[BATTLE] playerCheckReady');
    var flMax = 0;
    var iMax = 0;

    withBattle(function(state) {
      for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
        var player = state.player[i];
        if (!player) continue;
        if (player.state == FighterState.Com ||
          (player.state == FighterState.Act && player.action.actionType == BattleActionType.CoopMagic)) {
          flMax = 0;
          break;
        } else if (player.state == FighterState.Wait) {
          if (player.timeMeter > flMax) {
            iMax = i;
            flMax = player.timeMeter;
          }
        }
      }

      if (flMax >= 100.0) {
        var fastest = state.player[iMax];
        if (fastest) {
          fastest.state = FighterState.Com;
          fastest.defending = false;
        }
      }
    });
  };

  /**
   * Called once per video frame in battle.
   */
  battle.startFrame = function*() {
    //BATTLE().battleResult = BattleResult.Won;

    var onlyPuppet = true;
    var sceneBuf = BATTLE().sceneBuf;
    var screen = surface.byteBuffer;

    if (!BATTLE().enemyCleared) {
      battle.updateFighters();
    }

    // Update the scene
    battle.makeScene();
    surface.blitSurface(sceneBuf, null, screen, null);

    // Check if the battle is over
    if (BATTLE().enemyCleared) {
      // All enemies are cleared. Won the battle.
      battleService.setBattleResult(BattleResult.Won);
      sound.play(-1);
      return;
    } else {
      var ended = true;

      for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
        var playerRole = Global.party[i].playerRole;

        if (GameData.playerRoles.HP[playerRole] != 0) {
          onlyPuppet = false;
          ended = false;
          break;
        } else if (Global.playerStatus[playerRole][PlayerStatus.Puppet] != 0) {
          ended = false;
        }
      }

      if (ended) {
        // All players are dead. Lost the battle.
        battleService.setBattleResult(BattleResult.Lost);
        return;
      }
    }

    if (BATTLE().phase == BattlePhase.SelectAction) {
      if (BATTLE().UI.state == BattleUIState.Wait) {
        for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
          var playerRole = Global.party[i].playerRole;

          // Don't select action for this player if player is KO'ed,
          // sleeped, confused or paralyzed
          if (GameData.playerRoles.HP[playerRole] == 0 ||
              Global.playerStatus[playerRole][PlayerStatus.Sleep] ||
              Global.playerStatus[playerRole][PlayerStatus.Confused] ||
              Global.playerStatus[playerRole][PlayerStatus.Paralyzed]) {
            continue;
          }

          // Start the menu for the first player whose action is not
          // yet selected
          if (BATTLE().player[i].state == FighterState.Wait) {
            setBattleField('movingPlayerIndex', i);
            mutatePlayer(i, function(player) {
              player.state = FighterState.Com;
              return player;
            });
            uibattle.playerReady(i);
            break;
          } else if (BATTLE().player[i].action.actionType == BattleActionType.CoopMagic) {
            // Skip other players if someone selected coopmagic
            i = Global.maxPartyMemberIndex + 1;
            break;
          }
        }

        if (i > Global.maxPartyMemberIndex) {
          // actions for all players are decided. fill in the action queue.
          setBattleField('repeat', false);
          setBattleField('force', false);
          setBattleField('flee', false);

          setBattleField('curAction', 0);

          for (var i = 0; i < Const.MAX_ACTIONQUEUE_ITEMS; i++) {
            mutateActionQueue(i, function(queue) {
              queue.index = 0xFFFF;
              queue.dexterity = 0xFFFF;
              return queue;
            });
          }

          var j = 0;

          // Put all enemies into action queue
          for (var i = 0; i <= BATTLE().maxEnemyIndex; i++) {
            var enemy = BATTLE().enemy[i];
            if (enemy.objectID == 0) {
              continue;
            }

            var enemyDexterity = battle.getEnemyDexterity(i) * randomFloat(0.9, 1.1);
            mutateActionQueue(j, function(queue) {
              queue.isEnemy = true;
              queue.index = i;
              queue.dexterity = enemyDexterity;
              return queue;
            });

            j++;

            if (enemy.e.dualMove * 50 + randomLong(0, 100) > 100) {
              var extraDexterity = battle.getEnemyDexterity(i) * randomFloat(0.9, 1.1);
              mutateActionQueue(j, function(queue) {
                queue.isEnemy = true;
                queue.index = i;
                queue.dexterity = extraDexterity;
                return queue;
              });

              j++;
            }
          }

          // Put all players into action queue
          for (i = 0; i <= Global.maxPartyMemberIndex; i++) {
            var playerRole = Global.party[i].playerRole;
            var playerState = BATTLE().player[i];
            var nextActionType = playerState.action.actionType;
            var nextState = playerState.state;
            var queueDexterity = 0;

            if (GameData.playerRoles.HP[playerRole] == 0 ||
                Global.playerStatus[playerRole][PlayerStatus.Sleep] > 0 ||
                Global.playerStatus[playerRole][PlayerStatus.Paralyzed] > 0) {
              // players who are unable to move should attack physically if recovered
              // in the same turn
              nextActionType = BattleActionType.Attack;
              nextState = FighterState.Act;
              queueDexterity = 0;
            } else {
              var dexterity = battle.getPlayerActualDexterity(playerRole);

              if (Global.playerStatus[playerRole][PlayerStatus.Confused] > 0) {
                nextActionType = BattleActionType.Attack;
                nextState = FighterState.Act;
              }

              switch (nextActionType) {
                case BattleActionType.CoopMagic:
                  dexterity *= 10;
                  break;

                case BattleActionType.Defend:
                  dexterity *= 5;
                  break;

                case BattleActionType.Magic:
                  if ((GameData.object[playerState.action.actionID].magic.flags & MagicFlag.UsableToEnemy) == 0) {
                     dexterity *= 3;
                  }
                  break;

                case BattleActionType.Flee:
                  dexterity /= 2;
                  break;

                case BattleActionType.UseItem:
                  dexterity *= 3;
                  break;

                default:
                  break;
              }

              if (battle.isPlayerDying(playerRole)) {
                 dexterity /= 2;
              }

              dexterity *= randomFloat(0.9, 1.1);
              queueDexterity = dexterity;
            }

            mutateActionQueue(j, function(queue) {
              queue.isEnemy = false;
              queue.index = i;
              queue.dexterity = queueDexterity;
              return queue;
            });

            mutatePlayer(i, function(player) {
              player.action.actionType = nextActionType;
              player.state = nextState;
              return player;
            });

            j++;
          }

          // Sort the action queue by dexterity value
          BATTLE().actionQueue.sort(function(a, b) {
            if (a.dexterity === 0xFFFF) return 1;
            if (b.dexterity === 0xFFFF) return -1;
            return -(a.dexterity - b.dexterity);
          });

          // Perform the actions
          setBattleField('phase', BattlePhase.PerformAction);
        }
      }
    } else {
      // Are all actions finished?
      if (BATTLE().curAction >= Const.MAX_ACTIONQUEUE_ITEMS ||
          BATTLE().actionQueue[BATTLE().curAction].dexterity == 0xFFFF) {
        for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
          mutatePlayer(i, function(player) {
            player.defending = false;
            return player;
          });
        }

        // Run poison scripts
        battle.backupStat();

        for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
          var playerRole = Global.party[i].playerRole;

          for (var j = 0; j < Const.MAX_POISONS; j++) {
            if (Global.poisonStatus[j][i].poisonID != 0) {
              Global.poisonStatus[j][i].poisonScript = yield script.runTriggerScript(
                Global.poisonStatus[j][i].poisonScript,
                playerRole
              );
            }
          }

          // Update statuses
          for (var j = 0; j < PlayerStatus.All; j++) {
            if (Global.playerStatus[playerRole][j] > 0) {
              Global.playerStatus[playerRole][j]--;
            }
          }
        }

        for (var i = 0; i <= BATTLE().maxEnemyIndex; i++) {
          var enemyState = BATTLE().enemy[i];
          if (!enemyState) {
            continue;
          }

          for (var j = 0; j < Const.MAX_POISONS; j++) {
            var poisonSlot = enemyState.poisons[j];
            if (poisonSlot && poisonSlot.poisonID != 0) {
              var nextScriptEntry = yield script.runTriggerScript(
                poisonSlot.poisonScript,
                WORD(i)
              );
              battleService.setEnemyPoison(i, j, function(slot) {
                slot.poisonScript = nextScriptEntry;
                return slot;
              });
            }
          }

          // Update statuses
          for (var j = 0; j < PlayerStatus.All; j++) {
            if (enemyState.status[j] > 0) {
              battleService.setEnemyStatus(i, j, function(value) {
                return value > 0 ? value - 1 : value;
              });
            }
          }
        }

        yield battle.postActionCheck(false);
        if (battle.displayStatChange()) {
          yield battle.delay(8, 0, true);
        }

        var hidingTime = BATTLE().hidingTime;
        if (hidingTime > 0) {
          hidingTime--;
          battleService.setHidingTime(hidingTime);
          if (hidingTime == 0) {
            battle.backupScene();
            battle.makeScene();
            yield battle.fadeScene();
          }
        }

        if (BATTLE().hidingTime == 0) {
          for (var i = 0; i <= BATTLE().maxEnemyIndex; i++) {
            var enemyTurnState = BATTLE().enemy[i];
            if (!enemyTurnState || enemyTurnState.objectID == 0 || !enemyTurnState.scriptOnTurnStart) {
              continue;
            }

            var turnStartResult = yield script.runTriggerScript(
              enemyTurnState.scriptOnTurnStart,
              WORD(i)
            );

            mutateEnemy(i, function(enemy) {
              enemy.scriptOnTurnStart = turnStartResult;
              return enemy;
            });
          }
        }

        // Clear all item-using records
        for (var i = 0; i < Const.MAX_INVENTORY; i++) {
          Global.inventory[i].amountInUse = 0;
        }

        // Proceed to next turn...
        setBattleField('phase', BattlePhase.SelectAction);
      } else {
        var i = BATTLE().actionQueue[BATTLE().curAction].index;

        if (BATTLE().actionQueue[BATTLE().curAction].isEnemy) {
          var actingEnemy = BATTLE().enemy[i];
          if (BATTLE().hidingTime == 0 &&
              !onlyPuppet &&
              actingEnemy &&
              actingEnemy.objectID != 0) {
            if (actingEnemy.scriptOnReady) {
              var readyScriptResult = yield script.runTriggerScript(
                actingEnemy.scriptOnReady,
                WORD(i)
              );
              mutateEnemy(i, function(enemy) {
                enemy.scriptOnReady = readyScriptResult;
                return enemy;
              });
            }

            setBattleField('enemyMoving', true);
            yield battle.enemyPerformAction(i);
            setBattleField('enemyMoving', false);
          }
        } else if (BATTLE().player[i].state == FighterState.Act) {
          var playerRole = Global.party[i].playerRole;
          var updatedActionType = null;

          if (GameData.playerRoles.HP[playerRole] == 0) {
            if (Global.playerStatus[playerRole][PlayerStatus.Puppet] == 0) {
              updatedActionType = BattleActionType.Pass;
            }
          } else if (Global.playerStatus[playerRole][PlayerStatus.Sleep] > 0 ||
                     Global.playerStatus[playerRole][PlayerStatus.Paralyzed] > 0) {
            updatedActionType = BattleActionType.Pass;
          } else if (Global.playerStatus[playerRole][PlayerStatus.Confused] > 0) {
            updatedActionType = BattleActionType.AttackMate;
          }

          if (updatedActionType !== null) {
            mutatePlayer(i, function(player) {
              player.action.actionType = updatedActionType;
              return player;
            });
          }

          // Perform the action for this player.
          setBattleField('movingPlayerIndex', i);
          yield battle.playerPerformAction(i);
        }

        setBattleField('curAction', function(value) {
          return (value || 0) + 1;
        });
      }
    }

    // The R and F keys and Fleeing should affect all players
    if (BATTLE().UI.menuState == BattleMenuState.Main &&
        BATTLE().UI.state == BattleUIState.SelectMove) {
      if (input.isKeyPressed(Key.ForceRepeat)) {
        setBattleField('repeat', true);
      } else if (input.isKeyPressed(Key.Force)) {
         setBattleField('force', true);
      }
    }

    if (BATTLE().repeat) {
      input.keyPress = Key.Repeat;
    } else if (BATTLE().force) {
      input.keyPress = Key.Force;
    } else if (BATTLE().flee) {
      input.keyPress = Key.Flee;
    }

    // Update the battle UI
    yield uibattle.update();
  };

  /**
   * Commit the action which the player decided.
   * @param  {Boolean} repeat true if repeat the last action.
   */
  battle.commitAction = function(repeat) {
    log.debug(['[BATTLE] commitAction', repeat].join(' '));
    var curPlayer = BATTLE().player[BATTLE().UI.curPlayerIndex];
    if (!repeat) {
      curPlayer.action.actionType = BATTLE().UI.actionType;
      curPlayer.action.target = SHORT(BATTLE().UI.selectedIndex);
      curPlayer.action.actionID = BATTLE().UI.objectID;
    } else if (curPlayer.action.actionType == BattleActionType.Pass) {
      curPlayer.action.actionType = BattleActionType.Attack;
      curPlayer.action.target = -1;
    }

    // Check if the action is valid
    switch (curPlayer.action.actionType) {
      case BattleActionType.Magic:
        var w = curPlayer.action.actionID;
        w = GameData.magic[GameData.object[w].magic.magicNumber].costMP;

        if (GameData.playerRoles.MP[Global.party[BATTLE().UI.curPlayerIndex].playerRole] < w) {
          w = curPlayer.action.actionID;
          w = GameData.magic[GameData.object[w].magic.magicNumber].type;
          if (w == MagicType.ApplyToPlayer || w == MagicType.ApplyToParty ||
              w == MagicType.Trance) {
            curPlayer.action.actionType = BattleActionType.Defend;
          } else {
            curPlayer.action.actionType = BattleActionType.Attack;
            if (curPlayer.action.target == -1) {
              curPlayer.action.target = 0;
            }
          }
        }
        break;

      case BattleActionType.UseItem:
        if ((GameData.object[curPlayer.action.actionID].item.flags & ItemFlag.Consuming) == 0) {
          break;
        }

      case BattleActionType.ThrowItem:
        for (var w = 0; w < Const.MAX_INVENTORY; w++) {
          if (Global.inventory[w].item == curPlayer.action.actionID) {
            Global.inventory[w].amountInUse++;
            break;
          }
        }
        break;

      default:
        break;
    }

    if (BATTLE().UI.actionType == BattleActionType.Flee) {
      setBattleField('flee', true);
    }

    curPlayer.state = FighterState.Act;
    mutateUI(function(uiState) {
      uiState.state = BattleUIState.Wait;
      return uiState;
    });
  };

  /**
   * Show the effect for player before using a magic.
   * @param {Number} playerIndex   the index of the player.
   * @param {Boolean} summon       true if player is using a summon magic.
   */
  battle.showPlayerPreMagicAnim = function*(playerIndex, summon) {
    log.debug(['[BATTLE] showPlayerPreMagicAnim', playerIndex, summon].join(' '));
    var playerRole = Global.party[playerIndex].playerRole;

    for (var i = 0; i < 4; i++) {
      setPlayerPosition(playerIndex, function(pos) {
        return PAL_XY(
          PAL_X(pos) - (4 - i),
          PAL_Y(pos) - ~~((4 - i) / 2)
        );
      });

      yield battle.delay(1, 0, true);
    }

    yield battle.delay(2, 0, true);

    setPlayerFrame(playerIndex, 5);
    sound.play(GameData.playerRoles.magicSound[playerRole]);

    if (!summon) {
      var currentPos = BATTLE().player[playerIndex].pos;
      var x = PAL_X(currentPos);
      var y = PAL_Y(currentPos);

      var index = GameData.battleEffectIndex[battle.getPlayerBattleSprite(playerRole)][0];
      index = index * 10 + 15;

      for (var i = 0; i < 10; i++) {
        var frame = BATTLE().effectSprite.getFrame(index++);

        // Update the gesture of enemies.
        for (var j = 0; j <= BATTLE().maxEnemyIndex; j++) {
          mutateEnemy(j, function(enemy) {
            if (!enemy ||
                enemy.objectID == 0 ||
                enemy.status[PlayerStatus.Sleep] != 0 ||
                enemy.status[PlayerStatus.Paralyzed] != 0) {
              return enemy;
            }

            if (--enemy.e.idleAnimSpeed == 0) {
              enemy.currentFrame++;
              enemy.e.idleAnimSpeed =
                GameData.enemy[GameData.object[enemy.objectID].enemy.enemyID].idleAnimSpeed;
            }

            if (enemy.currentFrame >= enemy.e.wIdleFrames) {
              enemy.currentFrame = 0;
            }
            return enemy;
          });
        }

        battle.makeScene();
        surface.blitSurface(BATTLE().sceneBuf, null, surface.byteBuffer, null);

        surface.blitRLE(
          frame,
          PAL_XY(x - ~~(frame.width / 2), y - frame.height)
        );

        yield uibattle.update();

        surface.updateScreen(null);

        yield sleepByFrame(1);
      }
    }

    yield battle.delay(1, 0, true);
  };

  /**
   * Check if the player is dying.
   * @param  {Number}  the player role ID.
   * @return {Boolean} true if the player is dying, false if not.
   */
  battle.isPlayerDying = function(playerRole) {
    return GameData.playerRoles.HP[playerRole] < GameData.playerRoles.maxHP[playerRole] / 5;
  };

  /**
   * Calculate the base damage value of attacking.
   * @param  {Number} attackStrength attack strength of attacker.
   * @param  {Number} defense        defense value of inflictor.
   * @return {Number}                The base damage value of the attacking.
   */
  battle.calcBaseDamage = function(attackStrength, defense) {
    // TODO 这里有时候defense超大，而且是在GameData.enemy里就很大，只能先让它溢出为负数了
    defense = SHORT(defense);
    // Formula courtesy of palxex and shenyanduxing
    if (attackStrength > defense) {
      return SHORT(~~(attackStrength * 2 - defense * 1.6 + 0.5));
    } else if (attackStrength > defense * 0.6) {
      return SHORT(~~(attackStrength - defense * 0.6 + 0.5));
    } else {
      return 0;
    }
  };

  /**
   * Calculate the damage of magic.
   * @param  {Number} magicStrength       magic strength of attacker.
   * @param  {Number} defense             defense value of inflictor.
   * @param  {Array}  elementalResistance inflictor's resistance to the elemental magics.
   * @param  {Number} poisonResistance    inflictor's resistance to poison.
   * @param  {Number} magicID             object ID of the magic.
   * @return {Number}                     The damage value of the magic attack.
   */
  battle.calcMagicDamage = function(magicStrength, defense, elementalResistance, poisonResistance, magicID) {
    magicID = GameData.object[magicID].magic.magicNumber;

    // Formula courtesy of palxex and shenyanduxing
    magicStrength *= randomFloat(10, 11);
    magicStrength /= 10;

    damage = battle.calcBaseDamage(magicStrength, defense);
    damage /= 4;
    damage += GameData.magic[magicID].baseDamage;

    if (GameData.magic[magicID].elemental != 0) {
      var elem = GameData.magic[magicID].elemental;

      if (elem > Const.NUM_MAGIC_ELEMENTAL) {
        damage *= 10 - poisonResistance;
      } else if (elem == 0) {
        damage *= 5;
      } else {
        damage *= 10 - elementalResistance[elem - 1];
      }

      damage /= 5;

      if (elem <= Const.NUM_MAGIC_ELEMENTAL) {
        damage *= 10 + GameData.battleField[Global.numBattleField].magicEffect[elem - 1];
        damage /= 10;
      }
    }

    return ~~damage;
  };

  /**
   * Calculate the damage value of physical attacking.
   * @param  {Number} attackStrength   attack strength of attacker.
   * @param  {Number} defense          defense value of inflictor.
   * @param  {Number} attackResistance inflictor's resistance to physical attack.
   * @return {Number}                  The damage value of the physical attacking.
   */
  battle.calcPhysicalAttackDamage = function(attackStrength, defense, attackResistance) {
    var damage = battle.calcBaseDamage(attackStrength, defense);
    if (attackResistance != 0) {
      damage = ~~(damage / attackResistance);
    }

    return damage;
  };

  /**
   * Get the dexterity value of the enemy.
   * @param  {Number} enemyIndex the index of the enemy.
   * @return {Number}            The dexterity value of the enemy.
   */
  battle.getEnemyDexterity = function(enemyIndex) {
    var enemy = BATTLE().enemy[enemyIndex];
    var s = 0;
    s = (enemy.e.level + 6) * 3;
    s += SHORT(enemy.e.dexterity);

    return s;
  };

  /**
   * Get player's actual dexterity value in battle.
   * @param  {Number} playerRole the player role ID.
   * @return {Number}            The player's actual dexterity value.
   */
  battle.getPlayerActualDexterity = function(playerRole) {
    var dexterity = script.getPlayerDexterity(playerRole);

    if (Global.playerStatus[playerRole][PlayerStatus.Haste] != 0) {
      dexterity *= 3;
    }

    if (battle.isPlayerDying(playerRole)) {
      // player who is low of HP should be slower
      dexterity /= 2;
    }

    if (dexterity > 999) {
      dexterity = 999;
    }

    return ~~dexterity;
  };

  /**
   * Backup HP and MP values of all players and enemies.
   */
  battle.backupStat = function() {
    var playerRole;
    for (var i = 0; i <= BATTLE().maxEnemyIndex; i++) {
      mutateEnemy(i, function(enemy) {
        if (!enemy || enemy.objectID == 0) {
          return enemy;
        }
        enemy.prevHP = enemy.e.health;
        return enemy;
      });
    }

    for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
      playerRole = Global.party[i].playerRole;

      mutatePlayer(i, function(player) {
        if (!player) {
          return player;
        }
        player.prevHP = GameData.playerRoles.HP[playerRole];
        player.prevMP = GameData.playerRoles.MP[playerRole];
        return player;
      });
    }
  };

  /**
   * Display the HP and MP changes of all players and enemies.
   * @return {Boolean} true if there are any number displayed, false if not.
   */
  battle.displayStatChange = function() {
    log.debug(['[BATTLE] displayStatChange'].join(' '));
    var changed = false;

    for (var i = 0; i <= BATTLE().maxEnemyIndex; i++) {
      if (BATTLE().enemy[i].objectID == 0) {
        continue;
      }

      if (BATTLE().enemy[i].prevHP != BATTLE().enemy[i].e.health) {
        // Show the number of damage
        var damage = BATTLE().enemy[i].e.health - BATTLE().enemy[i].prevHP;

        var x = PAL_X(BATTLE().enemy[i].pos) - 9;
        var y = PAL_Y(BATTLE().enemy[i].pos) - 115;

        if (y < 10) {
          y = 10;
        }

        if (damage < 0) {
          uibattle.showNum(WORD(-damage), PAL_XY(x, y), NumColor.Blue);
        } else {
          uibattle.showNum(WORD(damage), PAL_XY(x, y), NumColor.Yellow);
        }

        changed = true;
      }
    }

    for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
      var playerRole = Global.party[i].playerRole;

      if (BATTLE().player[i].prevHP != GameData.playerRoles.HP[playerRole]) {
        var damage = GameData.playerRoles.HP[playerRole] - BATTLE().player[i].prevHP;

        var x = PAL_X(BATTLE().player[i].pos) - 9;
        var y = PAL_Y(BATTLE().player[i].pos) - 75;

        if (y < 10) {
          y = 10;
        }

        if (damage < 0) {
          uibattle.showNum(WORD(-damage), PAL_XY(x, y), NumColor.Blue);
        } else {
          uibattle.showNum(WORD(damage), PAL_XY(x, y), NumColor.Yellow);
        }

        changed = true;
      }

      if (BATTLE().player[i].prevMP != GameData.playerRoles.MP[playerRole]) {
        var damage = GameData.playerRoles.MP[playerRole] - BATTLE().player[i].prevMP;

        var x = PAL_X(BATTLE().player[i].pos) - 9;
        var y = PAL_Y(BATTLE().player[i].pos) - 67;

        if (y < 10) {
          y = 10;
        }

        // Only show MP increasing
        if (damage > 0) {
          uibattle.showNum(WORD(damage), PAL_XY(x, y), NumColor.Cyan);
        }

        changed = true;
      }
    }

    return changed;
  };

  /**
   * Essential checks after an action is executed.
   * @param  {Boolean} checkPlayers true if check for players, false if not.
   */
  battle.postActionCheck = function*(checkPlayers) {
    log.debug(['[BATTLE] postActionCheck', checkPlayers].join(' '));
    var sceneBuf = BATTLE().sceneBuf;
    var screen = surface.byteBuffer;
    var fade = false;
    var enemyRemaining = false;
    for (var i = 0; i <= BATTLE().maxEnemyIndex; i++) {
      var enemyState = BATTLE().enemy[i];
      if (!enemyState || enemyState.objectID == 0) {
        continue;
      }

      if (SHORT(enemyState.e.health) <= 0) {
        // This enemy is KO'ed
        setBattleField('expGained', function(value) {
          return (value || 0) + enemyState.e.exp;
        });
        setBattleField('cashGained', function(value) {
          return (value || 0) + enemyState.e.cash;
        });

        sound.play(enemyState.e.deathSound);
        mutateEnemy(i, function(enemy) {
          if (enemy) {
            enemy.objectID = 0;
          }
          return enemy;
        });
        fade = true;

        continue;
      }

      enemyRemaining = true;
    }

    if (!enemyRemaining) {
      setBattleField('enemyCleared', true);
      mutateUI(function(uiState) {
        uiState.state = BattleUIState.Wait;
        return uiState;
      });
    }

    if (checkPlayers && !Global.autoBattle) {
      for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
        var w = Global.party[i].playerRole;
        var name;

        if (GameData.playerRoles.HP[w] < BATTLE().player[i].prevHP &&
            GameData.playerRoles.HP[w] == 0) {
          w = GameData.playerRoles.coveredBy[w];

          for (var j = 0; j <= Global.maxPartyMemberIndex; j++) {
            if (Global.party[j].playerRole == w) {
               break;
            }
          }

          if (GameData.playerRoles.HP[w] > 0 &&
              Global.playerStatus[w][PlayerStatus.Sleep] == 0 &&
              Global.playerStatus[w][PlayerStatus.Paralyzed] == 0 &&
              Global.playerStatus[w][PlayerStatus.Confused] == 0 &&
              j <= Global.maxPartyMemberIndex) {
            name = GameData.playerRoles.name[w];

            if (GameData.object[name].player.scriptOnFriendDeath != 0) {
              yield battle.delay(10, 0, true);

              battle.makeScene();
              surface.blitSurface(sceneBuf, null, screen, null);
              surface.updateScreen(null);

              battleService.setBattleResult(BattleResult.Pause);

              GameData.object[name].player.scriptOnFriendDeath = yield script.runTriggerScript(
                GameData.object[name].player.scriptOnFriendDeath,
                w
              );

              battleService.setBattleResult(BattleResult.OnGoing);

              input.clear();
              return yield end();
            }
          }
        }
      }

      for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
        var w = Global.party[i].playerRole;
        var name;

        if (Global.playerStatus[w][PlayerStatus.Sleep] != 0 ||
           Global.playerStatus[w][PlayerStatus.Confused] != 0) {
          continue;
        }

        if (GameData.playerRoles.HP[w] < BATTLE().player[i].prevHP) {
          if (GameData.playerRoles.HP[w] > 0 && battle.isPlayerDying(w) &&
            BATTLE().player[i].prevHP >= GameData.playerRoles.maxHP[w] / 5) {
            var cover = GameData.playerRoles.coveredBy[w];

            if (Global.playerStatus[cover][PlayerStatus.Sleep] != 0 ||
               Global.playerStatus[cover][PlayerStatus.Paralyzed] != 0 ||
               Global.playerStatus[cover][PlayerStatus.Confused] != 0) {
              continue;
            }

            name = GameData.playerRoles.name[w];

            sound.play(GameData.playerRoles.dyingSound[w]);

            for (var j = 0; j <= Global.maxPartyMemberIndex; j++) {
              if (Global.party[j].playerRole == cover) {
                break;
              }
            }

            if (j > Global.maxPartyMemberIndex || GameData.playerRoles.HP[cover] == 0) {
              continue;
            }

            if (GameData.object[name].player.scriptOnDying != 0) {
              yield battle.delay(10, 0, true);

              battle.makeScene();
              surface.blitSurface(sceneBuf, null, screen, null);
              surface.updateScreen(null);

              battleService.setBattleResult(BattleResult.Pause);

              GameData.object[name].player.scriptOnDying = yield script.runTriggerScript(
                GameData.object[name].player.scriptOnDying,
                w
              );

              battleService.setBattleResult(BattleResult.OnGoing);
              input.clear();
            }

            return yield end();
          }
        }
      }
    }

    function* end() {
      if (fade) {
        battle.backupScene();
        battle.makeScene();
        yield battle.fadeScene();
      }
      // Fade out the summoned god
      if (BATTLE().summonSprite != null) {
        battle.updateFighters();
        yield battle.delay(1, 0, false);

        setBattleField('summonSprite', null);
        setBattleField('backgroundColorShift', 0);

        battle.backupScene();
        battle.makeScene();
        yield battle.fadeScene();
      }
    }
  };

  /**
   * Show the physical attack effect for player.
   * @param {Number} playerIndex    the index of the player.
   * @param {Boolean} critical      true if this is a critical hit.
   */
  battle.showPlayerAttackAnim = function*(playerIndex, critical) {
    log.debug(['[BATTLE] showPlayerAttackAnim', playerIndex, critical].join(' '));
    var sceneBuf = BATTLE().sceneBuf;
    var screen = surface.byteBuffer;
    var playerRole = Global.party[playerIndex].playerRole;
    var target = BATTLE().player[playerIndex].action.target;

    var enemy_x = 0;
    var enemy_y = 0;
    var enemy_h = 0;
    var dist = 0;

    if (target != -1) {
      var enemy = BATTLE().enemy[target];
      enemy_x = PAL_X(enemy.pos);
      enemy_y = PAL_Y(enemy.pos);

      var enemy_h = enemy.sprite.getFrame(enemy.currentFrame).height;

      if (target >= 3) {
        dist = (target - playerIndex) * 8;
      }
    } else {
      enemy_x = 150;
      enemy_y = 100;
    }

    var index = GameData.battleEffectIndex[battle.getPlayerBattleSprite(playerRole)][1];
    index *= 3;
    // Play the attack voice
    if (GameData.playerRoles.HP[playerRole] > 0) {
      if (!critical) {
        sound.play(GameData.playerRoles.attackSound[playerRole]);
      } else {
        sound.play(GameData.playerRoles.criticalSound[playerRole]);
      }
    }

    // Show the animation
    var x = enemy_x - dist + 64;
    var y = enemy_y + dist + 20;

    setPlayerFrame(playerIndex, 8);
    setPlayerPosition(playerIndex, PAL_XY(x, y));

    yield battle.delay(2, 0, true);

    x -= 10;
    y -= 2;
    setPlayerPosition(playerIndex, PAL_XY(x, y));

    yield battle.delay(1, 0, true);

    setPlayerFrame(playerIndex, 9);
    x -= 16;
    y -= 4;

    sound.play(GameData.playerRoles.weaponSound[playerRole]);

    x = enemy_x;
    y = enemy_y - ~~(enemy_h / 3) + 10;

    var index = 0;
    for (var i = 0; i < 3; i++) {
      var frame = BATTLE().effectSprite.getFrame(index++);

      // Update the gesture of enemies.
      for (var j = 0; j <= BATTLE().maxEnemyIndex; j++) {
        var enemy = BATTLE().enemy[j];
        if (enemy.objectID == 0 ||
            enemy.status[PlayerStatus.Sleep] > 0 ||
            enemy.status[PlayerStatus.Paralyzed] > 0) {
          continue;
        }

        if (--enemy.e.idleAnimSpeed == 0) {
          enemy.currentFrame++;
          enemy.e.idleAnimSpeed = GameData.enemy[GameData.object[enemy.objectID].enemy.enemyID].idleAnimSpeed;
        }

        if (enemy.currentFrame >= enemy.e.idleFrames) {
          enemy.currentFrame = 0;
        }
      }

      battle.makeScene();
      surface.blitSurface(sceneBuf, null, screen, null);

      surface.blitRLE(frame, PAL_XY(x - ~~(frame.width / 2), y - frame.height), screen);
      x -= 16;
      y += 16;

      yield uibattle.update();

      if (i == 0) {
        if (target == -1) {
          for (var j = 0; j <= BATTLE().maxEnemyIndex; j++) {
            battleService.setEnemyColorShift(j, 6);
          }
        } else {
          battleService.setEnemyColorShift(target, 6);
        }

        battle.displayStatChange();
        battle.backupStat();
      }

      surface.updateScreen(null);

      if (i == 1) {
        setPlayerPosition(playerIndex, function(pos) {
          return PAL_XY(PAL_X(pos) + 2, PAL_Y(pos) + 1);
        });
      }

      yield sleepByFrame(1);
    }

    dist = 8;

    for (var i = 0; i <= BATTLE().maxEnemyIndex; i++) {
      battleService.setEnemyColorShift(i, 0);
    }

    if (target == -1) {
      for (var i = 0; i < 3; i++) {
        for (var j = 0; j <= BATTLE().maxEnemyIndex; j++) {
          battleService.setEnemyPosition(j, function(pos) {
            return PAL_XY(
              PAL_X(pos) - dist,
              PAL_Y(pos) - ~~(dist / 2)
            );
          });
        }

        yield battle.delay(1, 0, true);
        dist = ~~(dist / -2);
      }
    } else{
      var targetPos = BATTLE().enemy[target].pos;
      var x = PAL_X(targetPos);
      var y = PAL_Y(targetPos);

      for (var i = 0; i < 3; i++) {
        x -= dist;
        dist = ~~(dist / -2);
        y += dist;
        battleService.setEnemyPosition(target, PAL_XY(x, y));

        yield battle.delay(1, 0, true);
      }
    }
  };

  /**
   * Show the "use item" effect for player.
   * @param {Number} playerIndex   the index of the player.
   * @param {Number} objectID      the object ID of the item to be used.
   * @param {Number} target        the target player of the action.
   */
  battle.showPlayerUseItemAnim = function*(playerIndex, objectID, target) {
    log.debug(['[BATTLE] showPlayerUseItemAnim', playerIndex, objectID, target].join(' '));
    yield battle.delay(4, 0, true);

    setPlayerPosition(playerIndex, function(pos) {
      return PAL_XY(PAL_X(pos) - 15, PAL_Y(pos) - 7);
    });

    setPlayerFrame(playerIndex, 5);

    sound.play(28);

    for (var i = 0; i <= 6; i++) {
      if (target == -1) {
        for (var j = 0; j <= Global.maxPartyMemberIndex; j++) {
          battleService.setPlayerColorShift(j, i);
        }
      } else {
         battleService.setPlayerColorShift(target, i);
      }

      yield battle.delay(1, objectID, true);
    }

    for (var i = 5; i >= 0; i--) {
      if (target == -1) {
        for (var j = 0; j <= Global.maxPartyMemberIndex; j++) {
          battleService.setPlayerColorShift(j, i);
        }
      } else {
        battleService.setPlayerColorShift(target, i);
      }

      yield battle.delay(1, objectID, true);
    }
  };

  /**
   * Show the defensive magic effect for player.
   * @param {Number} playerIndex   the index of the player.
   * @param {Number} objectID      the object ID of the magic to be used.
   * @param {Number} target        the target player of the action.
   */
  battle.showPlayerDefMagicAnim = function*(playerIndex, objectID, target) {
    log.debug(['[BATTLE] showPlayerDefMagicAnim', playerIndex, objectID, target].join(' '));
    var magicNum = GameData.object[objectID].magic.magicNumber;
    var effectNum = GameData.magic[magicNum].effect;

    var effectSprite = new Sprite(Files.FIRE.decompressChunk(effectNum));
    var n = effectSprite.frameCount;

    var sceneBuf = BATTLE().sceneBuf;
    var screen = surface.byteBuffer;

    var i, l, x, y;

    setPlayerFrame(playerIndex, 6);
    yield battle.delay(1, 0, true);

    for (i = 0; i < n; i++) {
      var frame = effectSprite.getFrame(i);

      if (i == GameData.magic[magicNum].soundDelay) {
         sound.play(GameData.magic[magicNum].sound);
      }

      battle.makeScene();
      surface.blitSurface(sceneBuf, null, screen, null);

      if (GameData.magic[magicNum].type == MagicType.ApplyToParty) {
        if (target != -1) {
          throw 'should not be here';
        }
        for (l = 0; l <= Global.maxPartyMemberIndex; l++) {
          var pos = BATTLE().player[l].pos;
          x = PAL_X(pos);
          y = PAL_Y(pos);

          x += SHORT(GameData.magic[magicNum].offsetX);
          y += SHORT(GameData.magic[magicNum].offsetY);

          surface.blitRLE(
            frame,
            PAL_XY(x - ~~(frame.width / 2), y - frame.height)
          );
        }
      } else if (GameData.magic[magicNum].type == MagicType.ApplyToPlayer ||
                 GameData.magic[magicNum].type == MagicType.Trance) {
        var effectTarget = (target === -1 ? playerIndex : target);

        var targetPos = BATTLE().player[effectTarget].pos;
        x = PAL_X(targetPos);
        y = PAL_Y(targetPos);

        x += SHORT(GameData.magic[magicNum].offsetX);
        y += SHORT(GameData.magic[magicNum].offsetY);

        surface.blitRLE(
          frame,
          PAL_XY(x - ~~(frame.width / 2), y - frame.height)
        );

        // Repaint the previous player
        if (effectTarget > 0 && BATTLE().hidingTime == 0) {
          if (Global.playerStatus[Global.party[effectTarget - 1].playerRole][PlayerStatus.Confused] == 0) {
            var targetPlayer = BATTLE().player[effectTarget - 1];
            var p = targetPlayer.sprite.getFrame(targetPlayer.currentFrame)
            x = PAL_X(targetPlayer.pos);
            y = PAL_Y(targetPlayer.pos);

            x -= ~~(p.width / 2);
            y -= p.height;

            surface.blitRLE(p, PAL_XY(x, y));
          }
        }
      } else {
        throw 'should not be here';
      }

      yield uibattle.update();
      surface.updateScreen(null);

      yield sleepByFrame(1);
    }

    for (i = 0; i < 6; i++) {
      if (GameData.magic[magicNum].type == MagicType.ApplyToParty) {
        for (j = 0; j <= Global.maxPartyMemberIndex; j++) {
          battleService.setPlayerColorShift(j, i);
        }
      } else {
        var effectTarget = (GameData.magic[magicNum].type == MagicType.Trance && target === -1)
          ? playerIndex
          : target;
        battleService.setPlayerColorShift(effectTarget, i);
      }

      yield battle.delay(1, 0, true);
    }

    for (i = 6; i >= 0; i--) {
      if (GameData.magic[magicNum].type == MagicType.ApplyToParty) {
        for (j = 0; j <= Global.maxPartyMemberIndex; j++) {
          battleService.setPlayerColorShift(j, i);
        }
      } else {
        var effectTarget = (GameData.magic[magicNum].type == MagicType.Trance && target === -1)
          ? playerIndex
          : target;
        battleService.setPlayerColorShift(effectTarget, i);
      }

      yield battle.delay(1, 0, true);
    }
  };

  /**
   * Show the offensive magic animation for player.
   * @param {Number} playerIndex   the index of the player.
   * @param {Number} objectID      the object ID of the magic to be used.
   * @param {Number} target        the target player of the action.
   */
  battle.showPlayerOffMagicAnim = function*(playerIndex, objectID, target) {
    log.debug(['[BATTLE] showPlayerOffMagicAnim', playerIndex, objectID, target].join(' '));
    playerIndex = SHORT(playerIndex);
    var magicNum = GameData.object[objectID].magic.magicNumber;
    var effectNum = GameData.magic[magicNum].effect;

    var effectSprite = new Sprite(Files.FIRE.decompressChunk(effectNum));
    var n = effectSprite.frameCount;

    var i, k, x, y, l;

    yield battle.delay(1, 0, true);

    l = n - GameData.magic[magicNum].soundDelay;
    l *= SHORT(GameData.magic[magicNum].effectTimes);
    l += n;
    l += GameData.magic[magicNum].shake;

    var wave = Global.screenWave;
    Global.screenWave += GameData.magic[magicNum].wave;

    for (i = 0; i < l; i++) {
      var frame;

      if (i == GameData.magic[magicNum].soundDelay && playerIndex != -1) {
        setPlayerFrame(playerIndex, 6);
      }

      var blow = ((BATTLE().blow > 0) ? randomLong(0, BATTLE().blow) : randomLong(BATTLE().blow, 0));

      for (k = 0; k <= BATTLE().maxEnemyIndex; k++) {
        var enemy = BATTLE().enemy[k];
        if (enemy.objectID == 0) {
          continue;
        }

        x = PAL_X(enemy.pos) + blow;
        y = PAL_Y(enemy.pos) + ~~(blow / 2);

        battleService.setEnemyPosition(k, PAL_XY(x, y));
      }

      if (l - i > GameData.magic[magicNum].shake) {
        if (i < n) {
          k = i;
        } else {
          k = i - GameData.magic[magicNum].soundDelay;
          k %= n - GameData.magic[magicNum].soundDelay;
          k += GameData.magic[magicNum].soundDelay;
        }

        frame = effectSprite.getFrame(k);

        if ((i - GameData.magic[magicNum].soundDelay) % n == 0) {
          sound.play(GameData.magic[magicNum].sound);
        }
      } else {
        yield surface.shakeScreen(i, 3);
        frame = effectSprite.getFrame((l - GameData.magic[magicNum].shake - 1) % n);
      }

      battle.makeScene();
      surface.blitSurface(BATTLE().sceneBuf, null, surface.byteBuffer, null);

      yield sleepByFrame(1);

      if (GameData.magic[magicNum].type == MagicType.Normal) {
        if (target == -1) {
          throw 'should not be here';
        }
        var targetEnemy = BATTLE().enemy[target];
        x = PAL_X(targetEnemy.pos);
        y = PAL_Y(targetEnemy.pos);

        x += SHORT(GameData.magic[magicNum].offsetX);
        y += SHORT(GameData.magic[magicNum].offsetY);

        surface.blitRLE(
          frame,
          PAL_XY(x - ~~(frame.width / 2), y - frame.height)
        );

        if (i == l - 1 && Global.screenWave < 9 && GameData.magic[magicNum].keepEffect == 0xFFFF) {
          surface.blitRLE(
            frame,
            PAL_XY(x - ~~(frame.width / 2), y - frame.height),
            BATTLE().background
          );
        }
      } else if (GameData.magic[magicNum].type == MagicType.AttackAll) {
        var effectPos = [ [70, 140], [100, 110], [160, 100] ];
        if (target != -1) {
          throw 'should not be here'
        }

        for (k = 0; k < 3; k++) {
          x = effectPos[k][0];
          y = effectPos[k][1];

          x += SHORT(GameData.magic[magicNum].offsetX);
          y += SHORT(GameData.magic[magicNum].offsetY);

          surface.blitRLE(
            frame,
            PAL_XY(x - ~~(frame.width / 2), y - frame.height)
          );

          if (i == l - 1 && Global.screenWave < 9 && GameData.magic[magicNum].keepEffect == 0xFFFF) {
            surface.blitRLE(
              frame,
              PAL_XY(x - ~~(frame.width / 2), y - frame.height),
              BATTLE().background
            );
          }
        }
      } else if (GameData.magic[magicNum].type == MagicType.AttackWhole ||
                 GameData.magic[magicNum].type == MagicType.AttackField) {
        if (target != -1) {
          throw 'should not be here'
        }

        if (GameData.magic[magicNum].type == MagicType.AttackWhole) {
          x = 120;
          y = 100;
        } else {
          x = 160;
          y = 200;
        }

        x += SHORT(GameData.magic[magicNum].offsetX);
        y += SHORT(GameData.magic[magicNum].offsetY);

        surface.blitRLE(
          frame,
          PAL_XY(x - ~~(frame.width / 2), y - frame.height)
        );

        if (i == l - 1 && Global.screenWave < 9 && GameData.magic[magicNum].keepEffect == 0xFFFF) {
          surface.blitRLE(
            frame,
            PAL_XY(x - ~~(frame.width / 2), y - frame.height),
            BATTLE().background
          );
        }
      } else {
        throw 'should not be here';
      }

      yield uibattle.update();
      surface.updateScreen(null);
    }

    Global.screenWave = wave;
    yield surface.shakeScreen(0, 0);

    for (i = 0; i <= BATTLE().maxEnemyIndex; i++) {
      var originalPos = BATTLE().enemy[i].originalPos;
      battleService.setEnemyPosition(i, originalPos);
    }
  };

  /**
   * Show the offensive magic animation for enemy.
   * @param {Number} objectID      the object ID of the magic to be used.
   * @param {Number} target        the target player index of the action.
   */
  battle.showEnemyMagicAnim = function*(objectID, target) {
    log.debug(['[BATTLE] showEnemyMagicAnim', objectID, target].join(' '));
    var magicNum = GameData.object[objectID].magic.magicNumber;
    var effectNum = GameData.magic[magicNum].effect;

    var effectSprite = new Sprite(Files.FIRE.decompressChunk(effectNum));

    var n = effectSprite.frameCount;

    var l = n - GameData.magic[magicNum].soundDelay;
    l *= SHORT(GameData.magic[magicNum].effectTimes);
    l += n;
    l += GameData.magic[magicNum].shake;

    var wave = Global.screenWave;
    Global.screenWave += GameData.magic[magicNum].wave;
    var x, y;

    for (var i = 0; i < l; i++) {
      var rle;

      var blow = ((BATTLE().blow > 0) ? randomLong(0, BATTLE().blow) : randomLong(BATTLE().blow, 0));

      for (var k = 0; k <= Global.maxPartyMemberIndex; k++) {
        var playerPos = BATTLE().player[k].pos;
        x = PAL_X(playerPos) + blow;
        y = PAL_Y(playerPos) + ~~(blow / 2);

        setPlayerPosition(k, PAL_XY(x, y));
      }

      if (l - i > GameData.magic[magicNum].shake) {
        if (i < n) {
          k = i;
        } else {
          k = i - GameData.magic[magicNum].soundDelay;
          k %= n - GameData.magic[magicNum].soundDelay;
          k += GameData.magic[magicNum].soundDelay;
        }

        rle = effectSprite.getFrame(k);

        if (i == GameData.magic[magicNum].soundDelay) {
          sound.play(GameData.magic[magicNum].sound);
        }
      } else {
        yield surface.shakeScreen(i, 3)
        rle = effectSprite.getFrame((l - GameData.magic[magicNum].shake - 1) % n);
      }

      battle.makeScene();
      surface.blitSurface(BATTLE().sceneBuf, null, surface.byteBuffer, null);

      if (GameData.magic[magicNum].type == MagicType.Normal) {
        if (target == -1) {
          throw 'should not be here';
        }

        x = PAL_X(BATTLE().player[target].pos);
        y = PAL_Y(BATTLE().player[target].pos);

        x += SHORT(GameData.magic[magicNum].offsetX);
        y += SHORT(GameData.magic[magicNum].offsetY);

        surface.blitRLE(
          rle,
          PAL_XY(x - ~~(rle.width / 2), y - rle.height)
        );

        if (i == l - 1 && Global.screenWave < 9 && GameData.magic[magicNum].keepEffect == 0xFFFF) {
          surface.blitRLE(
            rle,
            PAL_XY(x - ~~(rle.width / 2), y - rle.height),
            BATTLE().background
          );
        }
      }
      else if (GameData.magic[magicNum].type == MagicType.AttackAll) {
        var effectPos = [ [180, 180], [234, 170], [270, 146]];

        if (target != -1) {
          throw 'should not be here';
        }

        for (var k = 0; k < 3; k++) {
          x = effectPos[k][0];
          y = effectPos[k][1];

          x += SHORT(GameData.magic[magicNum].offsetX);
          y += SHORT(GameData.magic[magicNum].offsetY);

          surface.blitRLE(
            rle,
            PAL_XY(x - ~~(rle.width / 2), y - rle.height)
          );

          if (i == l - 1 && Global.screenWave < 9 && GameData.magic[magicNum].keepEffect == 0xFFFF) {
            surface.blitRLE(
              rle,
              PAL_XY(x - ~~(rle.width / 2), y - rle.height),
              BATTLE().background
            );
          }
        }
      } else if (GameData.magic[magicNum].type == MagicType.AttackWhole ||
                 GameData.magic[magicNum].type == MagicType.AttackField) {
        if (target != -1) {
          throw 'should not be here';
        }

        if (GameData.magic[magicNum].type == MagicType.AttackWhole) {
          x = 240;
          y = 150;
        } else {
          x = 160;
          y = 200;
        }

        x += SHORT(GameData.magic[magicNum].offsetX);
        y += SHORT(GameData.magic[magicNum].offsetY);


        surface.blitRLE(
          rle,
          PAL_XY(x - ~~(rle.width / 2), y - rle.height)
        );

        if (i == l - 1 && Global.screenWave < 9 && GameData.magic[magicNum].keepEffect == 0xFFFF) {
          surface.blitRLE(
            rle,
            PAL_XY(x - ~~(rle.width / 2), y - rle.height),
            BATTLE().background
          );
        }
      } else {
        throw 'should not be here';
      }

      yield uibattle.update();

      surface.updateScreen(null);

      yield sleepByFrame(1);
    }

    Global.screenWave = wave;
    yield surface.shakeScreen(0, 0);

    for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
      setPlayerPosition(i, BATTLE().player[i].originalPos);
    }
  };

  /**
   * Show the summon magic animation for player.
   * @param {Number} playerIndex   the index of the player.
   * @param {Number} objectID      the object ID of the magic to be used.
   */
  battle.showPlayerSummonMagicAnim = function*(playerIndex, objectID) {
    log.debug(['[BATTLE] showPlayerSummonMagicAnim', playerIndex, objectID].join(' '));
    var magicNum = GameData.object[objectID].magic.magicNumber;
    var effectMagicID = 0;

    for (effectMagicID = 0; effectMagicID < Const.MAX_OBJECTS; effectMagicID++) {
      if (GameData.object[effectMagicID].magic.magicNumber ==
          GameData.magic[magicNum].effect) {
        break;
      }
    }

    if (effectMagicID >= Const.MAX_OBJECTS) {
      throw 'should not be here';
    }
    // Brighten the players
    for (var i = 1; i <= 10; i++) {
      for (var j = 0; j <= Global.maxPartyMemberIndex; j++) {
        mutatePlayer(j, function(player) {
          player.colofShift = i;
          return player;
        });
      }

      yield battle.delay(1, objectID, true);
    }

    battle.backupScene();

    // Load the sprite of the summoned god
    var effectSpriteNum = GameData.magic[magicNum].summonEffect + 10;

    setBattleField('summonSprite', new Sprite(Files.F.decompressChunk(effectSpriteNum)));

    setBattleField('summonFrame', 0);
    setBattleField('summonPos', PAL_XY(
      230 + SHORT(GameData.magic[magicNum].offsetX),
      155 + SHORT(GameData.magic[magicNum].offsetY)
    ));
    setBattleField('backgroundColorShift', SHORT(GameData.magic[magicNum].effectTimes));

    // Fade in the summoned god
    battle.makeScene();
    yield battle.fadeScene();

    // Show the animation of the summoned god
    // TODO: There is still something missing here compared to the original game.
    while (BATTLE().summonFrame < BATTLE().summonSprite.frameCount - 1) {
      battle.makeScene();
      surface.blitSurface(BATTLE().sceneBuf, null, surface.byteBuffer, null);

      yield uibattle.update();

      surface.updateScreen(null);

      yield sleepByFrame(1);

      setBattleField('summonFrame', function(frame) {
        return (frame || 0) + 1;
      });
    }

    // Show the actual magic effect
    yield battle.showPlayerOffMagicAnim(-1, effectMagicID, -1);
  };

  /**
   * Show the post-magic animation.
   */
  battle.showPostMagicAnim = function*() {
    log.debug(['[BATTLE] showPostMagicAnim'].join(' '));
    var dist = 8;
    var enemyPosBak = new Array(Const.MAX_ENEMIES_IN_TEAM);

    for (var i = 0; i < Const.MAX_ENEMIES_IN_TEAM; i++) {
      var storedEnemy = BATTLE().enemy[i];
      enemyPosBak[i] = storedEnemy ? PAL_XY(PAL_X(storedEnemy.pos), PAL_Y(storedEnemy.pos)) : PAL_XY(0, 0);
    }

    for (var i = 0; i < 3; i++) {
      for (var j = 0; j <= BATTLE().maxEnemyIndex; j++) {
        var enemy = BATTLE().enemy[j];
        if (enemy.e.health == enemy.prevHP) {
          continue;
        }

        var x = PAL_X(enemy.pos);
        var y = PAL_Y(enemy.pos);

        x -= dist;
        y -= ~~(dist / 2);

        battleService.setEnemyPosition(j, PAL_XY(x, y));
        battleService.setEnemyColorShift(j, (i == 1) ? 6 : 0);
      }

      yield battle.delay(1, 0, true);
      dist = ~~(dist / -2);
    }

    for (var i = 0; i < Const.MAX_ENEMIES_IN_TEAM; i++) {
      battleService.setEnemyPosition(i, enemyPosBak[i]);
    }

    yield battle.delay(1, 0, true);
  };

  /**
   * Validate player's action, fallback to other action when needed.
   * @param {Number} playerIndex   the index of the player.
   */
  battle.playerValidateAction = function(playerIndex) {
    log.debug(['[BATTLE] playerValidateAction', playerIndex].join(' '));
    var playerRole = Global.party[playerIndex].playerRole;
    var objectID = BATTLE().player[playerIndex].action.actionID;
    var target = BATTLE().player[playerIndex].action.target;
    var valid = true;
    var toEnemy = false;
    var setActionField = function(field, value) {
      mutatePlayerAction(playerIndex, function(action) {
        action[field] = value;
        return action;
      });
    };

    switch (BATTLE().player[playerIndex].action.actionType) {
    case BattleActionType.Attack:
      toEnemy = true;
      break;

    case BattleActionType.Pass:
      break;

    case BattleActionType.Defend:
      break;

    case BattleActionType.Magic:
      // Make sure player actually has the magic to be used
      for (var i = 0; i < Const.MAX_PLAYER_MAGICS; i++) {
        if (GameData.playerRoles.magic[i][playerRole] == objectID) {
          break; // player has this magic
        }
      }

      if (i >= Const.MAX_PLAYER_MAGICS) {
        valid = false;
      }

      var w = GameData.object[objectID].magic.magicNumber;

      if (Global.playerStatus[playerRole][PlayerStatus.Silence] > 0) {
        // Player is silenced
        valid = false;
      }

      if (GameData.playerRoles.MP[playerRole] <
          GameData.magic[w].costMP) {
        // No enough MP
        valid = false;
      }

      // Fallback to physical attack if player is using an offensive magic,
      // defend if player is using a defensive or healing magic
      if (GameData.object[objectID].magic.flags & MagicFlag.UsableToEnemy) {
        if (!valid)
        {
          setActionField('actionType', BattleActionType.Attack);
        }
        else if (GameData.object[objectID].magic.flags & MagicFlag.ApplyToAll) {
          setActionField('target', -1);
          target = -1;
        } else if (target == -1) {
          var autoTarget = battle.selectAutoTarget();
          setActionField('target', autoTarget);
          target = autoTarget;
        }

        toEnemy = true;
      } else {
        if (!valid) {
          setActionField('actionType', BattleActionType.Defend);
        } else if (GameData.object[objectID].magic.flags & MagicFlag.ApplyToAll) {
          setActionField('target', -1);
          target = -1;
        } else if (BATTLE().player[playerIndex].action.target == -1) {
          setActionField('target', playerIndex);
          target = playerIndex;
        }
      }
      break;

    case BattleActionType.CoopMagic:
      toEnemy = true;

      for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
        var w = Global.party[i].playerRole;

        if (battle.isPlayerDying(w) ||
            Global.playerStatus[w][PlayerStatus.Silence] > 0 ||
            Global.playerStatus[w][PlayerStatus.Sleep] > 0 ||
            Global.playerStatus[w][PlayerStatus.Paralyzed] > 0 ||
            Global.playerStatus[w][PlayerStatus.Confused] > 0) {
          setActionField('actionType', BattleActionType.Attack);
          break;
        }
      }

      if (BATTLE().player[playerIndex].action.actionType == BattleActionType.CoopMagic) {
        if (GameData.object[objectID].magic.flags & MagicFlag.ApplyToAll) {
          setActionField('target', -1);
          target = -1;
        } else if (target == -1) {
          var autoTarget = battle.selectAutoTarget();
          setActionField('target', autoTarget);
          target = autoTarget;
        }
      }
      break;

    case BattleActionType.Flee:
      break;

    case BattleActionType.ThrowItem:
      toEnemy = true;

      if (script.getItemAmount(objectID) == 0) {
        setActionField('actionType', BattleActionType.Attack);
      } else if (GameData.object[objectID].item.flags & ItemFlag.ApplyToAll) {
        setActionField('target', -1);
        target = -1;
      } else if (BATTLE().player[playerIndex].action.target == -1) {
        var autoTarget = battle.selectAutoTarget();
        setActionField('target', autoTarget);
        target = autoTarget;
      }
      break;

    case BattleActionType.UseItem:
      if (script.getItemAmount(objectID) == 0) {
        setActionField('actionType', BattleActionType.Defend);
      } else if (GameData.object[objectID].item.flags & ItemFlag.ApplyToAll) {
        setActionField('target', -1);
        target = -1;
      } else if (BATTLE().player[playerIndex].action.target == -1) {
        setActionField('target', playerIndex);
        target = playerIndex;
      }
      break;

    case BattleActionType.AttackMate:
      if (Global.playerStatus[playerRole][PlayerStatus.Confused] == 0) {
        // Attack enemies instead if player is not confused
        toEnemy = true;
        setActionField('actionType', BattleActionType.Attack);
      } else {
        for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
          if (i != playerIndex && GameData.playerRoles.HP[Global.party[i].playerRole] != 0) {
            break;
          }
        }

        if (i > Global.maxPartyMemberIndex) {
          // Attack enemies if no one else is alive
          toEnemy = true;
          setActionField('actionType', BattleActionType.Attack);
        }
      }
      break;
    }

    // Check if player can attack all enemies at once, or attack one enemy
    if (BATTLE().player[playerIndex].action.actionType == BattleActionType.Attack) {
      if (target == -1) {
        if (!script.playerCanAttackAll(playerRole)) {
          var autoTarget = battle.selectAutoTarget();
          setActionField('target', autoTarget);
          target = autoTarget;
        }
      } else if (script.playerCanAttackAll(playerRole)) {
        setActionField('target', -1);
        target = -1;
      }
    }

    if (toEnemy && BATTLE().player[playerIndex].action.target >= 0) {
      if (BATTLE().enemy[BATTLE().player[playerIndex].action.target].objectID == 0) {
        var autoTarget = battle.selectAutoTarget();
        setActionField('target', autoTarget);
        target = autoTarget;
        if (autoTarget < 0) {
          throw 'should not be here';
        }
        //assert(BATTLE().player[playerIndex].action.target >= 0);
      }
    }
  };

  /**
   * Perform the selected action for a player.
   * @param {Number} playerIndex   the index of the player.
   */
  battle.playerPerformAction = function*(playerIndex) {
    log.debug(['[BATTLE] playerPerformAction', playerIndex].join(' '));
    var playerRole = Global.party[playerIndex].playerRole;
    var coopPos = [ [208, 157], [234, 170], [260, 183] ];

    setBattleField('movingPlayerIndex', playerIndex);
    battleService.setBattleBlow(0);

    battle.playerValidateAction(playerIndex);
    battle.backupStat();

    var target = BATTLE().player[playerIndex].action.target;
    var str, def, res, damage;
    var x, y;

    switch (BATTLE().player[playerIndex].action.actionType) {
      case BattleActionType.Attack:
        if (target != -1) {
          // Attack one enemy
          for (var t = 0; t < (Global.playerStatus[playerRole][PlayerStatus.DualAttack] ? 2 : 1); t++) {
            str = script.getPlayerAttackStrength(playerRole);
            def = BATTLE().enemy[target].e.defense;
            def += (BATTLE().enemy[target].e.level + 6) * 4;
            res = BATTLE().enemy[target].e.physicalResistance;
            var critical = false;

            //str = 999; // TODO
            damage = battle.calcPhysicalAttackDamage(str, def, res);
            damage += randomLong(1, 2);

            if (randomLong(0, 5) == 0 || Global.playerStatus[playerRole][PlayerStatus.Bravery] > 0) {
              // Critical Hit
              damage *= 3;
              critical = true;
            }

            if (playerRole == 0 && randomLong(0, 11) == 0) {
              // Bonus hit for Li Xiaoyao
              damage *= 2;
              critical = true;
            }

            damage = SHORT(~~(damage * randomFloat(1, 1.125)));

            if (damage <= 0) {
              damage = 1;
            }

            if (SUPER_ATTACK) {
              damage = 6666;
            }

            battleService.setEnemyHealth(target, function(health) {
              return (health || 0) - damage;
            });

            if (t == 0) {
               setPlayerFrame(playerIndex, 7);
               yield battle.delay(4, 0, true);
            }

            yield battle.showPlayerAttackAnim(playerIndex, critical);
          }
        } else {
          // Attack all enemies
          for (var t = 0; t < (Global.playerStatus[playerRole][PlayerStatus.DualAttack] ? 2 : 1); t++) {
            var division = 1;
            var indices = [ 2, 1, 0, 4, 3 ];

            var critical = (randomLong(0, 5) == 0 || Global.playerStatus[playerRole][PlayerStatus.Bravery] > 0);

            if (t == 0) {
              setPlayerFrame(playerIndex, 7);
              yield battle.delay(4, 0, true);
            }

            for (var i = 0; i < Const.MAX_ENEMIES_IN_TEAM; i++) {
              var enemy = BATTLE().enemy[indices[i]];
              if (enemy.objectID == 0 ||
                 indices[i] > BATTLE().maxEnemyIndex) {
                continue;
              }

              str = script.getPlayerAttackStrength(playerRole);
              def = enemy.e.defense;
              def += (enemy.e.level + 6) * 4;
              res = enemy.e.physicalResistance;

              //str = 999; // TODO
              damage = battle.calcPhysicalAttackDamage(str, def, res);
              damage += randomLong(1, 2);

              if (critical) {
                // Critical Hit
                damage *= 3;
              }

              damage = ~~(damage / division);

              damage = SHORT(~~(damage * randomFloat(1, 1.125)));

              if (damage <= 0) {
                damage = 1;
              }

              if (SUPER_ATTACK) {
                damage = 6666;
              }

              (function(enemyIndex, delta) {
                battleService.setEnemyHealth(enemyIndex, function(health) {
                  return (health || 0) - delta;
                });
              })(indices[i], damage);

              division++;
              if (division > 3) {
                division = 3;
              }
            }

            yield battle.showPlayerAttackAnim(playerIndex, critical);
          }
        }

        battle.updateFighters();
        battle.makeScene();
        yield battle.delay(3, 0, true);

        Global.exp.attackExp[playerRole].count++;
        Global.exp.healthExp[playerRole].count += randomLong(2, 3);
        break;

      case BattleActionType.AttackMate:
        // Check if there is someone else who is alive
        for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
          if (i == playerIndex) {
            continue;
          }

          if (GameData.playerRoles.HP[Global.party[i].playerRole] > 0) {
            break;
          }
        }

        if (i <= Global.maxPartyMemberIndex) {
          // Pick a target randomly
          do {
            target = randomLong(0, Global.maxPartyMemberIndex);
          } while (target == playerIndex || GameData.playerRoles.HP[Global.party[target].playerRole] == 0);

          for (var j = 0; j < 2; j++) {
            setPlayerFrame(playerIndex, 8);
            yield battle.delay(1, 0, true);

            setPlayerFrame(playerIndex, 0);
            yield battle.delay(1, 0, true);
          }

          yield battle.delay(2, 0, true);

          x = PAL_X(BATTLE().player[target].pos) + 30;
          y = PAL_Y(BATTLE().player[target].pos) + 12;

          setPlayerPosition(playerIndex, PAL_XY(x, y));
          setPlayerFrame(playerIndex, 8);
          yield battle.delay(5, 0, true);

          setPlayerFrame(playerIndex, 9);
          sound.play(GameData.playerRoles.weaponSound[playerRole]);

          str = script.getPlayerAttackStrength(playerRole);
          def = script.getPlayerDefense(Global.party[target].playerRole);
          if (BATTLE().player[target].defending) {
            def *= 2;
          }

          damage = battle.calcPhysicalAttackDamage(str, def, 2);
          if (Global.playerStatus[Global.party[target].playerRole][PlayerStatus.Protect] > 0) {
            damage = ~~(damage / 2);
          }

          if (damage <= 0) {
            damage = 1;
          }

          if (damage > SHORT(GameData.playerRoles.HP[Global.party[target].playerRole])) {
            damage = GameData.playerRoles.HP[Global.party[target].playerRole];
          }

          if (SUPER_DEFENSE) {
            damage = 1;
          }

          GameData.playerRoles.HP[Global.party[target].playerRole] -= damage;

          setPlayerPosition(target, function(pos) {
            return PAL_XY(PAL_X(pos) - 12, PAL_Y(pos) - 6);
          });
          yield battle.delay(1, 0, true);

          battleService.setPlayerColorShift(target, 6);
          yield battle.delay(1, 0, true);

          battle.displayStatChange();

          battleService.setPlayerColorShift(target, 0);
          yield battle.delay(4, 0, true);

          battle.updateFighters();
          yield battle.delay(4, 0, true);
        }

        break;

      case BattleActionType.CoopMagic:
        var object = script.getPlayerCooperativeMagic(Global.party[playerIndex].playerRole);
        var magicNum = GameData.object[object].magic.magicNumber;

        if (GameData.magic[magicNum].type == MagicType.Summon) {
          yield battle.showPlayerPreMagicAnim(playerIndex, true);
          yield battle.showPlayerSummonMagicAnim(-1, object);
        } else {
          for (var i = 1; i <= 6; i++) {
            // Update the position for the player who invoked the action
            x = PAL_X(BATTLE().player[playerIndex].originalPos) * (6 - i);
            y = PAL_Y(BATTLE().player[playerIndex].originalPos) * (6 - i);

            x += coopPos[0][0] * i;
            y += coopPos[0][1] * i;

            x /= 6;
            y /= 6;

            setPlayerPosition(playerIndex, PAL_XY(x, y));

            // Update the position for other players
            var t = 0;

            for (var j = 0; j <= Global.maxPartyMemberIndex; j++) {
              if (j == playerIndex) {
                continue;
              }

              t++;

              x = PAL_X(BATTLE().player[j].originalPos) * (6 - i);
              y = PAL_Y(BATTLE().player[j].originalPos) * (6 - i);

              x += coopPos[t][0] * i;
              y += coopPos[t][1] * i;

              x /= 6;
              y /= 6;

              setPlayerPosition(j, PAL_XY(x, y));
            }

            yield battle.delay(1, 0, true);
          }

          for (var i = Global.maxPartyMemberIndex; i >= 0; i--) {
            if (i == playerIndex) {
              continue;
            }

            setPlayerFrame(i, 5);

            yield battle.delay(3, 0, true);
          }

          battleService.setPlayerColorShift(playerIndex, 6);
          setPlayerFrame(playerIndex, 5);
          sound.play(157);
          yield battle.delay(5, 0, true);

          setPlayerFrame(playerIndex, 6);
          battleService.setPlayerColorShift(playerIndex, 0);
          yield battle.delay(3, 0, true);

          yield battle.showPlayerOffMagicAnim(-1, object, target);
        }

        for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
          GameData.playerRoles.HP[Global.party[i].playerRole] -= GameData.magic[magicNum].costMP;

          if (SHORT(GameData.playerRoles.HP[Global.party[i].playerRole]) <= 0) {
            GameData.playerRoles.HP[Global.party[i].playerRole] = 1;
          }

          // Reset the time meter for everyone when using coopmagic
          mutatePlayer(i, function(player) {
            player.state = FighterState.Wait;
            return player;
          });
        }

        battle.backupStat(); // so that "damages" to players won't be shown

        str = 0;

        for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
          str += script.getPlayerAttackStrength(Global.party[i].playerRole);
          str += script.getPlayerMagicStrength(Global.party[i].playerRole);
        }

        str = ~~(str / 4);

        var damage = 0;

        // Inflict damage to enemies
        if (target == -1) {
          // Attack all enemies
          for (var i = 0; i <= BATTLE().maxEnemyIndex; i++) {
            var enemy = BATTLE().enemy[i];
            if (enemy.objectID == 0) {
              continue;
            }

            def = enemy.e.defense;
            def += (enemy.e.level + 6) * 4;

            damage = battle.calcMagicDamage(str, def, enemy.e.elemResistance, enemy.e.poisonResistance, object);

            if (damage <= 0) {
              damage = 1;
            }

            if (SUPER_ATTACK) {
              damage = 6666;
            }

            battleService.setEnemyHealth(i, function(health) {
              return (health || 0) - damage;
            });
          }
        } else {
          // Attack one enemy
          var targetEnemyState = BATTLE().enemy[target];
          def = targetEnemyState.e.defense;
          def += (targetEnemyState.e.level + 6) * 4;

          damage = battle.calcMagicDamage(str, def, targetEnemyState.e.elemResistance, targetEnemyState.e.poisonResistance, object);

          if (damage <= 0) {
            damage = 1;
          }

          if (SUPER_ATTACK) {
            damage = 6666;
          }

          battleService.setEnemyHealth(target, function(health) {
            return (health || 0) - damage;
          });
        }

        battle.displayStatChange();
        yield battle.showPostMagicAnim();
        yield battle.delay(5, 0, true);

        if (GameData.magic[magicNum].type != MagicType.Summon) {
          yield battle.postActionCheck(false);

          // Move all players back to the original position
          for (var i = 1; i <= 6; i++) {
            // Update the position for the player who invoked the action
            x = PAL_X(BATTLE().player[playerIndex].originalPos) * i;
            y = PAL_Y(BATTLE().player[playerIndex].originalPos) * i;

            x += coopPos[0][0] * (6 - i);
            y += coopPos[0][1] * (6 - i);

            x /= 6;
            y /= 6;

            setPlayerPosition(playerIndex, PAL_XY(x, y));

            // Update the position for other players
            var t = 0;

            for (var j = 0; j <= Global.maxPartyMemberIndex; j++) {
              setPlayerFrame(j, 0);

              if (j == playerIndex) {
                continue;
              }

              t++;

              x = PAL_X(BATTLE().player[j].originalPos) * i;
              y = PAL_Y(BATTLE().player[j].originalPos) * i;

              x += coopPos[t][0] * (6 - i);
              y += coopPos[t][1] * (6 - i);

              x = ~~(x / 6);
              y = ~~(y / 6);

              setPlayerPosition(j, PAL_XY(x, y));
            }

            yield battle.delay(1, 0, true);
          }
        }
        break;

      case BattleActionType.Defend:
        mutatePlayer(playerIndex, function(player) {
          player.defending = true;
          return player;
        });
        Global.exp.defenseExp[playerRole].count += 2;
        break;

      case BattleActionType.Flee:
        str = script.getPlayerFleeRate(playerRole);
        def = 0;

        for (var i = 0; i <= BATTLE().maxEnemyIndex; i++) {
          if (BATTLE().enemy[i].objectID == 0) {
            continue;
          }

          def += SHORT(BATTLE().enemy[i].e.fleeRate);
          def += (BATTLE().enemy[i].e.level + 6) * 2;
        }

        if (SHORT(def) < 0) {
          def = 0;
        }

        if (randomLong(0, str) >= randomLong(0, def) && !BATTLE().isBoss) {
          // Successful escape
          yield battle.playerEscape();
        } else {
          // Failed escape
          setPlayerFrame(playerIndex, 0);

          for (var i = 0; i < 3; i++) {
            setPlayerPosition(playerIndex, function(pos) {
              return PAL_XY(PAL_X(pos) + 4, PAL_Y(pos) + 2);
            });

            yield battle.delay(1, 0, true);
          }

          setPlayerFrame(playerIndex, 1);
          yield battle.delay(8, ui.BATTLE_LABEL_ESCAPEFAIL, true);

          Global.exp.fleeExp[playerRole].count += 2;
        }
        break;

      case BattleActionType.Magic:
        var object = BATTLE().player[playerIndex].action.actionID;
        var magicNum = GameData.object[object].magic.magicNumber;

        yield battle.showPlayerPreMagicAnim(playerIndex, (GameData.magic[magicNum].type == MagicType.Summon));

        if (!Global.autoBattle) {
          GameData.playerRoles.MP[playerRole] -= GameData.magic[magicNum].costMP;
          if (SHORT(GameData.playerRoles.MP[playerRole]) < 0) {
            GameData.playerRoles.MP[playerRole] = 0;
          }
        }

        if (GameData.magic[magicNum].type == MagicType.ApplyToPlayer ||
            GameData.magic[magicNum].type == MagicType.ApplyToParty ||
            GameData.magic[magicNum].type == MagicType.Trance) {
          // Using a defensive magic
          var w = 0;

          if (BATTLE().player[playerIndex].action.target != -1) {
            w = Global.party[BATTLE().player[playerIndex].action.target].playerRole;
          }
          else if (GameData.magic[magicNum].type == MagicType.Trance) {
            w = playerRole;
          }

          GameData.object[object].magic.scriptOnUse = yield script.runTriggerScript(GameData.object[object].magic.scriptOnUse, playerRole);

          if (script.scriptSuccess) {
            yield battle.showPlayerDefMagicAnim(playerIndex, object, target);

            GameData.object[object].magic.scriptOnSuccess = yield script.runTriggerScript(GameData.object[object].magic.scriptOnSuccess, w);

            if (script.scriptSuccess) {
              if (GameData.magic[magicNum].type == MagicType.Trance) {
                for (var i = 0; i < 6; i++) {
                  battleService.setPlayerColorShift(playerIndex, i * 2);
                  yield battle.delay(1, 0, true);
                }

                battle.backupScene();
                battle.loadBattleSprites();

                battleService.setPlayerColorShift(playerIndex, 0);

                battle.makeScene();
                yield battle.fadeScene();
              }
            }
          }
        } else {
          // Using an offensive magic
          GameData.object[object].magic.scriptOnUse = yield script.runTriggerScript(GameData.object[object].magic.scriptOnUse, playerRole);

          if (script.scriptSuccess) {
            if (GameData.magic[magicNum].type == MagicType.Summon) {
              yield battle.showPlayerSummonMagicAnim(playerIndex, object);
            } else {
              yield battle.showPlayerOffMagicAnim(playerIndex, object, target);
            }

            GameData.object[object].magic.scriptOnSuccess = yield script.runTriggerScript(GameData.object[object].magic.scriptOnSuccess, WORD(target));

            // Inflict damage to enemies
            if (SHORT(GameData.magic[magicNum].baseDamage) > 0) {
              if (target == -1) {
                // Attack all enemies
                for (var i = 0; i <= BATTLE().maxEnemyIndex; i++) {
                  var enemy = BATTLE().enemy[i];
                  if (enemy.objectID == 0) {
                    continue;
                  }

                  str = script.getPlayerMagicStrength(playerRole);
                  def = enemy.e.defense;
                  def += (enemy.e.level + 6) * 4;

                  damage = battle.calcMagicDamage(str, def, enemy.e.elemResistance, enemy.e.poisonResistance, object);

                  if (damage <= 0) {
                    damage = 1;
                  }

                  if (SUPER_ATTACK) {
                    damage = 6666;
                  }

                  (function(enemyIndex, delta) {
                    battleService.setEnemyHealth(enemyIndex, function(health) {
                      return (health || 0) - delta;
                    });
                  })(i, damage);
                }
              } else {
                // Attack one enemy
                var targetEnemy = BATTLE().enemy[target];
                str = script.getPlayerMagicStrength(playerRole);
                def = targetEnemy.e.defense;
                def += (targetEnemy.e.level + 6) * 4;

                damage = battle.calcMagicDamage(str, def,
                  targetEnemy.e.elemResistance, targetEnemy.e.poisonResistance, object);

                if (damage <= 0) {
                  damage = 1;
                }

                if (SUPER_ATTACK) {
                  damage = 6666;
                }

                battleService.setEnemyHealth(target, function(health) {
                  return (health || 0) - damage;
                });
              }
            }
          }
        }

        battle.displayStatChange();
        yield battle.showPostMagicAnim();
        yield battle.delay(5, 0, true);

        Global.exp.magicExp[playerRole].count += randomLong(2, 3);
        Global.exp.magicPowerExp[playerRole].count++;
        break;

      case BattleActionType.ThrowItem:
        var player = BATTLE().player[playerIndex];
        var object = player.action.actionID;

        for (var i = 0; i < 4; i++) {
          setPlayerPosition(playerIndex, function(pos) {
            return PAL_XY(PAL_X(pos) - (4 - i), PAL_Y(pos) - (4 - i) / 2);
          });

          yield battle.delay(1, 0, true);
        }

        yield battle.delay(2, object, true);

        setPlayerFrame(playerIndex, 5);
        sound.play(GameData.playerRoles.magicSound[playerRole]);

        yield battle.delay(8, object, true);

        setPlayerFrame(playerIndex, 6);
        yield battle.delay(2, object, true);

        // Run the script
        GameData.object[object].item.scriptOnThrow =
           yield script.runTriggerScript(GameData.object[object].item.scriptOnThrow, WORD(target));

        // Remove the thrown item from inventory
        script.addItemToInventory(object, -1);

        battle.displayStatChange();
        yield battle.delay(4, 0, true);
        battle.updateFighters();
        yield battle.delay(4, 0, true);

        break;

      case BattleActionType.UseItem:
        var object = BATTLE().player[playerIndex].action.actionID;
        var item = GameData.object[object].item;

        yield battle.showPlayerUseItemAnim(playerIndex, object, target);

        // Run the script
        item.scriptOnUse = yield script.runTriggerScript(item.scriptOnUse, (target == -1) ? 0xFFFF : Global.party[target].playerRole);

        if (item.flags & ItemFlag.Consuming) {
          script.addItemToInventory(object, -1);
        }

        if (BATTLE().hidingTime < 0) {
          battleService.setHidingTime(-BATTLE().hidingTime);
          battle.backupScene();
          battle.makeScene();
          yield battle.fadeScene();
        }

        battle.updateFighters();
        battle.displayStatChange();
        yield battle.delay(8, 0, true);
        break;

      case BattleActionType.Pass:
        break;
    }

    // Revert this player back to waiting state.
    mutatePlayer(playerIndex, function(player) {
      player.state = FighterState.Wait;
      player.timeMeter = 0;
      return player;
    });

    yield battle.postActionCheck(false);
  };

  /**
   * Select a attackable player randomly.
   * @return {Number}
   */
  battle.enemySelectTargetIndex = function() {
    log.debug(['[BATTLE] enemySelectTargetIndex'].join(' '));
    var i = randomLong(0, Global.maxPartyMemberIndex);
    while (GameData.playerRoles.HP[Global.party[i].playerRole] == 0) {
      i = randomLong(0, Global.maxPartyMemberIndex);
    }

    return i;
  };

  /**
   * Perform the selected action for a player.
   * @param  {Number} enemyIndex the index of the player.
   */
  battle.enemyPerformAction = function*(enemyIndex) {
    var elementalResistance = utils.initArray(0, Const.NUM_MAGIC_ELEMENTAL);
    var autoDefend = false;
    var magAutoDefend = utils.initArray(false, Const.MAX_PLAYERS_IN_PARTY);
    battle.backupStat();
    battleService.setBattleBlow(0);

    var enemy = BATTLE().enemy[enemyIndex];
    var target = battle.enemySelectTargetIndex();
    var playerRole = Global.party[target].playerRole;
    var magic = enemy.e.magic;
    var magicNum;
    var soundNum;
    var str, def, x, y, ex, ey;
    var damage;

    if (enemy.status[PlayerStatus.Sleep] > 0 ||
        enemy.status[PlayerStatus.Paralyzed] > 0 ||
        BATTLE().hidingTime > 0) {
      // Do nothing
      return end();
    } else if (enemy.status[PlayerStatus.Confused] > 0) {
      // TODO
    } else if (magic != 0 && randomLong(0, 9) < enemy.e.magicRate &&
      enemy.status[PlayerStatus.Silence] == 0) {
      // Magical attack
      if (magic == 0xFFFF) {
        // Do nothing
        return end();
      }

      magicNum = GameData.object[magic].magic.magicNumber;

      str = SHORT(enemy.e.magicStrength);
      str += (enemy.e.level + 6) * 6;
      if (str < 0) {
        str = 0;
      }

      ex = PAL_X(enemy.pos);
      ey = PAL_Y(enemy.pos);

      ex += 12;
      ey += 6;

      battleService.setEnemyPosition(enemyIndex, PAL_XY(ex, ey));
      enemy = BATTLE().enemy[enemyIndex];
      yield battle.delay(1, 0, false);

      ex += 4;
      ey += 2;

      battleService.setEnemyPosition(enemyIndex, PAL_XY(ex, ey));
      enemy = BATTLE().enemy[enemyIndex];
      yield battle.delay(1, 0, false);

      sound.play(enemy.e.magicSound);

      for (var i = 0; i < enemy.e.magicFrames; i++) {
        battleService.setEnemyFrame(enemyIndex, enemy.e.idleFrames + i);
        enemy = BATTLE().enemy[enemyIndex];
        yield battle.delay(enemy.e.actWaitFrames, 0, false);
      }

      if (enemy.e.magicFrames == 0) {
         yield battle.delay(1, 0, false);
      }

      if (GameData.magic[magicNum].soundDelay == 0) {
        for (var i = 0; i <= enemy.e.attackFrames; i++) {
          battleService.setEnemyFrame(enemyIndex, i - 1 + enemy.e.idleFrames + enemy.e.magicFrames);
          enemy = BATTLE().enemy[enemyIndex];
          yield battle.delay(enemy.e.actWaitFrames, 0, false);
        }
      }

      if (GameData.magic[magicNum].type != MagicType.Normal) {
        target = -1;

        for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
          w = Global.party[i].playerRole;

          if (Global.playerStatus[w][PlayerStatus.Sleep] == 0 &&
              Global.playerStatus[w][PlayerStatus.Paralyzed] == 0 &&
              Global.playerStatus[w][PlayerStatus.Confused] == 0 &&
              randomLong(0, 2) == 0 &&
              GameData.playerRoles.HP[w] != 0) {
            magAutoDefend[i] = true;
            setPlayerFrame(i, 3);
          } else {
            magAutoDefend[i] = false;
          }
        }
      } else if (Global.playerStatus[playerRole][PlayerStatus.Sleep] == 0 &&
                 Global.playerStatus[playerRole][PlayerStatus.Paralyzed] == 0 &&
                 Global.playerStatus[playerRole][PlayerStatus.Confused] == 0 &&
                 randomLong(0, 2) == 0) {
        autoDefend = true;
        setPlayerFrame(target, 3);
      }

      // yield battle.delay(12, (WORD)(-((SHORT)magic)), false);

      GameData.object[magic].magic.scriptOnUse = yield script.runTriggerScript(GameData.object[magic].magic.scriptOnUse, playerRole);

      if (script.scriptSuccess) {
        yield battle.showEnemyMagicAnim(magic, target);

        GameData.object[magic].magic.scriptOnSuccess = yield script.runTriggerScript(GameData.object[magic].magic.scriptOnSuccess, playerRole);
      }

      if (SHORT(GameData.magic[magicNum].baseDamage) > 0) {
        if (target == -1) {
          // damage all players
          for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
            var w = Global.party[i].playerRole;
            if (GameData.playerRoles.HP[w] == 0) {
              // skip dead players
              continue;
            }

            def = script.getPlayerDefense(w);

            for (x = 0; x < Const.NUM_MAGIC_ELEMENTAL; x++) {
              elementalResistance[x] = 5 + ~~(script.getPlayerElementalResistance(w, x) / 20);
            }

            damage = battle.calcMagicDamage(
              str, def, elementalResistance,
              5 + ~~(script.getPlayerPoisonResistance(w) / 20),
              magic
            );

            damage /= ((BATTLE().player[i].defending ? 2 : 1) *
                      ((Global.playerStatus[w][PlayerStatus.Protect] > 0) ? 2 : 1)) +
                      (magAutoDefend[i] ? 1 : 0);
            damage = ~~damage;
            //damage = 999;

            if (damage > GameData.playerRoles.HP[w]) {
              damage = GameData.playerRoles.HP[w];
            }

            if (SUPER_DEFENSE) {
              damage = 1;
            }

            if (!INVINCIBLE) {
              GameData.playerRoles.HP[w] -= damage;
            }

            if (GameData.playerRoles.HP[w] == 0) {
              sound.play(GameData.playerRoles.deathSound[w]);
            }
          }
        } else {
          // damage one player
          def = script.getPlayerDefense(playerRole);

          for (x = 0; x < Const.NUM_MAGIC_ELEMENTAL; x++) {
            elementalResistance[x] = 5 + ~~(script.getPlayerElementalResistance(playerRole, x) / 20);
          }

          damage = battle.calcMagicDamage(
            str, def, elementalResistance,
            5 + ~~(script.getPlayerPoisonResistance(playerRole) / 20),
            magic
          );

          damage /= ((BATTLE().player[target].defending ? 2 : 1) *
                    ((Global.playerStatus[playerRole][PlayerStatus.Protect] > 0) ? 2 : 1)) +
                    (autoDefend ? 1 : 0);
          damage = ~~damage;
          // damage = 999;

          if (damage > GameData.playerRoles.HP[playerRole]) {
            damage = GameData.playerRoles.HP[playerRole];
          }

          if (SUPER_DEFENSE) {
            damage = 1;
          }

          if (!INVINCIBLE) {
            GameData.playerRoles.HP[playerRole] -= damage;
          }

          if (GameData.playerRoles.HP[playerRole] == 0) {
            sound.play(GameData.playerRoles.deathSound[playerRole]);
          }
        }
      }

      if (!Global.autoBattle) {
        battle.displayStatChange();
      }

      for (var i = 0; i < 5; i++) {
        if (target == -1) {
          for (x = 0; x <= Global.maxPartyMemberIndex; x++) {
            var targetPlayer = BATTLE().player[x];
            if (targetPlayer.prevHP ==
                GameData.playerRoles.HP[Global.party[x].playerRole]) {
              // Skip unaffected players
              continue;
            }

            setPlayerFrame(x, 4);
            if (i > 0) {
              setPlayerPosition(x, function(pos) {
                return PAL_XY(
                  PAL_X(pos) + (8 >> i),
                  PAL_Y(pos) + (4 >> i)
                );
              });
            }
            battleService.setPlayerColorShift(x, (i < 3) ? 6 : 0);
          }
        } else {
          var targetPlayer = BATTLE().player[target];
          setPlayerFrame(target, 4);
          if (i > 0) {
            setPlayerPosition(target, function(pos) {
              return PAL_XY(
                PAL_X(pos) + (8 >> i),
                PAL_Y(pos) + (4 >> i)
              );
            });
          }
          battleService.setPlayerColorShift(target, (i < 3) ? 6 : 0);
        }

        yield battle.delay(1, 0, false);
      }

      battleService.setEnemyFrame(enemyIndex, 0);
      battleService.setEnemyPosition(enemyIndex, enemy.originalPos);
      enemy = BATTLE().enemy[enemyIndex];

      yield battle.delay(1, 0, false);
      battle.updateFighters();

      yield battle.postActionCheck(true);
      yield battle.delay(8, 0, true);
    } else {
      // Physical attack
      var targetPlayer = BATTLE().player[target];
      var frameBak = targetPlayer.currentFrame;

      str = SHORT(enemy.e.attackStrength);
      str += (enemy.e.level + 6) * 6;
      if (str < 0) {
        str = 0;
      }

      def = script.getPlayerDefense(playerRole);

      if (targetPlayer.defending) {
        def *= 2;
      }

      sound.play(enemy.e.attackSound);

      var coverIndex = -1;
      var coverPlayer = null;

      autoDefend = (randomLong(0, 16) >= 10);

      // Check if the inflictor should be protected
      if ((battle.isPlayerDying(playerRole) ||
          Global.playerStatus[playerRole][PlayerStatus.Confused] > 0 ||
          Global.playerStatus[playerRole][PlayerStatus.Sleep] > 0 ||
          Global.playerStatus[playerRole][PlayerStatus.Paralyzed] > 0) && autoDefend) {
        var w = GameData.playerRoles.coveredBy[playerRole];

        for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
          if (Global.party[i].playerRole == w) {
            coverIndex = i;
            break;
          }
        }

        if (coverIndex != -1) {
          coverPlayer = Global.party[coverIndex];
          if (battle.isPlayerDying(Global.party[coverIndex].playerRole) ||
              Global.playerStatus[Global.party[coverIndex].playerRole][PlayerStatus.Confused] > 0 ||
              Global.playerStatus[Global.party[coverIndex].playerRole][PlayerStatus.Sleep] > 0 ||
              Global.playerStatus[Global.party[coverIndex].playerRole][PlayerStatus.Paralyzed] > 0) {
            coverIndex = -1;
            coverPlayer = null;
          }
        }
      }

      // If no one can cover the inflictor and inflictor is in a
      // bad status, don't evade
      if (coverIndex == -1 &&
          (Global.playerStatus[playerRole][PlayerStatus.Confused] > 0 ||
           Global.playerStatus[playerRole][PlayerStatus.Sleep] > 0 ||
           Global.playerStatus[playerRole][PlayerStatus.Paralyzed] > 0)) {
        autoDefend = false;
      }

      for (var i = 0; i < enemy.e.magicFrames; i++) {
        battleService.setEnemyFrame(enemyIndex, enemy.e.idleFrames + i);
        enemy = BATTLE().enemy[enemyIndex];
        yield battle.delay(2, 0, false);
      }

      for (var i = 0; i < 3 - enemy.e.magicFrames; i++) {
        x = PAL_X(enemy.pos) - 2;
        y = PAL_Y(enemy.pos) - 1;
        battleService.setEnemyPosition(enemyIndex, PAL_XY(x, y));
        enemy = BATTLE().enemy[enemyIndex];
        yield battle.delay(1, 0, false);
      }

      sound.play(enemy.e.wActionSound);
      yield battle.delay(1, 0, false);

      ex = PAL_X(targetPlayer.pos) - 44;
      ey = PAL_Y(targetPlayer.pos) - 16;

      soundNum = enemy.e.callSound;

      if (coverIndex != -1) {
        soundNum = GameData.playerRoles.coverSound[Global.party[coverIndex].playerRole];

        setPlayerFrame(coverIndex, 3);

        x = PAL_X(targetPlayer.pos) - 24;
        y = PAL_Y(targetPlayer.pos) - 12;

        setPlayerPosition(coverIndex, PAL_XY(x, y));
      } else if (autoDefend) {
        setPlayerFrame(target, 3);
        soundNum = GameData.playerRoles.coverSound[playerRole];
      }

      if (enemy.e.attackFrames == 0) {
        battleService.setEnemyFrame(enemyIndex, enemy.e.idleFrames - 1);
        battleService.setEnemyPosition(enemyIndex, PAL_XY(ex, ey));
        enemy = BATTLE().enemy[enemyIndex];
        yield battle.delay(2, 0, false);
      } else {
        for (var i = 0; i <= enemy.e.attackFrames; i++) {
          battleService.setEnemyFrame(enemyIndex, enemy.e.idleFrames + enemy.e.magicFrames + i - 1);
          battleService.setEnemyPosition(enemyIndex, PAL_XY(ex, ey));
          enemy = BATTLE().enemy[enemyIndex];
          yield battle.delay(enemy.e.actWaitFrames, 0, false);
        }
      }

      if (!autoDefend) {
        setPlayerFrame(target, 4);

        damage = battle.calcPhysicalAttackDamage(str + randomLong(0, 2), def, 2);
        damage += randomLong(0, 1);

        if (Global.playerStatus[playerRole][PlayerStatus.Protect]) {
          damage /= 2;
        }
        // damage = 999;

        if (SHORT(GameData.playerRoles.HP[playerRole]) < damage) {
          damage = GameData.playerRoles.HP[playerRole];
        }

        damage = ~~damage;

        if (damage <= 0) {
          damage = 1;
        }

        if (SUPER_DEFENSE) {
          damage = 1;
        }

        if (!INVINCIBLE) {
         GameData.playerRoles.HP[playerRole] -= damage;
        }

        battle.displayStatChange();

        battleService.setPlayerColorShift(target, 6);
      }

      sound.play(soundNum);
      yield battle.delay(1, 0, false);

      battleService.setPlayerColorShift(target, 0);

      if (coverIndex != -1) {
        battleService.setEnemyPosition(enemyIndex, function(pos) {
          return PAL_XY(PAL_X(pos) - 10, PAL_Y(pos) - 8);
        });
        setPlayerPosition(coverIndex, function(pos) {
          return PAL_XY(PAL_X(pos) + 4, PAL_Y(pos) + 2);
        });
        enemy = BATTLE().enemy[enemyIndex];
      } else {
        setPlayerPosition(target, function(pos) {
          return PAL_XY(PAL_X(pos) + 8, PAL_Y(pos) + 4);
        });
      }

      yield battle.delay(1, 0, false);

      if (GameData.playerRoles.HP[playerRole] == 0) {
        sound.play(GameData.playerRoles.deathSound[playerRole]);
        frameBak = 2;
      } else if (battle.isPlayerDying(playerRole)) {
         frameBak = 1;
      }

      if (coverIndex == -1) {
        setPlayerPosition(target, function(pos) {
          return PAL_XY(PAL_X(pos) + 2, PAL_Y(pos) + 1);
        });
      }

      yield battle.delay(3, 0, false);

      battleService.setEnemyPosition(enemyIndex, enemy.originalPos);
      battleService.setEnemyFrame(enemyIndex, 0);
      enemy = BATTLE().enemy[enemyIndex];

      yield battle.delay(1, 0, false);

      setPlayerFrame(target, frameBak);
      yield battle.delay(1, 0, true);

      setPlayerPosition(target, targetPlayer.originalPos);
      yield battle.delay(4, 0, true);

      battle.updateFighters();

      if (coverIndex == -1 && !autoDefend && enemy.e.attackEquivItemRate >= randomLong(1, 10)) {
        var i = enemy.e.attackEquivItem;
        GameData.object[i].item.scriptOnUse = yield script.runTriggerScript(
          GameData.object[i].item.scriptOnUse,
          playerRole
        );
      }

      yield battle.postActionCheck(true);
    }

    return end();

    function end() {
      // nothing
    }
  };

  /**
   * Steal from the enemy.
   * @param {Number} target        the target enemy index.
   * @param {Number} stealRate     the rate of successful theft.
   */

  battle.stealFromEnemy = function*(target, stealRate) {
    log.debug(['[BATTLE] stealFromEnemy', target, stealRate].join(' '));
    var playerIndex = BATTLE().movingPlayerIndex;
    var currentPlayerPos = BATTLE().player[playerIndex].pos;
    var targetEnemy = BATTLE().enemy[target];

    setPlayerFrame(playerIndex, 10);
    var offset = (target - playerIndex) * 8;

    var x = PAL_X(targetEnemy.pos) + 64 - offset;
    var y = PAL_Y(targetEnemy.pos) + 20 - offset / 2;

    setPlayerPosition(playerIndex, PAL_XY(x, y));

    yield battle.delay(1, 0, true);

    for (var i = 0; i < 5; i++) {
      x -= i + 8;
      y -= 4;

      setPlayerPosition(playerIndex, PAL_XY(x, y));

      if (i == 4) {
        battleService.setEnemyColorShift(target, 6);
      }

      yield battle.delay(1, 0, true);
    }

    battleService.setEnemyColorShift(target, 0);
    x--;
    setPlayerPosition(playerIndex, PAL_XY(x, y));
    yield battle.delay(3, 0, true);

    mutatePlayer(playerIndex, function(player) {
      player.state = FighterState.Wait;
      player.timeMeter = 0;
      return player;
    });
    battle.updateFighters();
    yield battle.delay(1, 0, true);

    var s;
    if (targetEnemy.e.stealItem > 0 &&
        (randomLong(0, 10) <= stealRate || stealRate == 0)) {
      if (targetEnemy.e.stealItem == 0) {
        // stolen coins
        var c = targetEnemy.e.stealItem / randomLong(2, 3);
        targetEnemy.e.stealItem -= c;
        Global.cash += c;

        if (c > 0) {
          s = ui.getWord(34);
          s.push(' '.charCodeAt(0));
          s = s.concat(c.toString().map(function(ch) {
            return ch.charCodeAt(0);
          }));
          s.push(' '.charCodeAt(0));
          s = s.concat(ui.getWord(10));
        }
      } else {
        // stolen item
        targetEnemy.e.stealItem--;
        script.addItemToInventory(targetEnemy.e.stealItem, 1);

        s = ui.getWord(34);
        s = s.concat(ui.getWord(targetEnemy.e.stealItem))
      }
    }

    if (s && s[0] != 0) {
       ui.startDialog(DialogPosition.CenterWindow, 0, 0, false);
       ui.showDialogText(s);
    }
  };

  /**
   * Simulate a magic for players. Mostly used in item throwing script.
   * @param {Number} target        the target enemy index. -1 = all enemies.
   * @param {Number} magicObjectID the object ID of the magic to be simulated.
   * @param {Number} baseDamage    the base damage of the simulation.
   */
  battle.simulateMagic = function*(target, magicObjectID, baseDamage) {
    log.debug(['[BATTLE] simulateMagic', target, magicObjectID, baseDamage].join(' '));
    var damage, def;
    if (GameData.object[magicObjectID].magic.flags & MagicFlag.ApplyToAll) {
      target = -1;
    } else if (target == -1) {
      target = battle.selectAutoTarget();
    }

    // Show the magic animation
    yield battle.showPlayerOffMagicAnim(0xFFFF, magicObjectID, target);

    if (GameData.magic[GameData.object[magicObjectID].magic.magicNumber].baseDamage > 0 || baseDamage > 0) {
      if (target == -1) {
        // Apply to all enemies
        for (var i = 0; i <= BATTLE().maxEnemyIndex; i++) {
          var enemy = BATTLE().enemy[i];
          if (enemy.objectID == 0) {
            continue;
          }

          def = SHORT(enemy.e.wDefense);
          def += (enemy.e.level + 6) * 4;

          if (def < 0) {
            def = 0;
          }

          damage = battle.calcMagicDamage(
            baseDamage,
            WORD(def),
            enemy.e.elemResistance,
            enemy.e.poisonResistance,
            magicObjectID
          );

          if (damage < 0) {
            damage = 0;
          }

          if (SUPER_ATTACK) {
            damage = 6666;
          }

          (function(enemyIndex, delta) {
            battleService.setEnemyHealth(enemyIndex, function(health) {
              return (health || 0) - delta;
            });
          })(i, damage);
        }
      } else {
        // Apply to one enemy
        var targetEnemy = BATTLE().enemy[target];
        def = SHORT(targetEnemy.e.defense);
        def += (targetEnemy.e.level + 6) * 4;

        if (def < 0) {
          def = 0;
        }

        damage = battle.calcMagicDamage(
          baseDamage,
          WORD(def),
          targetEnemy.e.elemResistance,
          targetEnemy.e.poisonResistance,
          magicObjectID
        );

        if (damage < 0) {
          damage = 0;
        }

        if (SUPER_ATTACK) {
          damage = 6666;
        }

        battleService.setEnemyHealth(target, function(health) {
          return (health || 0) - damage;
        });
      }
    }
  };
};

export default fight;
