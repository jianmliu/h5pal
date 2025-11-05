import storageService from './storage-service.js';
import stateService from './state-service.js';
import resourceService from './resource-service.js';
import scriptService from './script-service.js';
import battleService from './battle-service.js';
import worldService from './world-service.js';
import partyTrailAdapter from './party-trail-adapter.js';
import battleStateAdapter from './battle-state-adapter.js';
import scriptObjectAdapter from './script-object-adapter.js';
import sceneEventAdapter from './scene-event-adapter.js';
import battleFlagsAdapter from './battle-flags-adapter.js';
import saveDataAdapter from './save-data-adapter.js';
import sceneDataAdapter from './scene-data-adapter.js';

const services = {
  storage: storageService,
  state: stateService,
  resource: resourceService,
  script: scriptService,
  battle: battleService,
  world: worldService,
  adapters: {
    partyTrail: partyTrailAdapter,
    battleState: battleStateAdapter,
    scriptObjects: scriptObjectAdapter,
    sceneEvents: sceneEventAdapter,
    battleFlags: battleFlagsAdapter,
    saveData: saveDataAdapter,
    sceneData: sceneDataAdapter
  }
};

export {
  storageService,
  stateService,
  resourceService,
  scriptService,
  battleService,
  worldService,
  partyTrailAdapter,
  battleStateAdapter,
  scriptObjectAdapter,
  sceneEventAdapter,
  battleFlagsAdapter,
  saveDataAdapter,
  sceneDataAdapter
};
export default services;
