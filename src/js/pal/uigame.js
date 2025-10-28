/**
 * Game UI
 * @module
 * @memberOf  ui
 */

import utils from './utils';
import RLE from './rle';
import input from './input';
import music from './music';
import resourceService from '../../services/resource-service.js';
import stateService from '../../services/state-service.js';
import worldService from '../../services/world-service.js';

function getGlobalObject() {
  if (typeof global !== 'undefined') {
    return global;
  }
  if (typeof window !== 'undefined') {
    return window;
  }
  return null;
}

function getGame() {
  var root = getGlobalObject();
  return root && root.game ? root.game : null;
}

function requireGame() {
  var gameInstance = getGame();
  if (!gameInstance) {
    throw new Error('PAL game module has not been initialized');
  }
  return gameInstance;
}

function getParty() {
  return worldService.getParty();
}

function getPartyMember(index) {
  var party = getParty();
  return party[index] || null;
}

function getPartyRole(index) {
  var member = getPartyMember(index);
  return member ? member.playerRole : null;
}

function getMaxPartyMemberIndex() {
  return worldService.getMaxPartyMemberIndex();
}

function getCash() {
  var cash = stateService.getGlobal('cash');
  return typeof cash === 'number' ? cash : 0;
}

function getObjectEntry(objectId) {
  return worldService.getObjectEntry(objectId) || null;
}

function getMagicEntry(magicId) {
  return worldService.getMagicEntry(magicId) || null;
}

function getStoreEntry(storeId) {
  return worldService.getStoreEntry(storeId) || null;
}

function getExpState() {
  return worldService.getExpState() || null;
}

function getExpEntry(roleId) {
  var expState = getExpState();
  if (expState && Array.isArray(expState.primaryExp) && expState.primaryExp[roleId]) {
    return expState.primaryExp[roleId];
  }
  return { exp: 0, level: worldService.getPlayerLevel(roleId) };
}

function getPoisonStatusMatrix() {
  return worldService.getPoisonStatusMatrix() || [];
}

function getInventorySnapshot() {
  return worldService.getInventory();
}

function getInventorySlot(index) {
  return worldService.getInventorySlot(index);
}

function getObjectItemData(objectId) {
  var entry = getObjectEntry(objectId);
  return entry && entry.item ? entry.item : null;
}

function getObjectFlags(objectId) {
  var itemData = getObjectItemData(objectId);
  return itemData && typeof itemData.flags === 'number' ? itemData.flags : 0;
}

function getObjectBitmap(objectId) {
  var itemData = getObjectItemData(objectId);
  return itemData && typeof itemData.bitmap === 'number' ? itemData.bitmap : 0;
}

function getObjectPrice(objectId) {
  var itemData = getObjectItemData(objectId);
  return itemData && typeof itemData.price === 'number' ? itemData.price : 0;
}

function setObjectScriptOnEquip(objectId, scriptId) {
  worldService.mutateObjectEntry(objectId, function(entry) {
    if (entry && entry.item) {
      entry.item.scriptOnEquip = scriptId;
    }
    return entry;
  });
}

function getLastUnequippedItem() {
  var value = stateService.getGlobal('lastUnequippedItem');
  return typeof value === 'number' ? value : 0;
}

function setLastUnequippedItem(value) {
  stateService.setGlobal('lastUnequippedItem', value);
}

log.trace('uigame module load');

var uigame = {};

var surface = null;
var ui = null;
var itemmenu = null;
var resolveResource = function() {
  if (ui && ui.services && ui.services.resource) {
    return ui.services.resource;
  }
  return resourceService;
};

uigame.init = function*(surf, _ui) {
  log.debug('[UI] init uigame');
  ui = _ui;
  itemmenu = ui.itemmenu;
  global.uigame = ui.uigame = uigame;
  surface = surf;
};

/**
 * 绘制开场菜单背景
 */
uigame.drawOpeningMenuBackground = function*() {
  var resource = resolveResource();
  yield resource.loadMKF('FBP', 'PAT');
  var bitmap = resource.getMKF('FBP').decompressChunk(ui.MAINMENU_BACKGROUND_FBPNUM);
  surface.blit(bitmap);
  yield surface.fadeIn(0, false, 1);
};

/**
 * 开场菜单
 * @return {Promise}
 */
uigame.openingMenu = function*() {
  music.play(ui.RIX_NUM_OPENINGMENU, true, 1);
  yield uigame.drawOpeningMenuBackground();

  var menu = [
    //              value label                       enabled position
    new ui.MenuItem(0,    ui.MAINMENU_LABEL_NEWGAME,  true,   PAL_XY(125, 95)),
    new ui.MenuItem(1,    ui.MAINMENU_LABEL_LOADGAME, true,   PAL_XY(125, 112))
  ];
  var uimenu = yield ui.readMenu(null, menu, 0, ui.MENUITEM_COLOR, true);

  if (uimenu == 0) {
    return 0;
  } else {
    var slmenu = yield uigame.saveSlotMenu(1);
    if (slmenu === ui.MENUITEM_VALUE_CANCELLED) {
      return 1;
    } else {
      return slmenu;
    }
  }
};

/**
 * 存档菜单
 * @return {Promise}
 */
uigame.saveSlotMenu = function*(defaultSlot) {
  var boxes = [],
      menu = [],
      rect = new RECT(195, 7, 120, 190);
  var uimenu, numbers = [];
  // Create the boxes and create the menu items
  for (var i = 0; i < 5; i++) {
    boxes[i] = ui.createSingleLineBox(PAL_XY(195, 7 + 38 * i), 6, true);
    menu[i] = new ui.MenuItem(
      i + 1,                            // value
      ui.LOADMENU_LABEL_SLOT_FIRST + i, // num
      true,                             // enabled
      PAL_XY(210, 17 + 38 * i)          // pos
    );
  }

  // Draw the numbers of saved times
  for (var i = 1; i <= 5; i++) {
    var gameInstance = getGame();
    var meta = (gameInstance && typeof gameInstance.getSaveSlotMeta === 'function') ? gameInstance.getSaveSlotMeta(i) : null;
    var savedTimes = meta && meta.savedTimes ? meta.savedTimes : 0;
    ui.drawNumber(savedTimes, 4, PAL_XY(270, 38 * i - 17), NumColor.Yellow, NumAlign.Right);
  }

  surface.updateScreen(rect);

  // Activate the menu
  var slot = yield ui.readMenu(null, menu, defaultSlot - 1, ui.MENUITEM_COLOR/*, true*/);

  // Delete the boxes
  for (var i=0; i<5; ++i) {
    boxes[i].free();
  }

  surface.updateScreen(rect);
  return slot;
};

