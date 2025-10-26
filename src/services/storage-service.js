import EventBus from './event-bus.js';

const SAVE_STORAGE_PREFIX = 'PAL-SAVE-';

function getStorage() {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch (ex) {
    return null;
  }
}

class StorageService extends EventBus {
  constructor() {
    super();
    this.storage = getStorage();
  }

  isAvailable() {
    return !!this.storage;
  }

  _key(slot) {
    return `${SAVE_STORAGE_PREFIX}${slot}`;
  }

  readSlot(slot) {
    if (!this.storage) return null;
    const raw = this.storage.getItem(this._key(slot));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (ex) {
      return null;
    }
  }

  writeSlot(slot, payload) {
    if (!this.storage) return false;
    try {
      this.storage.setItem(this._key(slot), JSON.stringify(payload));
      this.storage.setItem(`${SAVE_STORAGE_PREFIX}lastSlot`, slot);
      this.fire('slotSaved', { slot, payload });
      return true;
    } catch (ex) {
      return false;
    }
  }

  getLastSlot() {
    if (!this.storage) return null;
    const raw = this.storage.getItem(`${SAVE_STORAGE_PREFIX}lastSlot`);
    return raw ? Number(raw) : null;
  }

  listSlots(range = [1, 5]) {
    if (!this.storage) return [];
    const [start, end] = range;
    const slots = [];
    for (let i = start; i <= end; i++) {
      slots.push({ slot: i, payload: this.readSlot(i) });
    }
    return slots;
  }

  removeSlot(slot) {
    if (!this.storage) return;
    this.storage.removeItem(this._key(slot));
    this.fire('slotRemoved', { slot });
  }
}

const storageService = new StorageService();

export { StorageService };
export default storageService;
