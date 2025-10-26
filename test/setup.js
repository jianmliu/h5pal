const noop = () => {};

globalThis.PAL_CLASSIC = true;

globalThis.Global = globalThis.Global || {};
globalThis.GameData = globalThis.GameData || {};
globalThis.Files = globalThis.Files || {};
globalThis.DEBUG = globalThis.DEBUG || { Timing: false };

globalThis.log = globalThis.log || {
  trace: noop,
  debug: noop,
  info: noop,
  warning: noop,
  error: noop,
  fatal: noop
};

globalThis.sleep = () => Promise.resolve();
globalThis.sleepByFrame = () => Promise.resolve();

globalThis.memset = (array, value, length) => {
  if (!array) return array;
  const len = length != null ? length : array.length;
  for (let i = 0; i < len; i++) {
    array[i] = value;
  }
  return array;
};

globalThis.memcpy = (target, source, length) => {
  if (!target || !source) return target;
  const len = length != null ? length : Math.min(target.length, source.length);
  for (let i = 0; i < len; i++) {
    target[i] = source[i];
  }
  return target;
};

globalThis.PAL_XY = (x, y) => ((x & 0xFFFF) << 16) | (y & 0xFFFF);
globalThis.timestamp = () => Date.now();


if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== 'function') {
  const { randomBytes } = await import('crypto');
  globalThis.crypto = {
    getRandomValues(typedArray) {
      if (!(typedArray instanceof Uint8Array)) {
        throw new TypeError('Expected Uint8Array');
      }
      const buf = randomBytes(typedArray.length);
      typedArray.set(buf);
      return typedArray;
    }
  };
}

globalThis.FrameTime = globalThis.FrameTime || (1000 / 24);

await import('../src/js/pal/binary-helper.js');
await import('../src/js/pal/pal-global.js');
