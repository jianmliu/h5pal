import scene from './scene';
import input from './input';
import script from '../../services/script-service.js';
import battleModule from './battle';
import battleService from '../../services/battle-service.js';
import ending from './ending';
import stateService from '../../services/state-service.js';
import worldService from '../../services/world-service.js';

battleService.bindModule(battleModule);

log.trace('play module load');

var play = {};

var surface = null;
var abs = Math.abs;

play.init = function*(surf) {
  log.debug('[PLAY] init');
  global.play = play;
  surface = surf;
  yield script.init(surf);
  worldService.init();
  yield battleService.init(surf);
  yield ending.init(surf);
};

/**
 * The main game logic routine. Update the status of everything.
 *
 * @param {Boolean} trigger       whether to process trigger events or not.
 */
play.update = function*(trigger) {
  var currentSceneId = worldService.getSceneId() || stateService.getGlobal('numScene');

  if (trigger) {
    if (stateService.getGlobal('enteringScene')) {
      stateService.setGlobal('enteringScene', false);

      var sceneData = worldService.getSceneData();
      var scriptOnEnter = sceneData && typeof sceneData.scriptOnEnter === 'number'
        ? sceneData.scriptOnEnter
        : 0;
      var nextScriptOnEnter = yield script.runTriggerScript(scriptOnEnter, 0xFFFF);

      if (sceneData && typeof nextScriptOnEnter === 'number') {
        stateService.mutateGameData('scene', function(scenes) {
          if (Array.isArray(scenes) && currentSceneId > 0 && scenes[currentSceneId - 1]) {
            scenes[currentSceneId - 1].scriptOnEnter = nextScriptOnEnter;
          }
          return scenes;
        });
      }

      if (stateService.getGlobal('enteringScene') || stateService.getGlobal('gameStart')) {
        return;
      }

      input.clear();
      yield scene.makeScene();
    }

    stateService.mutateGameData('eventObject', function(objects) {
      if (!Array.isArray(objects)) {
        return objects;
      }
      for (var idx = 0; idx < objects.length; idx++) {
        var eventObject = objects[idx];
        if (eventObject && eventObject.vanishTime !== 0) {
          eventObject.vanishTime += ((eventObject.vanishTime < 0) ? 1 : -1);
        }
      }
      return objects;
    });

    var viewportValue = worldService.getViewport();
    var partyOffsetValue = worldService.getPartyOffset();
    var sceneEventObjects = worldService.getEventObjectsInCurrentScene();

    for (var ei = 0; ei < sceneEventObjects.length; ei++) {
      var entry = sceneEventObjects[ei];
      var eventObjectID = entry.id;
      var eventIndex = entry.index;
      var obj = entry.state;

      if (!obj || obj.vanishTime !== 0) {
        continue;
      }

      if (obj.state < 0) {
        if (obj.x < PAL_X(viewportValue) ||
            obj.x > PAL_X(viewportValue) + 320 ||
            obj.y < PAL_Y(viewportValue) ||
            obj.y > PAL_Y(viewportValue) + 320) {
          worldService.mutateEventObject(eventIndex, (evt) => {
            evt.state = abs(evt.state);
            evt.currentFrameNum = 0;
            return evt;
          });
          obj = worldService.getEventObject(eventIndex);
        }
      } else if (obj.state > 0 && obj.triggerMode >= TriggerMode.TouchNear) {
        var heroX = PAL_X(viewportValue) + PAL_X(partyOffsetValue);
        var heroY = PAL_Y(viewportValue) + PAL_Y(partyOffsetValue);
        if (abs(heroX - obj.x) + abs(heroY - obj.y) * 2 <
            (obj.triggerMode - TriggerMode.TouchNear) * 32 + 16) {
          if (obj.spriteFrames) {
            worldService.mutateEventObject(eventIndex, (evt) => {
              evt.currentFrameNum = 0;
              var xOffset = heroX - evt.x;
              var yOffset = heroY - evt.y;
              if (xOffset > 0) {
                evt.direction = (yOffset > 0 ? Direction.East : Direction.North);
              } else {
                evt.direction = (yOffset > 0 ? Direction.South : Direction.West);
              }
              return evt;
            });
            obj = worldService.getEventObject(eventIndex);

            scene.updatePartyGestures(false);

            yield scene.makeScene();
            surface.updateScreen(null);

            viewportValue = worldService.getViewport();
            partyOffsetValue = worldService.getPartyOffset();
            heroX = PAL_X(viewportValue) + PAL_X(partyOffsetValue);
            heroY = PAL_Y(viewportValue) + PAL_Y(partyOffsetValue);
          }

          var updatedTrigger = yield script.runTriggerScript(obj.triggerScript, eventObjectID);
          worldService.mutateEventObject(eventIndex, (evt) => {
            evt.triggerScript = updatedTrigger;
            return evt;
          });
          obj = worldService.getEventObject(eventIndex);

          input.clear();

          if (stateService.getGlobal('enteringScene') || stateService.getGlobal('gameStart')) {
            return;
          }
        }
      }
    }
  }

  var viewportCurrent = worldService.getViewport();
  var partyOffsetCurrent = worldService.getPartyOffset();
  var sceneObjects = worldService.getEventObjectsInCurrentScene();

  for (var index = 0; index < sceneObjects.length; index++) {
    var currentEntry = sceneObjects[index];
    var currentIdx = currentEntry.index;
    var currentObj = currentEntry.state;
    if (!currentObj) {
      continue;
    }

    if (currentObj.state > 0 && currentObj.vanishTime === 0) {
      var autoScriptEntry = currentObj.autoScript;
      if (autoScriptEntry !== 0) {
        var autoScriptResult = yield script.runAutoScript(autoScriptEntry, currentEntry.id);
        worldService.mutateEventObject(currentIdx, (evt) => {
          evt.autoScript = autoScriptResult;
          return evt;
        });
        currentObj = worldService.getEventObject(currentIdx);
        if (stateService.getGlobal('enteringScene') || stateService.getGlobal('gameStart')) {
          return;
        }
      }
    }

    if (trigger && currentObj.state >= ObjectState.Blocker && currentObj.spriteNum !== 0) {
      var heroPosX = PAL_X(viewportCurrent) + PAL_X(partyOffsetCurrent);
      var heroPosY = PAL_Y(viewportCurrent) + PAL_Y(partyOffsetCurrent);
      if (abs(currentObj.x - heroPosX) + abs(currentObj.y - heroPosY) * 2 <= 12) {
        var dir = (currentObj.direction + 1) % 4;
        for (var attempt = 0; attempt < 4; attempt++) {
          heroPosX = PAL_X(viewportCurrent) + PAL_X(partyOffsetCurrent);
          heroPosY = PAL_Y(viewportCurrent) + PAL_Y(partyOffsetCurrent);
          var targetX = heroPosX + ((dir === Direction.West || dir === Direction.South) ? -16 : 16);
          var targetY = heroPosY + ((dir === Direction.West || dir === Direction.North) ? -8 : 8);
          var targetPos = PAL_XY(targetX, targetY);

          if (!scene.checkObstacle(targetPos, true, 0)) {
            worldService.setViewport(PAL_XY(
              PAL_X(targetPos) - PAL_X(partyOffsetCurrent),
              PAL_Y(targetPos) - PAL_Y(partyOffsetCurrent)
            ));
            viewportCurrent = worldService.getViewport();
            partyOffsetCurrent = worldService.getPartyOffset();
            break;
          }

          dir = (dir + 1) % 4;
        }
      }
    }
  }

  stateService.setGlobal('frameNum', (stateService.getGlobal('frameNum') || 0) + 1);
};

