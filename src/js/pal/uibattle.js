/**
 * Battle UI
 * @module
 * @memberOf  ui
 */

import utils from './utils';
import input from './input';
import uigame from './uigame';
import battleServiceDefault from '../../services/battle-service.js';

log.trace('uibattle module load');

global.BattleFrameTime = FrameTime;

global.BattleUIState = {
  Wait:                  0,
  SelectMove:            1,
  SelectTargetEnemy:     2,
  SelectTargetPlayer:    3,
  SelectTargetEnemyAll:  4,
  SelectTargetPlayerAll: 5
};

global.BattleMenuState = {
  Main:                  0,
  MagicSelect:           1,
  UseItemSelect:         2,
  ThrowItemSelect:       3,
  Misc:                  4,
  MiscItemSubMenu:       5,
};

global.BattleUIAction = {
  Attack:                0,
  Magic:                 1,
  CoopMagic:             2,
  Misc:                  3,
};

var SPRITENUM_BATTLEICON_ATTACK               = 40;
var SPRITENUM_BATTLEICON_MAGIC                = 41;
var SPRITENUM_BATTLEICON_COOPMAGIC            = 42;
var SPRITENUM_BATTLEICON_MISCMENU             = 43;

var SPRITENUM_BATTLE_ARROW_CURRENTPLAYER      = 69;
var SPRITENUM_BATTLE_ARROW_CURRENTPLAYER_RED  = 68;

var SPRITENUM_BATTLE_ARROW_SELECTEDPLAYER     = 67;
var SPRITENUM_BATTLE_ARROW_SELECTEDPLAYER_RED = 66;

var BATTLEUI_LABEL_ITEM                       = 5;
var BATTLEUI_LABEL_DEFEND                     = 58;
var BATTLEUI_LABEL_AUTO                       = 56;
var BATTLEUI_LABEL_INVENTORY                  = 57;
var BATTLEUI_LABEL_FLEE                       = 59;
var BATTLEUI_LABEL_STATUS                     = 60;

var BATTLEUI_LABEL_USEITEM                    = 23;
var BATTLEUI_LABEL_THROWITEM                  = 24;

var BATTLEUI_MAX_SHOWNUM                      = 16;

var uibattle = {
  frame: 0,
  curMiscMenuItem: 0,
  curSubMenuItem: 0
};

uibattle.TIMEMETER_COLOR_DEFAULT                   = 0x1B;
uibattle.TIMEMETER_COLOR_SLOW                      = 0x5B;
uibattle.TIMEMETER_COLOR_HASTE                     = 0x2A;

var surface = null;
var battle = null;
var ui = null;
var itemmenu = null;
var magicmenu = null;
var battleService = battleServiceDefault;

function BATTLE() {
  var state = battleService.getState();
  if (state) {
    return state;
  }
  if (typeof Global !== 'undefined' && Global && Global.battle) {
    return Global.battle;
  }
  return {};
}

uibattle.init = function*(surf, _battle, _ui) {
  log.debug('[BATTLE] init uibattle');
  battle = _battle;
  ui = _ui;
  itemmenu = ui.itemmenu;
  magicmenu = ui.magicmenu;
  global.uibattle = ui.uibattle = uibattle;
  surface = surf;
};

var ShowNum = uibattle.ShowNum = function() {
  this.reset();
};
ShowNum.prototype.reset = function(num, pos, time, color) {
  this.num = num || 0;
  this.pos = pos || 0;
  this.time = time || 0;
  this.color = color || NumColor.Yellow;

  return this;
};

var BattleUI = uibattle.BattleUI = function() {
  this.state = BattleUIState.Wait;
  this.menuState = BattleMenuState.Main;
  this.msg = null;
  this.nextMsg = null;
  this.msgShowTime = 0;
  this.nextMsgDuration = 0;
  this.curPlayerIndex = 0;
  this.selectedAction = 0;
  this.prevEnemyTarget = 0;
  this.actionType = 0;
  this.objectID = 0;
  this.autoAttack = false;
  this.showNum = utils.initArray(ShowNum, BATTLEUI_MAX_SHOWNUM);
};

var statusPos = [
  [35, 19],  // confused
  [0, 0],    // slow
  [54, 1],   // sleep
  [55, 20],  // silence
  [0, 0],    // puppet
  [0, 0],    // bravery
  [0, 0],    // protect
  [0, 0],    // haste
  [0, 0]     // dualattack
];
var statusWord = [
  0x1D,  // confused
  0x00,  // slow
  0x1C,  // sleep
  0x1A,  // silence
  0x00,  // puppet
  0x00,  // bravery
  0x00,  // protect
  0x00,  // haste
  0x00   // dualattack
];
var statusColor = [
  0x5F,  // confused
  0x00,  // slow
  0x0E,  // sleep
  0x3C,  // silence
  0x00,  // puppet
  0x00,  // bravery
  0x00,  // protect
  0x00,  // haste
  0x00   // dualattack
];

/**
 * Show the player info box.
 * @param  {POS} pos            the top-left corner position of the box.
 * @param  {Number}  playerRole     the player role ID to be shown.
 * @param  {Number}  timeMeter      the value of time meter. 0 = empty, 100 = full.
 * @param  {Number}  timeMeterColor the color of time meter.
 * @param  {Boolean} update         whether to update the screen area or not.
 */
