import { worldService, resourceService } from '../services/index.js';
import dialogService from '../services/dialog-service.js';
import NpcDialogController from '../js/pal/npc-dialog-controller.js';
import { runQwen } from './qwen-client.js';

const DEFAULT_NPC_LLM_CONFIG = {
  enabled: false,
  model: null,
  temperature: 0.7,
  cooldownMs: 5000
};

function readNpcLLMConfig() {
  if (typeof window === 'undefined') {
    return Object.assign({}, DEFAULT_NPC_LLM_CONFIG);
  }
  window.PAL_CONFIG = window.PAL_CONFIG || {};
  const npcConfig = window.PAL_CONFIG.npcLLM = Object.assign({}, DEFAULT_NPC_LLM_CONFIG, window.PAL_CONFIG.npcLLM || {});
  if (!npcConfig.model && window.PAL_CONFIG.llmModel) {
    npcConfig.model = window.PAL_CONFIG.llmModel;
  }
  return npcConfig;
}

function ensureArray(input) {
  return Array.isArray(input) ? input.slice() : [];
}

let big5MapPromise = null;

async function buildBig5Map() {
  if (big5MapPromise) {
    return big5MapPromise;
  }
  big5MapPromise = (async () => {
    try {
      const ascBuffer = await resourceService.loadFiles('wor16.asc');
      const codes = new Uint16Array(ascBuffer);
      const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('big5') : null;
      const map = new Map();
      if (!decoder) {
        return map;
      }
      const tmp = new Uint8Array(2);
      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        if (!code) {
          continue;
        }
        tmp[0] = code & 0xFF;
        tmp[1] = (code >> 8) & 0xFF;
        const char = decoder.decode(tmp);
        if (char && !map.has(char)) {
          map.set(char, code);
        }
      }
      return map;
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[npc] failed to build Big5 map', err);
      }
      return new Map();
    }
  })();
  return big5MapPromise;
}

async function encodeBig5Buffer(text) {
  const map = await buildBig5Map();
  const bytes = [];
  for (const ch of text) {
    const code = map.get(ch);
    if (code) {
      bytes.push(code & 0xFF, (code >> 8) & 0xFF);
    } else {
      const cp = ch.charCodeAt(0);
      if (cp < 0x80) {
        bytes.push(cp);
      } else {
        bytes.push(0x3F);
      }
    }
  }
  bytes.push(0);
  return new Uint8Array(bytes);
}

function decodePosComponent(value, type) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  let component;
  if (type === 'x') {
    component = value & 0xFFFF;
  } else {
    component = (value >> 16) & 0xFFFF;
  }
  if (component > 0x7FFF) {
    component -= 0x10000;
  }
  return component;
}

function getViewportOffsets(summary) {
  let viewportValue = summary && Number.isFinite(summary.viewport)
    ? summary.viewport
    : null;
  if (!Number.isFinite(viewportValue) && worldService && typeof worldService.getViewportComponent === 'function') {
    const component = worldService.getViewportComponent();
    if (component && Number.isFinite(component.value)) {
      viewportValue = component.value;
    }
  }
  if (!Number.isFinite(viewportValue) && worldService && typeof worldService.getViewportValue === 'function') {
    const fallback = worldService.getViewportValue();
    if (Number.isFinite(fallback)) {
      viewportValue = fallback;
    }
  }
  if (Number.isFinite(viewportValue) && typeof PAL_X === 'function' && typeof PAL_Y === 'function') {
    return {
      x: PAL_X(viewportValue),
      y: PAL_Y(viewportValue)
    };
  }
  return {
    x: decodePosComponent(viewportValue, 'x'),
    y: decodePosComponent(viewportValue, 'y')
  };
}


