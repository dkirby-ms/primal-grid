# B3+B4: Remove CLAIM_TILE and Wall/Floor Items

**Author:** Pemulis (Systems Dev)
**Date:** 2025-07-18

## Decision

Removed two legacy mechanics that were superseded by the B2 shape-based territory system:

1. **CLAIM_TILE** — The old per-tile claim message, handler, constant, payload, and `CLAIM_COST_WOOD` config. Shape placement (`PLACE_SHAPE`) now handles territory expansion.

2. **Wall/Floor items** — Removed recipes, inventory fields (`walls`, `floors`), placement logic, and `ITEM_TYPE_TO_FIELD` mappings. Shape blocks now handle wall-blocking via `shapeHP > 0` (already in place from B2).

## What stayed

- `ItemType.Wall` and `ItemType.Floor` **enum values** kept in `types.ts` — removing them would shift the numeric enum, breaking serialization.
- `isAdjacentToTerritory()` — still used by shape placement validation.
- `TERRITORY` constant object — still holds `STARTING_SIZE`, `STARTING_WOOD`, etc.
- `claimTile()` in `territory.ts` — not imported by GameRoom anymore but kept in module (used by `spawnHQ` internally).

## Files changed

- `shared/src/messages.ts` — removed CLAIM_TILE export and ClaimTilePayload interface
- `shared/src/constants.ts` — removed CLAIM_COST_WOOD from TERRITORY
- `shared/src/data/recipes.ts` — removed wall/floor recipes and ITEM_TYPE_TO_FIELD entries
- `shared/src/types.ts` — removed walls/floors from IPlayerState
- `server/src/rooms/GameState.ts` — removed walls/floors from PlayerState, removed ItemType.Wall from isWalkable blocking
- `server/src/rooms/GameRoom.ts` — removed handleClaimTile, CLAIM_TILE handler, Wall/Floor from placeableTypes, cleaned imports
- `client/src/input/InputHandler.ts` — removed CLAIM_TILE usage and Wall/Floor from PLACEABLE_ITEMS
- `client/src/ui/HudDOM.ts` — removed walls/floors DOM bindings
- Tests updated across 6 test files: removed wall/floor/claim-tile test cases, rewired to workbench equivalents

## Risks

- Client HTML may still have `#craft-walls` and `#craft-floors` DOM elements — they'll be inert. Low priority cleanup.
- StructureRenderer still has Wall/Floor render cases — harmless since no new Wall/Floor structures will be created.
