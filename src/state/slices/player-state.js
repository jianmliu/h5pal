import reactiveContext from '../reactive-context.js';

const PLAYER_ROLES_SIGNAL_KEY = 'world.player.roles';
const EQUIPMENT_EFFECT_SIGNAL_KEY = 'world.player.equipmentEffect';

const HP_EVENT_TYPE = 'world/player/hpChanged';
const MP_EVENT_TYPE = 'world/player/mpChanged';
const ROLES_EVENT_TYPE = 'world/player/rolesChanged';
const EQUIPMENT_EVENT_TYPE = 'world/player/equipmentEffectChanged';

function ensureSignal(key, fallback) {
  return reactiveContext.ensureSignal(key, fallback);
}

function cloneArrayLike(value) {
  if (value == null) {
    return [];
  }
  if (ArrayBuffer.isView(value) && typeof value.slice === 'function') {
    return Array.from(value.slice());
  }
  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (Array.isArray(entry) || (ArrayBuffer.isView(entry) && typeof entry.slice === 'function')) {
        return cloneArrayLike(entry);
      }
      if (entry && typeof entry === 'object') {
        return { ...entry };
      }
      return entry;
    });
  }
  return [];
}

function cloneObject(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  const clone = {};
  Reflect.ownKeys(value).forEach((rawKey) => {
    if (typeof rawKey !== 'string') {
      return;
    }
    let entry;
    try {
      entry = value[rawKey];
    } catch (err) {
      return;
    }
    const key = rawKey;
    if (Array.isArray(entry) || (ArrayBuffer.isView(entry) && typeof entry.slice === 'function')) {
      clone[key] = cloneArrayLike(entry);
    } else if (entry && typeof entry === 'object') {
      clone[key] = { ...entry };
    } else {
      clone[key] = entry;
    }
  });
  const proto = Object.getPrototypeOf(value);
  if (proto && proto !== Object.prototype) {
    Object.getOwnPropertyNames(proto).forEach((key) => {
      if (key === 'constructor' || Object.prototype.hasOwnProperty.call(clone, key)) {
        return;
      }
      const descriptor = Object.getOwnPropertyDescriptor(proto, key);
      if (!descriptor || typeof descriptor.get !== 'function' || typeof descriptor.set === 'function') {
        return;
      }
      let derived;
      try {
        derived = value[key];
      } catch (err) {
        return;
      }
      if (Array.isArray(derived) || (ArrayBuffer.isView(derived) && typeof derived.slice === 'function')) {
        clone[key] = cloneArrayLike(derived);
      } else if (derived && typeof derived === 'object') {
        clone[key] = { ...derived };
      } else {
        clone[key] = derived;
      }
    });
  }
  return clone;
}

function normaliseRoles(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return cloneObject(value);
}

function normaliseEquipmentEffect(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.slice();
  }
  if (ArrayBuffer.isView(value) && typeof value.slice === 'function') {
    return Array.from(value.slice());
  }
  return value;
}

function areValuesEqual(a, b) {
  if (a === b) {
    return true;
  }
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (err) {
    return false;
  }
}

function getStatArray(roles, key) {
  if (!roles || !roles[key]) {
    return [];
  }
  const value = roles[key];
  if (Array.isArray(value)) {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return Array.from(value);
  }
  return [];
}

function emitStatChanges(previousRoles, nextRoles, statKey, eventType, source) {
  const previousArray = getStatArray(previousRoles, statKey);
  const nextArray = getStatArray(nextRoles, statKey);
  const maxLength = Math.max(previousArray.length, nextArray.length);
  for (let index = 0; index < maxLength; index++) {
    const prevValue = typeof previousArray[index] === 'number' ? previousArray[index] : 0;
    const nextValue = typeof nextArray[index] === 'number' ? nextArray[index] : 0;
    if (prevValue !== nextValue) {
      reactiveContext.rootEvent$.next({
        type: eventType,
        roleId: index,
        previous: prevValue,
        value: nextValue,
        source
      });
    }
  }
}

function setSignalValue(key, value, options = {}) {
  const previous = reactiveContext.getSignal(key, options.fallback);
  const signal = ensureSignal(key, previous);
  const changed = !areValuesEqual(signal.value, value);
  if (changed || typeof previous === 'undefined') {
    reactiveContext.setSignal(key, value);
    if (options.emitEvent !== false) {
      reactiveContext.rootEvent$.next({
        type: options.eventType || `signal/${key}/changed`,
        value,
        previous,
        source: options.source || 'worldService'
      });
    }
  }
  return value;
}

export function playerStateSignals() {
  return {
    roles: ensureSignal(PLAYER_ROLES_SIGNAL_KEY, null),
    equipmentEffect: ensureSignal(EQUIPMENT_EFFECT_SIGNAL_KEY, [])
  };
}

export function updatePlayerRolesValue(value, options = {}) {
  const resolved = normaliseRoles(value);
  const previous = reactiveContext.getSignal(PLAYER_ROLES_SIGNAL_KEY, null);
  const signal = ensureSignal(PLAYER_ROLES_SIGNAL_KEY, previous);
  const hasPrevious = !!previous;
  const changed = !areValuesEqual(signal.value, resolved);
  const source = options.source || 'worldService';

  if (!previous || changed) {
    reactiveContext.setSignal(PLAYER_ROLES_SIGNAL_KEY, resolved);
  }

  if (options.emitEvent !== false) {
    if (!previous || changed) {
      reactiveContext.rootEvent$.next({
        type: ROLES_EVENT_TYPE,
        value: resolved,
        previous,
        source
      });
    }
    if (hasPrevious && resolved) {
      emitStatChanges(previous, resolved, 'HP', HP_EVENT_TYPE, source);
      emitStatChanges(previous, resolved, 'MP', MP_EVENT_TYPE, source);
    }
  }

  return resolved;
}

export function updateEquipmentEffectValue(value, options = {}) {
  return setSignalValue(
    EQUIPMENT_EFFECT_SIGNAL_KEY,
    normaliseEquipmentEffect(value),
    {
      ...options,
      eventType: EQUIPMENT_EVENT_TYPE
    }
  );
}

export function resetPlayerStateSlice() {
  reactiveContext.setSignal(PLAYER_ROLES_SIGNAL_KEY, null);
  reactiveContext.setSignal(EQUIPMENT_EFFECT_SIGNAL_KEY, []);
}
