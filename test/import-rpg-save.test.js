import { describe, expect, it } from 'vitest';
import { rpgBufferToPayload } from '../scripts/import-rpg-save.mjs';

async function ensureSaveDataClass() {
  if (globalThis.SaveData) {
    return globalThis.SaveData;
  }
  try {
    await rpgBufferToPayload(new Uint8Array(0));
  } catch (err) {
    if (!/Save buffer too small/.test(err?.message || '')) {
      throw err;
    }
  }
  return globalThis.SaveData;
}

describe('import-rpg-save', () => {
  it('produces a compatible save payload from RPG data', async () => {
    const SaveData = await ensureSaveDataClass();
    const saveInstance = new SaveData();
    saveInstance.savedTimes = 42;
    saveInstance.viewportX = 1234;
    saveInstance.viewportY = 5678;

    const payload = await rpgBufferToPayload(saveInstance.uint8Array);

    expect(payload.version).toBe(1);
    expect(payload.savedTimes).toBe(42);
    expect(Array.isArray(payload.bytes)).toBe(true);
    expect(payload.bytes.length).toBe(saveInstance.uint8Array.length);
    const firstBytes = payload.bytes.slice(0, 4);
    expect(firstBytes.length).toBe(4);
  });
});
