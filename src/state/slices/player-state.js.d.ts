export type Signal<T> = {
  value: T;
  subscribe: (listener: (value: T) => void) => { unsubscribe?: () => void } | (() => void);
};
export const playerStateSignals: any;
export const updatePlayerRolesValue: (updater: ((current: any) => any) | any, options?: any) => void;
export const updateEquipmentEffectValue: (updater: ((current: any) => any) | any, options?: any) => void;
export const resetPlayerStateSlice: () => void;
