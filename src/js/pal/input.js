/**
 * 处理浏览器键盘输入的模块
 * @mixes utils.Events
 * @module input
 */

import utils from './utils';
import config from './config';

console.trace('input module load');

const root = (typeof global !== 'undefined' && global) ||
  (typeof window !== 'undefined' && window) ||
  (typeof self !== 'undefined' && self) ||
  {};

const Key = root.Key || {
  Menu: 1,
  Search: 2,
  Down: 4,
  Left: 8,
  Up: 16,
  Right: 32,
  PageUp: 64,
  PageDown: 128,
  Repeat: 256,
  Auto: 512,
  Defend: 1024,
  UseItem: 2048,
  ThrowItem: 4096,
  Flee: 8192,
  Status: 16384,
  Force: 32768
};

const Direction = root.Direction || {
  South: 0,
  West: 1,
  North: 2,
  East: 3,
  Unknown: 4
};

if (!root.Key) {
  root.Key = Key;
}
if (!root.Direction) {
  root.Direction = Direction;
}

var MIN_DEADZONE = -16384;
var MAX_DEADZONE = 16384;
var TOUCH_MOVE_THRESHOLD = 12;
var TOUCH_TAP_DISTANCE = 16;
var TOUCH_TAP_TIME = 350;

var KeyCodes = {
  A: 65,
  B: 66,
  C: 67,
  D: 68,
  E: 69,
  F: 70,
  G: 71,
  H: 72,
  I: 73,
  J: 74,
  K: 75,
  L: 76,
  M: 77,
  N: 78,
  O: 79,
  P: 80,
  Q: 81,
  R: 82,
  S: 83,
  T: 84,
  U: 85,
  V: 86,
  W: 87,
  X: 88,
  Y: 89,
  Z: 90,

  KP0: 96,
  KP1: 97,
  KP2: 98,
  KP3: 99,
  KP4: 100,
  KP5: 101,
  KP6: 102,
  KP7: 103,
  KP8: 104,
  KP9: 105,

  ENTER: 13,
  RETURN: 13,
  CTRL: 17,
  ALT: 18,
  ESC: 27,
  ESCAPE: 27,
  SPACE: 32,

  PAGEUP: 33,
  PAGEDOWN: 34,

  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,

  INSERT: 45
};

var KeyCodesToPalKeys = {};

KeyCodesToPalKeys[KeyCodes.UP]       = KeyCodesToPalKeys[KeyCodes.KP8]    = Key.Up;
KeyCodesToPalKeys[KeyCodes.DOWN]     = KeyCodesToPalKeys[KeyCodes.KP2]    = Key.Down;
KeyCodesToPalKeys[KeyCodes.LEFT]     = KeyCodesToPalKeys[KeyCodes.KP4]    = Key.Left;
KeyCodesToPalKeys[KeyCodes.RIGHT]    = KeyCodesToPalKeys[KeyCodes.KP6]    = Key.Right;
KeyCodesToPalKeys[KeyCodes.ESCAPE]   = KeyCodesToPalKeys[KeyCodes.INSERT] = KeyCodesToPalKeys[KeyCodes.KP0]  = Key.Menu;
KeyCodesToPalKeys[KeyCodes.RETURN]   = KeyCodesToPalKeys[KeyCodes.SPACE]  = KeyCodesToPalKeys[KeyCodes.CTRL] = Key.Search;
KeyCodesToPalKeys[KeyCodes.PAGEUP]   = KeyCodesToPalKeys[KeyCodes.KP9]    = Key.PageUp;
KeyCodesToPalKeys[KeyCodes.PAGEDOWN] = KeyCodesToPalKeys[KeyCodes.KP3]    = Key.PageDown;
KeyCodesToPalKeys[KeyCodes.R] = Key.Repeat;
KeyCodesToPalKeys[KeyCodes.A] = Key.Auto;
KeyCodesToPalKeys[KeyCodes.D] = Key.Defend;
KeyCodesToPalKeys[KeyCodes.E] = Key.UseItem;
KeyCodesToPalKeys[KeyCodes.W] = Key.ThrowItem;
KeyCodesToPalKeys[KeyCodes.Q] = Key.Flee;
KeyCodesToPalKeys[KeyCodes.S] = Key.Status;
KeyCodesToPalKeys[KeyCodes.F] = Key.Force;

