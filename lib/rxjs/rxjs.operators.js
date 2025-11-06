define(function() {
  var root = typeof globalThis !== 'undefined' ? globalThis
    : (typeof self !== 'undefined' ? self
      : (typeof window !== 'undefined' ? window
        : (typeof global !== 'undefined' ? global : {})));
  var rxjs = root.rxjs || root.rxjsExports || root.Rx;
  if (!rxjs || !rxjs.operators) {
    throw new Error('[rxjs/operators] missing operators export from rxjs.umd.min');
  }
  return rxjs.operators;
});
