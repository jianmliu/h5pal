import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import scriptObjectAdapter from '../src/services/script-object-adapter.ts';
import worldService from '../src/services/world-service.ts';
import reactiveContext from '../src/state/reactive-context.js';
import stateService from '../src/services/state-service.ts';

describe('scriptObjectAdapter', () => {
  beforeEach(() => {
    reactiveContext.dispose();
    worldService.dispose();
    scriptObjectAdapter.dispose();

    globalThis.Global = {
      viewport: 0,
      partyOffset: 0,
      party: [{ playerRole: 0 }],
      trail: [],
      maxPartyMemberIndex: 0,
      numFollower: 0,
      partyDirection: 0,
      autoBattle: false,
      frameNum: 0,
      inventory: [],
      cash: 0,
      lastUnequippedItem: 0,
      curMainMenuItem: 0,
      curSystemMenuItem: 0,
      curInvMenuItem: 0,
      noMusic: false,
      noSound: false,
      musicNum: 0,
      numBattleMusic: 0,
      numBattleField: 0,
      screenWave: 0,
      waveProgression: 0,
      needToFadeIn: false,
      numPalette: 0,
      nightPalette: false,
      layer: 0
    };

    globalThis.GameData = {
      eventObject: [],
      scene: [],
      map: [],
      object: [
        { item: { flags: 0, scriptOnUse: 0 } }
      ],
      scriptEntry: [
        { opcode: 1, operand: [0, 0, 0] }
      ]
    };

    worldService.init();
    worldService.syncScriptRegisters();
    worldService.syncObjectStores();
  });

  afterEach(() => {
    scriptObjectAdapter.dispose();
    worldService.dispose();
    reactiveContext.dispose();
    stateService.updateGlobal({});
  });

  it('tracks script entries, object table, and descriptions', () => {
    const events = [];
    const unsubscribe = scriptObjectAdapter.subscribe((event) => events.push(event));

    expect(events[0].type).toBe('snapshot');
    expect(events[0].scriptEntries.length).toBe(1);
    expect(scriptObjectAdapter.getScriptEntries().length).toBe(1);
    expect(scriptObjectAdapter.getObjectTable().length).toBe(1);

    worldService.setScriptEntries([
      { opcode: 2, operand: [1, 0, 0] },
      { opcode: 3, operand: [0, 1, 0] }
    ]);

    worldService.setObjectTable([
      { item: { flags: 0, scriptOnUse: 123 } },
      { item: { flags: 0, scriptOnUse: 321 } }
    ]);

    worldService.setObjectDescTable([{ id: 1, text: 'Updated' }]);

    expect(events.find((event) => event.type === 'scriptEntries')).toBeTruthy();
    expect(events.find((event) => event.type === 'objectTable')).toBeTruthy();
    expect(events.find((event) => event.type === 'objectDesc')).toBeTruthy();

    expect(scriptObjectAdapter.getScriptEntries().length).toBe(2);
    expect(scriptObjectAdapter.getObjectTable().length).toBe(2);
    expect(scriptObjectAdapter.getObjectDesc()).toEqual([{ id: 1, text: 'Updated' }]);

    unsubscribe();
  });
});
