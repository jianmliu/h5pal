import utils from '../js/pal/utils.js';

class EventBus {
  constructor() {
    utils.extend(this, utils.Events);
  }
}

export default EventBus;
