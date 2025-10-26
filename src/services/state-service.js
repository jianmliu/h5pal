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

  mutateGlobal(key, mutator) {
    const current = Global[key];
    const result = mutator ? mutator(current) : current;
    if (typeof result !== 'undefined' && result !== current) {
      return this.setGlobal(key, result);
    }
    this.fire('globalChanged', { key, previous: current, value: current });
    return current;
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

  mutateGameData(key, mutator) {
    const current = GameData[key];
    const result = mutator ? mutator(current) : current;
    if (typeof result !== 'undefined' && result !== current) {
      return this.setGameData(key, result);
    }
    this.fire('gameDataChanged', { key, previous: current, value: current });
    return current;
  }
}

const stateService = new StateService();

export { StateService };
export default stateService;
