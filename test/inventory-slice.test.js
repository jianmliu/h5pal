import { beforeEach, describe, expect, it } from 'vitest';
import reactiveContext from '../src/state/reactive-context.js';
import {
  inventorySignals,
  updateInventoryValue,
  mutateInventoryValue,
  getInventoryValue,
  updateCashValue,
  getCashValue,
  updateLastUnequippedValue,
  getLastUnequippedValue
} from '../src/state/slices/inventory.ts';

function createSlot(overrides = {}) {
  return {
    item: 0,
    amount: 0,
    amountInUse: 0,
    ...overrides
  };
}

describe('inventory slice', () => {
  beforeEach(() => {
    reactiveContext.dispose();
  });

  it('exposes default signals', () => {
    const signals = inventorySignals();
    expect(signals.items.value).toEqual([]);
    expect(signals.cash.value).toBe(0);
    expect(signals.lastUnequipped.value).toBe(0);
  });

  it('updates inventory via updateInventoryValue', () => {
    const slots = [createSlot({ item: 10, amount: 2 })];
    updateInventoryValue(slots);
    expect(getInventoryValue()).toEqual(slots);

    updateInventoryValue([createSlot({ item: 5, amount: 1 })], { capacity: 64 });
    const { items, capacity } = inventorySignals();
    expect(items.value).toEqual([{ item: 5, amount: 1, amountInUse: 0 }]);
    expect(capacity.value).toBe(64);
  });

  it('mutates inventory in place', () => {
    updateInventoryValue([createSlot({ item: 3, amount: 1 })]);
    mutateInventoryValue((current) => {
      current.push(createSlot({ item: 8, amount: 4 }));
      return current;
    });
    expect(getInventoryValue()).toHaveLength(2);
  });

  it('tracks cash and last unequipped values', () => {
    updateCashValue(120);
    expect(getCashValue()).toBe(120);
    updateCashValue('bad');
    expect(getCashValue()).toBe(0);

    updateLastUnequippedValue(7);
    expect(getLastUnequippedValue()).toBe(7);
  });
});
