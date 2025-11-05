import scene from './scene';
import input from './input';
import script from '../../services/script-service.js';
import battleModule from './battle';
import battleService from '../../services/battle-service.js';
import ending from './ending';
import worldService from '../../services/world-service.js';
import sceneEventAdapter from '../../services/scene-event-adapter.js';
import partyTrailAdapter from '../../services/party-trail-adapter.js';
import scriptObjectAdapter from '../../services/script-object-adapter.js';
import {
  getViewportValue as getViewportSnapshot,
  getPartyOffsetValue as getPartyOffsetSnapshot,
  getPartyDirectionValue as getPartyDirectionSnapshot
} from '../../services/environment-adapter.js';
import { getSceneIdValue as getSceneIdSnapshot } from '../../services/scene-state-adapter.js';
import {
  getSceneEntry as getSceneEntrySnapshot,
  getSceneEventObjectRange as getSceneEventObjectRangeSnapshot
} from '../../services/scene-data-adapter.js';
import { getChaseSpeedChangeCycles } from '../../services/game-flags-adapter.js';

battleService.bindModule(battleModule);

log.trace('play module load');

var play = {};

var surface = null;
var abs = Math.abs;

play.init = function*(surf) {
  log.debug('[PLAY] init');
  global.play = play;
  surface = surf;
  worldService.init();
  yield script.init(surf);
  yield battleService.init(surf);
  yield ending.init(surf);
};

/**
 * The main game logic routine. Update the status of everything.
 *
 * @param {Boolean} trigger       whether to process trigger events or not.
 */
