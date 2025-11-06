import storageService from './storage-service.js';
import stateService from './state-service.js';
import resourceService from './resource-service.js';
import scriptService from './script-service.js';
import battleService from './battle-service.js';
import worldService from './world-service.js';
import environmentAdapter from './environment-adapter.js';
import partyTrailAdapter from './party-trail-adapter.js';
import playerStateAdapter from './player-state-adapter.js';
import battleStateAdapter from './battle-state-adapter.js';
import scriptObjectAdapter from './script-object-adapter.js';
import sceneEventAdapter from './scene-event-adapter.js';
import battleFlagsAdapter from './battle-flags-adapter.js';
import gameFlagsAdapter from './game-flags-adapter.js';
import gameDataAdapter from './game-data-adapter.js';
import saveDataAdapter from './save-data-adapter.js';
import sceneDataAdapter from './scene-data-adapter.js';
import sceneStateAdapter from './scene-state-adapter.js';

/**
 * @typedef {'world'|'party'|'player'|'battle'|'scene'|'game'|'script'|'storage'} AdapterCategory
 */

/**
 * @typedef {Object} AdapterManifestEntry
 * @property {string} id
 * @property {AdapterCategory} category
 * @property {string} description
 * @property {string} primaryStream
 * @property {string[]} streams
 * @property {() => Promise<any>} load
 * @property {any|null} module
 */

function createManifestEntry({
  id,
  category,
  description,
  primaryStream,
  streams,
  module,
  importer
}) {
  let cache = module || null;
  return Object.freeze({
    id,
    category,
    description,
    primaryStream,
    streams: Array.isArray(streams) ? [...streams] : [],
    async load() {
      if (cache) {
        return cache;
      }
      const mod = await importer();
      cache = mod && mod.default ? mod.default : mod;
      return cache;
    },
    get module() {
      return cache;
    }
  });
}

