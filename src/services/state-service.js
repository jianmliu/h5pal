import EventBus from './event-bus.js';

class StateService extends EventBus {
  getGlobal(key) {
    return key ? Global[key] : Global;
  }

  setGlobal(key, value) {
    const previous = Global[key];
    Global[key] = value;
    this.fire('globalChanged', { key, previous, value });
    return value;
  }

  updateGlobal(patch) {
    Object.keys(patch).forEach((key) => {
      this.setGlobal(key, patch[key]);
    });
  }

  getGameData(key) {
    return key ? GameData[key] : GameData;
  }

  setGameData(key, value) {
    const previous = GameData[key];
    GameData[key] = value;
    this.fire('gameDataChanged', { key, previous, value });
    return value;
  }

  updateGameData(patch) {
    Object.keys(patch).forEach((key) => {
      this.setGameData(key, patch[key]);
    });
  }
}

const stateService = new StateService();

export { StateService };
export default stateService;
