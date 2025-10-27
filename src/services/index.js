import storageService from './storage-service.js';
import stateService from './state-service.js';
import resourceService from './resource-service.js';
import scriptService from './script-service.js';
import battleService from './battle-service.js';
import worldService from './world-service.js';

const services = {
  storage: storageService,
  state: stateService,
  resource: resourceService,
  script: scriptService,
  battle: battleService,
  world: worldService
};

export { storageService, stateService, resourceService, scriptService, battleService, worldService };
export default services;
