# Phase 2.1: Biome Tile Colors & HMR Cleanup

**Date:** 2026-02-25  
**Author:** Gately (Game Dev)  
**Status:** Active

## Decisions

1. **Biome color palette** — Each biome type has a distinct hex color in `GridRenderer.TILE_COLORS`. Colors chosen for visual contrast at 32px tile size: Grassland=green, Forest=dark green, Swamp=dark olive, Desert=tan, Highland=gray-brown.

2. **HMR dispose disconnects Colyseus** — `main.ts` registers `import.meta.hot.dispose()` to call `network.disconnect()` on hot reload. Prevents ghost client connections during development.

3. **`network.disconnect()` export** — New public API on `network.ts` for clean room teardown. Calls `room.leave()` and nulls the reference.

4. **Vite client types** — Added `"types": ["vite/client"]` to client tsconfig for `import.meta.hot` support.

## Impact
- All agents referencing TileType must use `Grassland` (not `Grass`).
- New biomes (Forest, Swamp, Desert, Highland) are walkable by default (isWalkable deny-lists only Water/Rock).
- Enum numeric values shifted — use symbolic names, never hardcode numbers.
