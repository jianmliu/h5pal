declare module '../state/slices/scene-table.js' {
  export function getSceneTableValue<T>(fallback: T): T;
  export function sceneTableSignal<T>(initial: T): any;
}
