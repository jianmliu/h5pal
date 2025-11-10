const trace = typeof window !== 'undefined'
  && window.PAL_DEBUG
  && window.PAL_DEBUG.traceModules
  ? console.trace.bind(console)
  : () => {};

export default trace;