play.update = function*(trigger) {
  var currentSceneId = getSceneIdSnapshot() || 0;

  if (trigger) {
    if (worldService.isEnteringScene()) {
      worldService.setEnteringScene(false);

      var sceneData = getSceneEntrySnapshot(currentSceneId);
      var scriptOnEnter = sceneData && typeof sceneData.scriptOnEnter === 'number'
        ? sceneData.scriptOnEnter
        : 0;
      var nextScriptOnEnter = yield script.runTriggerScript(scriptOnEnter, 0xFFFF);

      if (sceneData && typeof nextScriptOnEnter === 'number' && currentSceneId > 0) {
        worldService.mutateSceneEntry(currentSceneId, function(entry) {
          if (entry) {
            entry.scriptOnEnter = nextScriptOnEnter;
          }
          return entry;
        });
      }

      if (worldService.isEnteringScene() || worldService.isGameStart()) {
        return;
      }

      input.clear();
      yield scene.makeScene();
    }

  var eventObjectIds = sceneEventAdapter.getEventObjectIds();
  if (Array.isArray(eventObjectIds) && eventObjectIds.length) {
    for (var eoIndex = 0; eoIndex < eventObjectIds.length; eoIndex++) {
      var eventId = eventObjectIds[eoIndex];
      worldService.mutateEventObjectById(eventId, function(eventObject) {
        if (!eventObject || eventObject.vanishTime === 0) {
          return eventObject;
        }
        eventObject.vanishTime += (eventObject.vanishTime < 0 ? 1 : -1);
        return eventObject;
      });
    }
  }

    var viewportValue = getViewportSnapshot();
    var partyOffsetValue = getPartyOffsetSnapshot();
    var sceneEventObjects = sceneEventAdapter.getEventObjects();

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
          var updatedState = worldService.mutateEventObjectById(eventObjectID, (evt) => {
            evt.state = abs(evt.state);
            evt.currentFrameNum = 0;
            return evt;
          });
          if (updatedState) {
            obj = updatedState;
          } else {
            obj = sceneEventAdapter.getEventObjectStateByIndex(eventIndex);
          }
        }
      } else if (obj.state > 0 && obj.triggerMode >= TriggerMode.TouchNear) {
        var heroX = PAL_X(viewportValue) + PAL_X(partyOffsetValue);
        var heroY = PAL_Y(viewportValue) + PAL_Y(partyOffsetValue);
        if (abs(heroX - obj.x) + abs(heroY - obj.y) * 2 <
            (obj.triggerMode - TriggerMode.TouchNear) * 32 + 16) {
          if (obj.spriteFrames) {
          var mutatedState = worldService.mutateEventObjectById(eventObjectID, (evt) => {
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
            if (mutatedState) {
              obj = mutatedState;
            } else {
              obj = sceneEventAdapter.getEventObjectStateByIndex(eventIndex);
            }

            scene.updatePartyGestures(false);

            yield scene.makeScene();
            surface.updateScreen(null);

            viewportValue = getViewportSnapshot();
            partyOffsetValue = getPartyOffsetSnapshot();
            heroX = PAL_X(viewportValue) + PAL_X(partyOffsetValue);
            heroY = PAL_Y(viewportValue) + PAL_Y(partyOffsetValue);
          }

          var updatedTrigger = yield script.runTriggerScript(obj.triggerScript, eventObjectID);
          var resolvedTrigger = Number.isFinite(updatedTrigger) ? updatedTrigger : 0;
          var triggerState = null;
          if (script.scriptSuccess) {
            triggerState = worldService.mutateEventObjectById(eventObjectID, (evt) => {
              if (evt) {
                evt.triggerScript = resolvedTrigger;
              }
              return evt;
            });
          }
          if (triggerState) {
            obj = triggerState;
          } else {
            obj = sceneEventAdapter.getEventObjectStateByIndex(eventIndex);
          }

          input.clear();

          if (worldService.isEnteringScene() || worldService.isGameStart()) {
            return;
          }
        }
      }
    }
  }

  var viewportCurrent = getViewportSnapshot();
  var partyOffsetCurrent = getPartyOffsetSnapshot();
  var sceneObjects = sceneEventAdapter.getEventObjects();

  for (var index = 0; index < sceneObjects.length; index++) {
    var currentEntry = sceneObjects[index];
    var currentIdx = currentEntry.index;
    var currentEventId = currentEntry.id;
    var currentObj = currentEntry.state;
    if (!currentObj) {
      continue;
    }

    if (currentObj.state > 0 && currentObj.vanishTime === 0) {
      var autoScriptEntry = currentObj.autoScript;
      if (autoScriptEntry !== 0) {
        var autoScriptResult = yield script.runAutoScript(autoScriptEntry, currentEntry.id);
        var resolvedAutoScript = Number.isFinite(autoScriptResult) ? autoScriptResult : 0;
        var updatedAutoScript = worldService.mutateEventObjectById(currentEventId, (evt) => {
          if (evt) {
            evt.autoScript = resolvedAutoScript;
          }
          return evt;
        });
        if (updatedAutoScript) {
          currentObj = updatedAutoScript;
        } else {
          currentObj = sceneEventAdapter.getEventObjectStateByIndex(currentIdx);
        }
        if (worldService.isEnteringScene() || worldService.isGameStart()) {
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
            viewportCurrent = getViewportSnapshot();
            partyOffsetCurrent = getPartyOffsetSnapshot();
            break;
          }

          dir = (dir + 1) % 4;
        }
      }
    }
  }

  worldService.incrementFrameCount(1);
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

    var objectState = scriptObjectAdapter.getObjectEntry(object);
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
        var updatedState = scriptObjectAdapter.getObjectEntry(object);
        if (updatedState && updatedState.item && (updatedState.item.flags & ItemFlag.Consuming) && script.scriptSuccess) {
          script.addItemToInventory(object, -1);
        }
        objectState = scriptObjectAdapter.getObjectEntry(object);
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
      var refreshedState = scriptObjectAdapter.getObjectEntry(object);
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

    var objectEntry = scriptObjectAdapter.getObjectEntry(object);
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
  var viewport = getViewportSnapshot();
  var partyOffset = getPartyOffsetSnapshot();
  var partyDirection = getPartyDirectionSnapshot();
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

  var currentSceneId = getSceneIdSnapshot() || 0;
  var sceneData = getSceneEntrySnapshot(currentSceneId);
  var eventRange = getSceneEventObjectRangeSnapshot();
  var rangeStart = eventRange && Number.isFinite(eventRange.start) ? eventRange.start : 0;
  var rangeEnd = eventRange && Number.isFinite(eventRange.end) ? eventRange.end : rangeStart;
  var partyMembers = partyTrailAdapter.getPartyState();
  for (i = 0; i < 13; i++) {
    // Convert to map location
    dh = ((PAL_X(poses[i]) % 32) ? 1 : 0);
    dx = ~~(PAL_X(poses[i]) / 32);
    dy = ~~(PAL_Y(poses[i]) / 16);

    // Loop through all event objects
    for (k = rangeStart; k < rangeEnd; k++){
      var eventId = k + 1;
      p = sceneEventAdapter.getEventObjectStateByIndex(k);
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
        worldService.mutateEventObjectById(eventId, (evt) => {
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
      var nextTriggerScript = yield script.runTriggerScript(p.triggerScript, eventId);
      if (script.scriptSuccess) {
        worldService.mutateEventObjectById(eventId, (evt) => {
          evt.triggerScript = nextTriggerScript;
          return evt;
        });
      }

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

  if (worldService.isEnteringScene()){
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

  var remainingCycles = Math.max(getChaseSpeedChangeCycles() - 1, 0);
  worldService.setChaseSpeedChangeCycles(remainingCycles);
  if (remainingCycles === 0) {
    worldService.setChaseRange(1);
  }
};

export default play;