const adapterManifest = Object.freeze({
  environment: createManifestEntry({
    id: 'environment',
    category: 'world',
    description: 'Viewport, palette, and fade flags that drive world rendering.',
    primaryStream: 'environment.viewport',
    streams: [
      'environment.viewport',
      'environment.partyOffset',
      'environment.partyDirection',
      'environment.currentSaveSlot',
      'environment.paletteId',
      'environment.screenWave',
      'environment.layer',
      'environment.nightPalette',
      'environment.needToFadeIn',
      'environment.waveProgression'
    ],
    module: environmentAdapter,
    importer: () => import('./environment-adapter.js')
  }),
  partyTrail: createManifestEntry({
    id: 'partyTrail',
    category: 'party',
    description: 'Party positions, trail history, and follower count.',
    primaryStream: 'partyTrail.party',
    streams: [
      'partyTrail.party',
      'partyTrail.trail',
      'partyTrail.followers'
    ],
    module: partyTrailAdapter,
    importer: () => import('./party-trail-adapter.js')
  }),
  playerState: createManifestEntry({
    id: 'playerState',
    category: 'player',
    description: 'Player role tables, equipment effects, and status matrices.',
    primaryStream: 'playerState.roles',
    streams: [
      'playerState.roles',
      'playerState.equipmentEffects',
      'playerState.status',
      'playerState.poisonStatus',
      'playerState.maxPartyIndex'
    ],
    module: playerStateAdapter,
    importer: () => import('./player-state-adapter.js')
  }),
  battleState: createManifestEntry({
    id: 'battleState',
    category: 'battle',
    description: 'Battle formations, audio selections, and live battle state.',
    primaryStream: 'battleState.state',
    streams: [
      'battleState.enemyTeam',
      'battleState.battleFields',
      'battleState.fieldId',
      'battleState.battleMusic',
      'battleState.musicTrack',
      'battleState.autoBattle',
      'battleState.state'
    ],
    module: battleStateAdapter,
    importer: () => import('./battle-state-adapter.js')
  }),
  battleFlags: createManifestEntry({
    id: 'battleFlags',
    category: 'battle',
    description: 'Flags toggled during battle (repeat/force/flee/result/phase).',
    primaryStream: 'battleFlags.state',
    streams: ['battleFlags.state'],
    module: battleFlagsAdapter,
    importer: () => import('./battle-flags-adapter.js')
  }),
  gameFlags: createManifestEntry({
    id: 'gameFlags',
    category: 'game',
    description: 'Global game flag values used by scripts and AI.',
    primaryStream: 'gameFlags.collect',
    streams: [
      'gameFlags.collect',
      'gameFlags.chaseRange',
      'gameFlags.chaseSpeedCycles',
      'gameFlags.battleSpeed'
    ],
    module: gameFlagsAdapter,
    importer: () => import('./game-flags-adapter.js')
  }),
  gameData: createManifestEntry({
    id: 'gameData',
    category: 'game',
    description: 'Lookup tables for magic, enemies, stores, experience, and level-up rewards.',
    primaryStream: 'gameData.magicTable',
    streams: [
      'gameData.magicTable',
      'gameData.storeTable',
      'gameData.enemyTable',
      'gameData.battleEffects',
      'gameData.expState',
      'gameData.levelUpExp',
      'gameData.levelUpMagic'
    ],
    module: gameDataAdapter,
    importer: () => import('./game-data-adapter.js')
  }),
  sceneState: createManifestEntry({
    id: 'sceneState',
    category: 'scene',
    description: 'Current scene id used by rendering and scripting subsystems.',
    primaryStream: 'scene.state.id',
    streams: ['scene.state.id'],
    module: sceneStateAdapter,
    importer: () => import('./scene-state-adapter.js')
  }),
  sceneData: createManifestEntry({
    id: 'sceneData',
    category: 'scene',
    description: 'Scene metadata table (map id, trigger scripts, event ranges).',
    primaryStream: 'scene.data.table',
    streams: ['scene.data.table'],
    module: sceneDataAdapter,
    importer: () => import('./scene-data-adapter.js')
  }),
  sceneEvents: createManifestEntry({
    id: 'sceneEvents',
    category: 'scene',
    description: 'Event objects, collision state, and versioning for the active scene.',
    primaryStream: 'scene.events.objects',
    streams: [
      'scene.events.id',
      'scene.events.objects',
      'scene.events.collision',
      'scene.events.version'
    ],
    module: sceneEventAdapter,
    importer: () => import('./scene-event-adapter.js')
  }),
  scriptObjects: createManifestEntry({
    id: 'scriptObjects',
    category: 'script',
    description: 'Script entry table, object metadata, and description strings.',
    primaryStream: 'scriptObjects.entries',
    streams: [
      'scriptObjects.entries',
      'scriptObjects.objectTable',
      'scriptObjects.objectDesc'
    ],
    module: scriptObjectAdapter,
    importer: () => import('./script-object-adapter.js')
  }),
  saveData: createManifestEntry({
    id: 'saveData',
    category: 'storage',
    description: 'Synchronous helpers for save-game payloads (no observable streams yet).',
    primaryStream: '',
    streams: [],
    module: saveDataAdapter,
    importer: () => import('./save-data-adapter.js')
  })
});

const services = {
  storage: storageService,
  state: stateService,
  resource: resourceService,
  script: scriptService,
  battle: battleService,
  world: worldService,
  adapters: {
    environment: environmentAdapter,
    partyTrail: partyTrailAdapter,
    playerState: playerStateAdapter,
    battleState: battleStateAdapter,
    scriptObjects: scriptObjectAdapter,
    sceneEvents: sceneEventAdapter,
    sceneState: sceneStateAdapter,
    battleFlags: battleFlagsAdapter,
    gameFlags: gameFlagsAdapter,
    gameData: gameDataAdapter,
    saveData: saveDataAdapter,
    sceneData: sceneDataAdapter
  },
  adapterManifest
};

export {
  storageService,
  stateService,
  resourceService,
  scriptService,
  battleService,
  worldService,
  environmentAdapter,
  partyTrailAdapter,
  playerStateAdapter,
  battleStateAdapter,
  scriptObjectAdapter,
  sceneEventAdapter,
  sceneStateAdapter,
  battleFlagsAdapter,
  gameFlagsAdapter,
  gameDataAdapter,
  saveDataAdapter,
  sceneDataAdapter,
  adapterManifest
};

export default services;
