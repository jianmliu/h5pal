import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('config', () => {
  beforeEach(() => {
    vi.resetModules();
    delete globalThis.PAL_CONFIG;
  });

  it('uses defaults when no global override is provided', async () => {
    const config = (await import('../src/js/pal/config.js')).default;
    expect(config.assetBaseUrl).toBe('./pal-assets/');
    expect(config.enableAudio).toBe(false);
    expect(config.audioBaseUrl).toBeNull();
    expect(config.resolveAssetPath('DATA/SCENE.MKF')).toBe('./pal-assets/DATA/SCENE.MKF');
    expect(config.resolveAudioPath('battle.mp3')).toBeNull();
  });

  it('normalises custom configuration', async () => {
    globalThis.PAL_CONFIG = {
      assetBaseUrl: '/assets',
      audioBaseUrl: '/audio',
      enableAudio: true
    };
    const config = (await import('../src/js/pal/config.js')).default;
    expect(config.assetBaseUrl).toBe('/assets/');
    expect(config.audioBaseUrl).toBe('/audio/');
    expect(config.enableAudio).toBe(true);
    expect(config.resolveAssetPath('/sprites/ui.png')).toBe('/assets/sprites/ui.png');
    expect(config.resolveAudioPath('/battle/theme.mp3')).toBe('/audio/battle/theme.mp3');
  });
});