/**
 * 确认菜单
 * @return {Promise}
 */
uigame.confirmMenu = function*() {
  var boxes = [];

  // Create menu items
  var items = [
    new ui.MenuItem(0, ui.CONFIRMMENU_LABEL_NO,  true, PAL_XY(145, 110)),
    new ui.MenuItem(1, ui.CONFIRMMENU_LABEL_YES, true, PAL_XY(220, 110))
  ];
  // Create the boxes
  for (var i =0; i<2; ++i) {
    boxes[i] = ui.createSingleLineBox(PAL_XY(130 + 75 * i, 100), 2, true);
  }

  var menu = yield ui.readMenu(null, items, 0, ui.MENUITEM_COLOR);

  // Delete the boxes
  for (var i=0; i<boxes.length; ++i) {
    boxes[i].free();
  }

  surface.updateScreen();

  if (menu === ui.MENUITEM_VALUE_CANCELLED || menu === 0) {
    return false;
  } else {
    return true;
  }
};

/**
 * 开关菜单
 * @param  {Boolean} enabled
 * @return {Promise}
 */
uigame.switchMenu = function*(enabled) {
  var boxes = [];

  // Create menu items
  var items = [
    new ui.MenuItem(0, ui.SWITCHMENU_LABEL_DISABLE, true, PAL_XY(145, 110)),
    new ui.MenuItem(1, ui.SWITCHMENU_LABEL_ENABLE,  true, PAL_XY(220, 110))
  ];

  // Create the boxes
  for (var i =0; i<2; ++i) {
    boxes[i] = ui.createSingleLineBox(PAL_XY(130 + 75 * i, 100), 2, true);
  }

  var menu = yield ui.readMenu(null, items, 0, ui.MENUITEM_COLOR);

  // Delete the boxes
  for (var i=0; i<boxes.length; ++i) {
    boxes[i].free();
  }

  //surface.updateScreen(); // box.free调用surface.putRect已经更新了屏幕

  if (menu === ui.MENUITEM_VALUE_CANCELLED) {
    return enabled;
  } else {
    return (menu === 0 ? false : true);
  }
};

/**
 * 战斗速度菜单
 * @return {Promise}
 */
uigame.battleSpeedMenu = function*() {
  // Create menu items
  var items = [
    new ui.MenuItem(1, ui.BATTLESPEEDMENU_LABEL_1, true, PAL_XY(145, 110)),
    new ui.MenuItem(2, ui.BATTLESPEEDMENU_LABEL_2, true, PAL_XY(170, 110)),
    new ui.MenuItem(3, ui.BATTLESPEEDMENU_LABEL_3, true, PAL_XY(195, 110)),
    new ui.MenuItem(4, ui.BATTLESPEEDMENU_LABEL_4, true, PAL_XY(220, 110)),
    new ui.MenuItem(5, ui.BATTLESPEEDMENU_LABEL_5, true, PAL_XY(245, 110))
  ];

  var box = ui.createSingleLineBox(PAL_XY(131, 100), 8, true)

  var menu = yield ui.readMenu(null, items, 0, ui.MENUITEM_COLOR);

  // Delete the boxes
  box.free();

  surface.updateScreen(rect);

  if (menu === ui.MENUITEM_VALUE_CANCELLED) {
    return false;
  } else {
    return menu;
  }
};

/**
 * 显示金钱
 * @param  {Number} cash
 * @return {Box}
 */
uigame.showCash = function(cash) {
  // Create the box.
  var box = ui.createSingleLineBox(PAL_XY(0, 0), 5, true)

  // Draw the text label.
  ui.drawText(
    ui.getWord(ui.CASH_LABEL),
    PAL_XY(10, 10), 0, false, false
  );

  // Draw the cash amount.
  ui.drawNumber(cash, 6, PAL_XY(49, 14), NumColor.Yellow, NumAlign.Right);

  return box;
};

uigame.systemMenu_onItemChange = function(currentItem) {
  stateService.setGlobal('curSystemMenuItem', currentItem - 1);
};

/**
 * 系统菜单
 * @return {Promise}
 */
