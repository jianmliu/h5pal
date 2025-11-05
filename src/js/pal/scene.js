import utils from './utils';
import input from './input';
import Sprite from './sprite';
import Map from './map';
import resourceService from '../../services/resource-service.js';
import worldService from '../../services/world-service.js';
import sceneEventAdapter from '../../services/scene-event-adapter.js';
import partyTrailAdapter from '../../services/party-trail-adapter.js';
import {
  getPlayerRoleField,
  getPlayerRoleFieldValue
} from '../../services/player-state-adapter.js';

log.trace('scene module load');

var scene = {
  playerSpriteCache: {},
  playerSprites: [],
  mapCache: {},
  thisStepFrame: 0,
  applyWaveIndex: 0,
  currentSceneId: null
};

var partyStateCache = [];
var trailStateCache = [];
var followerCountCache = 0;
var unsubscribePartyTrail = null;

function handlePartyTrailEvent(event) {
  if (!event) {
    return;
  }
  switch (event.type) {
    case 'snapshot':
      partyStateCache = Array.isArray(event.party) ? event.party : partyStateCache;
      trailStateCache = Array.isArray(event.trail) ? event.trail : trailStateCache;
      followerCountCache = Number.isFinite(event.followerCount) ? event.followerCount : followerCountCache;
      break;
    case 'party':
      partyStateCache = Array.isArray(event.value) ? event.value : partyStateCache;
      break;
    case 'trail':
      trailStateCache = Array.isArray(event.value) ? event.value : trailStateCache;
      break;
    case 'followerCount':
      followerCountCache = Number.isFinite(event.value) ? event.value : followerCountCache;
      break;
    case 'disposed':
      if (typeof unsubscribePartyTrail === 'function') {
        unsubscribePartyTrail();
      }
      unsubscribePartyTrail = null;
      partyStateCache = [];
      trailStateCache = [];
      followerCountCache = 0;
      break;
    default:
      break;
  }
}

function ensurePartyTrailSubscription() {
  if (unsubscribePartyTrail) {
    return;
  }
  unsubscribePartyTrail = partyTrailAdapter.subscribe(handlePartyTrailEvent);
}

function getCachedPartyState() {
  ensurePartyTrailSubscription();
  if (!Array.isArray(partyStateCache)) {
    partyStateCache = partyTrailAdapter.getPartyState();
  }
  return partyStateCache;
}

function getCachedTrailState() {
  ensurePartyTrailSubscription();
  if (!Array.isArray(trailStateCache)) {
    trailStateCache = partyTrailAdapter.getTrailState();
  }
  return trailStateCache;
}

function getCachedFollowerCount() {
  ensurePartyTrailSubscription();
  if (!Number.isFinite(followerCountCache)) {
    followerCountCache = partyTrailAdapter.getFollowerCount();
  }
  return followerCountCache;
}

var abs = Math.abs;
var floor = Math.floor;
var round = Math.round;

// for hidden class
function SpriteToDraw(frame, x, y, layer) {
  this.frame = frame;
  this.pos = PAL_XY(x, y);
  this.layer = layer;
}

function compareByYASC(a, b) {
  return PAL_Y(a.pos) - PAL_Y(b.pos);
}

function compareByYDESC(a, b) {
  return PAL_Y(b.pos) - PAL_Y(a.pos);
}

function compareByLayerASC(a, b) {
  return a.layer - b.layer;
}

function compareByLayerDESC(a, b) {
  return b.layer - a.layer;
}

function compareSprite(a, b) {
  //var layer = -(a.layer - b.layer);
  //if (layer !== 0) return layer;
  return (PAL_Y(a.pos) - PAL_Y(b.pos));
}

var surface = null;
scene.surface = null;

scene.init = function*(surf) {
  log.debug('[SCENE] init');
  surface = surf;
  scene.surface = surf;
  global.scene = scene;
  var list = ['MAP', 'GOP', 'MGO'];
  yield resourceService.loadMKF(...list);
  list.forEach(function(name) {
    Files[name] = resourceService.getMKF(name);
  });
  ensurePartyTrailSubscription();
};

scene.makeScene = function*() {
  var sceneId = worldService.getSceneId() || 0;
  var activeScene = sceneId ? worldService.getSceneEntry(sceneId) : null;
  if (!activeScene) return;
  if (scene.currentSceneId !== sceneId) {
    scene.currentSceneId = sceneId;
    if (activeScene) {
      activeScene.eventObjectSprite = null;
      activeScene._renderedMapId = null;
    }
  }
  yield activeScene.render();
};

