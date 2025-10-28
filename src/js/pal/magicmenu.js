import utils from './utils';
import input from './input';
import scene from './scene';
import uibattle from './uibattle';
import worldService from '../../services/world-service.js';

log.trace('magicmenu module load');

var MagicItem = function() {
  this.reset();
};
MagicItem.prototype.reset = function(magic, mp, enabled) {
  this.magic = magic || 0;
  this.MP = mp || 0;
  this.enabled = enabled || false;
  return this;
};

var magicmenu = {
  playerMP: 0,
  currentItem: 0,
  magicNum: 0,
  magicItems: utils.initArray(MagicItem, Const.MAX_PLAYER_MAGICS)
};

var surface = null;
var ui = null;

magicmenu.init = function*(surf, _ui) {
  log.debug('[UI] init magicmenu');
  ui = _ui;
  global.magicmenu = ui.magicmenu = magicmenu;
  surface = surf;
};

/**
 * Update the magic selection menu.
 * @return {Number} The selected magic. 0 if cancelled, 0xFFFF if not confirmed.
 */
magicmenu.magicSelectMenuUpdate = function() {
  log.trace(['[UI] magicmenu magicSelectMenuUpdate'].join(' '));
  // Check for inputs
  if (input.isKeyPressed(Key.Up)) {
    magicmenu.currentItem -= 3;
  } else if (input.isKeyPressed(Key.Down)) {
    magicmenu.currentItem += 3;
  } else if (input.isKeyPressed(Key.Left)) {
    magicmenu.currentItem--;
  } else if (input.isKeyPressed(Key.Right)) {
    magicmenu.currentItem++;
  } else if (input.isKeyPressed(Key.PageUp)) {
    magicmenu.currentItem -= 3 * 5;
  } else if (input.isKeyPressed(Key.PageDown)) {
    magicmenu.currentItem += 3 * 5;
  } else if (input.isKeyPressed(Key.Menu)) {
    return 0;
  }

  // Make sure the current menu item index is in bound
  if (magicmenu.currentItem < 0) {
    magicmenu.currentItem = 0;
  } else if (magicmenu.currentItem >= magicmenu.magicNum) {
    magicmenu.currentItem = magicmenu.magicNum - 1;
  }

  // Create the box.
  ui.createBox(PAL_XY(10, 42), 4, 16, 1, false);

  var objectDescTable = worldService.getObjectDescTable();
  var selectedSlot = magicmenu.magicItems[magicmenu.currentItem] || { MP: 0, magic: 0 };

  if (!objectDescTable) {
    // Draw the cash amount.
    ui.createSingleLineBox(PAL_XY(0, 0), 5, false);
    ui.drawText(ui.getWord(ui.CASH_LABEL), PAL_XY(10, 10), 0, false, false);
    ui.drawNumber(worldService.getCash(), 6, PAL_XY(49, 14), NumColor.Yellow, NumAlign.Right);

    // Draw the MP of the selected magic.
    ui.createSingleLineBox(PAL_XY(215, 0), 5, false);
    surface.blitRLE(
      ui.sprite.getFrame(ui.SPRITENUM_SLASH),
      PAL_XY(260, 14)
    );
    ui.drawNumber(
      selectedSlot.MP, 4,
      PAL_XY(230, 14),
      NumColor.Yellow, NumAlign.Right
    );
    ui.drawNumber(magicmenu.playerMP, 4, PAL_XY(265, 14), NumColor.Cyan, NumAlign.Right);
  } else {
    var descObj = ui.getObjectDesc(objectDescTable, selectedSlot.magic);
    // Draw the magic description.
    if (descObj) {
      var d = descObj.desc;
      var k = 3;
      var offset = 0;
      while (true) {
        var descBuf = [];
        var chStar = '*'.charCodeAt(0);
        for (; offset < d.byteLength; ++offset) {
          if (d[offset] == chStar) {
            ++offset;
            break;
          }
          descBuf.push(d[offset]);
        }
        ui.drawText(descBuf, PAL_XY(100, k), ui.DESCTEXT_COLOR, true, false);
        k += 16;
        if (offset >= d.byteLength) {
          break;
        }
      }
    }

    // Draw the MP of the selected magic.
    ui.createSingleLineBox(PAL_XY(0, 0), 5, false);
    surface.blitRLE(
      ui.sprite.getFrame(ui.SPRITENUM_SLASH),
      PAL_XY(45, 14)
    );
    ui.drawNumber(
      selectedSlot.MP, 4,
      PAL_XY(15, 14),
      NumColor.Yellow, NumAlign.Right
    );
    ui.drawNumber(magicmenu.playerMP, 4, PAL_XY(50, 14), NumColor.Cyan, NumAlign.Right);
  }

  // Draw the texts of the current page
  var i = ~~(magicmenu.currentItem / 3) * 3 - 3 * 2;
  if (i < 0) {
    i = 0;
  }

  for (var j = 0; j < 5; j++) {
    for (var k = 0; k < 3; k++) {
      var color = ui.MENUITEM_COLOR;

      if (i >= magicmenu.magicNum) {
        // End of the list reached
        j = 5;
        break;
      }

      if (i == magicmenu.currentItem) {
        if (magicmenu.magicItems[i].enabled) {
          color = ui.MENUITEM_COLOR_SELECTED;
        } else {
          color = ui.MENUITEM_COLOR_SELECTED_INACTIVE;
        }
      } else if (!magicmenu.magicItems[i].enabled) {
        color = ui.MENUITEM_COLOR_INACTIVE;
      }

      // Draw the text
      ui.drawText(
        ui.getWord(magicmenu.magicItems[i].magic),
        PAL_XY(35 + k * 87, 54 + j * 18), color, true, false
      );

      // Draw the cursor on the current selected item
      if (i == magicmenu.currentItem) {
        surface.blitRLE(
          ui.sprite.getFrame(ui.SPRITENUM_CURSOR),
          PAL_XY(60 + k * 87, 64 + j * 18)
        );
      }

      i++;
    }
  }

  if (input.isKeyPressed(Key.Search)) {
    if (magicmenu.magicItems[magicmenu.currentItem].enabled) {
      var j = magicmenu.currentItem % 3;
      var k = (magicmenu.currentItem < 3 * 2) ? ~~(magicmenu.currentItem / 3) : 2;

      j = 35 + j * 87;
      k = 54 + k * 18;

      ui.drawText(
        ui.getWord(magicmenu.magicItems[magicmenu.currentItem].magic),
        PAL_XY(j, k),
        ui.MENUITEM_COLOR_CONFIRMED,
        false, true
      );

      return magicmenu.magicItems[magicmenu.currentItem].magic;
    }
  }

  return 0xFFFF;
};

