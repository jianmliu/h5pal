import { beforeEach, describe, expect, it } from 'vitest';
import reactiveContext from '../src/state/reactive-context.js';

class TestSubject {
  constructor(initialValue) {
    this._value = initialValue;
    this._observers = new Set();
  }

  subscribe(observer) {
    this._observers.add(observer);
    observer(this._value);
    return {
      unsubscribe: () => {
        this._observers.delete(observer);
      }
    };
  }

  next(value) {
    this._value = value;
    const snapshot = Array.from(this._observers);
    for (let i = 0; i < snapshot.length; i++) {
      snapshot[i](value);
    }
  }
}

describe('reactive context scaffolding', () => {
  beforeEach(() => {
    reactiveContext.dispose();
  });

  it('stores simple signal values', () => {
    reactiveContext.setSignal('frame', 10);
    expect(reactiveContext.getSignal('frame')).toBe(10);
    reactiveContext.updateSignal('frame', (value) => value + 5);
    expect(reactiveContext.getSignal('frame')).toBe(15);
  });

  it('bridges observables into signals', () => {
    const subject = new TestSubject(1);
    const { signal, unsubscribe } = reactiveContext.toSignalFromObservable(
      'autoBattle',
      subject,
      { initialValue: false, transform: (value) => Boolean(value) }
    );
    expect(signal.value).toBe(true);
    subject.next(0);
    expect(signal.value).toBe(false);
    unsubscribe();
  });

  it('creates disposable behavior streams', () => {
    const stream = reactiveContext.createBehaviorStream({ cash: 0 });
    expect(stream.getValue()).toEqual({ cash: 0 });
    stream.next({ cash: 50 });
    expect(stream.getValue().cash).toBe(50);
  });
});