uibattle.playerInfoBox = function(pos, playerRole, timeMeter, timeMeterColor, update) {
  var screen = surface.byteBuffer;
  // Draw the box
  surface.blitRLE(
    ui.sprite.getFrame(ui.SPRITENUM_PLAYERINFOBOX),
    pos
  );

  // Draw the player face
  var maxLevel = 0;
  var poisonColor = 0xFF;

  for (var partyIndex = 0; partyIndex <= Global.maxPartyMemberIndex; partyIndex++) {
    if (Global.party[partyIndex].playerRole == playerRole) {
      break;
    }
  }

  if (partyIndex <= Global.maxPartyMemberIndex) {
    for (var i = 0; i < Const.MAX_POISONS; i++) {
      var w = Global.poisonStatus[i][partyIndex].poisonID;

      if (w != 0 && GameData.object[w].poison.poisonLevel <= 3) {
        if (GameData.object[w].poison.poisonLevel >= maxLevel) {
          maxLevel = GameData.object[w].poison.poisonLevel;
          poisonColor = GameData.object[w].poison.color;
        }
      }
    }
  }

  if (GameData.playerRoles.HP[playerRole] == 0) {
    // Always use the black/white color for dead players
    // and do not use the time meter
    poisonColor = 0;
    timeMeter = 0;
  }

  if (poisonColor == 0xFF) {
    surface.blitRLE(
      ui.sprite.getFrame(ui.SPRITENUM_PLAYERFACE_FIRST + playerRole),
      PAL_XY(PAL_X(pos) - 2, PAL_Y(pos) - 4)
    );
  } else {
    surface.blitRLEMonoColor(
      ui.sprite.getFrame(ui.SPRITENUM_PLAYERFACE_FIRST + playerRole),
      PAL_XY(PAL_X(pos) - 2, PAL_Y(pos) - 4),
      poisonColor,
      0
    );
  }

  // Draw the HP and MP value
  surface.blitRLE(
    ui.sprite.getFrame(ui.SPRITENUM_SLASH),
     PAL_XY(PAL_X(pos) + 49, PAL_Y(pos) + 6)
  );
  ui.drawNumber(
    GameData.playerRoles.maxHP[playerRole], 4,
    PAL_XY(PAL_X(pos) + 47, PAL_Y(pos) + 8), NumColor.Yellow, NumAlign.Right
  );
  ui.drawNumber(
    GameData.playerRoles.HP[playerRole], 4,
    PAL_XY(PAL_X(pos) + 26, PAL_Y(pos) + 5), NumColor.Yellow, NumAlign.Right
  );

  surface.blitRLE(
    ui.sprite.getFrame(ui.SPRITENUM_SLASH),
     PAL_XY(PAL_X(pos) + 49, PAL_Y(pos) + 22)
  );
  ui.drawNumber(
    GameData.playerRoles.maxMP[playerRole], 4,
    PAL_XY(PAL_X(pos) + 47, PAL_Y(pos) + 24), NumColor.Cyan, NumAlign.Right
  );
  ui.drawNumber(
    GameData.playerRoles.MP[playerRole], 4,
    PAL_XY(PAL_X(pos) + 26, PAL_Y(pos) + 21), NumColor.Cyan, NumAlign.Right
  );
  // Draw Statuses
  if (GameData.playerRoles.HP[playerRole] > 0) {
    for (var i = 0; i < PlayerStatus.All; i++) {
      if (Global.playerStatus[playerRole][i] > 0 && statusWord[i] != 0) {
        ui.drawText(
          ui.getWord(statusWord[i]),
          PAL_XY(PAL_X(pos) + statusPos[i][0], PAL_Y(pos) + statusPos[i][1]),
          statusColor, true, false
        );
      }
    }
  }

  // Update the screen area if needed
  if (update) {
    surface.updateScreen(new RECT(
      PAL_X(pos) - 2,
      PAL_Y(pos) - 4,
      77,
      39
    ));
  }
};

/**
 * Check if the specified action is valid.
 * @param  {BattleUIAction}  actionType the type of the action.
 * @return {Boolean}         true if the action is valid, false if not.
 */
uibattle.isActionValid = function(actionType) {
  var playerRole = Global.party[BATTLE().UI.curPlayerIndex].playerRole;

  switch (actionType) {
    case BattleUIAction.Attack:
    case BattleUIAction.Misc:
      break;

    case BattleUIAction.Magic:
      if (Global.playerStatus[playerRole][PlayerStatus.Silence] != 0) {
        return false;
      }
      break;

    case BattleUIAction.CoopMagic:
      if (Global.maxPartyMemberIndex == 0) {
        return false;
      }
      for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
        var w = Global.party[i].playerRole;

        if (GameData.playerRoles.HP[w] < GameData.playerRoles.maxHP[w] / 5 ||
            Global.playerStatus[w][PlayerStatus.Sleep] != 0 ||
            Global.playerStatus[w][PlayerStatus.Confused] != 0 ||
            Global.playerStatus[w][PlayerStatus.Silence] != 0) {
          return false;
        }
      }
      break;
  }

  return true;
};

/**
 * Draw the misc menu.
 * @param  {Number}  currentItem the current selected menu item.
 * @param  {Boolean} confirmed   true if confirmed, false if not.
 */
uibattle.drawMiscMenu = function(currentItem, confirmed) {
  var menuItems = [
    //              value label                     enabled position
    new ui.MenuItem(0,    BATTLEUI_LABEL_AUTO,      true,   PAL_XY(16, 32)),
    new ui.MenuItem(1,    BATTLEUI_LABEL_INVENTORY, true,   PAL_XY(16, 50)),
    new ui.MenuItem(2,    BATTLEUI_LABEL_DEFEND,    true,   PAL_XY(16, 68)),
    new ui.MenuItem(3,    BATTLEUI_LABEL_FLEE,      true,   PAL_XY(16, 86)),
    new ui.MenuItem(4,    BATTLEUI_LABEL_STATUS,    true,   PAL_XY(16, 104))
  ];

  // Draw the box
  ui.createBox(PAL_XY(2, 20), 4, 1, 0, false);

  // Draw the menu items
  for (var i = 0; i < 5; i++) {
    var color = ui.MENUITEM_COLOR;
    if (i == currentItem) {
      if (confirmed) {
        color = ui.MENUITEM_COLOR_CONFIRMED;
      } else {
        color = ui.MENUITEM_COLOR_SELECTED;
      }
    }

    ui.drawText(
      ui.getWord(menuItems[i].wordNum),
      menuItems[i].pos, color,
      true, false
    );
  }
};

