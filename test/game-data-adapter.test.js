import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import reactiveContext from '../src/state/reactive-context.js';
import {
  updateLevelUpExpTableValue,
  updateLevelUpMagicTableValue,
  resetGameDataSlice
} from '../src/state/slices/game-data.ts';

let worldServiceMock;
let gameDataAdapter;

function createWorldServiceMock(baseTable) {
  return {
    syncObjectStores: vi.fn(),
    getExpState: vi.fn(() => null),
    getLevelUpExp: vi.fn((level) => baseTable[level] || 0)
  };
}

describe('game-data-adapter level-up helpers', () => {
  beforeEach(async () => {
    vi.resetModules();
    reactiveContext.dispose();
    resetGameDataSlice();
    const baseTable = [0, 100, 300];
    const baseMagicTable = [{ m: [{ level: 2, magic: 500 }] }, { m: [{ level: 3, magic: 600 }] }];
    globalThis.GameData = {
      levelUpExp: baseTable.slice(),
      levelUpMagic: baseMagicTable.map((entry) => ({
        ...entry,
        m: Array.isArray(entry.m) ? entry.m.map((item) => ({ ...item })) : []
      }))
    };
    updateLevelUpExpTableValue(baseTable.slice(), { source: 'test:setup' });
    updateLevelUpMagicTableValue(baseMagicTable.map((entry) => ({
      ...entry,
      m: Array.isArray(entry.m) ? entry.m.map((item) => ({ ...item })) : []
    })), { source: 'test:setup' });
    worldServiceMock = createWorldServiceMock(baseTable);
    vi.doMock('../src/services/world-service.ts', () => ({
      __esModule: true,
      default: worldServiceMock
    }));
    gameDataAdapter = (await import('../src/services/game-data-adapter.ts')).default;
    updateLevelUpExpTableValue(baseTable.slice(), { source: 'test:postImport' });
    updateLevelUpMagicTableValue(baseMagicTable.map((entry) => ({
      ...entry,
      m: Array.isArray(entry.m) ? entry.m.map((item) => ({ ...item })) : []
    })), { source: 'test:postImport' });
  });

  afterEach(() => {
    reactiveContext.dispose();
    vi.resetModules();
    resetGameDataSlice();
    delete globalThis.GameData;
  });

  it('returns level-up exp values using the world-service fallback table', () => {
    expect(gameDataAdapter.getLevelUpExpValue(1)).toBe(100);
  });

  it('emits snapshots and refreshes cache after teardown', () => {
    const events = [];
    const unsubscribe = gameDataAdapter.subscribe((event) => events.push(event));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('snapshot');
    expect(events[0].levelUpExpTable).toEqual([0, 100, 300]);
    expect(events[0].levelUpMagicTable).toHaveLength(2);
    unsubscribe();

    const updatedTable = [0, 50, 150, 400];
    const updatedMagicTable = [{ m: [{ level: 4, magic: 700 }] }];
    globalThis.GameData.levelUpExp = updatedTable.slice();
    globalThis.GameData.levelUpMagic = updatedMagicTable.map((entry) => ({
      ...entry,
      m: Array.isArray(entry.m) ? entry.m.map((item) => ({ ...item })) : []
    }));
    updateLevelUpExpTableValue(updatedTable.slice(), { source: 'test' });
    updateLevelUpMagicTableValue(updatedMagicTable.map((entry) => ({
      ...entry,
      m: Array.isArray(entry.m) ? entry.m.map((item) => ({ ...item })) : []
    })), { source: 'test' });
    worldServiceMock.getLevelUpExp.mockImplementation((level) => updatedTable[level] || 0);

    expect(gameDataAdapter.getLevelUpExpValue(2)).toBe(150);
    expect(gameDataAdapter.getLevelUpExpValue(3)).toBe(400);
    expect(gameDataAdapter.getLevelUpMagicTable()).toEqual(expect.any(Array));
    expect(gameDataAdapter.getLevelUpMagicEntry(0)).toEqual({
      m: [{ level: 4, magic: 700 }]
    });
  });
});
