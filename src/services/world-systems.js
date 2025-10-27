import EventBus from './event-bus.js';
import collisionSystem from '../ecs/systems/collision-system.js';
import npcMoveSystem from '../ecs/systems/npc-move-system.js';
import renderMapSystem from '../ecs/systems/render-map-system.js';
import renderEventObjectSystem from '../ecs/systems/render-event-object-system.js';

const DEFAULT_PIPELINE = ['collision', 'movement', 'map', 'eventObjects'];

class WorldSystemManager extends EventBus {
  constructor(worldService, baseContext = {}) {
    super();
    this.worldService = worldService;
    this._systems = new Map();
    this._pipeline = DEFAULT_PIPELINE.slice();
    this._context = Object.assign({}, baseContext);
  }

  setContext(context) {
    this._context = context || {};
  }

  register(phase, systemFn) {
    if (!phase || typeof systemFn !== 'function') {
      throw new Error('phase and system function are required');
    }
    let list = this._systems.get(phase);
    if (!list) {
      list = [];
      this._systems.set(phase, list);
    }
    list.push(systemFn);
  }

  run(phase, context) {
    const systems = this._systems.get(phase);
    if (!systems || systems.length === 0) {
      return;
    }
    const runtime = Object.assign(
      {},
      this._context,
      context,
      {
        worldService: this.worldService,
        world: this.worldService
      }
    );
    for (let i = 0; i < systems.length; i++) {
      systems[i](runtime);
    }
  }

  runPipeline(phases, context) {
    let effective = phases;
    if (!effective) {
      effective = this._pipeline.slice();
    } else if (!Array.isArray(effective)) {
      effective = [effective];
    }
    for (let i = 0; i < effective.length; i++) {
      this.run(effective[i], context);
    }
  }

  clearPipeline() {
    this._pipeline = [];
  }
}

export default function createWorldSystemManager(options = {}) {
  const manager = new WorldSystemManager(options.worldService || null, options.context);
  manager.register('collision', collisionSystem);
  manager.register('movement', npcMoveSystem);
  manager.register('map', renderMapSystem);
  manager.register('eventObjects', renderEventObjectSystem);
  return manager;
}

export { renderMapSystem, renderEventObjectSystem, DEFAULT_PIPELINE };
