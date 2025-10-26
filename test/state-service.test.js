import { describe, expect, it, vi } from 'vitest';
import { StateService } from '../src/services/state-service.js';

describe('StateService', () => {
  it('reads and writes global values with events', () => {
    const service = new StateService();
    const spy = vi.fn();
    service.on('globalChanged', spy);

    service.setGlobal('testKey', 42);
    expect(Global.testKey).toBe(42);
    expect(spy).toHaveBeenCalledWith({ type: 'globalChanged', data: { key: 'testKey', previous: undefined, value: 42 } });

    service.updateGlobal({ anotherKey: 'value' });
    expect(Global.anotherKey).toBe('value');
  });

  it('reads and writes game data values', () => {
    const service = new StateService();
    const spy = vi.fn();
    service.on('gameDataChanged', spy);

    GameData.sample = 1;
    service.setGameData('sample', 2);
    expect(GameData.sample).toBe(2);
    expect(spy).toHaveBeenCalledWith({ type: 'gameDataChanged', data: { key: 'sample', previous: 1, value: 2 } });
  });
});
