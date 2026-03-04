### 2026-03-04: Pawn Builder System Implementation
**By:** Pemulis (Systems Dev)
**Status:** IMPLEMENTED

**What was decided:**
1. Builder AI uses a 3-state FSM (idle → move_to_site → building → idle) in a separate `builderAI.ts` module, dispatched from `tickCreatureAI` via `creatureType === "pawn_builder"`.
2. Pawn upkeep runs as a separate tick function (`tickPawnUpkeep`) every 60 ticks, not embedded in creature AI. This keeps upkeep timing independent of AI tick interval.
3. Building state validates adjacency to owner territory on every tick (not just at site selection). This prevents "teleport building" exploits where a builder starts building a non-adjacent tile.
4. Carnivores target builders via `findNearestPrey()` which checks both `herbivore` and `pawn_builder` creature types. No priority between them — nearest prey wins.
5. `isHQTerritory` is a boolean on TileState, set once during spawnHQ. HQ tiles are never un-claimed — this is the immutable starting zone.

**Why:**
- Separate upkeep tick: avoids coupling upkeep frequency to AI tick interval (2 ticks vs 60 ticks). Makes tuning independent.
- Adjacency validation in building state: the pre-existing pawnBuilder tests caught this — without it, a builder could claim tiles far from territory.
- Separate builderAI module: keeps creatureAI.ts focused on wildlife. Builder logic is fundamentally different (no hunger, no flee, owner-directed).