/**
 * Allow player use an item in the game.
 */
play.useItem = function*() {
  while (true){
    var object = yield itemmenu.itemSelectMenu(null, ItemFlag.Usable);

    if (object === 0) {
      return;
    }

    var objectState = worldService.getObjectEntry(object);
    if (!objectState || !objectState.item) {
      continue;
    }

    if (!(objectState.item.flags & ItemFlag.ApplyToAll)) {
      // Select the player to use the item on
      while (true) {
        var player = yield uigame.itemUseMenu(object);

        if (player == ui.MENUITEM_VALUE_CANCELLED) {
          break;
        }
        // Run the script
        var currentScript = objectState.item.scriptOnUse;
        var nextScript = yield script.runTriggerScript(currentScript, player);
        worldService.mutateObjectEntry(object, (entry) => {
          if (entry && entry.item) {
            entry.item.scriptOnUse = nextScript;
          }
          return entry;
        });
        // Remove the item if the item is consuming and the script succeeded
        var updatedState = worldService.getObjectEntry(object);
        if (updatedState && updatedState.item && (updatedState.item.flags & ItemFlag.Consuming) && script.scriptSuccess) {
          script.addItemToInventory(object, -1);
        }
        objectState = worldService.getObjectEntry(object);
      }
    } else {
      // Run the script
      var currentScriptAll = objectState.item.scriptOnUse;
      var nextScriptAll = yield script.runTriggerScript(currentScriptAll, 0xFFFF);
      worldService.mutateObjectEntry(object, (entry) => {
        if (entry && entry.item) {
          entry.item.scriptOnUse = nextScriptAll;
        }
        return entry;
      });

      // Remove the item if the item is consuming and the script succeeded
      var refreshedState = worldService.getObjectEntry(object);
      if (refreshedState && refreshedState.item && (refreshedState.item.flags & ItemFlag.Consuming) && script.scriptSuccess) {
        script.addItemToInventory(object, -1);
      }

      return;
    }
  }
};

/**
 * Allow player equip an item in the game.
 */
play.equipItem = function*() {
  while (true) {
    var object = yield itemmenu.itemSelectMenu(null, ItemFlag.Equipable);

    if (object === 0) {
       return;
    }

    var objectEntry = worldService.getObjectEntry(object);
    if (!objectEntry) {
      continue;
    }

    yield uigame.equipItemMenu(object);
  }
};

