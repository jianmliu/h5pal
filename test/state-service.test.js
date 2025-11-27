import { describe, expect, it, vi } from 'vitest';
import { StateService } from '../src/services/state-service.ts';

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

  it('mutateGlobal notifies listeners for in-place updates', () => {
    const service = new StateService();
    Global.sampleList = [{ value: 1 }];
    const spy = vi.fn();
    service.on('globalChanged', spy);

    service.mutateGlobal('sampleList', (list) => {
      list.push({ value: 2 });
    });

    expect(Global.sampleList).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(1);
    const event = spy.mock.calls[0][0];
    expect(event.type).toBe('globalChanged');
    expect(event.data.key).toBe('sampleList');
    expect(event.data.value).toBe(Global.sampleList);
    delete Global.sampleList;
  });

  it('mutateGameData notifies listeners for in-place updates', () => {
    const service = new StateService();
    GameData.sampleList = [1];
    const spy = vi.fn();
    service.on('gameDataChanged', spy);

    service.mutateGameData('sampleList', (list) => {
      list.push(2);
    });

    expect(GameData.sampleList).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(1);
    const event = spy.mock.calls[0][0];
    expect(event.type).toBe('gameDataChanged');
    expect(event.data.key).toBe('sampleList');
    expect(event.data.value).toBe(GameData.sampleList);
    delete GameData.sampleList;
  });
});
