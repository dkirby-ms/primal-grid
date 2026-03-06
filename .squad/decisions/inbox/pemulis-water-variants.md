# Decision: Water Tile Split — ShallowWater & DeepWater

**Author:** Pemulis (Systems Dev)
**Date:** 2026-03-10
**Issue:** #15

## Decision

`TileType.Water` has been replaced with `TileType.ShallowWater` (ordinal 5) and `TileType.DeepWater` (ordinal 6). This shifts `Rock` to 7 and `Sand` to 8. The enum now has 9 members.

## Key API

- **`isWaterTile(tileType)`** — canonical helper for checking any water variant. Exported from `@primal-grid/shared`. All server/test code should use this instead of comparing against both variants.
- **`WATER_GENERATION.SHALLOW_RADIUS`** — distance threshold (2 tiles) for shallow vs deep classification. Lives in `shared/src/constants.ts`.

## Map Generation

Water depth classification runs as a BFS-based second pass *after* initial biome assignment and cellular automata smoothing. Tiles within `SHALLOW_RADIUS` of any non-water tile → ShallowWater, otherwise → DeepWater.

## Impact on Other Agents

- **Client (Gately):** Must use `TileType.ShallowWater` and `TileType.DeepWater` for tile colors/rendering. Already handled in GridRenderer.ts.
- **All code:** Never reference `TileType.Water` — it no longer exists. Use `isWaterTile()` for boolean checks.