uigame.systemMenu = function*() {
  // Create menu items
  var menuitems = [];
  if (PAL_CLASSIC) {
    menuitems = [
      new ui.MenuItem(1, ui.SYSMENU_LABEL_SAVE,  true, PAL_XY(53, 72)),
      new ui.MenuItem(2, ui.SYSMENU_LABEL_LOAD,  true, PAL_XY(53, 72 + 18)),
      new ui.MenuItem(3, ui.SYSMENU_LABEL_MUSIC, true, PAL_XY(53, 72 + 36)),
      new ui.MenuItem(4, ui.SYSMENU_LABEL_SOUND, true, PAL_XY(53, 72 + 54)),
      new ui.MenuItem(5, ui.SYSMENU_LABEL_QUIT,  true, PAL_XY(53, 72 + 72))
    ];
  } else {
    menuitems = [
      new ui.MenuItem(1, ui.SYSMENU_LABEL_SAVE,  true, PAL_XY(53, 72)),
      new ui.MenuItem(2, ui.SYSMENU_LABEL_LOAD,  true, PAL_XY(53, 72 + 18)),
      new ui.MenuItem(3, ui.SYSMENU_LABEL_MUSIC, true, PAL_XY(53, 72 + 36)),
      new ui.MenuItem(4, ui.SYSMENU_LABEL_SOUND, true, PAL_XY(53, 72 + 54)),
      new ui.MenuItem(5, ui.SYSMENU_LABEL_BATTLEMODE, true, PAL_XY(53, 72 + 72)),
      new ui.MenuItem(6, ui.SYSMENU_LABEL_QUIT,  true, PAL_XY(53, 72 + 90))
    ];
  }

  // Create the menu box.
  var box;
  if (PAL_CLASSIC) {
    box = ui.createBox(PAL_XY(40, 60), 4, 3, 0, true);
  } else {
    box = ui.createBox(PAL_XY(40, 60), 5, 3, 0, true);
  }
  var rect = new RECT(40, 60, 100, 135);
  surface.updateScreen(rect);

  // Perform the menu.
  var curSystemMenuItem = stateService.getGlobal('curSystemMenuItem');
  if (typeof curSystemMenuItem !== 'number') {
    curSystemMenuItem = 0;
  }
  var returnValue = yield ui.readMenu(
    uigame.systemMenu_onItemChange,
    menuitems,
    curSystemMenuItem,
    ui.MENUITEM_COLOR
  );

  if (returnValue == ui.MENUITEM_VALUE_CANCELLED) {
    // User cancelled the menu
    box.free();
    surface.updateScreen(rect);
    return false;
  }

  var quit = function*() {
    if (yield uigame.confirmMenu()) {
      music.play(0, false, 2);
      yield surface.fadeOut(2);
      var gameInstance = getGame();
      if (gameInstance && typeof gameInstance.shutdown === 'function') {
        gameInstance.shutdown();
      }
    }
  };
  switch(returnValue) {
    case 1:
      // Save Game
      var slot = yield uigame.saveSlotMenu(stateService.getGlobal('currentSaveSlot') || 1);
      if (slot != ui.MENUITEM_VALUE_CANCELLED) {
        var gameInstance = requireGame();
        stateService.setGlobal('currentSaveSlot', slot);
        if (!gameInstance.saveGame(slot)) {
          if (typeof window !== 'undefined' && window.alert) {
            window.alert('保存失败');
          }
        }
      }
      break;
    case 2:
      // Load Game
      var slot = yield uigame.saveSlotMenu(stateService.getGlobal('currentSaveSlot') || 1);
      if (slot != ui.MENUITEM_VALUE_CANCELLED) {
        music.play(0, false, 1);
        yield surface.fadeOut(1);
        yield requireGame().initGameData(slot);
      }
      break;
    case 3:
      // Music
      var currentNoMusic = !!stateService.getGlobal('noMusic');
      const noMusic = !(yield uigame.switchMenu(!currentNoMusic));
      stateService.setGlobal('noMusic', noMusic);
      /*
      g_fNoMusic = !PAL_SwitchMenu(!g_fNoMusic);
      #ifdef PAL_HAS_NATIVEMIDI
      if (g_fUseMidi)
      {
         if (g_fNoMusic)
         {
            PAL_PlayMUS(0, false, 0);
         }
         else
         {
            PAL_PlayMUS(stateService.getGlobal('wNumMusic') || 0, true, 0);
         }
      }
      #endif
      */
      break;
    case 4:
      // Sound
      var currentNoSound = !!stateService.getGlobal('noSound');
      const noSound = !(yield uigame.switchMenu(!currentNoSound));
      stateService.setGlobal('noSound', noSound);
      break;
    case 5:
      if (!PAL_CLASSIC) {
        // Battle Mode
        yield uigame.battleSpeedMenu();
      } else {
        // Quit
        yield quit();
      }
      break;
    case 6:
      // Quit
      yield quit();
      break;
  }
  box.free();
  return true;
};

