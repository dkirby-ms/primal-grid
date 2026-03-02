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

---

## Select-to-Place Build Mode Removal

**Date:** 2026-03-02T15:15:48Z  
**Status:** ✅ PROPOSED (awaiting dkirby-ms approval)  
**Authors:** Hal (Lead), Gately (Game Dev)  
**Directive:** Remove explicit build mode (B-key toggle). Shapes carousel always visible, moved below creatures in status panel.

### The Decision

Replace `buildMode: boolean` client state with `selectedShapeIndex: number | null`. Carousel is always rendered. Selecting a shape in carousel arms it for placement. Escape or right-click deselects. Stay armed after placement for rapid building (RTS convention).

**What changed:**
- `#build-indicator` banner removed entirely
- B-key binding removed
- `buildMode: boolean` → `selectedShapeIndex: number | null`
- Shapes carousel moved below creatures in status panel (always visible, never `display:none`)
- Escape key binding added (deselect)
- Right-click deselect added (prevent context menu)
- Hint bar added below carousel: "R: rotate · Esc: cancel"

**What stays the same:**
- Polyomino shape system (catalog, rotation, cost)
- Ghost preview rendering (driven by selection state instead of mode boolean)
- Q/E/R/number-key bindings (keys unchanged, just no mode gate)
- PLACE_SHAPE message format (zero server changes)
- Cursor states (`cell` when armed, `crosshair` when not)

### Why This Design

**Select-to-Place matches industry standard:** Factorio, RimWorld, Satisfactory all use this pattern. Players expect shapes to stay armed after placement for rapid click-click-click building.

**Zero server risk:** Build mode is 100% client-side. Server validates `PLACE_SHAPE { shapeId, x, y, rotation }` independently. Any client interaction redesign producing same message is backward-compatible.

**Cognitive load reduction:** Removes a mode players must remember. Carousel visibility = new players see shapes immediately (discoverability gain).

**Ghost preview mitigates accidental placement:** Players see exactly where shape lands before clicking. Mis-click cost (2 wood/cell) is natural feedback.

### Edge Cases

| Edge Case | Resolution |
|-----------|------------|
| Click grid with no shape armed | No-op. Same as not in build mode. |
| Click already-selected shape in carousel | Toggle off (deselect). Same as Escape. |
| Player levels up while shape armed | Carousel updates. If armed shape still valid, stay armed; else clamp to new max. |
| Rapid clicking places multiple shapes | Intended. Server validates each independently. |

### Files Modified

**Client only:**
1. `client/index.html` — Move `#shape-carousel` below `#section-creatures`. Remove `display:none`.
2. `client/src/input/InputHandler.ts` — Replace `buildMode` + `shapeIndex` with `selectedShapeIndex: number | null`. Remove B-key. Add Escape + right-click handlers.
3. `client/src/ui/HudDOM.ts` — Remove `setBuildMode()`. Add `setSelectedShape(index, rotation)`. Carousel always rendered. Toggle-off on re-click.
4. `client/src/ui/HelpScreen.ts` — Update help text (remove B-key, add Escape).

**Server files:** No changes.

**Estimated scope:** ~80 lines across 4 client files. No new dependencies. No schema changes. No message changes.

### Interaction Model Reference

| Action | Result |
|--------|--------|
| Click shape in carousel | Arm shape. Ghost preview follows cursor. Cursor → `cell`. |
| Click same shape again | Disarm. Ghost clears. Cursor → `crosshair`. |
| 1–9 keys | Select shape by index + arm it. |
| Q/E | Cycle prev/next shape (no-op if disarmed). |
| R | Rotate shape (no-op if disarmed). |
| Click grid (armed) | Place shape. Stay armed. |
| Click grid (disarmed) | No-op. |
| Escape | Disarm. |
| Right-click | Disarm. |

### Recommendation

Ship it. Strict improvement: removes mode friction, improves discoverability, matches UX standard, zero server risk, minimal changeset. Only breaking change is B-key removal (muscle memory), but carousel click is more intuitive — players adapt in one session.

---

## Open Questions

(None at this time; Select-to-Place design complete and ready for implementation.)
