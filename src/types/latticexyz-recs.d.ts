declare module '@latticexyz/recs' {
  export type Component = unknown;
  export type Entity = number;
  export type World = unknown;
  export function defineComponent(world: World, schema?: unknown): Component;
  export function createWorld(): World;
}