uigame.inGameMagicMenu = function*() {
  var rect = new RECT(35, 62, 95, 90);
  // Draw the player info boxes
  var y = 45;
  var party = getParty();
  var maxPartyMemberIndex = getMaxPartyMemberIndex();

  for (var i = 0; i <= maxPartyMemberIndex; i++) {
   uibattle.playerInfoBox(
     PAL_XY(y, 165),
     getPartyRole(i),
     100,
     ui.TIMEMETER_COLOR_DEFAULT,
     true
   );
   y += 78;
  }

  y = 75;

  var menuitems = [];
  // Generate one menu items for each player in the party
  for (var i = 0; i <= maxPartyMemberIndex; i++) {
    if (i > Const.MAX_PLAYERS_IN_PARTY) {
      throw 'max players in party exceeded';
    }
    var roleId = getPartyRole(i);
    var roleNameId = worldService.getPlayerNameId(roleId);
    var roleHP = worldService.getPlayerHP(roleId);
    menuitems.push(new ui.MenuItem(
      i,
      roleNameId,
      roleHP > 0,
      PAL_XY(48, y)
    ));
    y += 18;
  }

  // Draw the box
  var box = ui.createBox(
    PAL_XY(35, 62),
    maxPartyMemberIndex,
    2,
    0,
  false);
  surface.updateScreen(rect);

  var w = yield ui.readMenu(null, menuitems, 0, ui.MENUITEM_COLOR);

  if (w == ui.MENUITEM_VALUE_CANCELLED) {
    return;
  }

  var magic = 0;
  while (true) {
    magic = yield ui.magicmenu.magicSelectMenu(
      getPartyRole(w),
      false,
      magic
    );
    if (magic == 0) {
      break;
    }
    var objectEntry = getObjectEntry(magic);
    var magicObj = objectEntry ? objectEntry.magic : null;
    if (!magicObj) {
      continue;
    }
    var magicData = getMagicEntry(magicObj.magicNumber) || {};
    var magicCost = magicData.costMP || 0;
    if (magicObj.flags & MagicFlag.ApplyToAll) {
      var applyScriptResult = yield script.runTriggerScript(magicObj.scriptOnUse, 0);
      worldService.mutateObjectEntry(magic, (entry) => {
        if (entry && entry.magic) {
          entry.magic.scriptOnUse = applyScriptResult;
        }
        return entry;
      });
      if (script.scriptSuccess) {
        magicObj.scriptOnSuccess = yield script.runTriggerScript(magicObj.scriptOnSuccess, 0);
        if (script.scriptSuccess) {
          var roleId = getPartyRole(w);
          var currentMP = worldService.getPlayerMP(roleId);
          worldService.setPlayerMP(roleId, currentMP - magicCost);
        }
      }

      if (stateService.getGlobal('needToFadeIn')) {
        yield surface.fadeIn(stateService.getGlobal('numPalette'), stateService.getGlobal('nightPalette'), 1);
        stateService.setGlobal('needToFadeIn', false);
      }
    } else {
      // Need to select which player to use the magic on.
      var player = 0;
      while (player != ui.MENUITEM_VALUE_CANCELLED) {
        // Redraw the player info boxes first
        y = 45;
        for (var i = 0; i <= maxPartyMemberIndex; i++) {
          uibattle.playerInfoBox(
            PAL_XY(y, 165),
            getPartyRole(i),
            100,
            ui.TIMEMETER_COLOR_DEFAULT,
            true
          );
          y += 78;
        }

        // Draw the cursor on the selected item
        rect.x = 70 + 78 * player;
        rect.y = 193;
        rect.w = 9;
        rect.h = 6;

        var frame = ui.sprite.frames[ui.SPRITENUM_CURSOR];
        surface.blitRLE(frame, PAL_XY(rect.x, rect.y));
        surface.updateScreen(rect);

        while (true) {
          if (input.isKeyPressed(Key.Menu)){
            player = ui.MENUITEM_VALUE_CANCELLED;
            break;
          } else if (input.isKeyPressed(Key.Search)) {
            var targetRole = getPartyRole(player);
            var targetedScript = yield script.runTriggerScript(magicObj.scriptOnUse, targetRole);
            worldService.mutateObjectEntry(magic, (entry) => {
              if (entry && entry.magic) {
                entry.magic.scriptOnUse = targetedScript;
              }
              return entry;
            });
            if (script.scriptSuccess) {
              magicObj.scriptOnSuccess = yield script.runTriggerScript(magicObj.scriptOnSuccess, targetRole);
              if (script.scriptSuccess){
                var casterRole = getPartyRole(w);
                var casterMP = worldService.getPlayerMP(casterRole);
                worldService.setPlayerMP(casterRole, casterMP - magicCost);
                // Check if we have run out of MP
                if (worldService.getPlayerMP(casterRole) < magicCost) {
                  // Don't go further if run out of MP
                  player = ui.MENUITEM_VALUE_CANCELLED;
                }
              }
            }
            break;
          } else if (input.isKeyPressed(Key.Left | Key.Up)) {
            if (player > 0) {
              player--;
              break;
            }
          } else if (input.isKeyPressed((Key.Right | Key.Down))) {
            if (player < maxPartyMemberIndex) {
              player++;
              break;
            }
          }

          input.clear();
          yield sleepByFrame(1);
        }
        input.clear();
      }
    }

    // Redraw the player info boxes
    y = 45;
    for (var i = 0; i <= maxPartyMemberIndex; i++) {
      uibattle.playerInfoBox(
        PAL_XY(y, 165),
        getPartyRole(i),
        100,
        ui.TIMEMETER_COLOR_DEFAULT,
        true
      );
      y += 78;
    }
  }
};

uigame.inventoryMenu = function*() {
  var rect = new RECT(30, 60, 75, 60);
  var menuitems = [
    new ui.MenuItem(1, ui.INVMENU_LABEL_USE,   true, PAL_XY(43, 73)),
    new ui.MenuItem(2, ui.INVMENU_LABEL_EQUIP, true, PAL_XY(43, 73 + 18))
  ];

  var box = ui.createBox(PAL_XY(30, 60), 1, 1, 0, false);
  surface.updateScreen(rect);

  var w = yield ui.readMenu(null, menuitems, 0, ui.MENUITEM_COLOR);

  switch (w) {
    case 1:
      yield play.useItem();
      break;
    case 2:
      yield play.equipItem();
      break;
  }
};

uigame.inGameMenu_onItemChange = function(currentItem) {
  stateService.setGlobal('curMainMenuItem', currentItem - 1);
};

uigame.inGameMenu = function*() {
  var result;
  var rect = new RECT(0, 0, 150, 185);

  // Display the cash amount.
  var cashBox = uigame.showCash(getCash());
  // Create the menu box.
  var menuBox = ui.createBox(PAL_XY(3, 37), 3, 1, 0, true);
  surface.updateScreen(rect);

  // Create menu items
  var menuitems = [
    new ui.MenuItem(1, ui.GAMEMENU_LABEL_STATUS,    true, PAL_XY(16, 50)),
    new ui.MenuItem(2, ui.GAMEMENU_LABEL_MAGIC,     true, PAL_XY(16, 50 + 18)),
    new ui.MenuItem(3, ui.GAMEMENU_LABEL_INVENTORY, true, PAL_XY(16, 50 + 36)),
    new ui.MenuItem(4, ui.GAMEMENU_LABEL_SYSTEM,    true, PAL_XY(16, 50 + 54))
  ];

  // Process the menu
  var curMainMenuItem = stateService.getGlobal('curMainMenuItem');
  if (typeof curMainMenuItem !== 'number') {
    curMainMenuItem = 0;
  }

  while (true) {
    var currentSelection = stateService.getGlobal('curMainMenuItem');
    if (typeof currentSelection !== 'number') {
      currentSelection = curMainMenuItem;
    } else {
      curMainMenuItem = currentSelection;
    }
    result = yield ui.readMenu(uigame.inGameMenu_onItemChange, menuitems, currentSelection, ui.MENUITEM_COLOR);

    if (result == ui.MENUITEM_VALUE_CANCELLED) {
      break;
    }

    switch (result) {
      case 1:
        // Status
        yield uigame.playerStatus();
        return out();
      case 2:
        // Magic
        yield uigame.inGameMagicMenu();
        return out();
      case 3:
        // Inventory
        yield uigame.inventoryMenu();
        return out();
      case 4:
        // System
        if (yield uigame.systemMenu()) {
          return out();
        }
        break;
    }
  }

  function out() {
    // Remove the boxes.
    cashBox.free();
    menuBox.free();
    surface.updateScreen(rect);
  }
  out();
};

