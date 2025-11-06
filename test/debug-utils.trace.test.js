import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('debug-utils reactive trace', () => {
  let reactiveContext;
  let debugUtils;
  let consoleDebugSpy;

  beforeEach(async () => {
    vi.resetModules();
    reactiveContext = (await import('../src/state/reactive-context.js')).default;
    reactiveContext.dispose();
    debugUtils = await import('../src/js/pal/debug-utils.js');
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleDebugSpy?.mockRestore();
    reactiveContext.dispose();
    vi.resetModules();
  });

  it('filters events and auto-disposes when limit is reached', () => {
    const session = debugUtils.startReactiveTrace('rx-test', {
      filter: (event) => event?.type === 'match',
      limit: 2
    });

    expect(debugUtils.listReactiveTraces()).toContain('rx-test');

    reactiveContext.rootEvent$.next({ type: 'skip' });
    reactiveContext.rootEvent$.next({ type: 'match', payload: 1 });
    reactiveContext.rootEvent$.next({ type: 'match', payload: 2 });
    reactiveContext.rootEvent$.next({ type: 'match', payload: 3 });

    expect(consoleDebugSpy).toHaveBeenCalledTimes(2);
    expect(debugUtils.listReactiveTraces()).not.toContain(session);
  });
});
