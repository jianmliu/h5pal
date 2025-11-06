/**
 * Shared reactive context using RxJS primitives. Signals are thin wrappers
 * around BehaviorSubject so existing `.value` accessors continue to work while
 * we transition the rest of the codebase.
 */

import { BehaviorSubject, Subject, Observable } from 'rxjs';

function getTimestamp() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function createDiagnosticsEntry(name, kind = 'stream') {
  return {
    name,
    kind,
    emissions: 0,
    subscribers: 0,
    lastEmission: null,
    lastValue: undefined,
    lastError: undefined,
    completed: false
  };
}

const streamDiagnostics = new Map();
let anonymousStreamId = 0;

function instrumentSubject(name, subject, kind = 'stream') {
  if (!subject || typeof subject.subscribe !== 'function') {
    return subject;
  }
  if (subject.__instrumented) {
    return subject;
  }
  const label = name || `${kind}#${++anonymousStreamId}`;
  const entry = streamDiagnostics.get(label) || createDiagnosticsEntry(label, kind);
  entry.kind = kind;
  streamDiagnostics.set(label, entry);

  const originalSubscribe = subject.subscribe.bind(subject);
  subject.subscribe = function instrumentedSubscribe(...args) {
    entry.subscribers += 1;
    const subscription = originalSubscribe(...args);
    if (subscription && typeof subscription.unsubscribe === 'function') {
      const originalUnsubscribe = subscription.unsubscribe.bind(subscription);
      subscription.unsubscribe = function instrumentedUnsubscribe() {
        if (entry.subscribers > 0) {
          entry.subscribers -= 1;
        }
        originalUnsubscribe();
      };
      return subscription;
    }
    if (typeof subscription === 'function') {
      const teardown = subscription;
      return function instrumentedTeardown() {
        if (entry.subscribers > 0) {
          entry.subscribers -= 1;
        }
        teardown();
      };
    }
    return subscription;
  };

  if (typeof subject.next === 'function') {
    const originalNext = subject.next.bind(subject);
    subject.next = function instrumentedNext(value) {
      entry.emissions += 1;
      entry.lastEmission = getTimestamp();
      entry.lastValue = value;
      return originalNext(value);
    };
  }

  if (typeof subject.error === 'function') {
    const originalError = subject.error.bind(subject);
    subject.error = function instrumentedError(err) {
      entry.lastError = err;
      entry.lastEmission = getTimestamp();
      return originalError(err);
    };
  }

  if (typeof subject.complete === 'function') {
    const originalComplete = subject.complete.bind(subject);
    subject.complete = function instrumentedComplete(...args) {
      entry.completed = true;
      entry.lastEmission = getTimestamp();
      entry.subscribers = 0;
      return originalComplete(...args);
    };
  }

  Object.defineProperty(subject, '__instrumented', {
    value: true,
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(subject, '__diagnosticsKey', {
    value: label,
    enumerable: false,
    configurable: false
  });
  return subject;
}

function getDiagnosticsSnapshot() {
  const nowTs = getTimestamp();
  const streams = Array.from(streamDiagnostics.values()).map((entry) => ({
    name: entry.name,
    kind: entry.kind,
    emissions: entry.emissions,
    subscribers: entry.subscribers,
    completed: entry.completed,
    lastEmission: entry.lastEmission,
    lastEmissionDelta: entry.lastEmission == null ? null : Number((nowTs - entry.lastEmission).toFixed(2)),
    lastValue: entry.lastValue,
    lastError: entry.lastError
  }));
  return {
    timestamp: nowTs,
    streams
  };
}

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

instrumentSubject('rootEvent$', rootEvent$, 'bus');
instrumentSubject('battleBus$', battleBus$, 'bus');
instrumentSubject('sceneBus$', sceneBus$, 'bus');

const signalRegistry = new Map();
const cleanupSubscriptions = new Set();

function ensureSignal(key, initialValue) {
  if (!signalRegistry.has(key)) {
    const instance = signal(initialValue);
    instrumentSubject(`signal:${key}`, instance._subject, 'signal');
    signalRegistry.set(key, instance);
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

function createBehaviorStream(initialValue, options = {}) {
  const label = options && typeof options.name === 'string' && options.name.trim()
    ? options.name.trim()
    : `behavior#${++anonymousStreamId}`;
  const subject = instrumentSubject(label, new BehaviorSubject(initialValue), 'behavior');
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
  resetSignals,
  getDiagnostics: getDiagnosticsSnapshot
};

export default reactiveContext;