scene.getPlayerSprite = function(i) {
  var party = getCachedPartyState();
  var player = party[i];
  if (!player) {
    return null;
  }
  var playerID = player.playerRole;
  var spriteNum;
  var maxPartyMemberIndex = worldService.getMaxPartyMemberIndex();
  var followerCount = getCachedFollowerCount();
  if (i > maxPartyMemberIndex && followerCount > 0) {
    // 如果是跟随者，那么spriteNum就是它的ID
    spriteNum = playerID;
  } else {
    // 否则从玩家数据中读取 spriteNum
    spriteNum = getPlayerRoleFieldValue('spriteNum', playerID, undefined);
  }
  if (typeof spriteNum === 'undefined') {
    return null;
  }
  var cache = scene.playerSpriteCache;
  var sprite = cache[spriteNum];
  if (!sprite) {
    var chunk = Files.MGO.decompressChunk(spriteNum);
    sprite = cache[spriteNum] = new Sprite(chunk);
  }
  return sprite;
};

/**
 * Update the location and walking gesture of all the party members.
 */
scene.updateParty = function() {
  ensurePartyTrailSubscription();
  //log.trace('[Scene] updateParty');
  var viewport = worldService.getViewport();
  var partyOffset = worldService.getPartyOffset();

  if (input.dir !== Direction.Unknown) {
    var xOffset = ((input.dir === Direction.West || input.dir === Direction.South) ? -16 : 16);
    var yOffset = ((input.dir === Direction.West || input.dir === Direction.North) ? -8 : 8);

    var xSource = PAL_X(viewport) + PAL_X(partyOffset);
    var ySource = PAL_Y(viewport) + PAL_Y(partyOffset);

    var xTarget = xSource + xOffset;
    var yTarget = ySource + yOffset;

    worldService.setPartyDirection(input.dir);

    if (!scene.checkObstacle(PAL_XY(xTarget, yTarget), true, 0)) {
      worldService.mutateTrail(function(trailState) {
        if (!Array.isArray(trailState) || trailState.length === 0) {
          return trailState;
        }
        for (var i = 3; i >= 0; i--) {
          trailState[i + 1] = trailState[i];
        }
        trailState[0] = trailState[0] || {};
        trailState[0].direction = input.dir;
        trailState[0].x = xSource;
        trailState[0].y = ySource;
        return trailState;
      });

      viewport = worldService.setViewport(PAL_XY(PAL_X(viewport) + xOffset, PAL_Y(viewport) + yOffset));

      scene.updatePartyGestures(true);
      return;
    }
  }

  scene.updatePartyGestures(false);
};

/**
 * Update the gestures of all the party members.
 *
 * @param  {Boolean} walking  whether the party is walking or not.
 */
