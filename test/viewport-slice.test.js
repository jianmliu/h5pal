import { beforeEach, describe, expect, it } from 'vitest';
import reactiveContext from '../src/state/reactive-context.js';
import {
  viewportSignals,
  getViewportValue,
  updateViewportValue,
  getPartyOffsetValue,
  updatePartyOffsetValue,
  getPartyDirectionValue,
  updatePartyDirectionValue,
  getMaxPartyIndexValue,
  updateMaxPartyIndexValue
} from '../src/state/slices/viewport.js';

describe('viewport slice', () => {
  beforeEach(() => {
    reactiveContext.dispose();
  });

  it('exposes default signals', () => {
    const signals = viewportSignals();
    expect(signals.viewport.value).toBe(0);
    expect(signals.partyOffset.value).toBe(0);
    expect(signals.partyDirection.value).toBe(0);
    expect(signals.maxPartyIndex.value).toBe(-1);
  });

  it('updates viewport and party offsets', () => {
    updateViewportValue(123);
    expect(getViewportValue()).toBe(123);
    updatePartyOffsetValue(456);
    expect(getPartyOffsetValue()).toBe(456);
  });

  it('coerces direction and max index', () => {
    updatePartyDirectionValue('bad', { emitEvent: false });
    expect(getPartyDirectionValue()).toBe(0);
    updatePartyDirectionValue(3);
    expect(getPartyDirectionValue()).toBe(3);

    updateMaxPartyIndexValue('nope', { emitEvent: false });
    expect(getMaxPartyIndexValue()).toBe(-1);
    updateMaxPartyIndexValue(4.7);
    expect(getMaxPartyIndexValue()).toBe(4);
  });
});
