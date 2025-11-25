export type EventDispatcher = {
  fire?: (...args: unknown[]) => unknown;
  on?: (...args: unknown[]) => unknown;
  off?: (...args: unknown[]) => unknown;
  extend?: (target: unknown, source: unknown) => void;
};
declare const utils: EventDispatcher & { Events?: EventDispatcher };
export default utils;