scene.updatePartyGestures = function(walking) {
  ensurePartyTrailSubscription();
  //log.trace('[Scene] updatePartyGestures ' + walking);
  var party = getCachedPartyState();
  var trail = getCachedTrailState();
  var walkFrames = getPlayerRoleField('walkFrames');
  var maxPartyMemberIndex = worldService.getMaxPartyMemberIndex();
  var viewport = worldService.getViewport();
  var partyOffset = worldService.getPartyOffset();
  var partyDirection = worldService.getPartyDirection();
  var followerCount = getCachedFollowerCount();
  function resolveWalkFrame(roleId, fallback) {
    if (Array.isArray(walkFrames) && typeof walkFrames[roleId] === 'number') {
      return walkFrames[roleId];
    }
    return fallback;
  }

  if (!party.length || !trail.length) {
    return;
  }

  var stepFrameFollower = 0;
  var stepFrameLeader = 0;
  var leadTrail = trail[0] || { x: PAL_X(partyOffset), y: PAL_Y(partyOffset), direction: partyDirection };

  if (walking) {
    // Update the gesture for party leader
    scene.thisStepFrame = (scene.thisStepFrame + 1) % 4;
    if (scene.thisStepFrame & 1) {
       stepFrameLeader = ~~((scene.thisStepFrame + 1) / 2);
       stepFrameFollower = 3 - stepFrameLeader;
    } else {
       stepFrameLeader = 0;
       stepFrameFollower = 0;
    }

    party[0].x = PAL_X(partyOffset);
    party[0].y = PAL_Y(partyOffset);

    if (resolveWalkFrame(party[0].playerRole, 0) === 4) {
      party[0].frame = partyDirection * 4 + scene.thisStepFrame;
    } else {
      party[0].frame = partyDirection * 3 + stepFrameLeader;
    }

    // Update the gestures and positions for other party members
    var firstTrail = trail[1] || leadTrail;
    for (var i = 1; i <= maxPartyMemberIndex && i < party.length; i++) {
      var baseTrail = i === 1 ? firstTrail : (trail[1] || leadTrail);
      party[i].x = baseTrail.x - PAL_X(viewport);
      party[i].y = baseTrail.y - PAL_Y(viewport);

      if (i === 2) {
        party[i].x += (baseTrail.direction === Direction.East || baseTrail.direction === Direction.West) ? -16 : 16;
        party[i].y += 8;
      } else {
        party[i].x += ((baseTrail.direction === Direction.West || baseTrail.direction === Direction.South) ? 16 : -16);
        party[i].y += ((baseTrail.direction === Direction.West || baseTrail.direction === Direction.North) ? 8 : -8);
      }

      // Adjust the position if there is obstacle
      var pos = PAL_XY(
        party[i].x + PAL_X(viewport),
        party[i].y + PAL_Y(viewport)
      );
      if (scene.checkObstacle(pos, true, 0)){
        party[i].x = trail[1].x - PAL_X(viewport);
        party[i].y = trail[1].y - PAL_Y(viewport);
      }

      // Update gesture for this party member
      var gestureTrail = trail[2] || baseTrail;
      if (resolveWalkFrame(party[i].playerRole, 0) === 4) {
        party[i].frame = gestureTrail.direction * 4 + scene.thisStepFrame;
      } else {
        party[i].frame = gestureTrail.direction * 3 + stepFrameLeader;
      }
    }

    var followerTrail = trail[3] || firstTrail;
    if (followerCount > 0 && party.length > maxPartyMemberIndex + 1){
      party[maxPartyMemberIndex + 1].x = followerTrail.x - PAL_X(viewport);
      party[maxPartyMemberIndex + 1].y = followerTrail.y - PAL_Y(viewport);
      party[maxPartyMemberIndex + 1].frame = followerTrail.direction * 3 + stepFrameFollower;
    }
  } else {
    // Player is not moved. Use the "standing" gesture instead of "walking" one.
    var i = resolveWalkFrame(party[0].playerRole, 3);
    if (i === 0) {
      i = 3;
    }
    party[0].frame = partyDirection * i;

    var idleTrail = trail[2] || leadTrail;
    for (i = 1; i <= maxPartyMemberIndex && i < party.length; i++) {
      var f = resolveWalkFrame(party[i].playerRole, 3);
      if (f === 0) {
        f = 3;
      }
      party[i].frame = idleTrail.direction * f;
    }

    var idleFollowerTrail = trail[3] || idleTrail;
    if (followerCount > 0 && party.length > maxPartyMemberIndex + 1) {
       party[maxPartyMemberIndex + 1].frame = idleFollowerTrail.direction * 3;
    }

    scene.thisStepFrame &= 2;
    scene.thisStepFrame ^= 2;
  }
};

/**
 * Check if the specified location has obstacle or not.
 *
 * @param  {POS} pos                   the position to check.
 * @param  {Boolean} checkEventObjects fCheckEventObjects - TRUE if check for event objects, FALSE if only check for the map.
 * @param  {EventObject} selfObject    the event object which will be skipped.
 * @return {Boolean}                   TRUE if the location is obstacle, FALSE if not.
 */
function legacyCheckObstacle(pos, checkEventObjects, selfObject) {
  if (PAL_X(pos) < 0 || PAL_X(pos) >= 2048 || PAL_Y(pos) < 0 || PAL_Y(pos) >= 2048) {
    return true;
  }
  var x = ~~(PAL_X(pos) / 32);
  var y = ~~(PAL_Y(pos) / 16);
  var h = 0;
  var xr = PAL_X(pos) % 32;
  var yr = PAL_Y(pos) % 16;

  if ((xr + (yr * 2)) >= 16) {
    if ((xr + (yr * 2)) >= 48) {
      x++;
      y++;
    } else if ((32 - (xr + (yr * 2))) > 16) {
      x++;
    } else if ((32 - (xr + (yr * 2))) < 48) {
      h = 1;
    } else {
      y++;
    }
  }

  var numScene = worldService.getSceneId() || 0;
  var sc = numScene ? worldService.getSceneEntry(numScene) : null;
  if (!sc || typeof sc.getMap !== 'function') {
    return true;
  }

  var map = sc.getMap();
  if (map.isTileBlocked(x, y, h)) {
    return true;
  }

  if (checkEventObjects) {
    var eventEntries = sceneEventAdapter.getEventObjects();
    for (var idx = 0; idx < eventEntries.length; idx++) {
      var entry = eventEntries[idx];
      if (!entry || !entry.state) {
        continue;
      }
      if (entry.index === selfObject - 1) {
        continue;
      }
      var p = entry.state;
      if (p.state >= ObjectState.Blocker) {
        if (abs(p.x - PAL_X(pos)) + abs(p.y - PAL_Y(pos)) * 2 < 16) {
          return true;
        }
      }
    }
  }
  return false;
}