/**
 * Initialize the magic selection menu.
 * @param  {Number}  playerRole   the player ID.
 * @param  {Boolean} inBattle     true if in battle, false if not.
 * @param  {Number}  defaultMagic the default magic item.
 */
magicmenu.magicSelectMenuInit = function(playerRole, inBattle, defaultMagic) {
  magicmenu.currentItem = 0;
  magicmenu.magicNum = 0;

  magicmenu.playerMP = worldService.getPlayerMP(playerRole);

  const magicSlots = worldService.getPlayerMagicSlots(playerRole);
  for (var slotIndex = 0; slotIndex < magicSlots.length && slotIndex < Const.MAX_PLAYER_MAGICS; slotIndex++) {
    var objectId = magicSlots[slotIndex];
    if (!objectId) {
      continue;
    }
    var objectEntry = worldService.getObjectEntry(objectId);
    var magicData = objectEntry && objectEntry.magic ? objectEntry.magic : null;
    if (!magicData) {
      continue;
    }
    var magicNumber = magicData.magicNumber || 0;
    var magicEntry = worldService.getMagicEntry(magicNumber) || {};
    var costMP = typeof magicEntry.costMP === 'number' ? magicEntry.costMP : 0;
    var flags = typeof magicData.flags === 'number' ? magicData.flags : 0;

    var slot = magicmenu.magicItems[magicmenu.magicNum];
    slot.reset(objectId, costMP, true);

    if (slot.MP > magicmenu.playerMP) {
      slot.enabled = false;
    }

    if (inBattle) {
      if (!(flags & MagicFlag.UsableInBattle)) {
        slot.enabled = false;
      }
    } else if (!(flags & MagicFlag.UsableOutsideBattle)) {
      slot.enabled = false;
    }

    magicmenu.magicNum++;
  }

  for (var resetIndex = magicmenu.magicNum; resetIndex < magicmenu.magicItems.length; resetIndex++) {
    magicmenu.magicItems[resetIndex].reset();
  }

  // Sort the array
  /*
  magicmenu.magicItems.sort(function(a, b) {
    return (a.magic - b.magic);
  });
  */
  for (var i = 0; i < magicmenu.magicNum - 1; i++) {
    var completed = true;

    for (var j = 0; j < magicmenu.magicNum - 1 - i; j++) {
      if (magicmenu.magicItems[j].magic > magicmenu.magicItems[j + 1].magic) {
        var t = magicmenu.magicItems[j];
        magicmenu.magicItems[j] = magicmenu.magicItems[j + 1];
        magicmenu.magicItems[j + 1] = t;

        completed = false;
      }
    }

    if (completed) {
      break;
    }
  }

  // Place the cursor to the default item
  for (var i = 0; i < magicmenu.magicNum; i++) {
    if (magicmenu.magicItems[i].magic == defaultMagic){
      magicmenu.currentItem = i;
      break;
    }
  }
};

/**
 * Show the magic selection menu.
 * @param  {Number}  playerRole   the player ID.
 * @param  {Boolean} inBattle     true if in battle, false if not.
 * @param  {Number}  defaultMagic the default magic item.
 */
magicmenu.magicSelectMenu = function*(playerRole, inBattle, defaultMagic) {
  magicmenu.magicSelectMenuInit(playerRole, inBattle, defaultMagic);
  input.clear();

  while (true) {
    yield scene.makeScene();

    var w = 45;
    var party = worldService.getParty();
    var maxPartyMemberIndex = worldService.getMaxPartyMemberIndex();
    for (var i = 0; i <= maxPartyMemberIndex; i++) {
      var member = party[i];
      if (member) {
        uibattle.playerInfoBox(
          PAL_XY(w, 165),
          member.playerRole,
          100,
          uibattle.TIMEMETER_COLOR_DEFAULT,
          false
        );
      }
      w += 78;
    }

    w = magicmenu.magicSelectMenuUpdate();
    surface.updateScreen(null);

    input.clear();

    if (w != 0xFFFF) {
      return w;
    }

    yield sleepByFrame(1);
  }

  throw 'should not be here';
};

export default magicmenu;
