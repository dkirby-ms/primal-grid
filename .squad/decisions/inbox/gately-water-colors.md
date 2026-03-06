# Decision: Water Depth Color Palette

**Date:** 2026-03-07  
**By:** Gately (Game Dev)  
**Status:** IMPLEMENTED  
**Issue:** #15 — Shallow/Deep Water Variants  

## What
- `ShallowWater` → `0x87CEEB` (light sky blue — inviting, traversable feel)
- `DeepWater` → `0x1a3a5c` (dark navy — deep, foreboding, impassable feel)

## Why These Colors
- **Contrast with each other:** ~4:1 luminance ratio ensures players instantly distinguish depth at a glance.
- **Contrast with neighbors:** Sky blue is distinct from Forest green and Sand tan. Navy is distinct from Rock gray and Swamp olive.
- **Game design signal:** Light = safe/traversable, dark = dangerous/impassable. Follows standard game water conventions.

## Impact
- Single file change: `client/src/renderer/GridRenderer.ts` (TILE_COLORS map)
- No other client files referenced `TileType.Water`
