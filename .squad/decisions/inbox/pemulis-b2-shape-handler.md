# B2 — Shape Placement Server Handler

**Author:** Pemulis (Systems Dev)
**Date:** 2026-02-26
**Status:** Implemented

## Decisions

1. **`shapeHP` added to TileState schema** — `@type("number") shapeHP: number = 0` after `ownerID`. Tiles with `shapeHP > 0` block movement via `isWalkable()` and suppress territory income in `tickTerritoryIncome()`.

2. **`isShapeAdjacentToTerritory()` in territory.ts** — Multi-cell adjacency check: returns true if ANY cell in the shape is adjacent to (cardinal) or inside the player's existing territory. Used by `handlePlaceShape` to ensure shapes extend from owned land.

3. **`handlePlaceShape()` validation order** — Player exists → shape exists in SHAPE_CATALOG → rotation 0–3 → all cells valid (in bounds, not Water/Rock, no structure, no existing shapeHP, not enemy territory) → adjacency → cost check → apply. Silent rejection on any failure, matching all other handlers.

4. **Shape blocks suppress territory income** — Tiles with `shapeHP > 0` skip income generation. This was a TODO from B1 that's now resolved.

5. **Shape placement claims unclaimed tiles** — If a shape cell lands on an unclaimed tile, it sets `ownerID` and increments score. Already-owned tiles just get shapeHP set.

## Files Changed

- `server/src/rooms/GameState.ts` — Added `shapeHP` field to TileState, added shapeHP>0 blocking check to `isWalkable()`
- `server/src/rooms/territory.ts` — Added `isShapeAdjacentToTerritory()` function
- `server/src/rooms/GameRoom.ts` — Added imports, wired `PLACE_SHAPE` handler, implemented `handlePlaceShape()`, fixed `tickTerritoryIncome()` shapeHP check
