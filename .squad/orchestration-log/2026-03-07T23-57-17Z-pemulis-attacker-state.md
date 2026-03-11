# Pemulis: attackerState Memory Leak Fix

**Spawn:** Background task from PR #43 review (2026-03-07)  
**Task:** Fix attackerState memory leak on pawn death in combat.ts  
**Outcome:** ✅ SUCCESS

## Work Done

- Identified that `attackerState` Map was missing from cleanup when attacker pawn dies in `tickCombat()`
- Added `attackerState` as 5th parameter to `tickCombat()` signature
- Added deletion of `attackerState` entry in Phase 3 death handling loop (alongside `attackCooldowns`, `tileAttackCooldowns`)
- Updated all call sites: GameRoom.ts + test helpers (combat-system.test.ts, grave-marker.test.ts)

## Test Results

- All 520 tests passing
- 0 lint errors
- Memory leak convention established: all per-creature `Map<creatureId, ...>` must be cleaned up in Phase 3

## Commit

**ccd2a84** — "fix: clean up attackerState on attacker pawn death (memory leak)"

## Decision Pushed to Inbox

**pemulis-attacker-state-cleanup.md** — Decision merged: `tickCombat()` now takes 5 params, convention for cleaning up new per-creature Maps in Phase 3.
