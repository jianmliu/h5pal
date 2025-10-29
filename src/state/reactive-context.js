/**
 * Shared reactive context wiring lightweight Subject/Signal primitives.
 * The implementation mirrors a subset of RxJS/Signals behaviours so we can
 * run in the browser without bundling additional libraries.
 */

class SimpleSubscription {
  constructor(unsubscribe) {
    this.closed = false;
    this._unsubscribe = typeof unsubscribe === 'function' ? unsubscribe : null;
  }

  unsubscribe() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this._unsubscribe) {
      this._unsubscribe();
    }
  }
}

class SimpleSubject {
  constructor() {
    this._observers = new Set();
    this.closed = false;
  }

  subscribe(observer) {
    if (typeof observer !== 'function') {
      return new SimpleSubscription();
    }
    if (this.closed) {
      try {
        observer();
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[reactive] subject observer error', err);
        }
      }
      return new SimpleSubscription();
    }
    this._observers.add(observer);
    return new SimpleSubscription(() => {
      this._observers.delete(observer);
    });
  }

  next(value) {
    if (this.closed) {
      return;
    }
    const snapshot = Array.from(this._observers);
    for (let i = 0; i < snapshot.length; i++) {
      try {
        snapshot[i](value);
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[reactive] subject handler error', err);
        }
      }
    }
  }

  complete() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this._observers.clear();
  }
}

class SimpleBehaviorSubject extends SimpleSubject {
  constructor(initialValue) {
    super();
    this._value = initialValue;
  }

  subscribe(observer) {
    const subscription = super.subscribe(observer);
    if (!subscription.closed) {
      try {
        observer(this._value);
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[reactive] behavior subject observer error', err);
        }
      }
    }
    return subscription;
  }

  next(value) {
    this._value = value;
    super.next(value);
  }

  getValue() {
    return this._value;
  }
}

class SimpleSignal {
  constructor(initialValue) {
    this._value = initialValue;
    this._listeners = new Set();
  }

  get value() {
    return this._value;
  }

  set value(next) {
    if (this._value === next) {
      return;
    }
    this._value = next;
    const listeners = Array.from(this._listeners);
    for (let i = 0; i < listeners.length; i++) {
      try {
        listeners[i](next);
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[reactive] signal listener error', err);
        }
      }
    }
  }

  subscribe(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }
}

function signal(initialValue) {
  return new SimpleSignal(initialValue);
}

function computed(fn) {
  return {
    get value() {
      return fn();
    }
  };
}

function effect(fn) {
  try {
    return fn();
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[reactive] effect error', err);
    }
    return undefined;
  }
}

function batch(fn) {
  return fn();
}

class QueryClient {
  getQueryData() {
    return undefined;
  }

  setQueryData() {
    return undefined;
  }

  invalidateQueries() {
    return undefined;
  }
}

const queryClient = new QueryClient();
const rootEvent$ = new SimpleSubject();
const battleBus$ = new SimpleSubject();
const sceneBus$ = new SimpleSubject();

const signalRegistry = new Map();
const cleanupSubscriptions = new Set();

function ensureSignal(key, initialValue) {
  if (!signalRegistry.has(key)) {
    signalRegistry.set(key, signal(initialValue));
  }
  return signalRegistry.get(key);
}

function setSignalValue(key, value) {
  const target = ensureSignal(key, value);
  if (target.value === value) {
    return target.value;
  }
  batch(() => {
    target.value = value;
  });
  return target.value;
}

function updateSignalValue(key, updater) {
  const current = ensureSignal(key);
  if (typeof updater === 'function') {
    return setSignalValue(key, updater(current.value));
  }
  return setSignalValue(key, updater);
}

function getSignalValue(key, fallback) {
  if (!signalRegistry.has(key)) {
    return fallback;
  }
  return signalRegistry.get(key).value;
}

function toSignalFromObservable(key, observable, options = {}) {
  const { initialValue, transform } = options;
  const target = ensureSignal(key, initialValue);
  const subscription = observable.subscribe((value) => {
    const nextValue = typeof transform === 'function' ? transform(value, target.value) : value;
    batch(() => {
      target.value = nextValue;
    });
  });
  cleanupSubscriptions.add(subscription);
  return {
    signal: target,
    unsubscribe() {
      subscription.unsubscribe();
      cleanupSubscriptions.delete(subscription);
    }
  };
}

function createBehaviorStream(initialValue) {
  const subject = new SimpleBehaviorSubject(initialValue);
  cleanupSubscriptions.add({
    unsubscribe() {
      subject.complete();
    }
  });
  return subject;
}

function resetSignals() {
  signalRegistry.clear();
}

function dispose() {
  cleanupSubscriptions.forEach((subscription) => {
    subscription.unsubscribe();
  });
  cleanupSubscriptions.clear();
  resetSignals();
}

const reactiveContext = {
  queryClient,
  rootEvent$,
  battleBus$,
  sceneBus$,
  setSignal: setSignalValue,
  getSignal: getSignalValue,
  updateSignal: updateSignalValue,
  ensureSignal,
  toSignalFromObservable,
  computed,
  effect,
  createBehaviorStream,
  dispose,
  resetSignals
};

export default reactiveContext;
