/**
 * Regression tests for Camera onWheel zoom anchoring.
 * Verifies that zooming anchors to the mouse cursor (or viewport centre)
 * rather than the map origin.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal PixiJS stub — only the Container surface that Camera uses
// ---------------------------------------------------------------------------
vi.mock('pixi.js', () => {
  class Container {
    position = { x: 0, y: 0 };
    scale = {
      _x: 1,
      _y: 1,
      get x() { return this._x; },
      get y() { return this._y; },
      set(sx: number, sy: number) { this._x = sx; this._y = sy; },
    };
  }
  return { Container };
});

// ---------------------------------------------------------------------------
// Shared package stub (needed transitively through GridRenderer)
// ---------------------------------------------------------------------------
vi.mock('@primal-grid/shared', () => ({
  TileType: {},
  ResourceType: {},
  DEFAULT_MAP_SIZE: 50,
}));

// ---------------------------------------------------------------------------
// GridRenderer stub so Camera can import TILE_SIZE without pulling pixi/shared
// ---------------------------------------------------------------------------
vi.mock('../renderer/GridRenderer.js', () => ({ TILE_SIZE: 32 }));

// ---------------------------------------------------------------------------
// Suppress window.addEventListener side-effects — we drive events manually
// ---------------------------------------------------------------------------
const eventListeners: Record<string, EventListenerOrEventListenerObject[]> = {};
vi.stubGlobal('window', {
  addEventListener: (type: string, fn: EventListenerOrEventListenerObject) => {
    (eventListeners[type] ??= []).push(fn);
  },
  removeEventListener: () => { /* no-op */ },
});

// ---------------------------------------------------------------------------
// Helper: build a synthetic WheelEvent-like object
// ---------------------------------------------------------------------------
function makeWheelEvent(clientX: number, clientY: number, deltaY: number): WheelEvent {
  return {
    preventDefault: vi.fn(),
    clientX,
    clientY,
    deltaY,
  } as unknown as WheelEvent;
}

// ---------------------------------------------------------------------------
// Helper: fire the 'wheel' listener registered by the Camera constructor
// ---------------------------------------------------------------------------
function fireWheel(evt: WheelEvent) {
  for (const listener of eventListeners['wheel'] ?? []) {
    if (typeof listener === 'function') {
      listener(evt);
    } else {
      listener.handleEvent(evt);
    }
  }
}

// ---------------------------------------------------------------------------
// Import Camera and Container after all mocks are in place
// ---------------------------------------------------------------------------
const { Camera } = await import('../renderer/Camera.js');
const { Container } = await import('pixi.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Camera zoom anchoring', () => {
  const VIEW_W = 800;
  const VIEW_H = 600;
  const MAP_TILES = 50; // 50 × 32px = 1600px map

  beforeEach(() => {
    // Clear captured listeners between tests
    for (const key of Object.keys(eventListeners)) {
      eventListeners[key] = [];
    }
  });

  it('zooms in anchored to the viewport centre when cursor is at centre', () => {
    const container = new Container();
    new Camera(container as never, VIEW_W, VIEW_H, MAP_TILES);

    // Position the camera so the map is centred in the viewport at scale 1.0
    // map pixel size = 1600; position = (800/2 - 1600/2) = -400
    container.position.x = -400;
    container.position.y = -300;

    const cursorX = VIEW_W / 2; // 400
    const cursorY = VIEW_H / 2; // 300

    const evt = makeWheelEvent(cursorX, cursorY, -100); // scroll up → zoom in
    fireWheel(evt);

    const newScale = container.scale.x; // should have stepped up from 1.0
    expect(newScale).toBeGreaterThan(1.0);

    // The world point under the cursor must not have moved.
    // Before zoom: worldX = (400 - (-400)) / 1.0 = 800, worldY = (300 - (-300)) / 1.0 = 600
    // After zoom: position should equal cursor - world * newScale
    const expectedX = cursorX - 800 * newScale;
    const expectedY = cursorY - 600 * newScale;

    expect(container.position.x).toBeCloseTo(expectedX, 5);
    expect(container.position.y).toBeCloseTo(expectedY, 5);
  });

  it('zooms in anchored to an off-centre mouse cursor', () => {
    const container = new Container();
    new Camera(container as never, VIEW_W, VIEW_H, MAP_TILES);

    // Start at scale 1.0, position (-400, -300)
    container.position.x = -400;
    container.position.y = -300;

    const cursorX = 200;
    const cursorY = 150;

    // Compute the world point under the cursor before zoom
    const worldX = (cursorX - container.position.x) / container.scale.x; // (200 - (-400)) / 1 = 600
    const worldY = (cursorY - container.position.y) / container.scale.x; // (150 - (-300)) / 1 = 450

    const evt = makeWheelEvent(cursorX, cursorY, -100);
    fireWheel(evt);

    const newScale = container.scale.x;
    expect(newScale).toBeGreaterThan(1.0);

    // The world point under the cursor must stay fixed
    const expectedX = cursorX - worldX * newScale;
    const expectedY = cursorY - worldY * newScale;

    expect(container.position.x).toBeCloseTo(expectedX, 5);
    expect(container.position.y).toBeCloseTo(expectedY, 5);
  });

  it('zooms out anchored to the mouse cursor', () => {
    const container = new Container();
    new Camera(container as never, VIEW_W, VIEW_H, MAP_TILES);

    // Start at scale 2.0 so there is room to zoom out
    container.scale.set(2.0, 2.0);
    container.position.x = -400;
    container.position.y = -300;

    const cursorX = 300;
    const cursorY = 250;

    const worldX = (cursorX - container.position.x) / container.scale.x;
    const worldY = (cursorY - container.position.y) / container.scale.x;

    const evt = makeWheelEvent(cursorX, cursorY, 100); // scroll down → zoom out
    fireWheel(evt);

    const newScale = container.scale.x;
    expect(newScale).toBeLessThan(2.0);

    const expectedX = cursorX - worldX * newScale;
    const expectedY = cursorY - worldY * newScale;

    expect(container.position.x).toBeCloseTo(expectedX, 5);
    expect(container.position.y).toBeCloseTo(expectedY, 5);
  });

  it('does not shift position when already at the zoom limit', () => {
    const container = new Container();
    new Camera(container as never, VIEW_W, VIEW_H, MAP_TILES);

    // Set to maximum zoom level (3.0)
    container.scale.set(3.0, 3.0);
    container.position.x = -400;
    container.position.y = -300;

    const posXBefore = container.position.x;
    const posYBefore = container.position.y;

    // Try to zoom in further — should stay at limit, position unchanged
    const evt = makeWheelEvent(400, 300, -100);
    fireWheel(evt);

    expect(container.scale.x).toBe(3.0);
    // When the zoom limit is reached, scale is unchanged, so the anchor
    // calculation is an identity transformation and position stays the same.
    expect(container.position.x).toBeCloseTo(posXBefore, 5);
    expect(container.position.y).toBeCloseTo(posYBefore, 5);
  });
});

