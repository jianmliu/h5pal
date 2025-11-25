import { Subject } from 'rxjs';
import reactiveContext from '../state/reactive-context.js';
import { party$ as partyStream, followerCount$ } from './party-trail-adapter.js';
import playerStateAdapter from './player-state-adapter.js';
import { sceneEventObjects$, sceneId$ } from './scene-event-adapter.js';
import dialogService from './dialog-service.ts';
import { createMudClient } from './mud-client.js';
import { getMudConfig } from './mud-config.js';

const mudOutgoing$ = new Subject();
const mudIncoming$ = new Subject();

let running = false;
let subscriptions = [];
let optionsSnapshot = { log: true };
let mudClient = null;
let readyPromise = null;
let readyResolve = null;

function cleanupSubscription(subscription) {
  if (!subscription) {
    return;
  }
  if (typeof subscription.unsubscribe === 'function') {
    subscription.unsubscribe();
    return;
  }
  if (typeof subscription === 'function') {
    subscription();
  }
}

function log(message, payload) {
  if (optionsSnapshot.log === false) {
    return;
  }
  if (typeof console !== 'undefined' && console.debug) {
    console.debug(`[mud-bridge] ${message}`, payload);
  }
}

const noisyStreams = new Set(['sceneEvents', 'sceneId']);

function emit(kind, payload) {
  if (!running) {
    return;
  }
  const envelope = {
    kind,
    payload,
    timestamp: Date.now()
  };
  mudOutgoing$.next(envelope);
  if (noisyStreams.has(kind)) {
    return;
  }
  log(`emit:${kind}`, payload);
}

function subscribeObservable(observable, kind) {
  if (!observable || typeof observable.subscribe !== 'function') {
    return;
  }
  let lastPayload = JSON.stringify(null);
  const subscription = observable.subscribe((value) => {
    if (noisyStreams.has(kind)) {
      const serialized = JSON.stringify(value);
      if (serialized === lastPayload) {
        return;
      }
      lastPayload = serialized;
    }
    emit(kind, value);
  });
  subscriptions.push(subscription);
}

async function startMudBridge(options = {}) {
  if (running) {
    return mudBridge;
  }
  running = true;
  optionsSnapshot = Object.assign({ log: true }, options);
  log('start', optionsSnapshot);

  readyPromise = new Promise((resolve) => (readyResolve = resolve));
  const connection = optionsSnapshot.connection || safeGetConfig();
  mudClient = await createMudClient(connection);
  if (readyResolve) {
    readyResolve(true);
    readyResolve = null;
  }
  if (mudClient.onSync) {
    mudClient.onSync((message) => handleMudMessage(message));
  }

  subscribeObservable(partyStream, 'party');
  subscribeObservable(followerCount$, 'followers');
  subscribeObservable(playerStateAdapter.playerRoles$, 'playerRoles');
  subscribeObservable(sceneEventObjects$(), 'sceneEvents');
  subscribeObservable(sceneId$(), 'sceneId');

  const dialogLine$ = reactiveContext.signalToObservable(dialogService.signals.currentLine);
  const dialogStatus$ = reactiveContext.signalToObservable(dialogService.signals.status);
  subscribeObservable(dialogLine$, 'dialogLine');
  subscribeObservable(dialogStatus$, 'dialogStatus');

  return mudBridge;
}

async function stopMudBridge() {
  if (!running) {
    return;
  }
  subscriptions.forEach(cleanupSubscription);
  subscriptions = [];
  running = false;
  if (mudClient && typeof mudClient.stop === 'function') {
    await mudClient.stop();
  }
  mudClient = null;
  readyPromise = null;
  readyResolve = null;
  log('stop');
}

function handleMudMessage(message) {
  if (!message) {
    return;
  }
  mudIncoming$.next(message);
  log('incoming', message);
}

const mudBridge = {
  start: startMudBridge,
  stop: stopMudBridge,
  isRunning: () => running,
  connectWallet: async (requestOpts = {}) => {
    const config = Object.assign({}, safeGetConfig(), { privateKey: null }, requestOpts);
    if (!mudClient || typeof mudClient.connectWallet !== 'function') {
      throw new Error('Mud client not ready');
    }
    return mudClient.connectWallet(config);
  },
  mudOutgoing$,
  mudIncoming$,
  handleMudMessage
};

function safeGetConfig() {
  try {
    return getMudConfig();
  } catch (err) {
    console.warn('[mud-bridge] missing PAL_CONFIG.mud', err);
    throw err;
  }
}

function writeSystemCall(functionName, args = []) {
  if (!mudClient || typeof mudClient.writeSystem !== 'function') {
    console.warn('[mud-bridge] writeSystem requested but client is not ready');
    return Promise.reject(new Error('mud client not ready'));
  }
  return mudClient
    .writeSystem(functionName, args)
    .then((txHash) => {
      log('writeSystem', { functionName, args, txHash });
      return txHash;
    })
    .catch((err) => {
      console.warn('[mud-bridge] writeSystem failed', err);
      throw err;
    });
}

export default mudBridge;
export {
  startMudBridge,
  stopMudBridge,
  mudOutgoing$,
  mudIncoming$,
  handleMudMessage,
  writeSystemCall
};
