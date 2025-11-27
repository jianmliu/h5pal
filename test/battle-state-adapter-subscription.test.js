import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import reactiveContext from '../src/state/reactive-context.js';

let battleServiceMock;
let worldServiceMock;
let listeners;
let subscribeBattleState;
let getBattleStateSnapshot;

function captureListener(event, handler) {
  const list = listeners.get(event) || [];
  list.push(handler);
  listeners.set(event, list);
}

describe('battle-state adapter subscription lifecycle', () => {
  beforeEach(async () => {
    vi.resetModules();
    reactiveContext.dispose();
    listeners = new Map();

    battleServiceMock = {
      getState: vi.fn(() => ({ foo: 'bar' })),
      on: vi.fn((event, handler) => captureListener(event, handler)),
      off: vi.fn((event, handler) => {
        const list = listeners.get(event) || [];
        listeners.set(event, list.filter((fn) => fn !== handler));
      })
    };

    worldServiceMock = {
      getBattleState: vi.fn(() => ({ fallback: true }))
    };

    vi.doMock('../src/services/battle-service.ts', () => ({
      __esModule: true,
      default: battleServiceMock
    }));

    vi.doMock('../src/services/world-service.ts', () => ({
      __esModule: true,
      default: worldServiceMock
    }));

    ({ subscribeBattleState, getBattleStateSnapshot } = await import('../src/services/battle-state-adapter.js'));
  });

  afterEach(() => {
    reactiveContext.dispose();
    vi.resetModules();
  });

  it('pushes updates, cleans up listeners, and resets cache', () => {
    const primary = [];
    const secondary = [];
    const unsubscribePrimary = subscribeBattleState((event) => primary.push(event));
    const unsubscribeSecondary = subscribeBattleState((event) => secondary.push(event));

    expect(primary).not.toHaveLength(0);
    expect(primary[0].type).toBe('snapshot');
    expect(primary[0].state).toEqual({ foo: 'bar' });
    expect(battleServiceMock.on).toHaveBeenCalledWith('stateChanged', expect.any(Function));
    expect(battleServiceMock.on).toHaveBeenCalledWith('stateMutated', expect.any(Function));

    battleServiceMock.getState.mockReturnValueOnce({ foo: 'baz' });
    listeners.get('stateChanged')[0]();
    expect(primary[1]).toEqual({ type: 'stateChanged', state: { foo: 'baz' }, previous: { foo: 'bar' } });

    battleServiceMock.getState.mockReturnValueOnce({ foo: 'qux' });
    listeners.get('stateMutated')[0]();
    expect(primary[2]).toEqual({ type: 'stateMutated', state: { foo: 'qux' }, previous: { foo: 'baz' } });

    unsubscribePrimary();
    expect(battleServiceMock.off).not.toHaveBeenCalled();
    expect((listeners.get('stateChanged') || []).length).toBeGreaterThan(0);
    expect((listeners.get('stateMutated') || []).length).toBeGreaterThan(0);

    unsubscribeSecondary();
    expect(battleServiceMock.off).toHaveBeenCalledWith('stateChanged', expect.any(Function));
    expect(battleServiceMock.off).toHaveBeenCalledWith('stateMutated', expect.any(Function));
    expect(listeners.get('stateChanged') || []).toHaveLength(0);
    expect(listeners.get('stateMutated') || []).toHaveLength(0);

    battleServiceMock.getState.mockReturnValue(null);
    worldServiceMock.getBattleState.mockReturnValueOnce({ alt: true });
    expect(getBattleStateSnapshot()).toEqual({ alt: true });
  });
});
