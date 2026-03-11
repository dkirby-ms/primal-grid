# Food Economy Implementation Notes

**Author:** Pemulis  
**Date:** 2026-03-14  
**Status:** Implemented  
**Issue:** #21

## Implementation Decisions

### Starvation damage does not kill pawns directly
The starvation check subtracts HP but does not handle death inline — existing creature death logic in the tick loop handles removal when health <= 0. This keeps death handling in one place.

### Food can go negative
Per the design spec, food debt accrues from upkeep. The starvation check fires when `player.food <= 0`, not just `== 0`. This means large armies can rack up food debt that must be repaid before spawning resumes.

### Persistence includes food
Added `food` to `SerializedPlayerState` and the serde functions. Reconnecting players restore their food balance. Legacy saves without food deserialize with `food: 0` (safe — triggers starvation on next tick, which is correct behavior for a returning player who had no food field).

### Test impact: pawn spawn cost test updated
The pawnBuilder test referenced legacy `PAWN.BUILDER_COST_WOOD` (10) which diverged from actual `PAWN_TYPES.builder.cost.wood` (now 8). Updated test to use `PAWN_TYPES` directly.

## For Gately (Client)
- `player.food` is now synced via Colyseus schema — listen for changes like wood/stone
- Spawn buttons should disable when `player.food <= 0` (server blocks it anyway)
- BUILDING_INCOME type now includes `food: number` — update any client references
- Spawn costs changed: builder 8W/4S, defender 12W/8S, attacker 16W/12S, explorer 10W/6S
