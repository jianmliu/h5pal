// Minimal shims for legacy PAL JS modules referenced from TS.
declare module './util-trace.js' {
  const traceModuleLoad: (module: string) => void;
  export default traceModuleLoad;
}

declare module './mkf.js' {
  const MKF: any;
  export default MKF;
}

declare module './config.js' {
  const config: Record<string, unknown>;
  export default config;
}

declare module './play.js' {
  const play: Record<string, unknown>;
  export default play;
}

declare module './res.js' {
  const res: Record<string, unknown>;
  export default res;
}

declare module './uigame.js' {
  const uigame: Record<string, unknown>;
  export default uigame;
}

declare module './script.js' {
  const scriptModule: Record<string, unknown>;
  export default scriptModule;
}
