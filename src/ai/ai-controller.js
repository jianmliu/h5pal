import aiGateway, { ensureAdaptersLoaded } from './ai-gateway.js';
import { ReplayRecorder } from './ai-replay.js';

const DEFAULT_ADAPTERS = ['environment', 'partyTrail', 'sceneEvents', 'battleState'];

const STREAM_CONFIG = [
  { adapter: 'environment', stream: 'environment.viewport', key: 'environment.viewport', throttleMs: 200, maxPayloadSize: 1024 },
  { adapter: 'partyTrail', stream: 'partyTrail.party', key: 'partyTrail.party', throttleMs: 200, maxPayloadSize: 2048 },
  { adapter: 'partyTrail', stream: 'partyTrail.followers', key: 'partyTrail.followers', throttleMs: 500, maxPayloadSize: 512 },
  { adapter: 'sceneEvents', stream: 'scene.events.objects', key: 'scene.events', throttleMs: 300, maxPayloadSize: 4096 },
  { adapter: 'battleState', stream: 'battleState.state', key: 'battle.state', throttleMs: 200, maxPayloadSize: 4096 }
];

export class AIController {
  constructor(options = {}) {
    this.adapters = options.adapters || DEFAULT_ADAPTERS;
    this.tickIntervalMs = options.tickIntervalMs || 500;
    this.state = new Map();
    this.subscriptions = [];
    this.timer = null;
    this.recorder = new ReplayRecorder({ adapters: this.adapters });
    this.ticks = 0;
  }

  async start() {
    await ensureAdaptersLoaded(this.adapters);
    await this.recorder.start();
    this._subscribeStreams();
    this.timer = setInterval(() => this._tick(), this.tickIntervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.subscriptions.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch (err) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[ai-controller] failed to unsubscribe', err);
        }
      }
    });
    this.subscriptions = [];
    this.recorder.stop();
  }

  _subscribeStreams() {
    STREAM_CONFIG.forEach((config) => {
      const { adapter, stream, key, throttleMs, maxPayloadSize } = config;
      if (!this.adapters.includes(adapter)) {
        return;
      }
      try {
        const unsubscribe = aiGateway.subscribe({
          adapter,
          stream,
          throttleMs,
          maxPayloadSize,
          handler: (value) => {
            this.state.set(key, value);
            this.recorder.recordStream({ adapter, stream, value });
          }
        });
        this.subscriptions.push(unsubscribe);
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error(`[ai-controller] subscribe failed for ${adapter}:${stream}`, err);
        }
      }
    });
  }

  _tick() {
    this.ticks += 1;
    const snapshot = this._summarise();
    const action = this._decide(snapshot);
    if (!action) {
      return;
    }
    try {
      aiGateway.dispatch(action);
      this.recorder.recordAction(action);
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[ai-controller] dispatch failed', err);
      }
    }
  }

  _summarise() {
    const summary = {
      timestamp: Date.now(),
      ticks: this.ticks,
      viewport: this.state.get('environment.viewport') || null,
      party: this.state.get('partyTrail.party') || [],
      followers: this.state.get('partyTrail.followers') || 0,
      sceneEvents: this.state.get('scene.events') || [],
      battle: this.state.get('battle.state') || null
    };
    return summary;
  }

  _decide(summary) {
    if (!summary) {
      return null;
    }
    const inBattle = summary.battle && summary.battle.stateId != null;
    if (inBattle) {
      return this._decideBattle(summary);
    }
    return this._decideExploration(summary);
  }

  _decideExploration(summary) {
    const party = summary.party || [];
    const leader = party[0];
    if (!leader) {
      return null;
    }
    const events = summary.sceneEvents || [];
    const nearEvent = events.find((entry) => {
      if (!entry || !entry.state) {
        return false;
      }
      const dx = Math.abs((entry.state.x || 0) - (leader.x || 0));
      const dy = Math.abs((entry.state.y || 0) - (leader.y || 0));
      return dx + dy < 48;
    });
    if (nearEvent) {
      return { type: 'interact', payload: { eventId: nearEvent.id, cooldownMs: 500 } };
    }
    const direction = Math.floor(Math.random() * 4);
    return { type: 'move', payload: { direction, cooldownMs: 300 } };
  }

  _decideBattle(summary) {
    const battle = summary.battle;
    if (!battle) {
      return null;
    }
    const players = (battle.player || []).filter(Boolean);
    const enemies = (battle.enemy || []).filter(Boolean);
    const allHealthy = players.every((p) => p.hp > 0 && p.hp > p.maxHp * 0.3);
    if (allHealthy) {
      return { type: 'startBattle', payload: { formationId: battle.fieldId || 0, cooldownMs: 500 } };
    }
    return null;
  }
}

let controllerInstance = null;

export async function bootstrapAI(options = {}) {
  if (controllerInstance) {
    return controllerInstance;
  }
  controllerInstance = new AIController(options);
  await controllerInstance.start();
  if (options.logStart && typeof console !== 'undefined' && console.info) {
    console.info('[ai-controller] AI bootstrap complete');
  }
  return controllerInstance;
}

export function shutdownAI() {
  if (!controllerInstance) {
    return;
  }
  controllerInstance.stop();
  controllerInstance = null;
}
