# Decision: Viewport Culling for Tile Rendering

**Date:** 2026-03-10
**Author:** Steeply (Tester)
**Issue:** #29 — Bug: Scrolling around the map is laggy
**PR:** #60

## Context

The 128×128 map creates 49,152 Graphics objects (3 per tile: terrain, territory overlay, fog overlay). All were permanently `visible = true` in the PixiJS stage tree, causing the renderer to process every object every frame regardless of whether they were on-screen.

## Decision

Implement **differential viewport culling** rather than PixiJS's built-in `cullable` property:

- `Camera.getViewportTileBounds()` computes the visible tile range from camera position, scale, and viewport size (with 2-tile padding).
- `GridRenderer.updateCulling()` uses a `lastCullBounds` cache to only toggle visibility on tiles entering/leaving the viewport boundary (~80 tiles per frame instead of scanning all 16,384).
- Tiles start `visible = false` in `buildGrid()` and are shown by the first culling pass.

## Why Not PixiJS `cullable`?

PixiJS 8's built-in culling still iterates all objects each frame to check bounds. With 49,152 objects, the culling check itself is expensive. Manual differential culling is O(viewport_border) per frame, not O(all_tiles).

## Impact

- At 1× zoom: ~400 objects rendered per frame (was ~49,152)
- Per-frame culling work: ~80 border tiles (differential), not 16,384

## For Future Work

If the map grows beyond 128×128, consider chunked containers (e.g., 16×16 tile chunks) where entire chunks can be culled as a unit, reducing even the border-tile overhead.
