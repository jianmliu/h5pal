import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import battleFlagsAdapter from '../src/services/battle-flags-adapter.js';
import battleService from '../src/services/battle-service.js';
import reactiveContext from '../src/state/reactive-context.js';
import stateService from '../src/services/state-service.js';

function createBareBattleState() {
  return {
    repeat: false,
    force: false,
    flee: false,
    battleResult: 0,
    phase: 0,
    player: [],
    enemy: [],
    actionQueue: [],
    UI: {}
  };
}

describe('battleFlagsAdapter', () => {
  beforeEach(() => {
    reactiveContext.dispose();
    battleFlagsAdapter.dispose();
    stateService.updateGlobal({});
    battleService.replaceState(createBareBattleState());
  });

  afterEach(() => {
    battleFlagsAdapter.dispose();
    reactiveContext.dispose();
    stateService.updateGlobal({});
    battleService.replaceState(createBareBattleState());
  });

  it('reflects repeat/force/flee flags and battle state transitions', () => {
    const events = [];
    const unsubscribe = battleFlagsAdapter.subscribe((event) => events.push(event));

    expect(events[0].type).toBe('snapshot');
    expect(events[0].value.repeat).toBe(false);

    battleService.set(['repeat'], true);
    battleService.set(['battleResult'], 2);
    battleService.set(['phase'], 1);

    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe('flags');
    expect(lastEvent.value.repeat).toBe(true);
    expect(lastEvent.value.result).toBe(2);
    expect(lastEvent.value.phase).toBe(1);

    unsubscribe();
  });
});
