# Decision: Competitive Territory Control Spec

**Date:** 2026-03-02  
**Author:** Hal (Lead)  
**Status:** PROPOSED — awaiting dkirby-ms approval  

## Summary

Wrote the build spec for multiplayer competitive territory control (`docs/competitive-territory-spec.md`). This is the B+C hybrid ("Hungry Living Grid") scoped to implementable work items.

## Key Design Decisions

1. **Territory contesting:** Players CAN place shapes on opponent tiles. Contest takes 4s instead of 2s. One code change: remove the ownerID rejection in `handlePlaceShape`, add contest timer.
2. **Upkeep mechanic:** 1 wood per 10 tiles every 60s. Can't pay = outermost tiles decay. Wood is the bottleneck resource (3/7 shapes + upkeep).
3. **Creatures stay neutral:** No taming, no ownership. Herbivores on your land = bonus berries. Carnivores on your land = border damage. Shared ecosystem creates emergent dynamics.
4. **10-minute rounds:** Timer-based. Most tiles wins. Elimination if you lose all non-HQ tiles.
5. **HQ is sacred:** 3×3 HQ area cannot be contested. Losing everything else = elimination.
6. **Symmetric balance:** All players identical. No asymmetric abilities.

## Scope Cuts

- No creature taming/breeding (too complex for v1)
- No fog of war (client complexity)
- No biome match scoring from Proposal A (can layer later)
- No matchmaking, chat, trading, or asymmetric abilities

## Implementation

4 phases, ~553 lines total. Phases 1 (contesting), 2 (upkeep), and 4 (creatures) can parallelize. Phase 3 (win condition) depends on Phase 1.

## Impact

This spec replaces the current directionless sandbox loop with a competitive game that has clear tension (expand vs. overextend), player interaction (territory stealing), and a win condition (most tiles at timer).
