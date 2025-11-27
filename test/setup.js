if (typeof globalThis.PAL_CLASSIC === 'undefined') {
  globalThis.PAL_CLASSIC = false;
}
if (!globalThis.GameData) {
  globalThis.GameData = {};
}
if (!globalThis.Global) {
  globalThis.Global = {};
}
if (!globalThis.log) {
  const noop = () => {};
  globalThis.log = {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop
  };
}
if (typeof globalThis.sprintf !== 'function') {
  globalThis.sprintf = (...args) => args.join(' ');
}

await import('../test/.cache/src/js/pal/debug-overlay.js');
await import('../src/js/pal/binary-helper.ts');
await import('../src/js/pal/pal-global.js');
await import('../src/js/pal/common.js');
