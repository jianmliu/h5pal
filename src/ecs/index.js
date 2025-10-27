import createEntityRegistry, { EntityRegistry } from './entity-registry.js';
import {
  COMPONENTS as BattleComponents,
  TAGS as BattleTags,
  createBattleActorComponent,
  createTimeComponent,
  createStatsComponent,
  createStatusComponent,
  createPositionComponent,
  createSpriteComponent,
  createAnimationComponent,
  createCommandComponent,
  createQueueEntryComponent,
  createUIStateComponent
} from './components/battle.js';
import {
  COMPONENTS as WorldComponents,
  createViewportComponent,
  createPartyMemberComponent,
  createTrailComponent,
  createEventObjectComponent,
  createSceneComponent,
  createMapMetaComponent,
  createMapTileComponent,
  createNpcStateComponent,
  createScriptRegisterComponent
} from './components/world.js';

export const ECSComponents = {
  Battle: BattleComponents,
  World: WorldComponents
};

export const ECSTags = {
  Battle: BattleTags
};

export {
  createEntityRegistry,
  EntityRegistry,
  BattleComponents,
  BattleTags,
  createBattleActorComponent,
  createTimeComponent,
  createStatsComponent,
  createStatusComponent,
  createPositionComponent,
  createSpriteComponent,
  createAnimationComponent,
  createCommandComponent,
  createQueueEntryComponent,
  createUIStateComponent,
  WorldComponents,
  createViewportComponent,
  createPartyMemberComponent,
  createTrailComponent,
  createEventObjectComponent,
  createSceneComponent,
  createMapMetaComponent,
  createMapTileComponent,
  createNpcStateComponent,
  createScriptRegisterComponent
};

export default {
  createEntityRegistry,
  EntityRegistry,
  BattleComponents,
  BattleTags,
  createBattleActorComponent,
  createTimeComponent,
  createStatsComponent,
  createStatusComponent,
  createPositionComponent,
  createSpriteComponent,
  createAnimationComponent,
  createCommandComponent,
  createQueueEntryComponent,
  createUIStateComponent,
  WorldComponents,
  createViewportComponent,
  createPartyMemberComponent,
  createTrailComponent,
  createEventObjectComponent,
  createSceneComponent,
  createMapMetaComponent,
  createMapTileComponent,
  createNpcStateComponent,
  createScriptRegisterComponent
};