uigame.playerStatus = function*() {
  var equipPos = [
    [190, 0],[248, 40], [252, 102], [202, 134], [142, 142], [82, 126]
  ];
  var bufBackground = Files.FBP.decompressChunk(ui.STATUS_BACKGROUND_FBPNUM);
  var bufImage;
  var current = 0;

  while (current >= 0 && current <= getMaxPartyMemberIndex()) {
    var role = getPartyRole(current);
    if (role == null) {
      current++;
      continue;
    }
    var nameWordId = worldService.getPlayerNameId(role);
    // Draw the background image
    surface.blit(bufBackground);
    // Draw the text labels
    ui.drawText(ui.getWord(ui.STATUS_LABEL_EXP),             PAL_XY(6, 6),   ui.MENUITEM_COLOR, true, false);
    ui.drawText(ui.getWord(ui.STATUS_LABEL_LEVEL),           PAL_XY(6, 32),  ui.MENUITEM_COLOR, true, false);
    ui.drawText(ui.getWord(ui.STATUS_LABEL_HP),              PAL_XY(6, 54),  ui.MENUITEM_COLOR, true, false);
    ui.drawText(ui.getWord(ui.STATUS_LABEL_MP),              PAL_XY(6, 76),  ui.MENUITEM_COLOR, true, false);
    ui.drawText(ui.getWord(ui.STATUS_LABEL_ATTACKPOWER),     PAL_XY(6, 98),  ui.MENUITEM_COLOR, true, false);
    ui.drawText(ui.getWord(ui.STATUS_LABEL_MAGICPOWER),      PAL_XY(6, 118), ui.MENUITEM_COLOR, true, false);
    ui.drawText(ui.getWord(ui.STATUS_LABEL_RESISTANCE),      PAL_XY(6, 138), ui.MENUITEM_COLOR, true, false);
    ui.drawText(ui.getWord(ui.STATUS_LABEL_DEXTERITY),       PAL_XY(6, 158), ui.MENUITEM_COLOR, true, false);
    ui.drawText(ui.getWord(ui.STATUS_LABEL_FLEERATE),        PAL_XY(6, 178), ui.MENUITEM_COLOR, true, false);

    ui.drawText(ui.getWord(nameWordId), PAL_XY(110, 8), ui.MENUITEM_COLOR_CONFIRMED, true, false);

    // Draw the stats
    var expEntry = getExpEntry(role);
    var currentLevel = worldService.getPlayerLevel(role);
    var levelUpTarget = worldService.getLevelUpExp(currentLevel) || 0;
    ui.drawNumber(expEntry.exp || 0, 5, PAL_XY(58, 6), NumColor.Yellow, NumAlign.Right);
    ui.drawNumber(levelUpTarget, 5, PAL_XY(58, 15), NumColor.Cyan, NumAlign.Right);
    ui.drawNumber(currentLevel, 2, PAL_XY(54, 35), NumColor.Yellow, NumAlign.Right);
    surface.blitRLE(ui.sprite.frames[ui.SPRITENUM_SLASH], PAL_XY(65, 58));
    surface.blitRLE(ui.sprite.frames[ui.SPRITENUM_SLASH], PAL_XY(65, 80));
    ui.drawNumber(worldService.getPlayerHP(role), 4, PAL_XY(42, 56), NumColor.Yellow, NumAlign.Right);
    ui.drawNumber(worldService.getPlayerMaxHP(role), 4, PAL_XY(63, 61), NumColor.Blue, NumAlign.Right);
    ui.drawNumber(worldService.getPlayerMP(role), 4, PAL_XY(42, 78), NumColor.Yellow, NumAlign.Right);
    ui.drawNumber(worldService.getPlayerMaxMP(role), 4, PAL_XY(63, 83), NumColor.Blue, NumAlign.Right);

    ui.drawNumber(script.getPlayerAttackStrength(role), 4, PAL_XY(42, 102), NumColor.Yellow, NumAlign.Right);
    ui.drawNumber(script.getPlayerMagicStrength(role), 4, PAL_XY(42, 122), NumColor.Yellow, NumAlign.Right);
    ui.drawNumber(script.getPlayerDefense(role), 4, PAL_XY(42, 142), NumColor.Yellow, NumAlign.Right);
    ui.drawNumber(script.getPlayerDexterity(role), 4, PAL_XY(42, 162), NumColor.Yellow, NumAlign.Right);
    ui.drawNumber(script.getPlayerFleeRate(role), 4, PAL_XY(42, 182), NumColor.Yellow, NumAlign.Right);

    // Draw the equipments
    for (var i = 0; i < Const.MAX_PLAYER_EQUIPMENTS; i++) {
      var equipmentId = worldService.getPlayerEquipment(i, role);
      if (!equipmentId) {
        continue;
      }
      // Draw the image
      bufImage = RLE(Files.BALL.readChunk(getObjectBitmap(equipmentId)));
      if (bufImage) {
         surface.blitRLE(bufImage, PAL_XY(equipPos[i][0], equipPos[i][1]));
      }
      // Draw the text label
      ui.drawText(ui.getWord(equipmentId), PAL_XY(equipPos[i][0] + 5, equipPos[i][1] + 38), ui.STATUS_COLOR_EQUIPMENT, true, false);
    }

    // Draw the image of player role
    bufImage = RLE(Files.RGM.readChunk(worldService.getPlayerAvatarId(role)));
    if (bufImage) {
       surface.blitRLE(bufImage, PAL_XY(110, 30));
    }

    // Draw all poisons
    var y = 58;
    var poisonMatrix = getPoisonStatusMatrix();
    for (var i = 0; i < Const.MAX_POISONS; i++) {
      var row = poisonMatrix[i];
      var entry = row && row[current] ? row[current] : null;
      var poisonId = entry ? entry.poisonID : 0;

      if (poisonId) {
        var poisonObject = getObjectEntry(poisonId);
        var poisonData = poisonObject && poisonObject.poison ? poisonObject.poison : null;
        if (poisonData && poisonData.poisonLevel <= 3) {
          ui.drawText(ui.getWord(poisonId), PAL_XY(185, y), (poisonData.color || 0) + 10, true, false);
          y += 18;
        }
      }
    }

    // Update the screen
    surface.updateScreen(null);

    // Wait for input
    input.clear();
    while (true) {
      if (input.isKeyPressed(Key.Menu)) {
        current = -1;
        break;
      } else if (input.isKeyPressed((Key.Left | Key.Up))) {
        current--;
        break;
      } else if (input.isKeyPressed((Key.Right | Key.Down | Key.Search))) {
        current++;
        break;
      }
      yield sleepByFrame(1);
    }
  }
};

