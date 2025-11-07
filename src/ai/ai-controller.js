import aiGateway, { ensureAdaptersLoaded } from './ai-gateway.js';
import { ReplayRecorder } from './ai-replay.js';
import { runQwen } from './qwen-client.js';

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
    this.llmModel = options.llmModel || 'qwen:7b';
    this.useLLM = typeof options.useLLM === 'boolean' ? options.useLLM : detectLLMFlag();
    this._tickPending = false;
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
    if (this._tickPending) {
      return;
    }
    this._tickPending = true;
    (async () => {
      this.ticks += 1;
      const snapshot = this._summarise();
      let action = null;
      if (this.useLLM) {
        action = await this._decideWithLLM(snapshot);
      }
      if (!action) {
        action = this._decideRuleBased(snapshot);
      }
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
    })()
      .catch((err) => {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[ai-controller] tick error', err);
        }
      })
      .finally(() => {
        this._tickPending = false;
      });
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

  _decideRuleBased(summary) {
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

  async _decideWithLLM(summary) {
    if (!summary) {
      return null;
    }
    try {
      const prompt = this._buildLLMPrompt(summary);
      const raw = await runQwen({ prompt, model: this.llmModel });
      const parsed = parseLLMResponse(raw);
      return this._normaliseLLMAction(parsed);
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[ai-controller] LLM decision failed', err);
      }
      return null;
    }
  }

  _normaliseLLMAction(candidate) {
    if (!candidate || typeof candidate !== 'object') {
      return null;
    }
    const allowed = new Set(['move', 'interact', 'startBattle', 'useItem', 'castMagic', 'openMenu', 'saveGame']);
    const type = typeof candidate.action === 'string'
      ? candidate.action
      : (typeof candidate.type === 'string' ? candidate.type : null);
    if (!type || !allowed.has(type)) {
      return null;
    }
    const payload = candidate.payload && typeof candidate.payload === 'object' ? { ...candidate.payload } : {};
    const cooldown = Number(candidate.cooldownMs);
    if (Number.isFinite(cooldown)) {
      payload.cooldownMs = cooldown;
    }
    if (type === 'move') {
      const dir = Number(payload.direction);
      payload.direction = Number.isFinite(dir) ? ((dir % 4) + 4) % 4 : 0;
    }
    if (type === 'interact') {
      const eventId = Number(payload.eventId);
      if (!Number.isFinite(eventId)) {
        return null;
      }
      payload.eventId = eventId;
    }
    return { type, payload };
  }

  _buildLLMPrompt(summary) {
    const leader = (summary.party || [])[0] || {};
    const events = (summary.sceneEvents || []).slice(0, 5).map((entry) => {
      if (!entry || !entry.state) {
        return null;
      }
      const dx = (entry.state.x || 0) - (leader.x || 0);
      const dy = (entry.state.y || 0) - (leader.y || 0);
      return `- Event ${entry.id} at (${entry.state.x}, ${entry.state.y}) dx=${dx} dy=${dy} trigger=${entry.state.triggerScript || 0}`;
    }).filter(Boolean).join('\n') || '- None within sample window';

    const battle = summary.battle;
    let battleSection = 'Battle: none';
    if (battle) {
      const playerStatus = (battle.player || []).slice(0, 3).map((p, idx) => {
        if (!p) return null;
        return `P${idx} hp=${p.hp}/${p.maxHp} mp=${p.mp}/${p.maxMp}`;
      }).filter(Boolean).join('; ');
      const enemyStatus = (battle.enemy || []).slice(0, 3).map((e, idx) => {
        if (!e) return null;
        return `E${idx} hp=${e.hp || e.prevHP || 0}`;
      }).filter(Boolean).join('; ');
      battleSection = `Battle stateId=${battle.stateId}, field=${battle.fieldId}, players:[${playerStatus || 'n/a'}], enemies:[${enemyStatus || 'n/a'}]`;
    }

    return [
      'You control the hero party in a retro RPG. Decide the next action.',
      'Allowed actions and payloads:',
      '- move -> {\"direction\": number} (0=N,1=E,2=S,3=W).',
      '- interact -> {\"eventId\": number}.',
      '- startBattle -> {\"formationId\": number}.',
      '- useItem -> {\"itemId\": number, \"targetIndex\": number}.',
      '- castMagic -> {\"magicId\": number, \"casterIndex\": number, \"targetIndex\": number}.',
      '- openMenu -> {\"menu\": string}.',
      '- saveGame -> {\"slot\": number}.',
      'Output STRICT JSON like {\"action\":\"move\",\"payload\":{\"direction\":1,\"cooldownMs\":300}} with no explanation.',
      '',
      `Tick: ${summary.ticks}`,
      `Leader: (${leader.x || 0}, ${leader.y || 0}) facing ${leader.direction || 0}`,
      `Followers: ${summary.followers}`,
      'Nearby events:',
      events,
      battleSection
    ].join('\n');
  }
}

function detectLLMFlag() {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('llm') === 'qwen';
  } catch (err) {
    return false;
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

function parseLLMResponse(rawText) {
  if (!rawText) {
    return null;
  }
  let trimmed = rawText.trim();
  if (trimmed.startsWith('```')) {
    trimmed = trimmed.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  }
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    return null;
  }
}
