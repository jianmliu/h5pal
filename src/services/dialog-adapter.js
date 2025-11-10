import reactiveContext from '../state/reactive-context.js';
import dialogService from './dialog-service.js';
import { createAdapterObservable } from './adapter-helpers.js';

const currentLine$ = createAdapterObservable({
  name: 'dialog.currentLine',
  signal: dialogService.signals.currentLine
});

const history$ = createAdapterObservable({
  name: 'dialog.history',
  signal: dialogService.signals.history
});

const status$ = createAdapterObservable({
  name: 'dialog.status',
  signal: dialogService.signals.status
});

const choice$ = createAdapterObservable({
  name: 'dialog.choice',
  signal: dialogService.signals.choice
});

function subscribe(listener) {
  const subscription = reactiveContext.signalToObservable(dialogService.signals.currentLine).subscribe(listener);
  return () => {
    if (subscription && typeof subscription.unsubscribe === 'function') {
      subscription.unsubscribe();
    }
  };
}

export {
  currentLine$,
  history$,
  status$,
  choice$,
  subscribe
};

export default {
  getCurrentLine: dialogService.getCurrentLine,
  currentLine$,
  history$,
  status$,
  choice$,
  subscribe
};
