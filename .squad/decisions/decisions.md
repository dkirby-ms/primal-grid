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

---

## Territory Starting Size Reduction (9×9 → 5×5)

**Date:** 2026-03-05T12:40:00Z  
**Status:** ✅ IMPLEMENTED  
**Authors:** Pemulis (Systems Dev), Steeply (Tester)  
**Directive:** dkirby-ms — Reduce starting territory size from 9×9 to 5×5 to improve early-game balance.

### The Decision

Starting territory controlled by players shrinks from a 9×9 grid (81 tiles) to a 5×5 grid (25 tiles). This forces tighter early-game decisions and accelerates territory expansion phase.

**What changed:**
- `STARTING_SIZE` constant: 9 → 5 in `shared/src/constants.ts`
- Comments in `server/src/rooms/territory.ts` updated to reference 5×5 area
- Starting resources remain: 25 Wood, 15 Stone (unchanged)

**What stays the same:**
- Territory adjacency rules (unchanged)
- Shape placement cost (unchanged)
- Resource gathering mechanics (unchanged)
- HQ positioning logic (unchanged)

### Rationale

- **Early game challenge:** Smaller starting foothold forces deliberate expansion strategy
- **Player agency:** Tighter space increases decision weight (where to place first shapes?)
- **Resource balance:** Smaller board, same starting resources → farming/building more critical sooner
- **Scope containment:** Constant change only, minimal ripple effects

### Verification

- TypeScript compilation passed (Pemulis)
- Test suite fully updated: all 205 tests passing (Steeply)
- No regressions introduced

### Files Modified

1. `shared/src/constants.ts` — STARTING_SIZE updated
2. `server/src/rooms/territory.ts` — Comments updated for clarity
3. Test descriptions updated (handled by Steeply)

---

## Resource Tile Tinting + Smooth Creature Movement

**Date:** 2026-03-05T12:40:00Z  
**Status:** ✅ IMPLEMENTED  
**Author:** Gately (Game Dev)  
**Summary:** Visual-only rendering improvements for resource tiles and creature animation.

### Resource Tile Tinting

Resource dots (previously separate `Graphics` objects) now blend into tile backgrounds via color lerp at 25% blend factor. Tiles with resources also get a subtle 1px inner border at 40% alpha for visual clarity.

**API change:**
- `updateTile(x, y, tileColor)` → `updateTile(x, y, tileColor, resourceType?, resourceAmount?)`
- Single `updateTile()` call replaces both old `updateTile()` + `updateResource()` pattern
- Net reduction: mapSize² fewer `Graphics` objects in memory

### Smooth Creature Movement

Creature sprites interpolate toward target positions using exponential lerp (factor 0.15/frame) driven by `CreatureRenderer.tick(dt)`. First spawn snaps to position (prevents sliding in from origin).

**Integration:**
- Wired into PixiJS app ticker inside `connectToServer()`
- No message format changes (server unaware)

### Verification

- All 205 tests passing
- Visual changes only (no type/schema changes)
- Draw overhead reduced (fewer Graphics objects)

### Files Modified

1. `client/src/renderer/GridRenderer.ts`
2. `client/src/renderer/CreatureRenderer.ts`
3. `client/src/main.ts`

---

## StarCraft-Style Structure-Based Economy

**Date:** 2026-03-05T12:40:00Z (previously 2026-03-04T23:15)  
**Status:** ✅ IMPLEMENTED  
**Author:** Pemulis (Systems Dev)  
**Directive:** dkirby-ms — Replace per-tile passive income with structure-based income (StarCraft economic model).

### The Decision

Remove old TERRITORY_INCOME system (per-tile depletion-based). Introduce STRUCTURE_INCOME: HQ produces +2 Wood/+2 Stone per tick (10 sec), and farms produce +1 Wood/+1 Stone each per tick.

**New structures:**
- **Farm:** 8 Wood, 3 Stone cost. Built by creatures in "farm" buildMode. Grants +1 W/+1 S per tick.
- **HQ:** Automatically structureType = "hq" on spawn. Grants base +2 W/+2 S per tick.
- **Outpost:** Standard territory expansion (structureType = "outpost").

**Economy loop:**
1. HQ produces base income (2W/2S per 10 sec)
2. Players spawn builders
3. Builders place outpost shapes (expand territory) or farm structures (boost income)
4. More income → more builders → faster expansion/farming

**Changes:**

| File | Change |
|------|--------|
| `shared/src/constants.ts` | TERRITORY_INCOME removed; STRUCTURE_INCOME added. Starting resources: 25W/15S. |
| `shared/src/types.ts` | `TileState`: add `structureType` field ("" \| "hq" \| "outpost" \| "farm"). `CreatureState`: add `buildMode` field ("outpost" default, can be "farm"). |
| `shared/src/messages.ts` | `SpawnPawnPayload`: optional `buildMode` field. |
| `server/src/rooms/GameRoom.ts` | `tickTerritoryIncome()` → `tickStructureIncome()`. Counts farm tiles, grants HQ base + farm income. |
| `server/src/rooms/builderAI.ts` | Sets `tile.structureType` based on `creature.buildMode` on build completion. Farm builds check/deduct player resources. |
| `server/src/rooms/territory.ts` | HQ tiles spawn with `structureType = "hq"`. |
| `shared/src/types.ts` | `SpawnPawnPayload` extended with optional `buildMode`. |

### Verification

- Tests: 208/208 passing
- Old TERRITORY_INCOME tests replaced with two new structure income tests (HQ base, HQ + farms)
- Server-side resource deduction verified (farm build cost)

### Impact

**Gameplay:**
- Economy tied to structure decisions (build farms = more income)
- Outpost builds = pure expansion (no income benefit, but territorial control)
- Early economy scaling: farm early, compound income growth

**Code:**
- Income system simplified (count tiles → count structures)
- Builder AI aware of buildMode (outpost vs farm placement)
- Tile state now tracks structure type (enables future structure interactions)

---

