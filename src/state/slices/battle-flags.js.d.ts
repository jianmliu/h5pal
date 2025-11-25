type Signal<T> = {
  value: T;
  subscribe: (listener: (value: T) => void) => { unsubscribe?: () => void } | (() => void);
};

export type BattleFlagSignals = {
  repeat: Signal<boolean>;
  force: Signal<boolean>;
  flee: Signal<boolean>;
  result: Signal<number>;
  phase: Signal<number>;
};

export function battleFlagSignals(): BattleFlagSignals;
export const updateBattleFlagsFromState: any;
export const resetBattleFlagsSlice: any;
