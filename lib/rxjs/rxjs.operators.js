define(['rxjs'], function(rxBundle) {
  var rx = rxBundle || (typeof rxjs !== 'undefined' ? rxjs : null);
  if (!rx || !rx.operators) {
    throw new Error('[rxjs/operators] missing operators export from rxjs.umd.min');
  }
  return rx.operators;
});