uigame.itemUseMenu = function*(itemToUse) {
  var rect = new RECT(110, 2, 200, 180);
  var selectedColor = ui.MENUITEM_COLOR_SELECTED_FIRST;
  var selectedPlayer = 0;
  var maxPartyMemberIndex = getMaxPartyMemberIndex();

  while (true) {
    if (maxPartyMemberIndex < 0) {
      return ui.MENUITEM_VALUE_CANCELLED;
    }
    if (selectedPlayer > maxPartyMemberIndex) {
      selectedPlayer = 0;
    }

    // Draw the box
    var box = ui.createBox(PAL_XY(110, 2), 7, 9, 0, false);

    // Draw the stats of the selected player
    ui.drawText(ui.getWord(ui.STATUS_LABEL_LEVEL),       PAL_XY(200, 16),  ui.ITEMUSEMENU_COLOR_STATLABEL, true, false);
    ui.drawText(ui.getWord(ui.STATUS_LABEL_HP),          PAL_XY(200, 34),  ui.ITEMUSEMENU_COLOR_STATLABEL, true, false);
    ui.drawText(ui.getWord(ui.STATUS_LABEL_MP),          PAL_XY(200, 52),  ui.ITEMUSEMENU_COLOR_STATLABEL, true, false);
    ui.drawText(ui.getWord(ui.STATUS_LABEL_ATTACKPOWER), PAL_XY(200, 70),  ui.ITEMUSEMENU_COLOR_STATLABEL, true, false);
    ui.drawText(ui.getWord(ui.STATUS_LABEL_MAGICPOWER),  PAL_XY(200, 88),  ui.ITEMUSEMENU_COLOR_STATLABEL, true, false);
    ui.drawText(ui.getWord(ui.STATUS_LABEL_RESISTANCE),  PAL_XY(200, 106), ui.ITEMUSEMENU_COLOR_STATLABEL, true, false);
    ui.drawText(ui.getWord(ui.STATUS_LABEL_DEXTERITY),   PAL_XY(200, 124), ui.ITEMUSEMENU_COLOR_STATLABEL, true, false);
    ui.drawText(ui.getWord(ui.STATUS_LABEL_FLEERATE),    PAL_XY(200, 142), ui.ITEMUSEMENU_COLOR_STATLABEL, true, false);

    var role = getPartyRole(selectedPlayer);
    if (role == null) {
      role = getPartyRole(0) || 0;
    }

    ui.drawNumber(worldService.getPlayerLevel(role), 4, PAL_XY(240, 20), NumColor.Yellow, NumAlign.Right);
    ui.drawNumber(worldService.getPlayerMaxHP(role), 4, PAL_XY(261, 40), NumColor.Blue,   NumAlign.Right);
    ui.drawNumber(worldService.getPlayerHP(role),    4, PAL_XY(240, 37), NumColor.Yellow, NumAlign.Right);
    ui.drawNumber(worldService.getPlayerMaxMP(role), 4, PAL_XY(261, 58), NumColor.Blue,   NumAlign.Right);
    ui.drawNumber(worldService.getPlayerMP(role),    4, PAL_XY(240, 55), NumColor.Yellow, NumAlign.Right);
    surface.blitRLE(ui.sprite.frames[ui.SPRITENUM_SLASH], PAL_XY(263, 38));
    surface.blitRLE(ui.sprite.frames[ui.SPRITENUM_SLASH], PAL_XY(263, 56));

    ui.drawNumber(script.getPlayerAttackStrength(role), 4, PAL_XY(240, 74),  NumColor.Yellow, NumAlign.Right);
    ui.drawNumber(script.getPlayerMagicStrength(role),  4, PAL_XY(240, 92),  NumColor.Yellow, NumAlign.Right);
    ui.drawNumber(script.getPlayerDefense(role),        4, PAL_XY(240, 110), NumColor.Yellow, NumAlign.Right);
    ui.drawNumber(script.getPlayerDexterity(role),      4, PAL_XY(240, 128), NumColor.Yellow, NumAlign.Right);
    ui.drawNumber(script.getPlayerFleeRate(role),       4, PAL_XY(240, 146), NumColor.Yellow, NumAlign.Right);

    // Draw the names of the players in the party
    for (var i = 0; i <= maxPartyMemberIndex; i++) {
      var color = (i == selectedPlayer ? selectedColor : ui.MENUITEM_COLOR);
      var partyRole = getPartyRole(i);
      var nameWord = worldService.getPlayerNameId(partyRole);
      ui.drawText(ui.getWord(nameWord), PAL_XY(125, 16 + 20 * i), color, true, false);
    }

    surface.blitRLE(ui.sprite.frames[ui.SPRITENUM_ITEMBOX], PAL_XY(120, 80));

    var amount = script.getItemAmount(itemToUse);

    if (amount > 0) {
      // Draw the picture of the item
      var bufImage = Files.BALL.readChunk(getObjectBitmap(itemToUse));
      if (bufImage) {
        surface.blitRLE(bufImage, PAL_XY(127, 88));
      }

      // Draw the amount and label of the item
      ui.drawText(ui.getWord(itemToUse), PAL_XY(116, 143), ui.STATUS_COLOR_EQUIPMENT, true, false);
      ui.drawNumber(amount, 2, PAL_XY(170, 133), NumColor.Cyan, NumAlign.Right);
    }

    // Update the screen area
    surface.updateScreen(rect);

    // Wait for key
    input.clear();
    var colorChangeTime = 0;
    while (true) {
      // See if we should change the highlight color
      var now = timestamp();
      if (now > colorChangeTime) {
        if (selectedColor + 1 >= ui.MENUITEM_COLOR_SELECTED_FIRST + ui.MENUITEM_COLOR_SELECTED_TOTALNUM) {
          selectedColor = ui.MENUITEM_COLOR_SELECTED_FIRST;
        } else {
          selectedColor++;
        }

        colorChangeTime = now + (600 / ui.MENUITEM_COLOR_SELECTED_TOTALNUM);

        // Redraw the selected item.
        var selectedName = worldService.getPlayerNameId(getPartyRole(selectedPlayer));
        ui.drawText(ui.getWord(selectedName), PAL_XY(125, 16 + 20 * selectedPlayer), selectedColor, false, true);
      }

      if (input.keyPress != 0) {
        break;
      }

      yield sleepByFrame(1);
    }

    if (amount <= 0) {
      return ui.MENUITEM_VALUE_CANCELLED;
    }

    if (input.isKeyPressed(Key.Up | Key.Left)) {
      if (selectedPlayer > 0) {
        selectedPlayer--;
      }
    } else if (input.isKeyPressed(Key.Down | Key.Right)) {
      if (selectedPlayer < maxPartyMemberIndex) {
        selectedPlayer++;
      }
    } else if (input.isKeyPressed(Key.Menu)) {
      box.free();
      break;
    } else if (input.isKeyPressed(Key.Search)) {
      box.free();
      return getPartyRole(selectedPlayer);
    }

    box.free();
  }

  return ui.MENUITEM_VALUE_CANCELLED;
};