var PalKeysToPalDirs = {};
PalKeysToPalDirs[Key.Up]    = Direction.North;
PalKeysToPalDirs[Key.Down]  = Direction.South;
PalKeysToPalDirs[Key.Left]  = Direction.West;
PalKeysToPalDirs[Key.Right] = Direction.East;

var input = {
  /**
   * 当前按下的键
   * @type {Key}
   */
  keyPress: 0
};

utils.extend(input, utils.Events);

function pressKey(palKey) {
  var previous = input.keyPress;
  input.keyPress |= palKey;
  if (palKey in PalKeysToPalDirs) {
    if (input.dir !== PalKeysToPalDirs[palKey]) {
      input.prevDir = (Global.inBattle ? Direction.Unknown : input.dir);
      input.dir = PalKeysToPalDirs[palKey];
      log.trace('[INPUT] turn from %d to %d', input.prevDir, input.dir);
    }
  }
  if (previous !== input.keyPress) {
    log.trace('[INPUT] press %d', palKey);
  }
  input.fire('keydown', palKey);
}

function releaseKey(palKey) {
  var previous = input.keyPress;
  input.keyPress &= ~palKey;
  if (palKey in PalKeysToPalDirs) {
    if (input.dir === PalKeysToPalDirs[palKey]) {
      log.trace('[INPUT] walking %d back to %d', input.dir, input.prevDir);
      input.dir = input.prevDir;
      input.prevDir = Direction.Unknown;
    } else if (input.prevDir === PalKeysToPalDirs[palKey]) {
      log.trace('[INPUT] cancel prev walking %d', input.prevDir);
      input.prevDir = Direction.Unknown;
    }
  }
  if (previous !== input.keyPress) {
    log.trace('[INPUT] release %d', palKey);
  }
  input.fire('keyup', palKey);
}

function keyboardEventFilter(evt) {
  var processed = false;
  var keyCode = evt.keyCode;
  if (keyCode in KeyCodesToPalKeys) {
    processed = true;
    var palKey = KeyCodesToPalKeys[keyCode];
    log.trace('[INPUT] %s %d %d', evt.type, keyCode, palKey);
    switch (evt.type) {
      case 'keydown':
        // Pressed a key
        pressKey(palKey);
        break;
      case 'keyup':
        // Released a key
        releaseKey(palKey);
        break;
    }
    if (processed) {
      evt.preventDefault();
      evt.stopPropagation();
    }
  }
}

/**
 * 初始化，并开启事件监听
 */
input.init = function() {
  log.debug('[INPUT] init')
  global.input = input;
  if (input.listening) return;
  input.dir = input.prevDir = Direction.Unknown;
  $(window).on('keydown keyup', keyboardEventFilter);
  if (!input.touchListening && config.enableTouch && typeof window !== 'undefined' && ('ontouchstart' in window || (window.navigator && window.navigator.maxTouchPoints > 0))) {
    input.touchListening = setupTouchListeners();
  }
  input.listening = true;
};

/**
 * 判断某个键是否是按下状态
 * @param  {Key}  key
 * @return {Boolean}
 */
input.isKeyPressed = function(key) {
  return !!(input.keyPress & key);
};

/**
 * 重置
 */
input.clear = function() {
  input.keyPress = 0;
};

/**
 * 取消监听事件
 */
input.shutdown = function() {
  if (!input.listening) return;
  $(window).off('keydown keyup', keyboardEventFilter);
  if (input._removeTouchListeners) {
    input._removeTouchListeners();
    input.touchListening = false;
  }
  input.listening = false;
};

/**
 * 等待一个按键
 * @return {Promise}
 */
