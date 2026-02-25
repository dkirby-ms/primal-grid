# Decision: Player Survival & Creature AI Implementation

**Date:** 2026-02-25  
**Author:** Pemulis (Systems Dev)  
**Status:** Active

## Decisions

1. **EAT message has no payload** — consume 1 berry, restore 20 hunger. Simplest possible eat action; food types can be extended later.
2. **Player health floors at 1** — per A7, no player death. Starvation makes the player hurt but never kills.
3. **Creature AI is a standalone function** — `tickCreatureAI(state: GameState)` in `creatureAI.ts`. No Room dependency, testable in isolation.
4. **FSM is implicit via priority chains** — not a formal state machine class. Each creature type has a priority-ordered behavior chain evaluated each tick. States are string labels for client display.
5. **Carnivore kills remove prey immediately** — no corpse, no loot. Creature respawning (Phase 2.6) will replenish populations.
6. **Herbivore grazing depletes tile resources** — same depletion logic as player gathering. Resource regen handles regrowth.
7. **All AI/survival constants in shared** — `PLAYER_SURVIVAL` and `CREATURE_AI` objects in `shared/src/constants.ts`. Tunable without touching logic.

## Implications

- Client needs to handle `hunger` and `health` fields on PlayerState (Gately: HUD bars).
- Client should reflect `currentState` string on creatures for visual feedback.
- Phase 2.6 ecosystem integration can tune all constants without code changes.
- Creature population will decline without respawning (2.6 adds threshold respawn).
