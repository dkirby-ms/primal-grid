### 2026-03-04T23:15: StarCraft-style structure-based economy implemented
**By:** Pemulis (Systems Dev)
**Directive:** dkirby-ms — Replace per-tile passive income with structure-based income (StarCraft model)

**What changed:**

1. **TERRITORY_INCOME replaced with STRUCTURE_INCOME** in shared/src/constants.ts:
   - HQ base income: +2 Wood, +2 Stone per income tick (every 40 ticks / 10 seconds)
   - Farm income: +1 Wood, +1 Stone per farm per income tick
   - Old per-tile resource depletion income removed entirely

2. **New "farm" structure type** added to the builder system:
   - Farm cost: 8 Wood, 3 Stone (deducted on build completion)
   - Added to PAWN constants as FARM_COST_WOOD / FARM_COST_STONE
   - structureType field added to TileState schema ("", "hq", "outpost", "farm")
   - buildMode field added to CreatureState schema ("outpost" default, "farm")
   - SpawnPawnPayload extended with optional buildMode

3. **tickTerritoryIncome → tickStructureIncome** in GameRoom.ts:
   - No longer iterates tiles checking resourceAmount
   - Counts farm tiles per player, grants HQ base + farm income
   - Tile resourceAmount/resourceType still used for creature grazing and regen (untouched)

4. **Builder AI** updated in builderAI.ts:
   - Sets tile.structureType based on creature.buildMode on build completion
   - Farm builds check/deduct player resources; abort if can't afford
   - Default buildMode is "outpost" (territory expansion, same as before)

5. **Starting resources rebalanced:** 25 Wood, 15 Stone (down from 30W/15S)

6. **HQ tiles** now get structureType = "hq" on spawn (territory.ts)

**Files touched:** shared/src/constants.ts, shared/src/types.ts, shared/src/messages.ts, server/src/rooms/GameState.ts, server/src/rooms/GameRoom.ts, server/src/rooms/builderAI.ts, server/src/rooms/territory.ts, server/src/__tests__/pawnBuilder.test.ts

**Tests:** 208/208 passing. Old territory income test replaced with two new structure income tests (HQ base income, HQ + farm income).

**Economy loop:** HQ income → spawn builder → builder builds farm (8W/3S) → more income → more builders → territory expansion via outpost-mode builders.
