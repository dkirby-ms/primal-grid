# Canonical Decision Log

## Core Mechanic: Shapes-Only Build

**Date:** 2026-02-28T19:40:00Z  
**Status:** Active  
**Author:** Hal (Lead), Pemulis, Gately, Steeply  
**Directive:** User request to remove structure placement (workbench, farm, turret). Build mode = shapes only.

### The Decision

Players expand territory **exclusively via polyomino shapes** (PLACE_SHAPE). No structure placement, no crafting intermediary, no farming/turrets.

**What changed:**
- Removed PLACE, CRAFT, FARM_HARVEST message handlers (server)
- Removed structure inventory fields: workbenches, farmPlots, turrets
- Removed recipes system and canCraft() logic
- Removed V key toggle; build mode now shapes-only (B key)
- Removed default click-to-claim (mono shape on bare click)

**What stayed:**
- Polyomino shape system (all 11 shapes, rotation, cost)
- Claiming tick animation for shape-only claims
- HQ as bootstrap structure (special case, server-managed)
- Territory adjacency validation, resource gathering
- Score formula (+1 per tile claimed)

### Implications

- **Core loop:** Gather resources → Place shapes → Expand territory
- **Simpler:** No crafting, no recipes, no structure trees
- **Unified UI:** Single build carousel, one input mode
- **Faster testing:** Removed 39 tests, suite down to 151 tests, 149 passing

### Files Modified

**Server:** GameRoom.ts, GameState.ts, shared/types.ts, shared/messages.ts, shared/data/recipes.ts, shared/constants.ts, shared/index.ts (7 files)

**Client:** InputHandler.ts, HudDOM.ts, HelpScreen.ts, StructureRenderer.ts kept for HQ (4 files, 3 modified)

**Tests:** 5 deleted, 3 updated for cleanup. Result: 149/151 passing (2 pre-existing creature AI flaky tests).

---

## Related Sessions

- **2026-02-28T19:40:00Z-unified-build:** Session log documenting all 4 agents' work
- **2026-02-28T19:40:00Z-hal.md:** Design orchestration log
- **2026-02-28T19:40:00Z-pemulis.md:** Server removal orchestration log
- **2026-02-28T19:40:00Z-gately.md:** Client UI orchestration log
- **2026-02-28T19:40:00Z-steeply.md:** Test cleanup orchestration log

---

## Open Questions

(None at this time; design complete and implemented across all layers.)
