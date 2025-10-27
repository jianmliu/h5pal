const DEFAULT_COMPONENT_FACTORY = () => new Map();

class EntityRegistry {
  constructor(options = {}) {
    this._nextEntityId = 1;
    this._entities = new Set();
    this._componentStores = new Map();
    this._tags = new Map();
    this._entityTags = new Map();
    this._createComponentStore = options.createComponentStore || DEFAULT_COMPONENT_FACTORY;
  }

  createEntity(metadata) {
    const entityId = this._nextEntityId++;
    this._entities.add(entityId);
    if (metadata && metadata.tags) {
      const tags = Array.isArray(metadata.tags) ? metadata.tags : [metadata.tags];
      tags.forEach((tag) => this.tagEntity(entityId, tag));
    }
    return entityId;
  }

  destroyEntity(entityId) {
    if (!this._entities.has(entityId)) {
      return false;
    }
    this._entities.delete(entityId);
    this._componentStores.forEach((store) => store.delete(entityId));
    const entityTagSet = this._entityTags.get(entityId);
    if (entityTagSet) {
      entityTagSet.forEach((tag) => {
        const tagged = this._tags.get(tag);
        if (tagged) {
          tagged.delete(entityId);
          if (tagged.size === 0) {
            this._tags.delete(tag);
          }
        }
      });
      this._entityTags.delete(entityId);
    }
    return true;
  }

  clear() {
    this._entities.clear();
    this._componentStores.clear();
    this._tags.clear();
    this._entityTags.clear();
    this._nextEntityId = 1;
  }

  hasEntity(entityId) {
    return this._entities.has(entityId);
  }

  tagEntity(entityId, tag) {
    if (!this._entities.has(entityId) || !tag) {
      return;
    }
    let tagged = this._tags.get(tag);
    if (!tagged) {
      tagged = new Set();
      this._tags.set(tag, tagged);
    }
    tagged.add(entityId);

    let entityTags = this._entityTags.get(entityId);
    if (!entityTags) {
      entityTags = new Set();
      this._entityTags.set(entityId, entityTags);
    }
    entityTags.add(tag);
  }

  getEntitiesByTag(tag) {
    const tagged = this._tags.get(tag);
    if (!tagged) {
      return [];
    }
    return Array.from(tagged);
  }

  _getStore(componentName) {
    if (!componentName) {
      throw new Error('componentName is required');
    }
    let store = this._componentStores.get(componentName);
    if (!store) {
      store = this._createComponentStore(componentName);
      this._componentStores.set(componentName, store);
    }
    return store;
  }

  addComponent(entityId, componentName, data) {
    if (!this._entities.has(entityId)) {
      throw new Error(`Entity ${entityId} does not exist`);
    }
    const store = this._getStore(componentName);
    store.set(entityId, data);
    return data;
  }

  getComponent(entityId, componentName) {
    const store = this._componentStores.get(componentName);
    if (!store) {
      return undefined;
    }
    return store.get(entityId);
  }

  updateComponent(entityId, componentName, updater) {
    const store = this._componentStores.get(componentName);
    if (!store || !store.has(entityId) || typeof updater !== 'function') {
      return undefined;
    }
    const previous = store.get(entityId);
    const next = updater(previous);
    if (typeof next !== 'undefined') {
      store.set(entityId, next);
      return next;
    }
    return previous;
  }

  removeComponent(entityId, componentName) {
    const store = this._componentStores.get(componentName);
    if (!store) {
      return false;
    }
    return store.delete(entityId);
  }

  iterateEntitiesWith(componentNames) {
    const names = Array.isArray(componentNames) ? componentNames : [componentNames];
    if (names.length === 0) {
      return [];
    }
    const primaryStore = this._componentStores.get(names[0]);
    if (!primaryStore) {
      return [];
    }
    const result = [];
    primaryStore.forEach((_, entityId) => {
      if (!this._entities.has(entityId)) {
        return;
      }
      for (let i = 1; i < names.length; i++) {
        const store = this._componentStores.get(names[i]);
        if (!store || !store.has(entityId)) {
          return;
        }
      }
      result.push(entityId);
    });
    return result;
  }
}

export function createEntityRegistry(options) {
  return new EntityRegistry(options);
}

export { EntityRegistry };
export default createEntityRegistry;
