## 2026-03-05: Territory Acts as Barrier to Wild Creatures (Pemulis)

**By:** Pemulis (Systems Dev)
**Status:** IMPLEMENTED

**What:** Wild creatures (herbivores, carnivores) are now blocked from entering any tile with `ownerID` set. Pawn builders still move freely within their owner's territory. Territory functions as a physical barrier — no walls needed.

**Key decisions:**
1. `isTileOpenForCreature(state, creature, x, y)` is the single gating function for all creature movement.
2. Carnivore prey-finding skips targets inside territory (prevents futile pathing).
3. Herbivore resource-seeking skips resources inside territory (same reason).
4. Creatures trapped by territory expansion stay put — starvation handles cleanup. No teleport/eviction logic.
5. `moveToward()` (exported, used by builderAI) passes the creature through the check, so builders naturally pass their own territory's ownership gate.

**Rationale:** Simplest correct implementation. One helper, four call-site changes, two search filters. No new schema fields. Territory becomes meaningful defense without requiring explicit wall structures.

**Files changed:**
- `server/src/rooms/creatureAI.ts` — added `isTileOpenForCreature()`, updated 3 movement functions and 2 search functions
- `server/src/__tests__/pawnBuilder.test.ts` — updated carnivore targeting test to use unowned tiles
- `server/src/__tests__/gameLog.test.ts` — updated builder death log test to use unowned tiles
