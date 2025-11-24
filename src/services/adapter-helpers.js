import reactiveContext from '../state/reactive-context.js';

function validateObservable(stream, label) {
  if (!stream || typeof stream.subscribe !== 'function') {
    throw new TypeError(`[adapter] ${label || 'stream'} is not an Observable`);
  }
  return stream;
}

export function createAdapterObservable(options = {}) {
  const {
    name = 'adapter$',
    getValue = null,
    observe,
    signal = null,
    projector = null
  } = options;

  if (!observe && !signal) {
    throw new TypeError('[adapter] createAdapterObservable requires either observe() or signal');
  }

  const compute =
    typeof getValue === 'function'
      ? getValue
      : (signal
        ? (() => {
            const value = signal.value;
            return typeof projector === 'function' ? projector(value) : value;
          })
        : (() => undefined));

  let cachedStream = null;

  const resolveStream = () => {
    if (cachedStream) {
      return cachedStream;
    }
    if (observe) {
      cachedStream = validateObservable(
        typeof observe === 'function' ? observe() : observe,
        name
      );
    } else if (signal) {
      cachedStream = reactiveContext.signalToObservable(signal, () => compute());
    }
    return cachedStream;
  };

  const facade = function adapterObservable() {
    return resolveStream();
  };

  facade.asObservable = () => resolveStream();
  facade.subscribe = (...args) => resolveStream().subscribe(...args);
  if (compute) {
    facade.getValue = compute;
  }
  facade.label = name;

  return facade;
}

export function attachAdapterObservable(target, options) {
  if (typeof target !== 'function') {
    throw new TypeError('[adapter] attachAdapterObservable target must be a function');
  }
  const observable = createAdapterObservable(options);
  target.asObservable = observable.asObservable;
  target.subscribe = observable.subscribe;
  if (observable.getValue) {
    target.getValue = observable.getValue;
  }
  target.label = observable.label;
  return target;
}