uigame.buyMenu_onItemChange = function(currentItem) {
  var rect = new RECT(20, 8, 128, 175);
  // Draw the picture of current selected item
  surface.blitRLE(ui.sprite.frames[ui.SPRITENUM_ITEMBOX], PAL_XY(35, 8));
  var bufImage = Files.BALL.readChunk(getObjectBitmap(currentItem));
  if (bufImage) {
    surface.blitRLE(bufImage, PAL_XY(42, 16));
  }
  // See how many of this item we have in the inventory
  var amount = 0;
  var inventory = getInventorySnapshot();
  for (var i = 0; i < Const.MAX_INVENTORY; i++) {
    var slot = inventory[i];
    if (!slot || slot.item === 0) {
      break;
    } else if (slot.item === currentItem) {
       amount = slot.amount || 0;
       break;
    }
  }
  // Draw the amount of this item in the inventory
  ui.createSingleLineBox(PAL_XY(20, 105), 5, false);
  ui.drawText(ui.getWord(ui.BUYMENU_LABEL_CURRENT), PAL_XY(30, 115), 0, false, false);
  ui.drawNumber(amount, 6, PAL_XY(69, 119), NumColor.Yellow, NumAlign.Right);
  // Draw the cash amount
  ui.createSingleLineBox(PAL_XY(20, 145), 5, false);
  ui.drawText(ui.getWord(ui.CASH_LABEL), PAL_XY(30, 155), 0, false, false);
  ui.drawNumber(getCash(), 6, PAL_XY(69, 159), NumColor.Yellow, NumAlign.Right);

  surface.updateScreen(rect);
};

uigame.buyMenu = function*(storeNum){
  var rect = new RECT(125, 8, 190, 190);
  // create the menu items
  var menuitems = [];
  var storeEntry = getStoreEntry(storeNum);
  var storeItems = storeEntry && Array.isArray(storeEntry.items) ? storeEntry.items : [];
  for (var i = 0; i < Const.MAX_STORE_ITEM; i++) {
    var itemId = storeItems[i];
    if (!itemId) {
      break;
    }
    menuitems.push(new ui.MenuItem(
      itemId,
      itemId,
      true,
      PAL_XY(150, 22 + i * 18)
    ));
  }

  // Draw the box
  ui.createBox(PAL_XY(125, 8), 8, 8, 1, false);
  // Draw the number of prices
  for (var i = 0; i < menuitems.length; i++) {
    var w = getObjectPrice(menuitems[i].value);
    ui.drawNumber(w, 6, PAL_XY(235, 25 + i * 18), NumColor.Cyan, NumAlign.Right);
  }
  surface.updateScreen(rect);

  var result = 0;
  while (true) {
    result = yield ui.readMenu(uigame.buyMenu_onItemChange, menuitems, result, ui.MENUITEM_COLOR);

    if (result == ui.MENUITEM_VALUE_CANCELLED) {
      break;
    }

    if (getObjectPrice(result) <= getCash()) {
      if (yield uigame.confirmMenu()) {
        // Player bought an item
        stateService.mutateGlobal('cash', (cash) => {
          var currentCash = Number(cash) || 0;
          return currentCash - getObjectPrice(result);
        });
        script.addItemToInventory(result, 1);
      }
    }

    // Place the cursor to the current item on next loop
    for (var i=0; i<menuitems.length; ++i) {
      if (result == menuitems[i].value) {
        result = i;
        break;
      }
    }
  }
};

uigame.sellMenu_onItemChange = function(currentItem) {
  // Draw the cash amount
  ui.createSingleLineBox(PAL_XY(100, 150), 5, false);
  ui.drawText(ui.getWord(ui.CASH_LABEL), PAL_XY(110, 160), 0, false, false);
  ui.drawNumber(getCash(), 6, PAL_XY(149, 164), NumColor.Yellow, NumAlign.Right);

  // Draw the price
  ui.createSingleLineBox(PAL_XY(220, 150), 5, false);

  if (getObjectFlags(currentItem) & ItemFlag.Sellable) {
    ui.drawText(ui.getWord(ui.SELLMENU_LABEL_PRICE), PAL_XY(230, 160), 0, false, false);
    ui.drawNumber(~~(getObjectPrice(currentItem) / 2), 6, PAL_XY(269, 164), NumColor.Yellow, NumAlign.Right);
  }
};