/**
 * Update the misc menu.
 * @return {Number} The selected item number. 0 if cancelled, 0xFFFF if not confirmed.
 */
uibattle.miscMenuUpdate = function() {
  // Draw the menu
  uibattle.drawMiscMenu(uibattle.curMiscMenuItem, false);

  // Process inputs
  if (input.isKeyPressed(Key.Up | Key.Left)) {
    uibattle.curMiscMenuItem--;
    if (uibattle.curMiscMenuItem < 0) {
       uibattle.curMiscMenuItem = 4;
    }
  } else if (input.isKeyPressed(Key.Down | Key.Right)) {
    uibattle.curMiscMenuItem++;
    if (uibattle.curMiscMenuItem > 4) {
      uibattle.curMiscMenuItem = 0;
    }
  } else if (input.isKeyPressed(Key.Search)) {
    return uibattle.curMiscMenuItem + 1;
  }
  else if (input.isKeyPressed(Key.Menu)) {
    return 0;
  }

  return 0xFFFF;
};

/**
 * Update the item sub menu of the misc menu.
 * @return {Number} The selected item number. 0 if cancelled, 0xFFFF if not confirmed.
 */
uibattle.miscItemSubMenuUpdate = function() {
  var menuItems = [
    //              value label                     enabled position
    new ui.MenuItem(0,    BATTLEUI_LABEL_USEITEM,   true,   PAL_XY(44, 62)),
    new ui.MenuItem(1,    BATTLEUI_LABEL_THROWITEM, true,   PAL_XY(44, 80))
  ];

  // Draw the menu
  uibattle.drawMiscMenu(1, true);
  ui.createBox(PAL_XY(30, 50), 1, 1, 0, false);

  // Draw the menu items
  for (var i = 0; i < 2; i++) {
    var color = ui.MENUITEM_COLOR;

    if (i == uibattle.curSubMenuItem) {
      color = ui.MENUITEM_COLOR_SELECTED;
    }

    ui.drawText(
      ui.getWord(menuItems[i].wordNum),
      menuItems[i].pos, color,
      true, false
    );
  }

  // Process inputs
  if (input.isKeyPressed(Key.Up | Key.Left)) {
    uibattle.curSubMenuItem = 0;
  } else if (input.isKeyPressed(Key.Down | Key.Right)) {
    uibattle.curSubMenuItem = 1;
  } else if (input.isKeyPressed(Key.Search)) {
    return uibattle.curSubMenuItem + 1;
  } else if (input.isKeyPressed(Key.Menu)) {
    return 0;
  }

  return 0xFFFF;
};

/**
 * Show a text message in the battle.
 * @param  {Number} text     the text message to be shown.
 * @param  {Number} duration the duration of the message, in milliseconds.
 */
uibattle.showText = function(text, duration) {
  var now = hrtime();
  if (now < BATTLE().UI.msgShowTime) {
    // BATTLE().UI.nextMsg = utils.arrClone(text);
    BATTLE().UI.nextMsg = text;
    BATTLE().UI.nextMsgDuration = duration;
  } else {
    // BATTLE().UI.msg = utils.arrClone(text);
    BATTLE().UI.msg = text;
    BATTLE().UI.msgShowTime = now + duration;
  }
};

/**
 * Start the action selection menu of the specified player.
 * @param  {Number} playerIndex the player index.
 */
uibattle.playerReady = function(playerIndex) {
  BATTLE().UI.curPlayerIndex = playerIndex;
  BATTLE().UI.state = BattleUIState.SelectMove;
  BATTLE().UI.selectedAction = 0;
  BATTLE().UI.menuState = BattleMenuState.Main;
};

/**
 * Use an item in the battle UI.
 */
uibattle.useItem = function() {
  var selectedItem = itemmenu.itemSelectMenuUpdate();

  if (selectedItem != 0xFFFF) {
    if (selectedItem != 0) {
      BATTLE().UI.actionType = BattleActionType.UseItem;
      BATTLE().UI.objectID = selectedItem;

      if (GameData.object[selectedItem].item.flags & ItemFlag.ApplyToAll) {
        BATTLE().UI.state = BattleUIState.SelectTargetPlayerAll;
      } else {
        BATTLE().UI.selectedIndex = 0;
        BATTLE().UI.state = BattleUIState.SelectTargetPlayer;
      }
    } else {
      BATTLE().UI.menuState = BattleMenuState.Main;
    }
  }
};

/**
 * Throw an item in the battle UI.
 */
uibattle.throwItem = function() {
  var selectedItem = itemmenu.itemSelectMenuUpdate();

  if (selectedItem != 0xFFFF) {
    if (selectedItem != 0) {
      BATTLE().UI.actionType = BattleActionType.ThrowItem;
      BATTLE().UI.objectID = selectedItem;

      if (GameData.object[selectedItem].item.flags & ItemFlag.ApplyToAll) {
        BATTLE().UI.state = BattleUIState.SelectTargetEnemyAll;
      } else {
        BATTLE().UI.selectedIndex = BATTLE().UI.prevEnemyTarget;
        BATTLE().UI.state = BattleUIState.SelectTargetEnemy;
      }
    } else {
      BATTLE().UI.menuState = BattleMenuState.Main;
    }
  }
};