/**
 * Process searching trigger events.
 */
play.search = function*() {
  var x, y, xOffset, yOffset, dx, dy, dh, ex, ey, eh, i, k, l, p;
  var poses = [];

  // Get the party location
  var viewport = worldService.getViewport();
  var partyOffset = worldService.getPartyOffset();
  var partyDirection = worldService.getPartyDirection();
  x = PAL_X(viewport) + PAL_X(partyOffset);
  y = PAL_Y(viewport) + PAL_Y(partyOffset);
  if (partyDirection == Direction.North || partyDirection == Direction.East) {
    xOffset = 16;
  } else {
    xOffset = -16;
  }

  if (partyDirection == Direction.East || partyDirection == Direction.South) {
    yOffset = 8;
  } else {
    yOffset = -8;
  }

  poses[0] = PAL_XY(x, y);

  for (i = 0; i < 4; i++) {
    poses[i * 3 + 1] = PAL_XY(x + xOffset, y + yOffset);
    poses[i * 3 + 2] = PAL_XY(x, y + yOffset * 2);
    poses[i * 3 + 3] = PAL_XY(x + xOffset, y);
    x += xOffset;
    y += yOffset;
  }

  var sceneData = worldService.getSceneData();
  var range = worldService.getSceneEventObjectRange();
  var partyMembers = worldService.getParty();
  for (i = 0; i < 13; i++) {
    // Convert to map location
    dh = ((PAL_X(poses[i]) % 32) ? 1 : 0);
    dx = ~~(PAL_X(poses[i]) / 32);
    dy = ~~(PAL_Y(poses[i]) / 16);

    // Loop through all event objects
    for (k = range.start; k < range.end; k++){
      p = worldService.getEventObject(k);
      if (!p) {
        continue;
      }
      ex = ~~(p.x / 32);
      ey = ~~(p.y / 16);
      eh = ((p.x % 32) ? 1 : 0);

      if (p.state <= 0 || p.triggerMode >= TriggerMode.TouchNear ||
          p.triggerMode * 6 - 4 < i || dx != ex || dy != ey || dh != eh) {
        continue;
      }

      // Adjust direction/gesture for party members and the event object
      if (p.spriteFrames * 4 > p.currentFrameNum) {
        worldService.mutateEventObject(k, (evt) => {
          evt.currentFrameNum = 0;
          evt.direction = (partyDirection + 2) % 4;
          return evt;
        });

        for (l = 0; l < partyMembers.length; l++) {
          worldService.mutatePartyMember(l, (member) => {
            if (member) {
              member.frame = partyDirection * 3;
            }
            return member;
          });
        }

        // Redraw everything
        yield scene.makeScene();
        surface.updateScreen(null);
      }

      // Execute the script
      var nextTriggerScript = yield script.runTriggerScript(p.triggerScript, k + 1);
      worldService.mutateEventObject(k, (evt) => {
        evt.triggerScript = nextTriggerScript;
        return evt;
      });

      // Clear inputs and delay for a short time
      yield sleep(50); // WARNING param normalize
      input.clear();

      return; // don't go further
    }
  }
  input.clear();
};

/**
 * Starts a video frame. Called once per video frame.
 */
play.startFrame = function*() {
  // Run the game logic of one frame
  yield play.update(true);

  if (Global.enteringScene){
    return;
  }

  // Update the positions and gestures of party members
  scene.updateParty();

  // Update the scene
  yield scene.makeScene();
  surface.updateScreen(null);

  if (input.isKeyPressed(Key.Menu)) {
    // Show the in-game menu
    yield uigame.inGameMenu();
  } else if (input.isKeyPressed(Key.UseItem)) {
    // Show the use item menu
    yield play.useItem();
  } else if (input.isKeyPressed(Key.ThrowItem)) {
    // Show the equipment menu
    yield play.equipItem();
  } else if (input.isKeyPressed(Key.Force)) {
    // Show the magic menu
    yield uigame.inGameMagicMenu();
  } else if (input.isKeyPressed(Key.Status)) {
    // Show the player status
    yield uigame.playerStatus();
  } else if (input.isKeyPressed(Key.Search)) {
    // Process search events
    yield play.search();
  } else if (input.isKeyPressed(Key.Flee)) {
    // Quit Game
    if (yield uigame.confirmMenu()) {
      //music.play(0, false, 2);
      yield surface.fadeOut(2);
      //shutdown();

      //PAL_PlayMUS(0, FALSE, 2);
      //PAL_FadeOut(2);
      //PAL_Shutdown();
      //exit(0);
    }
  }

  stateService.setGlobal('chaseSpeedChangeCycles', (stateService.getGlobal('chaseSpeedChangeCycles') || 0) - 1);
  if ((stateService.getGlobal('chaseSpeedChangeCycles') || 0) === 0) {
    stateService.setGlobal('chaseRange', 1);
  }
};

export default play;
