import reactiveContext from '../reactive-context.js';

const FRAME_COUNT_SIGNAL_KEY = 'world.frameCount.value';

let frameCountSubject = null;

function normalise(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return fallback;
}

function ensureFrameCountSubject(initialValue = 0) {
  if (!frameCountSubject || frameCountSubject.closed || frameCountSubject.isStopped) {
    const signal = reactiveContext.ensureSignal(FRAME_COUNT_SIGNAL_KEY, normalise(initialValue, 0));
    frameCountSubject = reactiveContext.createBehaviorStream(signal.value);
  }
  return frameCountSubject;
}

export function frameCountSignal(initialValue = 0) {
  return reactiveContext.ensureSignal(FRAME_COUNT_SIGNAL_KEY, normalise(initialValue, 0));
}

export function getFrameCountValue(initialValue = 0) {
  return frameCountSignal(initialValue).value;
}

export function frameCountStream(initialValue) {
  const baseline = normalise(
    typeof initialValue === 'undefined' ? getFrameCountValue(0) : initialValue,
    0
  );
  return ensureFrameCountSubject(baseline);
}

export function updateFrameCount(value, options = {}) {
  const resolved = normalise(value, 0);
  const previous = reactiveContext.getSignal(FRAME_COUNT_SIGNAL_KEY, resolved);
  const subject = ensureFrameCountSubject(previous);
  if (previous === resolved) {
    reactiveContext.setSignal(FRAME_COUNT_SIGNAL_KEY, resolved);
    return resolved;
  }
  reactiveContext.setSignal(FRAME_COUNT_SIGNAL_KEY, resolved);
  if (subject && typeof subject.getValue === 'function') {
    if (subject.getValue() !== resolved) {
      subject.next(resolved);
    }
  } else if (subject && typeof subject.next === 'function') {
    subject.next(resolved);
  }
  if (options.emitEvent !== false) {
    reactiveContext.rootEvent$.next({
      type: 'world/frameCount/set',
      value: resolved,
      previous,
      source: options.source || 'worldService'
    });
  }
  return resolved;
}

export function incrementFrameCount(delta = 1, options = {}) {
  const current = reactiveContext.getSignal(FRAME_COUNT_SIGNAL_KEY, 0);
  const adjustment = Number.isFinite(delta) ? delta : 0;
  return updateFrameCount(current + adjustment, options);
}

export function resetFrameCountSlice(defaultValue = 0) {
  if (frameCountSubject && typeof frameCountSubject.complete === 'function') {
    frameCountSubject.complete();
  }
  frameCountSubject = null;
  reactiveContext.setSignal(FRAME_COUNT_SIGNAL_KEY, normalise(defaultValue, 0));
}
