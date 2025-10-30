import utils from './utils';
import input from './input';
import scene from './scene';
import worldService from '../../services/world-service.js';
import scriptObjectAdapter from '../../services/script-object-adapter.js';
import { menuSelectionSignals } from '../../state/slices/menu-selections.js';
import { inventorySignals } from '../../state/slices/inventory.js';
import partyTrailAdapter from '../../services/party-trail-adapter.js';

log.trace('itemmenu module load');

var itemmenu = {
  numInventory: 0,
  itemFlags: 0,
  noDesc: false
};

var surface = null;
var ui = null;

const menuSignals = menuSelectionSignals();
const inventoryMenuSignal = menuSignals.inventory;

const inventorySlice = inventorySignals();
const inventoryItemsSignal = inventorySlice.items;
const inventoryCapacitySignal = inventorySlice.capacity;

function getInventoryList() {
  const items = inventoryItemsSignal.value;
  if (Array.isArray(items)) {
    return items;
  }
  if (items && typeof items.length === 'number') {
    return Array.from(items);
  }
  return [];
}

function getInventorySlotFromSignal(index) {
  const items = getInventoryList();
  return (index >= 0 && index < items.length) ? items[index] : null;
}

function getInventoryCapacityFromSignal() {
  const value = inventoryCapacitySignal.value;
  if (Number.isFinite(value) && value > 0) {
    return value;
  }
  return Const.MAX_INVENTORY;
}

function setCurrentInventoryIndex(value) {
  worldService.setInventoryMenuIndex(value);
}

function adjustCurrentInventoryIndex(delta) {
  setCurrentInventoryIndex(getCurrentInventoryIndex() + delta);
}

function getCurrentInventoryIndex() {
  return inventoryMenuSignal.value;
}

function ensureInventorySlot(inventory, index) {
  if (!inventory[index]) {
    inventory[index] = { item: 0, amount: 0, amountInUse: 0 };
  }
  return inventory[index];
}

itemmenu.init = function*(surf, _ui) {
  log.debug('[UI] init itemmenu');
  ui = _ui;
  global.itemmenu = ui.itemmenu = itemmenu;
  surface = surf;
};

itemmenu.itemSelectMenuUpdate = function() {
  var prevImageIndex = 0xFFFF;
  var bufImage = null;
  // Process input
  if (input.isKeyPressed(Key.Up)) {
    adjustCurrentInventoryIndex(-3);
  } else if (input.isKeyPressed(Key.Down)) {
    adjustCurrentInventoryIndex(3);
  } else if (input.isKeyPressed(Key.Left)) {
    adjustCurrentInventoryIndex(-1);
  } else if (input.isKeyPressed(Key.Right)) {
    adjustCurrentInventoryIndex(1);
  } else if (input.isKeyPressed(Key.PageUp)) {
    adjustCurrentInventoryIndex(-3 * 7);
  } else if (input.isKeyPressed(Key.PageDown)) {
    adjustCurrentInventoryIndex(3 * 7);
  } else if (input.isKeyPressed(Key.Menu)) {
    return 0;
  }

  // Make sure the current menu item index is in bound
  var currentIndex = getCurrentInventoryIndex();
  if (currentIndex >= itemmenu.numInventory) {
    setCurrentInventoryIndex(itemmenu.numInventory - 1);
    currentIndex = getCurrentInventoryIndex();
  }
  if (currentIndex < 0) {
    setCurrentInventoryIndex(0);
    currentIndex = 0;
  }

  // Redraw the box
  ui.createBox(PAL_XY(2, 0), 6, 17, 1, false);

  // Draw the texts in the current page
  var inventory = getInventoryList();
  var i = ~~(currentIndex / 3) * 3 - 3 * 4;
  if (i < 0) {
    i = 0;
  }

  for (var j = 0; j < 7; j++) {
    for (var k = 0; k < 3; k++) {
      var slot = inventory[i] || {};
      var object = slot.item || 0;
      var color = ui.MENUITEM_COLOR;
      if (i >= Const.MAX_INVENTORY || object == 0) {
        // End of the list reached
        j = 7;
        break;
      }
    var objectEntry = scriptObjectAdapter.getObjectEntry(object) || {};
      var objectFlags = objectEntry.item ? objectEntry.item.flags : 0;
      if (i == currentIndex) {
        if (!(objectFlags & itemmenu.itemFlags) ||
            (slot.amount || 0) <= (slot.amountInUse || 0)) {
          // This item is not selectable
          color = ui.MENUITEM_COLOR_SELECTED_INACTIVE;
        } else {
          // This item is selectable
          if ((slot.amount || 0) === 0) {
            color = ui.MENUITEM_COLOR_EQUIPPEDITEM;
          } else {
            color = ui.MENUITEM_COLOR_SELECTED;
          }
        }
      } else if (!(objectFlags & itemmenu.itemFlags) ||
                 (slot.amount || 0) <= (slot.amountInUse || 0)) {
        // This item is not selectable
        color = ui.MENUITEM_COLOR_INACTIVE;
      } else if ((slot.amount || 0) === 0) {
        color = ui.MENUITEM_COLOR_EQUIPPEDITEM;
      }
      // Draw the text
      ui.drawText(ui.getWord(object), PAL_XY(15 + k * 100, 12 + j * 18), color, true, false);
      // Draw the cursor on the current selected item
      if (i == currentIndex) {
        surface.blitRLE(ui.sprite.frames[ui.SPRITENUM_CURSOR], PAL_XY(40 + k * 100, 22 + j * 18));
      }
      // Draw the amount of this item
      var remaining = (slot.amount || 0) - (slot.amountInUse || 0);
      if (remaining > 1) {
        ui.drawNumber(
          remaining,
          2,
          PAL_XY(96 + k * 100, 17 + j * 18),
          NumColor.Cyan,
          NumAlign.Right);
      }

      i++;
    }
  }

  // Draw the picture of current selected item
  surface.blitRLE(ui.sprite.frames[ui.SPRITENUM_ITEMBOX], PAL_XY(5, 140));

  var currentSlot = inventory[currentIndex] || {};
  var object = currentSlot.item || 0;
  var objectData = scriptObjectAdapter.getObjectEntry(object);
  var currentObjectFlags = objectData && objectData.item ? objectData.item.flags : 0;
  var bitmapId = objectData && objectData.item ? objectData.item.bitmap : 0;

  if (bitmapId != prevImageIndex) {
    bufImage = Files.BALL.readChunk(bitmapId);
    if (bufImage) {
      prevImageIndex = bitmapId;
    } else {
      prevImageIndex = 0xFFFF;
      bufImage = null;
    }
  }
  if (prevImageIndex != 0xFFFF) {
    surface.blitRLE(bufImage, PAL_XY(12, 148));
  }

  // Draw the description of the selected item
  var objectDescTable = scriptObjectAdapter.getObjectDesc() || [];
  if (!itemmenu.noDesc && objectDescTable != null){
    var descObj = ui.getObjectDesc(objectDescTable, object);
    if (descObj) {
      var d = descObj.desc;
      var k = 150;
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
        ui.drawText(descBuf, PAL_XY(75, k), ui.DESCTEXT_COLOR, true, false);
        k += 16;
        if (offset >= d.byteLength) {
          break;
        }
      }
    }
  }

  if (input.isKeyPressed(Key.Search)) {
    if ((currentObjectFlags & itemmenu.itemFlags) &&
        (currentSlot.amount || 0) > (currentSlot.amountInUse || 0)) {
      if ((currentSlot.amount || 0) > 0) {
        var j = (currentIndex < 3 * 4) ? ~~(currentIndex / 3) : 4;
        var k = currentIndex % 3;

        ui.drawText(ui.getWord(object), PAL_XY(15 + k * 100, 12 + j * 18),
           ui.MENUITEM_COLOR_CONFIRMED, false, false);
      }

      return object;
    }
  }

  return 0xFFFF;
};

