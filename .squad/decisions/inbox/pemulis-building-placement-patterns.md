## 2026-03-12: Building Placement Architecture Patterns

**Author:** Pemulis (Systems Dev)
**Issue:** #110
**Context:** Server-side building placement system

### Decisions

1. **Outpost tiles are valid building sites.** PLACE_BUILDING accepts tiles with structureType `""` or `"outpost"`. HQ, farm, and factory tiles are blocked. Rationale: outposts are territory markers, not buildings — players expand via builders (outpost), then upgrade tiles via PLACE_BUILDING (farm/factory).

2. **Data-driven building income.** `tickStructureIncome()` uses the `BUILDING_INCOME` constant map instead of hardcoded farm-only logic. Adding a new building type (e.g., "generator") requires only adding an entry to `BUILDING_COSTS` and `BUILDING_INCOME` in constants.ts — no GameRoom changes needed.

3. **Terrain check is inlined, not `isWalkable()`.** Owned tiles have `shapeHP > 0`, which `isWalkable()` rejects. The PLACE_BUILDING handler checks `isWaterTile(tile.type) || tile.type === TileType.Rock` directly. If `isWalkable()` is ever refactored to accept owned tiles, this can be unified.

4. **Building removal relies on existing combat.ts.** When enemies destroy a tile (shapeHP → 0), combat.ts already clears `structureType`. The defensive clear in `tickClaiming()` is a safety net for future mechanics that might transfer tile ownership without going through combat.

### Impact

- **Gately:** Client needs `PLACE_BUILDING` message sender + building selection UI
- **Parker:** New handler needs test coverage (7 validation conditions, income with factories)
- **Future:** Adding new building types is now a constants-only change for income/cost; only validation or special behavior needs code changes
