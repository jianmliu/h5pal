import Surface from '../js/pal/surface.js';
import renderMapSystem from '../ecs/systems/render-map-system.js';
import worldService from './world-service.js';

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 400;

class OverviewRenderer {
  constructor() {
    this.surface = null;
    this.canvas = null;
    this.context = null;
    this.lastSceneId = null;
    this.lastViewport = null;
    this.dirty = true;
  }

  ensureSurface(width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT) {
    if (this.surface && this.canvas && this.canvas.width === width && this.canvas.height === height) {
      return;
    }
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.surface = new Surface(this.canvas, width, height);
    this.context = this.canvas.getContext('2d');
  }

  markDirty() {
    this.dirty = true;
  }

  render(overrides = {}) {
    if (typeof document === 'undefined') return null;
    const sceneId = overrides.sceneId ?? (worldService && typeof worldService.getSceneId === 'function'
      ? worldService.getSceneId()
      : null);
    if (!sceneId || sceneId <= 0) {
      return null;
    }
    const viewportComponent = worldService && typeof worldService.getViewportComponent === 'function'
      ? worldService.getViewportComponent()
      : null;
    this.ensureSurface(overrides.width, overrides.height);
    const context = {
      surface: this.surface,
      worldService,
      viewportComponent
    };
    this.surface.clear();
    renderMapSystem(context);
    this.dirty = false;
    return this.canvas;
  }
}

const overviewRenderer = typeof window !== 'undefined' ? new OverviewRenderer() : null;

export default overviewRenderer;