scene.checkObstacle = function(pos, checkEventObjects, selfObject) {
  var options = {
    checkEventObjects: checkEventObjects !== false
  };
  if (typeof selfObject === 'number') {
    options.selfEventIndex = selfObject - 1;
  }
  var collisionContext = {
    mapCache: scene.mapCache,
    Files: typeof Files !== 'undefined' ? Files : null,
    viewportComponent: typeof worldService.getViewportComponent === 'function'
      ? worldService.getViewportComponent()
      : null
  };
  var blocked = worldService.isPositionBlocked(
    { x: PAL_X(pos), y: PAL_Y(pos) },
    options,
    collisionContext
  );
  if (blocked === false) {
    return false;
  }
  if (blocked === true) {
    return legacyCheckObstacle(pos, checkEventObjects, selfObject);
  }
  return legacyCheckObstacle(pos, checkEventObjects, selfObject);
};

scene.applyWave = function(buffer) {
  var wave = new Array(32);
  worldService.adjustScreenWave(worldService.getWaveProgression());
  var screenWave = worldService.getScreenWave();
  var buf = new Uint8Array(320);
  if (screenWave === 0 || screenWave >= 256) {
    // No need to wave the screen
    worldService.setScreenWave(0);
    worldService.setWaveProgression(0);
    return;
  }

  // Calculate the waving offsets.
  var a = 0;
  var b = 60 + 8;

  for (var i = 0; i < 16; i++) {
    b -= 8;
    a += b;

    // WARNING: assuming the screen width is 320
    wave[i] = ~~(a * screenWave / 256);
    wave[i + 16] = 320 - wave[i];
  }

  // Apply the effect.
  // WARNING: only works with 320x200 8-bit surface.
  a = scene.applyWaveIndex;

  // Loop through all lines in the screen buffer.
  for (var i = 0; i < 200; i++) {
    b = wave[a];

    if (b > 0 && b < 320) {
       // Do a shift on the current line with the calculated offset.
       memcpy(buf, buffer, b);
       memmove(buffer, buffer.subarray(b), 320 - b);
       memcpy(buffer.subarray(320 - b), buf, b);
    }

    a = (a + 1) % 32;
    buffer = buffer.subarray(surface.pitch);
  }

  scene.applyWaveIndex = (scene.applyWaveIndex + 1) % 32;
};

