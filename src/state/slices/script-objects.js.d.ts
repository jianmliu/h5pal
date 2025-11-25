export type Signal<T> = {
  value: T;
  subscribe: (listener: (value: T) => void) => { unsubscribe?: () => void } | (() => void);
};

export type ScriptEntries = Record<string, unknown>[];
export type ObjectTable = Record<string, unknown>[];
export type ObjectDesc = Array<{ id: number; desc: Uint8Array } | null> | null;

export function scriptObjectSignals(): {
  scriptEntries: Signal<ScriptEntries>;
  objectTable: Signal<ObjectTable>;
  objectDesc: Signal<ObjectDesc | undefined>;
};

export function resetScriptObjectSlice(): void;
export const updateScriptEntriesValue: (updater: ((current: ScriptEntries) => ScriptEntries) | ScriptEntries, options?: any) => void;
export const updateObjectTableValue: (updater: ((current: ObjectTable) => ObjectTable) | ObjectTable, options?: any) => void;
export const updateObjectDescValue: (updater: ((current: ObjectDesc | undefined) => ObjectDesc | undefined) | ObjectDesc | undefined, options?: any) => void;
