import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/js/pal/play.ts', () => ({
  default: {
    init: vi.fn(() => Promise.resolve()),
    startFrame: vi.fn(() => Promise.resolve())
  }
}));

vi.mock('../src/js/pal/script.ts', () => ({
  default: {
    updateEquipments: vi.fn(() => Promise.resolve())
  }
}));

vi.mock('../src/js/pal/res.ts', () => ({
  default: {
    setLoadFlags: vi.fn(),
    loadResources: vi.fn(() => Promise.resolve())
  }
}));

vi.mock('../src/js/pal/uigame.ts', () => ({
  default: {
    openingMenu: vi.fn(() => Promise.resolve(1))
  }
}));

import game from '../src/js/pal/game.js';

const STORAGE_PREFIX = 'PAL-SAVE-';

describe('game save metadata', () => {
  beforeEach(() => {
    window.localStorage.clear();
    globalThis.SaveData = class SaveData {
      constructor(buf = new Uint8Array(0)) {
        this.buffer = buf;
        this.uint8Array = buf;
        this.savedTimes = 0;
      }
    };
  });

  it('returns null when slot is empty', () => {
    expect(game.getSaveSlotMeta(1)).toBeNull();
  });

  it('reads savedTimes and timestamp from storage', () => {
    const payload = {
      bytes: Array.from(new Uint8Array([1, 2, 3])),
      savedTimes: 7,
      timestamp: 123456
    };
    window.localStorage.setItem(`${STORAGE_PREFIX}1`, JSON.stringify(payload));

    const meta = game.getSaveSlotMeta(1);
    expect(meta).toEqual({
      savedTimes: 7,
      timestamp: 123456
    });
  });

  it('persists save payload and updates metadata', () => {
    const originalSaveGame = game._saveGame;
    const mockPayload = {
      savedTimes: 0,
      uint8Array: new Uint8Array(0)
    };
    game._saveGame = vi.fn(() => mockPayload);

    const ok = game.saveGame(2);
    expect(ok).toBe(true);
    expect(game._saveGame).toHaveBeenCalled();

    const stored = JSON.parse(window.localStorage.getItem(`${STORAGE_PREFIX}2`));
    expect(stored.savedTimes).toBe(1);
    expect(window.localStorage.getItem(`${STORAGE_PREFIX}lastSlot`)).toBe('2');

    game._saveGame = originalSaveGame;
  });
});
