# Decision: Stamina System Tuning

**Date:** 2026-03-18  
**Author:** Pemulis (Systems Dev)  
**Issue:** #180 — Units get tired too quickly  
**PR:** #183  

## Context

The stamina system introduced in the creature systems phase was causing units to exhaust too quickly, creating a jarring stop-and-go gameplay experience. The system is binary (normal movement → exhausted hard stop), and the original values were tuned too aggressively:

**Original Values:**
- Player pawns: 20-30 maxStamina → 10-15 seconds of continuous movement
- Wild creatures: 8-18 maxStamina with costPerMove=2 → 2-9 seconds of movement

Research found that creatures move at AI tick interval (2 ticks = 0.5s), so they deplete stamina quickly. Recovery from 0 was fast (1.5-3s) but the hard stop was disruptive.

## Decision

Tune stamina constants to provide roughly **2x longer movement duration** for player pawns and **~1.5x longer** for creatures:

### Player Pawns (`shared/src/constants.ts` PAWN_TYPES)
- **Builder**: maxStamina 20 → 40 (40 moves = 20s)
- **Defender**: maxStamina 25 → 50 (50 moves = 25s)
- **Attacker**: maxStamina 30 → 60 (60 moves = 30s)
- **Explorer**: maxStamina 30 → 60 (60 moves = 30s)
- Keep costPerMove=1, regenPerTick=2 unchanged
- Update `PAWN.BUILDER_MAX_STAMINA` to 40 to stay in sync

### Wild Creatures (`shared/src/data/creatures.ts`)
- **Herbivore**: maxStamina 10 → 15, costPerMove 2 → 1
- **Carnivore**: maxStamina 14 → 21, costPerMove 2 → 1
- **Bird**: maxStamina 18 → 27 (already had costPerMove=1)
- **Monkey**: maxStamina 12 → 18, costPerMove 2 → 1
- **Spider**: maxStamina 8 → 12, costPerMove 2 → 1
- Keep regenPerTick unchanged

### Test Updates
Updated `server/src/__tests__/creature-stamina.test.ts`:
- HERBIVORE_STAMINA: maxStamina 10→15, costPerMove 2→1
- CARNIVORE_STAMINA: maxStamina 14→21, costPerMove 2→1
- Builder test title and expectation: 20→40 moves

## Rationale

1. **Player Experience:** Doubling pawn stamina gives 20-30s of continuous movement, allowing players to complete typical tasks (gathering, pathing across territory) without interruption.
2. **Wildlife Balance:** Increasing creature stamina by ~50% and reducing per-move cost maintains ecological activity without constant stops. Creatures now move for 6-13.5s continuously.
3. **Strategic Depth Preserved:** The binary exhaustion system still matters — units can't move indefinitely, and stamina management remains a factor in combat and exploration.
4. **Consistency:** Both runtime constants (PAWN_TYPES, CREATURE_TYPES) and test fixtures (HERBIVORE_STAMINA, CARNIVORE_STAMINA, BUILDER_STAMINA) updated together to avoid test failures.

## Alternatives Considered

- **Gradual slowdown instead of hard stop:** Would require animation system changes and more complex movement state machine. Deferred.
- **Different regen rates:** Kept regen unchanged to maintain recovery timing (important for rest micro-strategy).
- **Separate stamina for combat vs movement:** Too complex for current phase.

## Impact

- **Files Changed:** `shared/src/constants.ts`, `shared/src/data/creatures.ts`, `server/src/__tests__/creature-stamina.test.ts`
- **Tests:** All 984 tests pass ✅
- **Gameplay:** Units move 1.5-2x longer before exhaustion, reducing frustration while maintaining stamina as a strategic resource.

## Follow-up

If stamina still feels too restrictive in playtesting, consider:
1. Adding stamina-boosting items or techs
2. Implementing a "tired" state with gradual slowdown before exhaustion
3. Making regen scale with unit level or equipment

For now, this tuning provides a baseline that feels reasonable for early-game colony management.
