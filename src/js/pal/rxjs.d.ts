declare module 'rxjs' {
  export class Observable<T = any> {
    constructor(subscriber: (observer: { next: (value: T) => void; complete: () => void }) => (() => void) | void);
    subscribe: (...args: any[]) => any;
  }
}
