import storageService from './storage-service.js';
import stateService from './state-service.js';

const services = {
  storage: storageService,
  state: stateService
};

export { storageService, stateService };
export default services;
