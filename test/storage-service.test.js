import { describe, expect, it, vi } from 'vitest';
import { StorageService } from '../src/services/storage-service.ts';

describe('StorageService', () => {
  it('writes and reads slots', () => {
    const service = new StorageService();
    const payload = { foo: 'bar' };

    expect(service.writeSlot(3, payload)).toBe(true);
    const stored = service.readSlot(3);
    expect(stored).toEqual(payload);
  });

  it('emits events on save/remove', () => {
    const service = new StorageService();
    const spy = vi.fn();
    service.on('slotSaved', spy);
    service.writeSlot(1, { value: 1 });
    expect(spy).toHaveBeenCalledWith({ type: 'slotSaved', data: { slot: 1, payload: { value: 1 } } });

    const removeSpy = vi.fn();
    service.on('slotRemoved', removeSpy);
    service.removeSlot(1);
    expect(removeSpy).toHaveBeenCalled();
  });
});
