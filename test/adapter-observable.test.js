import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

function readOnce(observable) {
  let subscription;
  const result = new Promise((resolve, reject) => {
    subscription = observable.subscribe({
      next(value) {
        resolve(value);
      },
      error(err) {
        reject(err);
      }
    });
  });
  return result.finally(() => {
    if (subscription) {
      subscription.unsubscribe();
    }
  });
}

describe('environment-adapter observables', () => {
  let environmentAdapter;
  let resetViewportSlice;
  let updateViewportValue;
  let reactiveContext;
  let resetTimeFlagSlice;
  let updateNeedToFadeInValue;
  let updateWaveProgressionValue;
  let updatePaletteIdValue;
  let resetAudioResourceSlice;

  beforeEach(async () => {
    vi.resetModules();
    const worldServiceMock = {
      getViewport: vi.fn(() => 0),
      getPartyOffset: vi.fn(() => 0),
      getPartyDirection: vi.fn(() => 0),
      getCurrentSaveSlot: vi.fn(() => 1),
      getPaletteId: vi.fn(() => 0),
      getScreenWave: vi.fn(() => 0),
      getLayer: vi.fn(() => 0),
      getNightPaletteFlag: vi.fn(() => false),
      getNeedToFadeIn: vi.fn(() => false),
      getWaveProgression: vi.fn(() => 0)
    };
    vi.doMock('../src/services/world-service.ts', () => ({
      __esModule: true,
      default: worldServiceMock
    }));
    reactiveContext = (await import('../src/state/reactive-context.js')).default;
    ({ resetViewportSlice, updateViewportValue } = await import('../src/state/slices/viewport.ts'));
    ({
      resetTimeFlagSlice,
      updateNeedToFadeInValue,
      updateWaveProgressionValue
    } = await import('../src/state/slices/time-flags.ts'));
    ({
      resetAudioResourceSlice,
      updatePaletteIdValue
    } = await import('../src/state/slices/audio-resources.ts'));
    reactiveContext.dispose();
    resetViewportSlice();
    resetTimeFlagSlice();
    resetAudioResourceSlice();
    environmentAdapter = await import('../src/services/environment-adapter.ts');
  });

  afterEach(() => {
    reactiveContext.dispose();
    vi.resetModules();
  });

  it('viewport$ emits current values', async () => {
    const first = await readOnce(environmentAdapter.viewport$());
    expect(first).toBe(0);

    updateViewportValue(128, { emitEvent: false });
    const second = await readOnce(environmentAdapter.viewport$());
    expect(second).toBe(128);
  });

  it('fadeIn$ and waveProgression$ mirror time flag updates', async () => {
    const fadeFirst = await readOnce(environmentAdapter.fadeIn$());
    expect(fadeFirst).toBe(false);
    const waveFirst = await readOnce(environmentAdapter.waveProgression$());
    expect(waveFirst).toBe(0);

    updateNeedToFadeInValue(true, { emitEvent: true, source: 'test' });
    updateWaveProgressionValue(42, { emitEvent: true, source: 'test' });

    const fadeSecond = await readOnce(environmentAdapter.fadeIn$());
    const waveSecond = await readOnce(environmentAdapter.waveProgression$());
    expect(fadeSecond).toBe(true);
    expect(waveSecond).toBe(42);
  });

  it('paletteId$ emits audio palette updates', async () => {
    const first = await readOnce(environmentAdapter.paletteId$());
    expect(first).toBe(0);
    updatePaletteIdValue(7, { emitEvent: true, source: 'test' });
    const second = await readOnce(environmentAdapter.paletteId$());
    expect(second).toBe(7);
  });
});

describe('battle-flags-adapter observables', () => {
  let reactiveContext;
  let resetBattleFlagsSlice;
  let updateRepeatFlag;
  let battleFlagsAdapter;

  beforeEach(async () => {
    vi.resetModules();
    reactiveContext = (await import('../src/state/reactive-context.js')).default;
    ({ resetBattleFlagsSlice, updateRepeatFlag } = await import('../src/state/slices/battle-flags.ts'));
    reactiveContext.dispose();
    resetBattleFlagsSlice();
    battleFlagsAdapter = await import('../src/services/battle-flags-adapter.ts');
  });

  afterEach(() => {
    reactiveContext.dispose();
    vi.resetModules();
  });

  it('flags$ emits snapshots and updates', async () => {
    const values = [];
    const subscription = battleFlagsAdapter.flags$().subscribe((value) => {
      values.push(value);
    });

    expect(values[0]).toMatchObject({ repeat: false, force: false });

    updateRepeatFlag(true, { emitEvent: true, source: 'test' });
    expect(values.some((entry) => entry.repeat === true)).toBe(true);

    subscription.unsubscribe();
  });
});

describe('battle-state-adapter observables', () => {
  let reactiveContext;
  let resetBattleFormationSlice;
  let updateEnemyTeamValue;
  let battleStateAdapter;
  let battleServiceMock;
  let worldServiceMock;
  let listeners;
  let currentState;

  beforeEach(async () => {
    vi.resetModules();
    reactiveContext = (await import('../src/state/reactive-context.js')).default;
    ({ resetBattleFormationSlice, updateEnemyTeamValue } =
      await import('../src/state/slices/battle-formation.ts'));
    reactiveContext.dispose();
    resetBattleFormationSlice();

    listeners = new Map();
    currentState = { stateId: 1, enemy: [], player: [] };

    battleServiceMock = {
      getState: vi.fn(() => currentState),
      on: vi.fn((event, handler) => {
        const set = listeners.get(event) || new Set();
        set.add(handler);
        listeners.set(event, set);
      }),
      off: vi.fn((event, handler) => {
        const set = listeners.get(event);
        if (set) {
          set.delete(handler);
        }
      })
    };

    worldServiceMock = {
      getBattleState: vi.fn(() => currentState)
    };

    vi.doMock('../src/services/battle-service.ts', () => ({
      __esModule: true,
      default: battleServiceMock
    }));

    vi.doMock('../src/services/world-service.ts', () => ({
      __esModule: true,
      default: worldServiceMock
    }));

    battleStateAdapter = await import('../src/services/battle-state-adapter.js');
  });

  afterEach(() => {
    reactiveContext.dispose();
    vi.resetModules();
  });

  it('enemyTeam$ publishes formation updates', () => {
    const values = [];
    const subscription = battleStateAdapter.enemyTeam$().subscribe((value) => values.push(value));

    expect(values[0]).toEqual([]);

    const formation = [{ enemy: [1, 2, 3] }];
    updateEnemyTeamValue(formation, { emitEvent: true, source: 'test' });
    expect(values[values.length - 1]).toEqual(formation);

    subscription.unsubscribe();
  });

  it('battleState$ emits current snapshot and reacts to state changes', () => {
    const snapshots = [];
    const subscription = battleStateAdapter.battleState$().subscribe((state) => snapshots.push(state));

    expect(snapshots[0]).toBe(currentState);

    currentState = { stateId: 2 };
    battleServiceMock.getState.mockReturnValue(currentState);
    const changeHandlers = Array.from(listeners.get('stateChanged') || []);
    changeHandlers.forEach((handler) => handler());
    expect(snapshots[snapshots.length - 1]).toEqual({ stateId: 2 });

    subscription.unsubscribe();
  });
});
