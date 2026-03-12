# Decision: CPU Players Participate in Elimination & Victory

**Author:** Pemulis  
**Date:** 2026-03-16  
**Status:** Implemented  

## Context
In 1-human + N-CPU games, four interrelated bugs caused immediate game-over:
1. Victory condition only counted human players → 1 human always = "last standing"
2. No grace period → players eliminated before spawning pawns (~2.5s after start)
3. CPU players were immune to elimination (immortal)
4. `getHighestScorePlayer` excluded CPUs from tiebreaker

## Decision
- **CPU players are full participants** in elimination and victory checks — same rules as humans.
- **Elimination grace period of 40 ticks (~10 seconds)** added via `ELIMINATION_GRACE_TICKS` constant. No elimination checks run before this threshold.
- **`getHighestScorePlayer` is player-type-agnostic** — a CPU can win if it has the highest score.

## Impact
- **Gately:** End-game UI should handle CPU winners (display name will be the CPU's `displayName`).
- **Steeply:** Game lifecycle tests updated. Grace period constant must be mirrored in tests as `ELIMINATION_GRACE_TICKS = 40`.
- **Hal:** If CPU AI complexity changes, the grace period may need tuning.
