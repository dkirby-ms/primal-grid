# Combat System Implementation Decisions

**By:** Pemulis (Systems Dev)
**Date:** 2026-03-07
**Status:** IMPLEMENTED

## Decisions

1. **WAVE_SPAWNER replaced by ENEMY_SPAWNING** — single constant group. Old WAVE_SPAWNER removed.
2. **Base destruction awards resources** — reward amounts defined per base type in ENEMY_BASE_TYPES registry (fortress > hive > raider_camp).
3. **Enemy bases spawn at night only** — `state.dayPhase !== DayPhase.Night` guard in tickEnemyBaseSpawning.
4. **Combat cooldowns are module-level Maps** in combat.ts (not schema fields). Cleaned up on creature death.
5. **PAWN_TYPES registry** centralizes all pawn config (builder, defender, attacker). Existing flat PAWN constants retained for backward compat.
6. **isTileOpenForCreature updated**: enemy mobiles + attackers can enter any walkable tile; defenders restricted to own territory.

## Impact

- **Gately:** New creature types need rendering (icons/colors in ENEMY_BASE_TYPES, ENEMY_MOBILE_TYPES, PAWN_TYPES). Spawn buttons for defender/attacker needed in HUD.
- **Steeply:** 139 combat .todo() tests need implementation. All existing 384 tests pass.
- **Hal:** WAVE_SPAWNER is gone. Any references in docs should update to ENEMY_SPAWNING.
