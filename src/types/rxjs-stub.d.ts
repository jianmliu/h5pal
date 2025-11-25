declare module 'rxjs' {
  export const EMPTY: any;
  export const of: any;
  export const from: any;
  export const Subject: any;
  export class BehaviorSubject<T = any> {
    constructor(value?: T);
    value: T;
    next(value: T): void;
    subscribe(...args: any[]): Subscription;
  }
  export class Observable<T = any> {
    constructor(subscribe?: (...args: any[]) => any);
    subscribe(...args: any[]): Subscription;
  }
  export class Subscription {
    unsubscribe(): void;
  }
}
