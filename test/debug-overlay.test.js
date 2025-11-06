import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const OVERLAY_ID = 'pal-debug-overlay';

describe('debug-overlay module', () => {
  let overlay;
  let originalRequestAnimationFrame;
  let originalCancelAnimationFrame;
  let rafCallbacks;

  beforeEach(async () => {
    vi.resetModules();
    rafCallbacks = [];
    originalRequestAnimationFrame = global.requestAnimationFrame;
    originalCancelAnimationFrame = global.cancelAnimationFrame;
    global.requestAnimationFrame = vi.fn((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    global.cancelAnimationFrame = vi.fn();
    const module = await import('../src/js/pal/debug-overlay.js');
    overlay = module.default || module;
  });

  afterEach(() => {
    if (overlay && typeof overlay.stopOverlay === 'function') {
      overlay.stopOverlay();
    }
    document.getElementById(OVERLAY_ID)?.remove();
    global.requestAnimationFrame = originalRequestAnimationFrame;
    global.cancelAnimationFrame = originalCancelAnimationFrame;
    vi.resetModules();
    overlay = undefined;
  });

  it('starts overlay loop and renders summary', () => {
    overlay.startOverlay();
    const element = document.getElementById(OVERLAY_ID);
    expect(element).toBeTruthy();
    expect(global.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(rafCallbacks.length).toBe(1);

    // Simulate a frame tick.
    const firstCallback = rafCallbacks[0];
    firstCallback();

    expect(document.getElementById(OVERLAY_ID).textContent).toContain('Scene');

    overlay.stopOverlay();
    expect(global.cancelAnimationFrame).toHaveBeenCalled();
    expect(document.getElementById(OVERLAY_ID)).toBeNull();
  });

  it('toggleOverlay toggles overlay visibility', () => {
    overlay.toggleOverlay();
    expect(document.getElementById(OVERLAY_ID)).toBeTruthy();
    expect(global.requestAnimationFrame).toHaveBeenCalledTimes(1);

    overlay.toggleOverlay();
    expect(global.cancelAnimationFrame).toHaveBeenCalled();
    expect(document.getElementById(OVERLAY_ID)).toBeNull();
  });
});