class NPCBehaviour {
  constructor(config = {}) {
    if (!config || !Number.isFinite(config.eventId)) {
      throw new TypeError('[npc] behaviour requires an eventId');
    }
    this.id = config.id || `npc:${config.eventId}`;
    this.name = config.name || this.id;
    this.sceneId = Number.isFinite(config.sceneId) ? config.sceneId : null;
    this.eventId = Math.trunc(config.eventId);
    this.description = config.description || '';
    this.tags = ensureArray(config.tags);
    this.metadata = config.metadata || {};
    this.state = {
      lastEvent: null,
      lastSeenAt: 0,
      lastSummary: null
    };
    const llmOptions = config.llm || {};
    this.llmState = {
      overrides: Object.assign({}, llmOptions),
      pending: null,
      queue: [],
      lastRequestedAt: 0
    };
  }

  matchScene(summary) {
    if (!this.sceneId) {
      return true;
    }
    const currentSceneId = summary && Number.isFinite(summary.sceneId)
      ? summary.sceneId
      : (typeof worldService?.getSceneId === 'function' ? worldService.getSceneId() : null);
    return currentSceneId === this.sceneId;
  }

  observe(summary) {
    if (!summary || !this.matchScene(summary)) {
      return null;
    }
    const events = Array.isArray(summary.sceneEvents) ? summary.sceneEvents : [];
    const eventEntry = events.find((entry) => Number(entry?.id) === this.eventId) || null;
    this.state.lastEvent = eventEntry;
    this.state.lastSeenAt = summary.timestamp || Date.now();
    this.state.lastSummary = summary;
    if (typeof this.afterObserve === 'function') {
      try {
        this.afterObserve(summary);
      } catch (err) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[npc] afterObserve failed for ${this.id}`, err);
        }
      }
    }
    return eventEntry;
  }

  afterObserve() {}

  plan() {
    return null;
  }

  _renderDialog(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return;
    }
    const summary = options.summary || this.state.lastSummary;
    const dialogStatus = summary && summary.dialog && summary.dialog.status
      ? summary.dialog.status
      : null;
    const latestLine = summary && summary.dialog ? summary.dialog.latest : null;
    encodeBig5Buffer(text).then((buffer) => {
      dialogService.clearInjectedLines((entry) => {
        return entry && Number(entry?.targetEventId) === this.eventId;
      });
      const metadata = Object.assign({
        source: this.id,
        npcId: this.id,
        eventObjectId: this.eventId,
        speaker: this.name,
        variant: options.variant ?? null,
        injected: true
      }, options.metadata);
      const distance = this._distanceToLeader(summary);
      const keyPress = typeof window !== 'undefined' && window.input ? window.input.keyPress : null;
      const needsCloseTrigger = Number.isFinite(distance) && distance <= this.thresholds.interceptRadius && keyPress === 0;
      if (!needsCloseTrigger) {
        return;
      }
      if (NpcDialogController && typeof NpcDialogController.enqueue === 'function') {
        const run = () => NpcDialogController.enqueue(buffer, {
          npcId: this.id,
          position: Number.isFinite(options.position) ? options.position : DialogPosition.Upper,
          autoAdvance: options.autoAdvance === true,
          holdMs: Number.isFinite(options.holdMs) ? options.holdMs : 1600,
          metadata
        });
        if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
          window.setTimeout(run, options.enqueueDelayMs ?? 0);
        } else {
          run();
        }
        return;
      }
      dialogService.queueInjectedLine({
        buffer,
        metadata,
        position: Number.isFinite(options.position) ? options.position : null,
        skipOriginal: !!options.skipOriginal,
        targetEventId: this.eventId,
        targetSceneId: this.sceneId,
        ttlMs: Number.isFinite(options.ttlMs) ? options.ttlMs : 1500
      });
    }).catch((err) => {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[npc] failed to queue custom dialog', err);
      }
    });
  }

  _getLeader(summary) {
    if (!summary || !Array.isArray(summary.party) || summary.party.length === 0) {
      return null;
    }
    return summary.party[0] || null;
  }

  _distanceToLeader(summary) {
    const leader = this._getLeader(summary);
    const eventState = this.state.lastEvent && this.state.lastEvent.state;
    if (!leader || !eventState) {
      return null;
    }
    const leaderLocalX = Number(leader.x);
    const leaderLocalY = Number(leader.y);
    const eventWorldX = Number(eventState.x);
    const eventWorldY = Number(eventState.y);
    const viewportOffsets = getViewportOffsets(summary);
    if (![
      leaderLocalX,
      leaderLocalY,
      eventWorldX,
      eventWorldY,
      viewportOffsets.x,
      viewportOffsets.y
    ].every((value) => Number.isFinite(value))) {
      return null;
    }
    const leaderWorldX = leaderLocalX + viewportOffsets.x;
    const leaderWorldY = leaderLocalY + viewportOffsets.y;
    const dx = (leaderWorldX - eventWorldX) / 32;
    const dy = (leaderWorldY - eventWorldY) / 32;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _speak(text, extras = {}) {
    if (!text || typeof text !== 'string') {
      return null;
    }
    return {
      type: 'npcSpeak',
      payload: Object.assign({
        npcId: this.id,
        eventId: this.eventId,
        sceneId: this.sceneId,
        speaker: this.name,
        text: text.trim()
      }, extras)
    };
  }


  describe() {
    return {
      id: this.id,
      name: this.name,
      sceneId: this.sceneId,
      eventId: this.eventId,
      tags: this.tags,
      description: this.description,
      lastSeenAt: this.state.lastSeenAt,
      hasEvent: !!this.state.lastEvent
    };
  }

  _getLLMSettings() {
    const base = readNpcLLMConfig();
    const overrides = (this.llmState && this.llmState.overrides) || {};
    const enabled = typeof overrides.enabled === 'boolean' ? overrides.enabled : base.enabled;
    const model = overrides.model || overrides.llmModel || base.model;
    const temperature = typeof overrides.temperature === 'number' ? overrides.temperature : base.temperature;
    const cooldownMs = Number.isFinite(overrides.cooldownMs) ? overrides.cooldownMs : base.cooldownMs;
    return { enabled, model, temperature, cooldownMs };
  }

  _isLLMEnabled() {
    const settings = this._getLLMSettings();
    return !!(settings.enabled && (settings.model || settings.model === '') && typeof runQwen === 'function');
  }

  _ensureLLMGeneration(context = {}) {
    if (!this._isLLMEnabled()) {
      return;
    }
    const state = this.llmState;
    const settings = this._getLLMSettings();
    if (state.pending) {
      return;
    }
    const now = Date.now();
    if (now - state.lastRequestedAt < settings.cooldownMs) {
      return;
    }
    const prompt = this._buildLLMPrompt(context);
    if (!prompt) {
      return;
    }
    state.lastRequestedAt = now;
    if (typeof console !== 'undefined' && console.debug) {
      console.debug(`[npc:${this.id}] llm prompt`, prompt);
    }
    state.pending = runQwen({
      prompt,
      model: settings.model || undefined,
      options: {
        temperature: settings.temperature
      }
    }).then((text) => {
      const normalized = this._normalizeLLMLine(text);
      if (normalized) {
        state.queue.push(normalized);
        if (typeof console !== 'undefined' && console.debug) {
          console.debug(`[npc:${this.id}] llm response`, normalized);
        }
      }
    }).catch((err) => {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`[npc:${this.id}] llm generation failed`, err);
      }
    }).finally(() => {
      state.pending = null;
    });
  }

  _consumeLLMLine(context = {}) {
    if (!this._isLLMEnabled() || !this.llmState) {
      return null;
    }
    if (this.llmState.queue && this.llmState.queue.length) {
      return this.llmState.queue.shift();
    }
    this._ensureLLMGeneration(context);
    return null;
  }

  _buildLLMPrompt(context = {}) {
    const summary = context.summary || this.state.lastSummary || {};
    const sceneId = summary.sceneId != null ? `Scene ${summary.sceneId}` : 'current scene';
    const dialogHistory = Array.isArray(summary.dialog?.history)
      ? summary.dialog.history.slice(-3).map((entry) => {
          const speaker = entry?.speaker || entry?.source || '旁白';
          return `${speaker}：${entry?.text || ''}`.trim();
        }).filter(Boolean).join('\n')
      : '';
    const player = (summary.party || [])[0] || {};
    const playerInfo = player?.playerRole != null ? `Player role ${player.playerRole}` : 'Player';
    return [
      `你是 NPC ${this.name}，位置：${sceneId}。`,
      `玩家：${playerInfo}，距离约${context.distance != null ? context.distance.toFixed(1) : '未知'}格。`,
      dialogHistory ? `最近对白：\n${dialogHistory}` : '最近对白：暂无记录',
      '请用中文给出一句自然的对白，不要包含引号。'
    ].join('\n');
  }

  _normalizeLLMLine(text) {
    if (!text) {
      return null;
    }
    const normalized = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0];
    return normalized || null;
  }
}

class NPCRegistry {
  constructor() {
    this.behaviours = new Map();
  }

  register(behaviour) {
    if (!behaviour || !behaviour.eventId) {
      return;
    }
    const key = behaviour.id || `npc:${behaviour.eventId}`;
    if (this.behaviours.has(key)) {
      console.warn('[npc] duplicate behaviour id', key);
    }
    this.behaviours.set(key, behaviour);
  }

  observe(summary) {
    this.behaviours.forEach((behaviour) => {
      try {
        behaviour.observe(summary);
      } catch (err) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[npc] observe failed', behaviour.id, err);
        }
      }
    });
  }

  plan(summary) {
    const actions = [];
    this.behaviours.forEach((behaviour) => {
      try {
        const result = behaviour.plan(summary);
        if (!result) {
          return;
        }
        if (Array.isArray(result)) {
          result.filter(Boolean).forEach((action) => actions.push(action));
        } else {
          actions.push(result);
        }
      } catch (err) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[npc] plan failed', behaviour.id, err);
        }
      }
    });
    return actions;
  }

  list() {
    return Array.from(this.behaviours.values()).map((behaviour) => behaviour.describe());
  }
}

class LiDaNiangBehaviour extends NPCBehaviour {
  constructor() {
    super({
      id: 'npc:li-daniang',
      name: '李大娘',
      sceneId: 16,
      eventId: 229,
      description: '酒馆开场剧情中的李大娘，负责对白与动作提示。',
      tags: ['tutorial', 'support']
    });
    this.flags = {
      greeted: false,
      lastPromptTs: 0
    };
  }

  afterObserve(summary) {
    if (!this.state.lastEvent || !summary?.dialog?.latest) {
      return;
    }
    const sourceName = summary.dialog.latest?.source || '';
    if (sourceName.includes(this.name)) {
      this.flags.greeted = true;
      this.flags.lastPromptTs = summary.timestamp || Date.now();
    }
  }

  plan() {
    const summary = this.state.lastSummary;
    if (!summary || !this.matchScene(summary)) {
      return null;
    }
    const eventState = this.state.lastEvent && this.state.lastEvent.state;
    if (!eventState) {
      return null;
    }
    const dialogStatus = summary.dialog?.status || {};
    if (dialogStatus.active && dialogStatus.awaitingInput) {
      return null;
    }
    const distance = this._distanceToLeader(summary);
    if (!Number.isFinite(distance) || distance > 96) {
      return null;
    }
    const now = summary.timestamp || Date.now();
    if (!this.flags.greeted) {
      this.flags.greeted = true;
      this.flags.lastPromptTs = now;
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[npc:li-daniang] greet player');
      }
      return this._speak('小李子，快去端酒菜！');
    }
    if (now - this.flags.lastPromptTs > 10000) {
      this.flags.lastPromptTs = now;
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[npc:li-daniang] reminder');
      }
      return this._speak('动作麻利些，菜都要凉了！');
    }
    return null;
  }
}

class AZhuBehaviour extends NPCBehaviour {
  constructor() {
    super({
      id: 'npc:a-zhu',
      name: '阿珠',
      sceneId: 4,
      eventId: 88,
      description: '村口哄孩子的阿珠，会在主角经过时闲聊几句。',
      tags: ['villager', 'flavor']
    });
    this.lines = [
      '咕咕，快快吃，快快長大喔！',
      '村口風大，把衣服穿暖點，別著涼啦。',
      '小李哥，勞煩幫我向李大娘問聲好。',
      '最近山下不太平，出門記得多帶些草藥。'
    ];
    this.flags = {
      lastLineTs: 0,
      nextIndex: 0,
      awaitingIntercept: false
    };
    this.thresholds = {
      interceptRadius: 6,
      ambientRadius: 6
    };
  }

  afterObserve(summary) {
    if (!summary || !summary.dialog || !summary.dialog.latest) {
      return;
    }
    const latest = summary.dialog.latest;
    if (latest?.metadata && latest.metadata.injected) {
      return;
    }
    const matches = latest.eventObjectId === this.eventId
      || (typeof latest.source === 'string' && latest.source.includes(`event-${this.eventId}`))
      || (typeof latest.source === 'string' && latest.source.includes(this.name));
    if (matches) {
      this.flags.awaitingIntercept = true;
    }
  }

  plan() {
    const summary = this.state.lastSummary;
    if (!summary || !this.matchScene(summary)) {
      return null;
    }
    const eventState = this.state.lastEvent && this.state.lastEvent.state;
    if (!eventState) {
      return null;
    }
    const dialogStatus = summary.dialog?.status || {};
    const latestLine = summary.dialog?.latest;
    if (this.flags.awaitingIntercept && latestLine) {
      const now = summary.timestamp || Date.now();
      if (now - this.flags.lastLineTs < 3000) {
        return null;
      }
      const distance = this._distanceToLeader(summary);
      if (!Number.isFinite(distance) || distance > this.thresholds.interceptRadius) {
        return null;
      }
      this.flags.awaitingIntercept = false;
      const llmLine = this._consumeLLMLine({ summary, mode: 'intercept', distance });
      if (!llmLine) {
        this._ensureLLMGeneration({ summary, mode: 'intercept', distance });
      }
      const interceptLine = llmLine || this.lines[this.flags.nextIndex % this.lines.length];
      this.flags.nextIndex += 1;
      this._renderDialog(interceptLine, {
        position: DialogPosition.Upper,
        metadata: {
          variant: this.flags.nextIndex,
          mood: 'intercept'
        },
        summary
      });
      this.flags.lastLineTs = now;
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[npc:a-zhu] intercept', { line: interceptLine });
      }
      return null;
    }
    if (dialogStatus.active && dialogStatus.awaitingInput) {
      return null;
    }
    const distance = this._distanceToLeader(summary);
    if (!Number.isFinite(distance) || distance > this.thresholds.ambientRadius) {
      return null;
    }
    const now = summary.timestamp || Date.now();
    if (now - this.flags.lastLineTs < 3000) {
      return null;
    }
    this.flags.lastLineTs = now;
    const llmLine = this._consumeLLMLine({ summary, mode: 'ambient', distance });
    if (!llmLine) {
      this._ensureLLMGeneration({ summary, mode: 'ambient', distance });
    }
    const line = llmLine || this.lines[this.flags.nextIndex % this.lines.length];
    this.flags.nextIndex += 1;
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[npc:a-zhu] speak', {
        line,
        distance,
        variant: this.flags.nextIndex
      });
    }
    return this._speak(line, { mood: 'gentle', variant: this.flags.nextIndex });
  }
}

const npcRegistry = new NPCRegistry();
npcRegistry.register(new LiDaNiangBehaviour());
npcRegistry.register(new AZhuBehaviour());

if (typeof window !== 'undefined') {
  window.NPC_BEHAVIOURS = npcRegistry;
}

export { NPCBehaviour, NPCRegistry, LiDaNiangBehaviour };
export default npcRegistry;