/**
 * Pick a magic for the specified player for automatic usage.
 * @param  {Number} playerRole  the player role ID.
 * @param  {Number} randomRange the range of the magic power.
 * @return {Number}             The object ID of the selected magic. 0 for physical attack.
 */
uibattle.pickAutoMagic = function(playerRole, randomRange) {
  var maxPower = 0;
  if (Global.playerStatus[playerRole][PlayerStatus.Silence] != 0) {
    return 0;
  }

  var magic = 0;
  for (var i = 0; i < Const.MAX_PLAYER_MAGICS; i++) {
    var w = GameData.playerRoles.magic[i][playerRole];
    if (w == 0) {
      continue;
    }

    var magicNum = GameData.object[w].magic.magicNumber;

    // skip if the magic is an ultimate move or not enough MP
    if (GameData.magic[magicNum].costMP == 1 ||
        GameData.magic[magicNum].costMP > GameData.playerRoles.MP[playerRole] ||
        SHORT(GameData.magic[magicNum].baseDamage) <= 0) {
      continue;
    }

    var power = SHORT(GameData.magic[magicNum].baseDamage) + randomLong(0, randomRange);

    if (power > maxPower) {
      maxPower = power
      magic = w;
    }
  }

  return magic;
};

/**
 * Update the status of battle UI.
 */
