import storageService from './storage-service.js';
import stateService from './state-service.js';
import resourceService from './resource-service.js';
import scriptService from './script-service.js';

const services = {
  storage: storageService,
  state: stateService,
  resource: resourceService,
  script: scriptService
};

export { storageService, stateService, resourceService, scriptService };
export default services;
