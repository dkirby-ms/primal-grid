# Decision: Resource Tile Tinting + Smooth Creature Movement

**Author:** Gately  
**Date:** 2026-03-05  
**Status:** Implemented

## Resource Tile Tinting
- Resource dots (separate `Graphics` objects per tile) replaced with background color blending via `lerpColor()` at 25% blend factor.
- Tiles with resources also get a subtle inner border (1px, 40% alpha) for visual clarity.
- `updateTile()` now accepts optional `resourceType` and `resourceAmount` params — no separate `updateResource()` method.
- Net fewer PixiJS `Graphics` objects (mapSize² fewer) = less memory and draw overhead.

## Smooth Creature Movement
- Creature sprites now interpolate toward target tile positions using exponential lerp (factor 0.15/frame).
- `CreatureRenderer.tick(dt)` drives the interpolation, wired into the PixiJS app ticker inside `connectToServer()`.
- First spawn snaps to position to avoid sliding in from (0,0).

## Files Changed
- `client/src/renderer/GridRenderer.ts`
- `client/src/renderer/CreatureRenderer.ts`
- `client/src/main.ts`

## Impact
- Visual-only changes, no server or shared type modifications.
- All 205 tests pass.