uibattle.update = function*() {
  uibattle.frame++;
  if (input.isKeyPressed(Key.Auto)) {
    var enableAuto = !Global.autoBattle;
    Global.autoBattle = enableAuto;
    BATTLE().UI.autoAttack = enableAuto;
    BATTLE().UI.menuState = BattleMenuState.Main;
    if (!enableAuto && BATTLE().UI.state != BattleUIState.Wait) {
      BATTLE().UI.state = BattleUIState.Wait;
    }
  }

  if (Global.autoBattle) {
    ui.drawText(
      ui.getWord(BATTLEUI_LABEL_AUTO),
      PAL_XY(280, 10),
      ui.MENUITEM_COLOR_CONFIRMED,
      true,
      false
    );

    if (input.isKeyPressed(Key.Menu) || input.isKeyPressed(Key.Search)) {
      Global.autoBattle = false;
      BATTLE().UI.autoAttack = false;
      return end();
    }

    if (BATTLE().phase == BattlePhase.SelectAction && !BATTLE().enemyCleared) {
      battle.playerCheckReady();

      for (var i = 0; i <= Global.maxPartyMemberIndex; i++) {
        if (BATTLE().player[i].state == FighterState.Com) {
          uibattle.playerReady(i);
          break;
        }
      }

      if (BATTLE().UI.state != BattleUIState.Wait) {
        var playerRole = Global.party[BATTLE().UI.curPlayerIndex].playerRole;
        var actionDecided = false;

        if (GameData.playerRoles.HP[playerRole] == 0 &&
            Global.playerStatus[playerRole][PlayerStatus.Puppet]) {
          BATTLE().UI.actionType = BattleActionType.Attack;
          BATTLE().UI.objectID = 0;
          if (script.playerCanAttackAll(playerRole)) {
            BATTLE().UI.selectedIndex = -1;
          } else {
            var puppetTarget = battle.selectAutoTarget();
            BATTLE().UI.selectedIndex = (puppetTarget < 0 ? -1 : puppetTarget);
          }
          actionDecided = true;
        } else if (GameData.playerRoles.HP[playerRole] == 0 ||
                   Global.playerStatus[playerRole][PlayerStatus.Sleep] != 0 ||
                   Global.playerStatus[playerRole][PlayerStatus.Paralyzed] != 0) {
          BATTLE().UI.actionType = BattleActionType.Pass;
          BATTLE().UI.objectID = 0;
          BATTLE().UI.selectedIndex = -1;
          actionDecided = true;
        } else if (Global.playerStatus[playerRole][PlayerStatus.Confused] != 0) {
          BATTLE().UI.actionType = BattleActionType.AttackMate;
          BATTLE().UI.objectID = 0;
          BATTLE().UI.selectedIndex = -1;
          actionDecided = true;
        } else {
          var magicObject = uibattle.pickAutoMagic(playerRole, 9999);
          var targetIndex = -1;

          if (magicObject !== 0) {
            var magicFlags = GameData.object[magicObject].magic.flags;
            if (magicFlags & MagicFlag.ApplyToAll) {
              BATTLE().UI.selectedIndex = -1;
            } else {
              targetIndex = battle.selectAutoTarget();
              if (targetIndex < 0) {
                magicObject = 0;
              }
            }
          }

          if (magicObject === 0) {
            targetIndex = battle.selectAutoTarget();
            if (targetIndex < 0) {
              BATTLE().UI.actionType = BattleActionType.Pass;
              BATTLE().UI.selectedIndex = -1;
            } else {
              BATTLE().UI.actionType = BattleActionType.Attack;
              BATTLE().UI.selectedIndex = targetIndex;
            }
            BATTLE().UI.objectID = 0;
          } else {
            BATTLE().UI.actionType = BattleActionType.Magic;
            BATTLE().UI.objectID = magicObject;
            if (!(GameData.object[magicObject].magic.flags & MagicFlag.ApplyToAll)) {
              BATTLE().UI.selectedIndex = targetIndex;
            }
          }
          actionDecided = true;
        }

        if (actionDecided) {
          battle.commitAction(false);
        }
      }
    }

    return end();
  }

  if (BATTLE().phase == BattlePhase.PerformAction) {
    return end();
  }

  if (!Global.autoBattle) {
    // Draw the player info boxes.
    for (var i = 0; i <= Global.maxPartyMemberIndex; i++)
    {
      var playerRole = Global.party[i].playerRole;
      var w = WORD(BATTLE().player[i].timeMeter);
      var j = uibattle.TIMEMETER_COLOR_DEFAULT;

      if (Global.playerStatus[playerRole][PlayerStatus.Sleep] != 0 ||
          Global.playerStatus[playerRole][PlayerStatus.Confused] != 0 ||
          Global.playerStatus[playerRole][PlayerStatus.Puppet] != 0) {
        w = 0;
      }
      uibattle.playerInfoBox(PAL_XY(91 + 77 * i, 165), playerRole, w, j, false);
    }
  }

  if (input.isKeyPressed(Key.Status)) {
    yield uigame.playerStatus();
    return end();
  }

  if (BATTLE().UI.state != BattleUIState.Wait) {
    var playerRole = Global.party[BATTLE().UI.curPlayerIndex].playerRole;

    if (GameData.playerRoles.HP[playerRole] == 0 &&
        Global.playerStatus[playerRole][PlayerStatus.Puppet]) {
      BATTLE().UI.actionType = BattleActionType.Attack;

      if (script.playerCanAttackAll(Global.party[BATTLE().UI.curPlayerIndex].playerRole)) {
        BATTLE().UI.selectedIndex = -1;
      } else {
        BATTLE().UI.selectedIndex = battle.selectAutoTarget();
      }

      battle.commitAction(false);
      return end(); // don't go further
    }

    // Cancel any actions if player is dead or sleeping.
    if (GameData.playerRoles.HP[playerRole] == 0 ||
        Global.playerStatus[playerRole][PlayerStatus.Sleep] != 0 ||
        Global.playerStatus[playerRole][PlayerStatus.Paralyzed] != 0) {
      BATTLE().UI.actionType = BattleActionType.Pass;
      battle.commitAction(false);
      return end(); // don't go further
    }

    if (Global.playerStatus[playerRole][PlayerStatus.Confused] != 0) {
      BATTLE().UI.actionType = BattleActionType.AttackMate;
      battle.commitAction(false);
      return end(); // don't go further
    }

    if (Global.autoBattle) {
      BATTLE().UI.actionType = BattleActionType.Attack;

      if (script.playerCanAttackAll(Global.party[BATTLE().UI.curPlayerIndex].playerRole)) {
        BATTLE().UI.selectedIndex = -1;
      } else {
        BATTLE().UI.selectedIndex = battle.selectAutoTarget();
      }
      battle.commitAction(false);
      return end(); // don't go further
    }

    // Draw the arrow on the player's head.
    var i = SPRITENUM_BATTLE_ARROW_CURRENTPLAYER_RED;
    if (uibattle.frame & 1) {
      i = SPRITENUM_BATTLE_ARROW_CURRENTPLAYER;
    }

    var x = battle.playerPos[Global.maxPartyMemberIndex][BATTLE().UI.curPlayerIndex][0] - 8;
    var y = battle.playerPos[Global.maxPartyMemberIndex][BATTLE().UI.curPlayerIndex][1] - 74;

    surface.blitRLE(ui.sprite.getFrame(i), PAL_XY(x, y));
  }

  switch (BATTLE().UI.state) {
    case BattleUIState.Wait:
      if (!BATTLE().enemyCleared) {
        battle.playerCheckReady();

        for (i = 0; i <= Global.maxPartyMemberIndex; i++) {
          if (BATTLE().player[i].state == FighterState.Com) {
            uibattle.playerReady(i);
            break;
          }
        }
      }
      break;

    case BattleUIState.SelectMove:
      // Draw the icons
      var items = [
        { spriteNum: SPRITENUM_BATTLEICON_ATTACK,    pos: PAL_XY(27, 140), action: BattleUIState.ActionAttack },
        { spriteNum: SPRITENUM_BATTLEICON_MAGIC,     pos: PAL_XY(0, 155),  action: BattleUIState.ActionMagic },
        { spriteNum: SPRITENUM_BATTLEICON_COOPMAGIC, pos: PAL_XY(54, 155), action: BattleUIState.ActionCoopMagic },
        { spriteNum: SPRITENUM_BATTLEICON_MISCMENU,  pos: PAL_XY(27, 170), action: BattleUIState.ActionMisc }
      ];

      if (BATTLE().UI.menuState == BattleMenuState.Main) {
        if (input.dir == Direction.North) {
          BATTLE().UI.selectedAction = 0;
        } else if (input.dir == Direction.South) {
           BATTLE().UI.selectedAction = 3;
        } else if (input.dir == Direction.West) {
          if (uibattle.isActionValid(BattleUIState.ActionMagic)) {
            BATTLE().UI.selectedAction = 1;
          }
        } else if (input.dir == Direction.East) {
          if (uibattle.isActionValid(BattleUIState.ActionCoopMagic)) {
            BATTLE().UI.selectedAction = 2;
          }
        }
      }

      if (!uibattle.isActionValid(items[BATTLE().UI.selectedAction].action)) {
        BATTLE().UI.selectedAction = 0;
      }

      for (var i = 0; i < 4; i++) {
        if (BATTLE().UI.selectedAction == i) {
           surface.blitRLE(ui.sprite.getFrame(items[i].spriteNum), items[i].pos);
        } else if (uibattle.isActionValid(items[i].action)) {
           surface.blitRLEMonoColor(ui.sprite.getFrame(items[i].spriteNum), items[i].pos, 0, -4);
        } else {
           surface.blitRLEMonoColor(ui.sprite.getFrame(items[i].spriteNum), items[i].pos, 0x10, -4);
        }
      }

      switch (BATTLE().UI.menuState) {
        case BattleMenuState.Main:
          if (input.isKeyPressed(Key.Search)) {
            switch (BATTLE().UI.selectedAction) {
              case 0:
                // Attack
                BATTLE().UI.actionType = BattleActionType.Attack;
                if (script.playerCanAttackAll(Global.party[BATTLE().UI.curPlayerIndex].playerRole)) {
                  BATTLE().UI.state = BattleUIState.SelectTargetEnemyAll;
                } else {
                   BATTLE().UI.selectedIndex = BATTLE().UI.prevEnemyTarget;
                   BATTLE().UI.state = BattleUIState.SelectTargetEnemy;
                }
                break;

              case 1:
                // Magic
                BATTLE().UI.menuState = BattleMenuState.MagicSelect;
                magicmenu.magicSelectMenuInit(playerRole, true, 0);
                break;

              case 2:
                // Cooperative magic
                var w = Global.party[BATTLE().UI.curPlayerIndex].playerRole;
                w = script.getPlayerCooperativeMagic(w);

                BATTLE().UI.actionType = BattleActionType.CoopMagic;
                BATTLE().UI.objectID = w;

                if (GameData.object[w].magic.flags & MagicFlag.UsableToEnemy) {
                  if (GameData.object[w].magic.flags & MagicFlag.ApplyToAll) {
                    BATTLE().UI.state = BattleUIState.SelectTargetEnemyAll;
                  } else {
                    BATTLE().UI.selectedIndex = BATTLE().UI.prevEnemyTarget;
                    BATTLE().UI.state = BattleUIState.SelectTargetEnemy;
                  }
                } else {
                  if (GameData.object[w].magic.flags & MagicFlag.ApplyToAll) {
                    BATTLE().UI.state = BattleUIState.SelectTargetPlayerAll;
                  } else {
                    BATTLE().UI.selectedIndex = 0;
                    BATTLE().UI.state = BattleUIState.SelectTargetPlayer;
                  }
                }
                break;

              case 3:
                // Misc menu
                BATTLE().UI.menuState = BattleMenuState.Misc;
                uibattle.curMiscMenuItem = 0;
                break;
            }
          } else if (input.isKeyPressed(Key.Defend)) {
            BATTLE().UI.actionType = BattleActionType.Defend;
            battle.commitAction(false);
          } else if (input.isKeyPressed(Key.Force)) {
            var w = uibattle.pickAutoMagic(Global.party[BATTLE().UI.curPlayerIndex].playerRole, 60);

            if (w == 0) {
              BATTLE().UI.actionType = BattleActionType.Attack;

              if (script.playerCanAttackAll(Global.party[BATTLE().UI.curPlayerIndex].playerRole)) {
                BATTLE().UI.selectedIndex = -1;
              } else {
                BATTLE().UI.selectedIndex = battle.selectAutoTarget();
              }
            } else {
              BATTLE().UI.actionType = BattleActionType.Magic;
              BATTLE().UI.objectID = w;

              if (GameData.object[w].magic.flags & MagicFlag.ApplyToAll) {
                 BATTLE().UI.selectedIndex = -1;
              } else {
                 BATTLE().UI.selectedIndex = battle.selectAutoTarget();
              }
            }

            battle.commitAction(false);
          } else if (input.isKeyPressed(Key.Flee)) {
            BATTLE().UI.actionType = BattleActionType.Flee;
            battle.commitAction(false);
          } else if (input.isKeyPressed(Key.UseItem)) {
            BATTLE().UI.menuState = BattleMenuState.UseItemSelect;
            itemmenu.itemSelectMenuInit(ItemFlag.Usable);
          } else if (input.isKeyPressed(Key.ThrowItem)) {
            BATTLE().UI.menuState = BattleMenuState.ThrowItemSelect;
            itemmenu.itemSelectMenuInit(ItemFlag.Throwable);
          } else if (input.isKeyPressed(Key.Repeat)) {
            battle.commitAction(true);
          } else if (input.isKeyPressed(Key.Menu)) {
            BATTLE().player[BATTLE().UI.curPlayerIndex].state = FighterState.Wait;
            BATTLE().UI.state = BattleUIState.Wait;

            if (BATTLE().UI.curPlayerIndex > 0) {
              // Revert to the previous player
              do {
                BATTLE().player[--BATTLE().UI.curPlayerIndex].state = FighterState.Wait;

                if (BATTLE().player[BATTLE().UI.curPlayerIndex].action.ActionType == BattleActionType.ThrowItem) {
                  for (i = 0; i < Const.MAX_INVENTORY; i++) {
                    if (Global.inventory[i].item == BATTLE().player[BATTLE().UI.curPlayerIndex].action.actionID) {
                      Global.inventory[i].amountInUse--;
                      break;
                    }
                  }
                } else if (BATTLE().player[BATTLE().UI.curPlayerIndex].action.ActionType == BattleActionType.UseItem) {
                  if (GameData.object[BATTLE().player[BATTLE().UI.curPlayerIndex].action.actionID].item.flags & ItemFlag.Consuming) {
                    for (i = 0; i < Const.MAX_INVENTORY; i++) {
                      if (Global.inventory[i].item == BATTLE().player[BATTLE().UI.curPlayerIndex].action.actionID) {
                        Global.inventory[i].amountInUse--;
                        break;
                      }
                    }
                  }
                }
              } while (BATTLE().UI.curPlayerIndex > 0 &&
                 (GameData.playerRoles.HP[Global.party[BATTLE().UI.curPlayerIndex].playerRole] == 0 ||
                  Global.playerStatus[Global.party[BATTLE().UI.curPlayerIndex].playerRole][PlayerStatus.Confused] > 0 ||
                  Global.playerStatus[Global.party[BATTLE().UI.curPlayerIndex].playerRole][PlayerStatus.Sleep] > 0 ||
                  Global.playerStatus[Global.party[BATTLE().UI.curPlayerIndex].playerRole][PlayerStatus.Paralyzed] > 0));
            }
          }
          break;

        case BattleMenuState.MagicSelect:
          var w = magicmenu.magicSelectMenuUpdate();

          if (w != 0xFFFF) {
            BATTLE().UI.menuState = BattleMenuState.Main;

            if (w != 0) {
              BATTLE().UI.actionType = BattleActionType.Magic;
              BATTLE().UI.objectID = w;

              if (GameData.object[w].magic.flags & MagicFlag.UsableToEnemy) {
                if (GameData.object[w].magic.flags & MagicFlag.ApplyToAll) {
                  BATTLE().UI.state = BattleUIState.SelectTargetEnemyAll;
                } else {
                  BATTLE().UI.selectedIndex = BATTLE().UI.prevEnemyTarget;
                  BATTLE().UI.state = BattleUIState.SelectTargetEnemy;
                }
              } else {
                if (GameData.object[w].magic.flags & MagicFlag.ApplyToAll) {
                  BATTLE().UI.state = BattleUIState.SelectTargetPlayerAll;
                } else {
                  BATTLE().UI.selectedIndex = 0;
                  BATTLE().UI.state = BattleUIState.SelectTargetPlayer;
                }
              }
            }
          }
          break;

        case BattleMenuState.UseItemSelect:
          uibattle.useItem();
          break;

        case BattleMenuState.ThrowItemSelect:
          uibattle.throwItem();
          break;

        case BattleMenuState.Misc:
          var w = uibattle.miscMenuUpdate();

          if (w != 0xFFFF) {
            BATTLE().UI.menuState = BattleMenuState.Main;

            switch (w) {
              case 2: // item
                BATTLE().UI.menuState = BattleMenuState.MiscItemSubMenu;
                uibattle.curSubMenuItem = 0;
                break;

              case 3: // defend
                BATTLE().UI.actionType = BattleActionType.Defend;
                battle.commitAction(false);
                break;
              case 1: // auto
                var enable = !Global.autoBattle;
                Global.autoBattle = enable;
                BATTLE().UI.autoAttack = enable;
                if (!enable && BATTLE().UI.state != BattleUIState.Wait) {
                  BATTLE().UI.state = BattleUIState.Wait;
                }
                break;

              case 4: // flee
                BATTLE().UI.actionType = BattleActionType.Flee;
                battle.commitAction(false);
                break;

              case 5: // status
                yield uigame.playerStatus();
                break;
            }
          }
          break;

        case BattleMenuState.MiscItemSubMenu:
          var w = uibattle.miscItemSubMenuUpdate();

          if (w != 0xFFFF) {
            BATTLE().UI.menuState = BattleMenuState.Main;

            switch (w) {
              case 1: // use
                BATTLE().UI.menuState = BattleMenuState.UseItemSelect;
                itemmenu.itemSelectMenuInit(ItemFlag.Usable);
                break;

              case 2: // throw
                BATTLE().UI.menuState = BattleMenuState.ThrowItemSelect;
                itemmenu.itemSelectMenuInit(ItemFlag.Throwable);
                break;
            }
          }
          break;
      }
      break;

    case BattleUIState.SelectTargetEnemy:
      var maxEnemyIndex = -1;
      var enemyCount = 0;

      for (var i = 0; i <= BATTLE().maxEnemyIndex; i++) {
        if (BATTLE().enemy[i].objectID != 0) {
          maxEnemyIndex = i;
          enemyCount++;
        }
      }

      if (maxEnemyIndex == -1) {
        BATTLE().UI.state = BattleUIState.SelectMove;
        break;
      }

      if (BATTLE().UI.actionType == BattleActionType.CoopMagic) {
        if (!uibattle.isActionValid(BattleActionType.CoopMagic)) {
          BATTLE().UI.state = BattleUIState.SelectMove;
          break;
        }
      }

      // Don't bother selecting when only 1 enemy left
      if (enemyCount == 1) {
        BATTLE().UI.prevEnemyTarget = WORD(maxEnemyIndex);
        battle.commitAction(false);
        break;
      }
      if (BATTLE().UI.selectedIndex > maxEnemyIndex) {
        BATTLE().UI.selectedIndex = maxEnemyIndex;
      }

      for (var i = 0; i <= maxEnemyIndex; i++) {
        if (BATTLE().enemy[BATTLE().UI.selectedIndex].objectID != 0) {
          break;
        }
        BATTLE().UI.selectedIndex++;
        BATTLE().UI.selectedIndex %= (maxEnemyIndex + 1);
      }

      // Highlight the selected enemy
      if (uibattle.frame & 1) {
        var i = BATTLE().UI.selectedIndex;
        var enemy = BATTLE().enemy[i];

        var x = PAL_X(enemy.pos);
        var y = PAL_Y(enemy.pos);

        var frame = enemy.sprite.getFrame(enemy.currentFrame);
        x -= ~~(frame.width / 2);
        y -= frame.height;

        surface.blitRLEWithColorShift(frame, PAL_XY(x, y), 7);
      }

      if (input.isKeyPressed(Key.Menu)) {
        BATTLE().UI.state = BattleUIState.SelectMove;
      } else if (input.isKeyPressed(Key.Search)) {
        BATTLE().UI.prevEnemyTarget = BATTLE().UI.selectedIndex;
        battle.commitAction(false);
      } else if (input.isKeyPressed(Key.Left | Key.Down)) {
        if (BATTLE().UI.selectedIndex != 0) {
          BATTLE().UI.selectedIndex--;
          while (BATTLE().UI.selectedIndex != 0 &&
                 BATTLE().enemy[BATTLE().UI.selectedIndex].objectID == 0) {
            BATTLE().UI.selectedIndex--;
          }
        }
      } else if (input.isKeyPressed(Key.Right | Key.Up)) {
        if (BATTLE().UI.selectedIndex < maxEnemyIndex) {
          BATTLE().UI.selectedIndex++;
          while (BATTLE().UI.selectedIndex < maxEnemyIndex &&
                 BATTLE().enemy[BATTLE().UI.selectedIndex].objectID == 0) {
            BATTLE().UI.selectedIndex++;
          }
        }
      }
      break;

    case BattleUIState.SelectTargetPlayer:
      // Don't bother selecting when only 1 player is in the party
      if (Global.maxPartyMemberIndex == 0) {
        BATTLE().UI.selectedIndex = 0;
        battle.commitAction(false);
      }

      var j = SPRITENUM_BATTLE_ARROW_SELECTEDPLAYER;
      if (uibattle.frame & 1) {
        j = SPRITENUM_BATTLE_ARROW_SELECTEDPLAYER_RED;
      }

      // Draw arrows on the selected player
      var x = battle.playerPos[Global.maxPartyMemberIndex][BATTLE().UI.selectedIndex][0] - 8;
      var y = battle.playerPos[Global.maxPartyMemberIndex][BATTLE().UI.selectedIndex][1] - 67;

      surface.blitRLE(ui.sprite.getFrame(j), PAL_XY(x, y));

      if (input.isKeyPressed(Key.Menu)) {
         BATTLE().UI.state = BattleUIState.SelectMove;
      } else if (input.isKeyPressed(Key.Search)) {
         battle.commitAction(false);
      } else if (input.isKeyPressed(Key.Left | Key.Down)) {
        if (BATTLE().UI.selectedIndex != 0) {
          BATTLE().UI.selectedIndex--;
        } else {
          BATTLE().UI.selectedIndex = Global.maxPartyMemberIndex;
        }
      } else if (input.isKeyPressed(Key.Right | Key.Up)) {
        if (BATTLE().UI.selectedIndex < Global.maxPartyMemberIndex) {
          BATTLE().UI.selectedIndex++;
        } else {
          BATTLE().UI.selectedIndex = 0;
        }
      }

      break;

    case BattleUIState.SelectTargetEnemyAll:
      // Don't bother selecting
      BATTLE().UI.selectedIndex = -1;
      battle.commitAction(false);
      if (BATTLE().UI.actionType == BattleActionType.CoopMagic) {
        if (!uibattle.isActionValid(BattleActionType.CoopMagic)) {
          BATTLE().UI.state = BattleUIState.SelectMove;
          break;
        }
      }

      if (uibattle.frame & 1) {
        // Highlight all enemies
        for (var i = BATTLE().maxEnemyIndex; i >= 0; i--) {
          var enemy = BATTLE().enemy[i];
          if (enemy.objectID == 0) {
            continue;
          }

          var x = PAL_X(enemy.pos);
          var y = PAL_Y(enemy.pos);

          var frame = enemy.sprite.getFrame(enemy.currentFrame);
          x -= ~~(frame.width / 2);
          y -= frame.height;

          surface.blitRLEWithColorShift(frame, PAL_XY(x, y), 7);
        }
      } if (input.isKeyPressed(Key.Menu)) {
        BATTLE().UI.state = BattleUIState.SelectMove;
      } else if (input.isKeyPressed(Key.Search)) {
        BATTLE().UI.selectedIndex = -1;
        battle.commitAction(false);
      }
      break;

    case BattleUIState.SelectTargetPlayerAll:
      // Don't bother selecting
      BATTLE().UI.selectedIndex = -1;
      battle.commitAction(false);
      break;
  }

  return end();

  function end() {
    // Show the text message if there is one.
    // Draw the numbers
    for (var i = 0; i < BATTLEUI_MAX_SHOWNUM; i++) {
      if (BATTLE().UI.showNum[i].num > 0) {
        if ((hrtime() - BATTLE().UI.showNum[i].time) / BattleFrameTime > 10) {
          BATTLE().UI.showNum[i].num = 0;
        } else {
          var x = PAL_X(BATTLE().UI.showNum[i].pos);
          var y = PAL_Y(BATTLE().UI.showNum[i].pos) - ~~((hrtime() - BATTLE().UI.showNum[i].time) / BattleFrameTime);
          ui.drawNumber(
            BATTLE().UI.showNum[i].num, 5,
            PAL_XY(x, y),
            BATTLE().UI.showNum[i].color, NumAlign.Right
          );
        }
      }
    }

    input.clear();
  }
};

/**
 * Show a number on battle screen (indicates HP/MP change).
 * @param  {Number} num     number to be shown.
 * @param  {POS} pos        position of the number on the screen.
 * @param  {NumColor} color color of the number.
 */
uibattle.showNum = function(num, pos, color) {
  var ss = BATTLE().UI.showNum;
  for (var i = 0; i < ss.length; ++i) {
    var sn = ss[i];
    if (sn.num == 0) {
      sn.num = num;
      sn.pos = PAL_XY(PAL_X(pos) - 15, PAL_Y(pos));
      sn.color = color;
      sn.time = hrtime();
      break;
    }
  }
};

export default uibattle;
