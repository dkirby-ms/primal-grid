## Building Cap Bonus — Global Per-Type Pattern

**Author:** Gately  
**Date:** 2026-03-14  
**Status:** Implemented (PR #148)

### Decision

Building cap bonuses apply **globally to all pawn types equally** (not per-type). The effective cap is `baseCap + totalBuildingBonus` where bonus sums across all buildings regardless of type.

### Implications

- Any new building type that grants cap bonus should add an entry to `BUILDING_CAP_BONUS` in `shared/src/constants.ts`
- `getBuildingCapBonus()` in GameRoom.ts handles the server-side sum; client mirrors it by iterating tiles
- Both server (`spawnPawnCore`) and client (`updateSpawnButton` + HUD display) must use the same formula
- Starting cap (13 total across types) is unchanged — progression through buildings is optional
