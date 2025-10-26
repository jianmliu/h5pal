import storageService from './storage-service.js';
import stateService from './state-service.js';
import resourceService from './resource-service.js';

const services = {
  storage: storageService,
  state: stateService,
  resource: resourceService
};

export { storageService, stateService, resourceService };
export default services;
