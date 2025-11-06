/**
 * Shared reactive context using RxJS primitives. Signals are thin wrappers
 * around BehaviorSubject so existing `.value` accessors continue to work while
 * we transition the rest of the codebase.
 */

import { BehaviorSubject, Subject, Observable } from 'rxjs';

class RxSignal {
  constructor(initialValue) {
    this._subject = new BehaviorSubject(initialValue);
  }

  get value() {
    return this._subject.getValue();
  }

  set value(next) {
    const current = this._subject.getValue();
    if (Object.is(current, next)) {
      return;
    }
    this._subject.next(next);
  }

  subscribe(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    const subscription = this._subject.subscribe({
      next: listener,
      error(err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[reactive] signal listener error', err);
        }
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }

  asObservable() {
    return this._subject.asObservable();
  }

  complete() {
    this._subject.complete();
  }
}

function signal(initialValue) {
  return new RxSignal(initialValue);
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
const rootEvent$ = new Subject();
const battleBus$ = new Subject();
const sceneBus$ = new Subject();

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
  const onNext = (value) => {
    const nextValue = typeof transform === 'function' ? transform(value, target.value) : value;
    batch(() => {
      target.value = nextValue;
    });
  };
  let subscription;
  try {
    subscription = observable.subscribe(onNext);
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[reactive] observable signal subscribe error', err);
    }
    subscription = {
      unsubscribe() {}
    };
  }
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
  const subject = new BehaviorSubject(initialValue);
  cleanupSubscriptions.add({
    unsubscribe() {
      subject.complete();
    }
  });
  return subject;
}

function signalToObservable(signal, projector) {
  if (!signal || typeof signal.asObservable !== 'function') {
    return new Observable((subscriber) => {
      subscriber.error(new Error('[reactive] invalid signal'));
    });
  }
  const source = signal.asObservable();
  if (typeof projector !== 'function') {
    return source;
  }
  return new Observable((subscriber) => {
    const subscription = source.subscribe({
      next(value) {
        try {
          subscriber.next(projector(value));
        } catch (err) {
          subscriber.error(err);
        }
      },
      error(err) {
        subscriber.error(err);
      },
      complete() {
        subscriber.complete();
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  });
}

function resetSignals() {
  signalRegistry.forEach((sig) => {
    if (sig && typeof sig.complete === 'function') {
      sig.complete();
    }
  });
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
  signalToObservable,
  dispose,
  resetSignals
};

export default reactiveContext;
