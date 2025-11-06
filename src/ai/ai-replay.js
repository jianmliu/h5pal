const isBrowser = typeof window !== 'undefined';

export class ReplayRecorder {
  constructor(options = {}) {
    const { adapters = [], maxEntries = 10000 } = options;
    this.adapters = Array.isArray(adapters) ? adapters : [adapters];
    this.maxEntries = maxEntries;
    this.entries = [];
    this.subscriptions = [];
  }

  async start() {
    this.entries.length = 0;
  }

  stop() {
    this.subscriptions.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch (err) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[ai-replay] unsubscribe failure', err);
        }
      }
    });
    this.subscriptions = [];
  }

  registerSubscription(unsubscribe) {
    if (typeof unsubscribe === 'function') {
      this.subscriptions.push(unsubscribe);
    }
  }

  recordStream(event) {
    if (this.entries.length >= this.maxEntries) {
      return;
    }
    this.entries.push({ type: 'stream', timestamp: Date.now(), ...event });
  }

  recordAction(action) {
    if (this.entries.length >= this.maxEntries) {
      return;
    }
    this.entries.push({ type: 'action', timestamp: Date.now(), action });
  }

  save() {
    const payload = JSON.stringify(this.entries, null, 2);
    if (isBrowser) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[ai-replay] save() called in browser; returning JSON string only');
      }
    }
    return payload;
  }
}

export class ReplayPlayer {
  constructor(entries = []) {
    this.entries = Array.isArray(entries) ? entries : [];
  }

  async play(options = {}) {
    const { delay = 0, onAction } = options;
    for (const entry of this.entries) {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      if (entry.type === 'action' && typeof onAction === 'function') {
        onAction(entry.action);
      }
    }
  }
}

export function loadReplayFromJSON(json) {
  try {
    return JSON.parse(json);
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[ai-replay] loadReplayFromJSON parse error', err);
    }
    return [];
  }
}
