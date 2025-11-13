export function getMudConfig() {
  if (typeof window !== 'undefined') {
    const cfg = window.PAL_CONFIG?.mud;
    if (cfg && cfg.rpcUrl && cfg.wsUrl && cfg.worldAddress) {
      return cfg;
    }
  }
  throw new Error('[mud-config] PAL_CONFIG.mud (rpcUrl/wsUrl/worldAddress) must be provided');
}
