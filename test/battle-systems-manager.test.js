import { describe, it, expect } from 'vitest';
import { BattleSystemManager } from '../src/services/battle-systems.js';

describe('BattleSystemManager pipeline', () => {
  it('runs each phase in order once per tick', () => {
    const executed = [];
    const yielded = [];
    const manager = new BattleSystemManager({}, {});

    manager.register('time', () => executed.push('time'));
    manager.register('status', () => executed.push('status'));
    manager.register('ai', () => executed.push('ai'));
    manager.registerGenerator('queue', function* () {
      executed.push('queue');
      yield 'queue-step';
    });
    manager.registerGenerator('action', function* () {
      executed.push('action');
      yield 'action-step';
    });
    manager.register('animation', () => executed.push('animation'));
    manager.register('render', () => executed.push('render'));

    manager.setPipeline(['time', 'status', 'ai', 'queue', 'action', 'animation', 'render']);

    for (const value of manager.runTick({})) {
      yielded.push(value);
    }

    expect(executed).toStrictEqual([
      'time',
      'status',
      'ai',
      'queue',
      'action',
      'animation',
      'render'
    ]);
    expect(yielded).toStrictEqual(['queue-step', 'action-step']);
  });

  it('rejects duplicate phases', () => {
    const manager = new BattleSystemManager({}, {});
    expect(() => manager.setPipeline(['time', 'status', 'time'])).toThrow(/Duplicate pipeline phase: time/);
  });
});