utils.extend(Scene.prototype, {
  loadEventObjectSpites: function(version) {
    var entries = sceneEventAdapter.getEventObjects();
    if (!entries || !entries.length) {
      this.eventObjectSprite = [];
      this._eventSpriteVersion = version;
      return;
    }
    var MGO = Files.MGO;
    var array = this.eventObjectSprite = new Array(entries.length);

    entries.forEach(function(entry, localIndex) {
      var state = entry && entry.state ? entry.state : null;
      var spriteNum = state && typeof state.spriteNum === 'number' ? state.spriteNum : 0;
      if (!spriteNum) {
        array[localIndex] = null;
        return;
      }
      var chunk = MGO.decompressChunk(spriteNum);
      var sprite = new Sprite(chunk);
      sprite.__paletteSpriteNum = spriteNum;
      array[localIndex] = sprite;
      worldService.mutateEventObjectById(entry.id, function(eventState) {
        if (eventState) {
          eventState.spriteFramesAuto = sprite.frameCount;
        }
        return eventState;
      });
    });
    this._eventSpriteVersion = version;
    worldService.setPartyOffset(PAL_XY(160, 112));
  },
  getEventObjectSprite: function(eventObjectID) {
    var version = sceneEventAdapter.getEventObjectsVersion();
    if (!this.eventObjectSprite || (version != null && this._eventSpriteVersion !== version)) {
      this.loadEventObjectSpites(version);
    }

    var range = typeof worldService.getSceneEventObjectRange === 'function'
      ? worldService.getSceneEventObjectRange()
      : { start: 0, end: 0 };
    var targetIndex = eventObjectID - 1;
    if (targetIndex < range.start || targetIndex >= range.end) {
      return null;
    }
    var localIndex = targetIndex - range.start;
    if (localIndex < 0 || localIndex >= this.eventObjectSprite.length) {
      return null;
    }

    var state = sceneEventAdapter.getEventObjectStateByIndex(targetIndex);
    var spriteNum = state && typeof state.spriteNum === 'number' ? state.spriteNum : 0;
    var cached = this.eventObjectSprite[localIndex];

    if (spriteNum <= 0) {
      if (cached) {
        this.eventObjectSprite[localIndex] = null;
      }
      return null;
    }

    if (!cached || cached.__paletteSpriteNum !== spriteNum) {
      var chunk = Files.MGO.decompressChunk(spriteNum);
      var sprite = new Sprite(chunk);
      sprite.__paletteSpriteNum = spriteNum;
      this.eventObjectSprite[localIndex] = sprite;
      if (state) {
        worldService.mutateEventObjectById(eventObjectID, function(eventState) {
          if (eventState) {
            eventState.spriteFramesAuto = sprite.frameCount;
          }
          return eventState;
        });
      }
      return sprite;
    }

    return cached;
    //return gpResources->lppEventObjectSprites[wEventObjectID];
  },
  addToDrawList: function(frame, x, y, layer) {
    var obj = new SpriteToDraw(frame, x, y, layer);
    var drawList = this.drawList || (this.drawList = []);
    this.drawList.push(obj);
    //surface.__debugStr([y].join(','),
    //  x, y - frame.height - layer, '#f00', 'middle', 'center', 12)
    return obj;
  },
  calcCoverTiles: function(spriteToDraw){
    var viewport = worldService.getViewport();
    var viewportX = PAL_X(viewport);
    var viewportY = PAL_Y(viewport);
    var sx = viewportX + PAL_X(spriteToDraw.pos),
        sy = viewportY + PAL_Y(spriteToDraw.pos),
        sh = ((sx % 32) ? 1 : 0);

    var width = spriteToDraw.frame.width,
        height = spriteToDraw.frame.height;

    var dx = 0, dy = 0, dh = 0;
    var x, y, i;
    // Loop through all the tiles in the area of the sprite.
    for (y = ~~((sy - height - 15) / 16); y <= ~~(sy / 16); y++) {
      for (x = ~~((sx - ~~(width / 2)) / 32); x <= ~~((sx + ~~(width / 2)) / 32); x++) {
        for (i = (x == ~~((sx - ~~(width / 2)) / 32) ? 0 : 3); i < 5; i++) {
          // Scan tiles in the following form (* = to scan):
          // . . . * * * . . .
          //  . . . * * . . . .
          switch (i) {
            case 0:
              dx = x;
              dy = y;
              dh = sh;
              break;
            case 1:
              dx = x - 1;
              break;
            case 2:
              dx = (sh ? x : (x - 1));
              dy = (sh ? (y + 1) : y);
              dh = 1 - sh;
              break;
            case 3:
              dx = x + 1;
              dy = y;
              dh = sh;
              break;
            case 4:
              dx = (sh ? (x + 1) : x);
              dy = (sh ? (y + 1) : y);
              dh = 1 - sh;
              break;
          }

          for (var l = 0; l < 2; l++) {
            var map = this.getMap();
            var tile = map.getTileBitmap(dx, dy, dh, l);
            var tileHeight = map.getTileHeight(dx, dy, dh, l);

            // Check if this tile may cover the sprites
            if (tile && tileHeight > 0 && (dy + tileHeight) * 16 + dh * 8 >= sy) {
              // This tile may cover the sprite
              this.addToDrawList(
                tile,
                dx * 32 + dh * 16 - 16 - viewportX,
                dy * 16 + dh * 8 + 7 + l + tileHeight * 8 - viewportY,
                tileHeight * 8 + l
              );
            }
          }
        }
      }
    }
  },
  getMap: function() {
    var mapNum = this.mapNum,
        mapCache = scene.mapCache;
    if (mapNum in mapCache) {
      return mapCache[mapNum];
    }
    //var mapBuf = Files.MAP.decompressChunk(mapNum);
    //var tileSprite = Files.GOP.readChunk(mapNum);

    //var map = new Map(mapBuf, tileSprite, mapNum);
    var map = Map.fromFile(mapNum, Files.MAP, Files.GOP);

    return (mapCache[mapNum] = map);
  },
  renderMap: function() {
    var mapMeta = typeof worldService.getMapMetaComponent === 'function'
      ? worldService.getMapMetaComponent()
      : null;
    var resolvedMapId = this.mapNum;
    if (mapMeta && typeof mapMeta.mapId === 'number') {
      resolvedMapId = mapMeta.mapId;
      if (this._renderedMapId !== mapMeta.mapId) {
        this.eventObjectSprite = null;
        this._renderedMapId = mapMeta.mapId;
      }
      this.mapNum = resolvedMapId;
    }
    worldService.runSystems('map', {
      surface: surface,
      mapCache: scene.mapCache,
      Files: typeof Files !== 'undefined' ? Files : null,
      viewportComponent: worldService.getViewportComponent(),
      mapId: resolvedMapId
    });
  },
  renderSprites: function() {
    ensurePartyTrailSubscription();
    worldService.runSystems(['collision', 'movement'], {
      mapCache: scene.mapCache,
      Files: typeof Files !== 'undefined' ? Files : null,
      viewportComponent: worldService.getViewportComponent(),
      sceneEventObjects: sceneEventAdapter.getEventObjects()
    });
    var viewport = worldService.getViewport();
    var viewportX = PAL_X(viewport);
    var viewportY = PAL_Y(viewport);
    var party = getCachedPartyState();
    var drawList = this.drawList || (this.drawList = []);
    var maxPartyMemberIndex = worldService.getMaxPartyMemberIndex();
    var followerCount = getCachedFollowerCount();

    // Players
    var layer = worldService.getLayer();
    for (var i = 0; i <= maxPartyMemberIndex + followerCount; ++i) {
      var player = party[i];
      if (!player) {
        continue;
      }
      var sprite = scene.getPlayerSprite(i);
      if (!sprite) {
        continue;
      }
      var bitmap = sprite.getFrame(player.frame);
      if (!bitmap) continue;

      // Add it to our array
      var obj = this.addToDrawList(
        bitmap,
        player.x - ~~(bitmap.width / 2),
        player.y + layer + 10,
        layer + 6
      );
      // Calculate covering tiles on the map
      this.calcCoverTiles(obj);
    }
    // Event Objects (Monsters/NPCs/others)
    worldService.runSystems('eventObjects', {
      surface: surface,
      viewportValue: viewport,
      addToDrawList: this.addToDrawList.bind(this),
      calcCoverTiles: this.calcCoverTiles.bind(this),
      getEventObjectSprite: this.getEventObjectSprite.bind(this),
      sceneEventObjects: sceneEventAdapter.getEventObjects()
    });

    // All sprites are now in our array; sort them by their vertical positions.
    drawList.sort(compareSprite); // 按Y升序
    // Draw all the sprites to the screen.
    for (var i = 0; i < drawList.length; ++i) {
      var obj = drawList[i];
      var frame = obj.frame,
          layer = obj.layer,
          x = PAL_X(obj.pos),
          y = PAL_Y(obj.pos) - frame.height - layer;
      surface.blitRLE(frame, PAL_XY(x, y));
    }
  },
  render: function*() {
    var surf = scene.surface || surface;
    if (!surf && global.ui && global.ui.surface) {
      surf = global.ui.surface;
    }
    if (!surf) {
      console.warn('[SCENE] render called before surface initialized');
      return;
    }
    scene.surface = surface = surf;
    surface.clear(); // 因为后面会renderMap所以似乎不需要clear了
    // Step 1: Draw the complete map, for both of the layers.
    this.renderMap();
    // Step 2: Apply screen waving effects.
    scene.applyWave(surface.byteBuffer);
    // Step 3: Draw all the sprites.
    if (!this.drawList) this.drawList = [];
    this.drawList.length = 0;
    //surface.__debugClear(0, 0, 320, 200);
    this.renderSprites();
    // Check if we need to fade in.
    var needToFadeIn = worldService.getNeedToFadeIn();
    if (needToFadeIn) {
      var paletteId = worldService.getPaletteId();
      var useNightPalette = worldService.getNightPaletteFlag();
      //surface.refresh();
      yield surface.fadeIn(paletteId, useNightPalette, 1);
      worldService.setNeedToFadeIn(false);
    }
  }
});

export default scene;
