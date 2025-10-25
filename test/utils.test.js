import { describe, expect, it } from 'vitest';
import utils from '../src/js/pal/utils.js';

describe('utils', () => {
  it('clones arrays without sharing references', () => {
    const original = [1, 2, 3];
    const clone = utils.arrClone(original);

    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);

    clone[0] = 99;
    expect(original[0]).toBe(1);
  });

  it('provides a simple event system', () => {
    const target = {};
    utils.extend(target, utils.Events);

    let observed = 0;
    target.on('test', (event) => {
      observed += event.data.increment;
    });

    target.fire('test', { increment: 2 });
    target.fire('test', { increment: 3 });

    expect(observed).toBe(5);
  });

  it('initialises arrays with independent elements', () => {
    const result = utils.initArray(Array, 3);
    expect(result).toHaveLength(3);
    result.forEach((entry) => {
      expect(Array.isArray(entry)).toBe(true);
    });
    expect(result[0]).not.toBe(result[1]);
  });
});
