## 2026-03-12: Building Placement System Architecture (Issue #110)

**Author:** Hal (Lead)
**Date:** 2026-03-12
**Issue:** #110 — Feature: Players can place buildings on controlled territory tiles
**Status:** Proposal — pending team review

### Context

Issue #110 requests a building placement system where players directly place buildings on tiles they own. Two initial building types: Factory (production-oriented) and Farm (resource-generating).

### Decisions

1. **No new schema class.** Buildings use the existing `TileState.structureType` field. Add `"factory"` as a new valid value alongside `""`, `"hq"`, `"outpost"`, `"farm"`.

2. **Direct placement model.** New `PLACE_BUILDING` message lets players place buildings on owned tiles. This complements (not replaces) the builder-pawn autonomous build system. Builders expand territory; direct placement improves existing territory.

3. **Building costs.** Farm: 12W+6S. Factory: 20W+12S. Both affordable from mid-game income, ~30s ROI.

4. **Building bonuses.** Farm: +1W+1S per income tick (unchanged). Factory: +2W+1S per income tick (wood-biased, fuels military pawn production).

5. **No building health for v1.** Buildings removed when tile ownership changes via existing contestation. HP would require combat targeting priority, repair UI, and balance work.

6. **No building upgrades for v1.** Two types with clear bonuses is sufficient strategic depth. Revisit after playtesting.

7. **Server validates 7 conditions:** player exists, tile exists, tile owned by player, no existing structure, tile is walkable, valid building type, player has resources.

8. **Client placement mode.** Button click enters placement mode (highlight valid tiles), tile click places building, ESC cancels. Standard RTS pattern.

### Impact

- **Pemulis:** Add `BUILDING_COSTS` + `FACTORY_WOOD/STONE` to constants, `PLACE_BUILDING` message, server handler, update income tick. ~1 day.
- **Gately:** HUD buttons, placement mode state, tile highlighting, factory icon rendering. ~1.5 days.
- **Steeply:** Test all 7 validation paths, factory income, building removal on ownership change. ~0.5 days.
- **Critical path:** Pemulis constants+messages must land before Gately and Steeply can start.