itemmenu.itemSelectMenuInit = function(itemFlags) {
  itemmenu.itemFlags = itemFlags;

  // Compress the inventory
  script.compressInventory();
  // Count the total number of items in inventory
  itemmenu.numInventory = 0;
  var inventorySnapshot = getInventoryList();
  while (itemmenu.numInventory < Const.MAX_INVENTORY &&
         inventorySnapshot[itemmenu.numInventory] &&
         inventorySnapshot[itemmenu.numInventory].item != 0) {
    itemmenu.numInventory++;
  }
  // Also add usable equipped items to the list
  if ((itemFlags & ItemFlag.Usable) && !worldService.isInBattle()) {
    worldService.mutateInventory((inventory) => {
      if (!Array.isArray(inventory)) {
        return inventory;
      }
      var party = partyTrailAdapter.getPartyState();
      var maxPartyMemberIndex = worldService.getMaxPartyMemberIndex();
      var capacity = getInventoryCapacityFromSignal();
      for (var i = 0; i <= maxPartyMemberIndex; i++) {
        var member = party[i];
        if (!member) {
          continue;
        }
        var roleId = member.playerRole;
        for (var j = 0; j < Const.MAX_PLAYER_EQUIPMENTS; j++) {
          var equipId = worldService.getPlayerEquipment(j, roleId);
          if (!equipId) {
            continue;
          }
          var equipEntry = scriptObjectAdapter.getObjectEntry(equipId);
          var equipFlags = equipEntry && equipEntry.item ? equipEntry.item.flags : 0;
          if (equipFlags & ItemFlag.Usable) {
            if (itemmenu.numInventory < capacity) {
              var slot = ensureInventorySlot(inventory, itemmenu.numInventory);
              slot.item = equipId;
              slot.amount = 0;
              slot.amountInUse = -1;
              itemmenu.numInventory++;
            }
          }
        }
      }
      return inventory;
    });
    inventorySnapshot = getInventoryList();
  }
};

itemmenu.itemSelectMenu = function*(onchange, itemFlags) {
  itemmenu.itemSelectMenuInit(itemFlags);
  var prevIndex = getCurrentInventoryIndex();
  input.clear();
  if (onchange) {
    itemmenu.noDesc = true;
    var initialSlot = getInventorySlotFromSignal(prevIndex);
    onchange(initialSlot ? initialSlot.item : 0);
  }
  while (true) {
    if (!onchange) {
       yield scene.makeScene();
    }
    var w = itemmenu.itemSelectMenuUpdate();
    surface.updateScreen(null);

    input.clear();

    //var start = timestamp();
    //while (timestamp() - start < FrameTime){
    //  if (input.isKeyPress != 0){
    //    break;
    //  }
    //  yield sleep(5);
    //}
    yield sleepByFrame(1);

    if (w != 0xFFFF) {
      itemmenu.noDesc = false;
      return w;
    }

    var currentIndex = getCurrentInventoryIndex();
    if (prevIndex != currentIndex) {
      if (currentIndex >= 0 && currentIndex < Const.MAX_INVENTORY) {
        if (onchange){
          var slot = getInventorySlotFromSignal(currentIndex);
          onchange(slot ? slot.item : 0);
        }
      }

      prevIndex = currentIndex;
    }
  }
  throw 'should not really reach here';
};

export default itemmenu;