uigame.sellMenu = function*(){
  while (true) {
    var w = yield itemmenu.itemSelectMenu(uigame.sellMenu_onItemChange, ItemFlag.Sellable);
    if (w == 0) {
      break;
    }

    if (yield uigame.confirmMenu()) {
      if (script.addItemToInventory(w, -1)) {
        stateService.mutateGlobal('cash', (cash) => {
          var currentCash = Number(cash) || 0;
          return currentCash + getObjectPrice(w) / 2;
        });
      }
    }
  }
};

uigame.equipItemMenu = function*(item) {
  setLastUnequippedItem(item);
  var bufBackground = Files.FBP.decompressChunk(ui.EQUIPMENU_BACKGROUND_FBPNUM);
  var currentPlayer = 0;
  var selectedColor = ui.MENUITEM_COLOR_SELECTED_FIRST;
  while (true) {
    var maxPartyMemberIndex = getMaxPartyMemberIndex();
    if (maxPartyMemberIndex < 0) {
      return;
    }
    item = getLastUnequippedItem();
    // Draw the background
    surface.blit(bufBackground);
    // Draw the item picture
    var bufImage = Files.BALL.readChunk(getObjectBitmap(item));
    if (bufImage) {
       surface.blitRLE(bufImage, PAL_XY(16, 16));
    }
    // Draw the current equipment of the selected player
    var role = getPartyRole(currentPlayer);
    if (role == null) {
      role = getPartyRole(0) || 0;
    }
    for (var i = 0; i < ui.MAX_PLAYER_EQUIPMENTS; i++) {
      var equipId = worldService.getPlayerEquipment(i, role);
      if (equipId) {
        ui.drawText(ui.getWord(equipId), PAL_XY(130, 11 + i * 22), ui.MENUITEM_COLOR, true, false);
      }
    }
    // Draw the stats of the currently selected player
    ui.drawNumber(script.getPlayerAttackStrength(role), 4, PAL_XY(260, 14),  NumColor.Cyan, NumAlign.Right);
    ui.drawNumber(script.getPlayerMagicStrength(role),  4, PAL_XY(260, 36),  NumColor.Cyan, NumAlign.Right);
    ui.drawNumber(script.getPlayerDefense(role),        4, PAL_XY(260, 58),  NumColor.Cyan, NumAlign.Right);
    ui.drawNumber(script.getPlayerDexterity(role),      4, PAL_XY(260, 80),  NumColor.Cyan, NumAlign.Right);
    ui.drawNumber(script.getPlayerFleeRate(role),       4, PAL_XY(260, 102), NumColor.Cyan, NumAlign.Right);
    // Draw a box for player selection
    ui.createBox(PAL_XY(2, 95), maxPartyMemberIndex, 2, 0, false);
    // Draw the label of players
    var itemFlags = getObjectFlags(item);
    for (i = 0; i <= maxPartyMemberIndex; i++) {
      var partyRole = getPartyRole(i);
      var nameWord = worldService.getPlayerNameId(partyRole);
      var color;
      var canEquip = !!(itemFlags & (ItemFlag.EquipableByPlayerRole_First << partyRole));
      if (currentPlayer == i) {
        color = canEquip ? selectedColor : ui.MENUITEM_COLOR_SELECTED_INACTIVE;
      } else {
        color = canEquip ? ui.MENUITEM_COLOR : ui.MENUITEM_COLOR_INACTIVE;
      }

      ui.drawText(ui.getWord(nameWord), PAL_XY(15, 108 + 18 * i), color, true, false);
    }
    // Draw the text label and amount of the item
    if (item != 0) {
       ui.drawText(ui.getWord(item), PAL_XY(5, 70), ui.MENUITEM_COLOR_CONFIRMED, true, false);
       ui.drawNumber(script.getItemAmount(item), 2, PAL_XY(65, 73), NumColor.Cyan, NumAlign.Right);
    }
    // Update the screen
    surface.updateScreen(null);

    // Accept input
    input.clear();
    var colorChangeTime = timestamp() + (600 / ui.MENUITEM_COLOR_SELECTED_TOTALNUM);
    while (true) {
      // See if we should change the highlight color
      var now = timestamp();
      if (now > colorChangeTime) {
        if (selectedColor + 1 >= ui.MENUITEM_COLOR_SELECTED_FIRST + ui.MENUITEM_COLOR_SELECTED_TOTALNUM) {
          selectedColor = ui.MENUITEM_COLOR_SELECTED_FIRST;
        } else {
          selectedColor++;
        }

        colorChangeTime = now + (600 / ui.MENUITEM_COLOR_SELECTED_TOTALNUM);

        // Redraw the selected item if needed.
        role = getPartyRole(currentPlayer);
        if (role != null && (itemFlags & (ItemFlag.EquipableByPlayerRole_First << role))) {
          var selectedNameWord = worldService.getPlayerNameId(role);
          ui.drawText(ui.getWord(selectedNameWord), PAL_XY(15, 108 + 18 * currentPlayer), selectedColor, true, true);
        }
      }

      if (input.keyPress != 0) {
        break;
      }

      yield sleepByFrame(1);
    }
    if (item == 0) {
       return;
    }
    if (input.isKeyPressed(Key.Up | Key.Left)) {
      currentPlayer--;
      if (currentPlayer < 0) {
        currentPlayer = 0;
      }
    } else if (input.isKeyPressed(Key.Down | Key.Right)) {
      currentPlayer++;
      if (currentPlayer > maxPartyMemberIndex) {
        currentPlayer = maxPartyMemberIndex;
      }
    } else if (input.isKeyPressed(Key.Menu)) {
       return;
    } else if (input.isKeyPressed(Key.Search)) {
       role = getPartyRole(currentPlayer);
       if (role != null && (itemFlags & (ItemFlag.EquipableByPlayerRole_First << role))) {
          // Run the equip script
          var equipScript = getObjectItemData(item) ? getObjectItemData(item).scriptOnEquip : 0;
          const nextEquipScript = yield script.runTriggerScript(equipScript, role);
          setObjectScriptOnEquip(item, nextEquipScript);
       }
    }
  }
};

export default uigame;
