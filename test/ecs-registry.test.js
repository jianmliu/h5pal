import { describe, expect, it } from 'vitest';
import { createEntityRegistry } from '../src/ecs/index.js';

describe('EntityRegistry', () => {
  it('creates and destroys entities', () => {
    const registry = createEntityRegistry();
    const entity = registry.createEntity();
    expect(registry.hasEntity(entity)).toBe(true);
    registry.destroyEntity(entity);
    expect(registry.hasEntity(entity)).toBe(false);
  });

  it('stores components and iterates by requirement', () => {
    const registry = createEntityRegistry();
    const e1 = registry.createEntity({ tags: 'player' });
    const e2 = registry.createEntity({ tags: ['enemy'] });

    registry.addComponent(e1, 'position', { x: 1, y: 2 });
    registry.addComponent(e1, 'time', { meter: 10 });
    registry.addComponent(e2, 'time', { meter: 5 });

    const players = registry.getEntitiesByTag('player');
    expect(players).toEqual([e1]);

    const withTime = registry.iterateEntitiesWith('time');
    expect(withTime).toEqual([e1, e2]);

    const withPositionAndTime = registry.iterateEntitiesWith(['position', 'time']);
    expect(withPositionAndTime).toEqual([e1]);
  });
});
