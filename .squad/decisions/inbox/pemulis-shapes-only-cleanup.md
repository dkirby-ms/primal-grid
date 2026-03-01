#### Shapes-Only Cleanup — Full Structure Removal
**Author:** Pemulis (Systems Dev)
**Date:** 2026-02-28
**Status:** ✅ ACTIVE

### Context
Per Hal's shapes-only design, StructureState and the structures MapSchema have been fully removed from server and shared code. HQ is now tracked purely via hqX/hqY coordinates on PlayerState — no longer a StructureState entry.

### What Was Removed
- `StructureState` schema class from GameState.ts
- `structures` MapSchema from GameState
- `IStructureState` interface from shared types
- `ItemType.Wall` and `ItemType.Floor` enum entries
- Structure occupation check in PLACE_SHAPE handler
- `nextStructureId` from GameRoom and spawnHQ
- HQ StructureState creation in territory.ts

### What Remains
- `ItemType.HQ` (kept for potential future use / client reference)
- `hqX`/`hqY` on PlayerState (HQ spawn point)
- All shape/territory/claiming mechanics unchanged
- All creature systems unchanged

### Downstream Work Required
- **Gately:** Client StructureRenderer.ts still references `structures` MapSchema, `ItemType.Wall`, `ItemType.Floor`, `ItemType.FarmPlot`, `ItemType.Workbench`. Needs cleanup.
- **Steeply:** Tests in territory.test.ts and player-lifecycle.test.ts reference `structures` MapSchema and `ItemType.HQ` on structures. Needs cleanup.

### Compile Status
- `shared`: builds clean (`npx tsc`)
- `server`: compiles clean (`npx tsc --noEmit`)
- Client and tests NOT verified (owned by Gately and Steeply respectively)