input.waitForKey = function*(timeout) {
  input.clear();
  var endtime = hrtime() + timeout;
  while (timeout === 0 || hrtime() < endtime) {
    if (input.isKeyPressed(Key.Search | Key.Menu)) {
      break;
    }
    yield sleepByFrame(1);
  }
};

function setupTouchListeners() {
  var cvs = document.getElementById('cvs');
  if (!cvs) {
    log.warn('[INPUT] canvas element not found, touch disabled');
    return false;
  }

  var state = {
    key: null,
    identifier: null,
    startX: 0,
    startY: 0,
    startTime: 0,
    moved: false
  };
  input._touchState = state;

  function setDirectionalKey(newKey) {
    if (state.key === newKey) return;
    if (state.key) {
      releaseKey(state.key);
    }
    state.key = newKey;
    if (newKey) {
      pressKey(newKey);
    }
  }

  function directionFromPoint(clientX, clientY) {
    var rect = cvs.getBoundingClientRect();
    var width = rect.width || cvs.width;
    var height = rect.height || cvs.height;
    if (!width || !height) return null;
    var relX = clientX - rect.left;
    var relY = clientY - rect.top;
    if (relX < 0 || relY < 0 || relX > width || relY > height) return null;
    var offsetX = relX - width / 2;
    var offsetY = relY - height / 2;
    if (Math.abs(offsetX) > Math.abs(offsetY)) {
      return offsetX < 0 ? Key.Left : Key.Right;
    }
    return offsetY < 0 ? Key.Up : Key.Down;
  }

  function handleTouchStart(ev) {
    if (state.identifier !== null) return;
    var touch = ev.changedTouches[0];
    state.identifier = touch.identifier;
    state.startX = touch.clientX;
    state.startY = touch.clientY;
    state.startTime = Date.now();
    state.moved = false;
    setDirectionalKey(directionFromPoint(touch.clientX, touch.clientY));
    ev.preventDefault();
  }

  function handleTouchMove(ev) {
    for (var i = 0; i < ev.changedTouches.length; ++i) {
      var touch = ev.changedTouches[i];
      if (touch.identifier !== state.identifier) continue;
      var dx = touch.clientX - state.startX;
      var dy = touch.clientY - state.startY;
      if (!state.moved && (Math.abs(dx) > TOUCH_MOVE_THRESHOLD || Math.abs(dy) > TOUCH_MOVE_THRESHOLD)) {
        state.moved = true;
      }
      setDirectionalKey(directionFromPoint(touch.clientX, touch.clientY));
      ev.preventDefault();
      break;
    }
  }

  function handleTouchEnd(ev) {
    for (var i = 0; i < ev.changedTouches.length; ++i) {
      var touch = ev.changedTouches[i];
      if (touch.identifier !== state.identifier) continue;
      setDirectionalKey(null);
      state.identifier = null;
      var duration = Date.now() - state.startTime;
      var dx = touch.clientX - state.startX;
      var dy = touch.clientY - state.startY;
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (!state.moved && distance < TOUCH_TAP_DISTANCE && duration < TOUCH_TAP_TIME) {
        pressKey(Key.Search);
        releaseKey(Key.Search);
      }
      ev.preventDefault();
      break;
    }
  }

  cvs.addEventListener('touchstart', handleTouchStart, { passive: false });
  cvs.addEventListener('touchmove', handleTouchMove, { passive: false });
  cvs.addEventListener('touchend', handleTouchEnd, { passive: false });
  cvs.addEventListener('touchcancel', handleTouchEnd, { passive: false });
  log.debug('[INPUT] touch controls enabled');

  input._removeTouchListeners = function() {
    cvs.removeEventListener('touchstart', handleTouchStart);
    cvs.removeEventListener('touchmove', handleTouchMove);
    cvs.removeEventListener('touchend', handleTouchEnd);
    cvs.removeEventListener('touchcancel', handleTouchEnd);
    state.key = null;
    state.identifier = null;
    delete input._touchState;
  };

  return true;
}

export default input;
