import { EMPTY, Observable } from 'rxjs';
import {
  createWorld,
  defineComponent,
  getComponentValue,
  hasComponent,
  removeComponent,
  setComponent,
  Type,
  updateComponent
} from '@latticexyz/recs';

const world = createWorld();
const entityCache = new Map();

function ensureEntity(key) {
  if (!key) {
    throw new Error('[ecs-context] entity key is required');
  }
  if (!entityCache.has(key)) {
    world.registerEntity({ id: key });
    entityCache.set(key, key);
  }
  return entityCache.get(key);
}

const components = Object.freeze({
  playerState: defineComponent(
    world,
    {
      x: Type.OptionalNumber,
      y: Type.OptionalNumber,
      direction: Type.OptionalNumber,
      followers: Type.OptionalNumber,
      updatedAt: Type.OptionalNumber
    },
    { id: 'PlayerState' }
  ),
  dialogState: defineComponent(
    world,
    {
      active: Type.Boolean,
      awaitingInput: Type.Boolean,
      needsAdvance: Type.Boolean,
      lastMsgId: Type.OptionalNumber,
      position: Type.OptionalNumber,
      updatedAt: Type.OptionalNumber
    },
    { id: 'DialogState' }
  ),
  npcBehavior: defineComponent(
    world,
    {
      npcId: Type.OptionalString,
      speaker: Type.OptionalString,
      lastLine: Type.OptionalString,
      lastSpokenAt: Type.OptionalNumber,
      state: Type.OptionalString
    },
    { id: 'NpcBehavior' }
  ),
  mudRecord: defineComponent(
    world,
    {
      tableId: Type.OptionalString,
      tableName: Type.OptionalString,
      key: Type.OptionalString,
      valueJson: Type.OptionalString
    },
    { id: 'MudRecord' }
  )
});

const entities = Object.freeze({
  player: ensureEntity('entity:player'),
  dialog: ensureEntity('entity:dialog')
});

function mergeComponentValue(component, entity, patch) {
  if (!component || !entity || !patch || typeof patch !== 'object') {
    return;
  }
  if (hasComponent(component, entity)) {
    updateComponent(component, entity, patch);
  } else {
    setComponent(component, entity, patch);
  }
}

function writePlayerState(patch = {}) {
  const payload = Object.assign({ updatedAt: Date.now() }, patch);
  mergeComponentValue(components.playerState, entities.player, payload);
}

function writeDialogState(patch = {}) {
  const payload = Object.assign({ updatedAt: Date.now() }, patch);
  mergeComponentValue(components.dialogState, entities.dialog, payload);
}

function writeNpcBehavior(npcId, patch = {}) {
  if (!npcId) {
    return;
  }
  const entity = ensureEntity(`npc:${npcId}`);
  const payload = Object.assign({ npcId, lastSpokenAt: Date.now() }, patch);
  mergeComponentValue(components.npcBehavior, entity, payload);
}

function writeMudRecord({ tableId, tableName, keyTuple = [], record }) {
  if (!tableId) {
    return;
  }
  const key = Array.isArray(keyTuple) && keyTuple.length ? keyTuple.join(',') : '::';
  const entity = ensureEntity(`mud:${tableId}:${key}`);
  mergeComponentValue(components.mudRecord, entity, {
    tableId,
    tableName: tableName || '',
    key,
    valueJson: JSON.stringify(record ?? {})
  });
}

function removeMudRecord(tableId, keyTuple = []) {
  if (!tableId) {
    return;
  }
  const key = Array.isArray(keyTuple) && keyTuple.length ? keyTuple.join(',') : '::';
  const entity = ensureEntity(`mud:${tableId}:${key}`);
  if (hasComponent(components.mudRecord, entity)) {
    removeComponent(components.mudRecord, entity);
  }
}

function componentObservable(component, entity) {
  if (!component || !entity) {
    return EMPTY;
  }
  return new Observable((subscriber) => {
    const initialValue = getComponentValue(component, entity);
    if (initialValue !== undefined) {
      subscriber.next(initialValue);
    }
    const subscription = component.update$.subscribe((update) => {
      if (update.entity !== entity) {
        return;
      }
      subscriber.next(update.value);
    });
    return () => subscription.unsubscribe();
  });
}

export default {
  world,
  components,
  entities,
  ensureEntity,
  writePlayerState,
  writeDialogState,
  writeNpcBehavior,
  writeMudRecord,
  removeMudRecord,
  componentObservable
};

export {
  world as ecsWorld,
  components as ecsComponents,
  entities as ecsEntities,
  ensureEntity as ensureEcsEntity,
  writePlayerState,
  writeDialogState,
  writeNpcBehavior,
  writeMudRecord,
  removeMudRecord,
  componentObservable
};
