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

## Water Tile Split — ShallowWater & DeepWater

**Date:** 2026-03-10  
**Status:** ✅ IMPLEMENTED  
**Author:** Pemulis (Systems Dev)  
**Issue:** #15  

### The Decision

`TileType.Water` has been replaced with `TileType.ShallowWater` (ordinal 5) and `TileType.DeepWater` (ordinal 6). This shifts `Rock` to 7 and `Sand` to 8. The enum now has 9 members.

### Key API

- **`isWaterTile(tileType)`** — canonical helper for checking any water variant. Exported from `@primal-grid/shared`. All server/test code should use this instead of comparing against both variants.
- **`WATER_GENERATION.SHALLOW_RADIUS`** — distance threshold (2 tiles) for shallow vs deep classification. Lives in `shared/src/constants.ts`.

### Map Generation

Water depth classification runs as a BFS-based second pass *after* initial biome assignment and cellular automata smoothing. Tiles within `SHALLOW_RADIUS` of any non-water tile → ShallowWater, otherwise → DeepWater.

### Impact on Other Agents

- **Client (Gately):** Must use `TileType.ShallowWater` and `TileType.DeepWater` for tile colors/rendering. Already handled in GridRenderer.ts.
- **All code:** Never reference `TileType.Water` — it no longer exists. Use `isWaterTile()` for boolean checks.

---

## Rendering Constants Location — Client-Only

**Date:** 2026-03-07  
**Status:** ✅ APPLIED  
**Author:** Gately (Game Dev)  

### The Decision

All particle/overlay rendering constants are defined at the top of `client/src/renderer/ParticleSystem.ts`, **not** in `shared/src/constants.ts`. This keeps the shared package focused on game-mechanic tuning that both server and client need.

### Implications

- Future rendering-only constants (animation speeds, glow radii, camera effects) should follow the same pattern: define them in the client file that uses them.
- If a visual constant ever needs to be driven by server state (e.g. server controls particle density per biome), it should migrate to shared at that point.

---

## Water Depth Color Palette

**Date:** 2026-03-07  
**Status:** ✅ IMPLEMENTED  
**Author:** Gately (Game Dev)  
**Issue:** #15 — Shallow/Deep Water Variants  

### The Decision

- `ShallowWater` → `0x87CEEB` (light sky blue — inviting, traversable feel)
- `DeepWater` → `0x1a3a5c` (dark navy — deep, foreboding, impassable feel)

### Rationale

- **Contrast with each other:** ~4:1 luminance ratio ensures players instantly distinguish depth at a glance.
- **Contrast with neighbors:** Sky blue is distinct from Forest green and Sand tan. Navy is distinct from Rock gray and Swamp olive.
- **Game design signal:** Light = safe/traversable, dark = dangerous/impassable. Follows standard game water conventions.

### Impact

- Single file change: `client/src/renderer/GridRenderer.ts` (TILE_COLORS map)
- No other client files referenced `TileType.Water`

---

## Day/Night Phase Names Use Lowercase Strings

**Date:** 2026-03-10  
**Status:** ✅ IMPLEMENTED  
**Author:** Pemulis (Systems Dev)  
**Scope:** shared types, server state, client display

### Context

Implementing #10 day/night cycle required choosing phase name casing. Pre-existing tests by Gately expected lowercase (`"dawn"`, `"day"`, `"dusk"`, `"night"`).

### Decision

Phase names are lowercase strings matching the `DayPhase` enum values: `dawn`, `day`, `dusk`, `night`. The `dayPhase` field on `GameState` syncs these values to the client. Gately should use these exact strings for client-side rendering/tinting.

### Rationale

- Aligns with pre-existing test expectations
- Lowercase strings are conventional for Colyseus schema string fields in this codebase
- `DayPhase` enum in `shared/src/types.ts` provides type-safe access

### Impact

- Client code should import `DayPhase` from `@primal-grid/shared` and compare against `room.state.dayPhase`
- `DAY_NIGHT.PHASES` array in constants has the phase boundaries for calculating tint interpolation

---

## Implementation Plan: Four Map Visibility Enhancement Issues

**Date:** 2026-03-07  
**Status:** ✅ ACTIVE  
**Author:** Hal (Lead)  
**Branch:** `feature/map-visibility-enhancements`

### Executive Summary

Four issues will land on the visibility enhancements branch in **3 sequential batches** to avoid merge conflicts:
- **Batch 1 (parallel):** #11 (map size) + #10 (day/night cycle)
- **Batch 2 (sequential):** #15 (water variants) after Batch 1
- **Batch 3 (sequential):** #16 (fog of war) after Batch 2

This keeps overlapping files isolated while keeping each team member productive.

### Batch Details

**Batch 1: Map Size + Day/Night (PARALLEL)**
- **#11 — Larger Map Size** (Pemulis): Increase DEFAULT_MAP_SIZE 64→128. Duration: 0.5d. Files: constants.ts.
- **#10 — Day/Night Cycle** (Pemulis + Gately): Server tracks time-of-day, client renders cycle in status. Duration: 1.5d. Files: constants.ts, GameState.ts, GameRoom.ts, HudDOM.ts.

**Batch 2: Shallow/Deep Water Variants (Sequential after Batch 1)**
- **#15 — Water Variants** (Pemulis + Gately): Split Water → ShallowWater/DeepWater. Duration: 1.5d. Files: types.ts, constants.ts, mapGenerator.ts, GridRenderer.ts.
- **Rationale:** Delayed after Batch 1 merges because #15 modifies GridRenderer.ts, and #16 also needs to modify it.

**Batch 3: Fog of War (Sequential after Batch 2)**
- **#16 — Fog of War** (Pemulis + Gately): Per-player visibility tracking, server updates visible tiles, client renders fog overlay. Duration: 2.5d. Files: types.ts, GameState.ts, GameRoom.ts, GridRenderer.ts.
- **Rationale:** Delayed until Batch 2 merges to avoid multi-way conflicts on types.ts and GridRenderer.ts.

### File Conflict Resolution

| File | #11 | #10 | #15 | #16 | Strategy |
|------|-----|-----|-----|-----|----------|
| `constants.ts` | ✓ MAP_SIZE | ✓ DAY_CYCLE | ✓ NOISE | — | Different sections; parallel OK |
| `types.ts` | — | — | ✓ TileType | ✓ VisibilityState | Serialize #15→#16 |
| `GameState.ts` | — | ✓ dayPhase | — | ✓ visibility | Serialize #10→#15→#16 |
| `GameRoom.ts` | — | ✓ tickDayNight | — | ✓ tickVisibility | Separate methods, OK in sequence |
| `GridRenderer.ts` | — | — | ✓ water colors | ✓ fog overlay | Serialize #15→#16 |

### Definition of Done (Branch-Level)

✅ All four issues implemented  
✅ No merge conflicts on primary files  
✅ Steeply: 380+ tests passing (baseline 273 + new ~100)  
✅ Pemulis: All constants centralized, no hardcoded tuning  
✅ Gately: All rendering optimized, 60 FPS maintained  
✅ Full map generates, creatures spawn, cycle displays, fog renders end-to-end  
✅ Code review passed, linting clean  
✅ Ready for merge to main

---

## Water Depth Test Strategy

**Date:** 2026-03-09  
**Status:** ✅ IMPLEMENTED  
**Author:** Steeply (Tester)  
**Issue:** #15 — Shallow/Deep Water Variants

### What

Wrote 18 tests covering the water depth variant system across 4 categories:
1. **Enum integrity (6):** ShallowWater/DeepWater exist, Water removed, isWaterTile() correctness
2. **Map generation distribution (6):** Both variants present, shallow at edges, deep in interior, multi-seed consistency
3. **Creature AI avoidance (5):** Both water types blocked for all creature types via isWalkable and isTileOpenForCreature
4. **Performance (1):** 128×128 map with water depth pass under 500ms

### Key Decision: Cardinal Distance for DeepWater Assertions

The `classifyWaterDepth()` BFS uses **cardinal neighbors only** (not diagonal). Tests for DeepWater validate using Manhattan distance (`|dx| + |dy| > radius`) to match the BFS semantics. This is important — using Chebyshev distance would create false negatives at diagonal positions.

### Outcome

331 total tests, all passing. No regressions. Water depth tests are deterministic and seed-stable.

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

## Discord Notifications on E2E Pipeline

**Date:** 2026-03-08  
**Author:** Marathe (DevOps / CI-CD)  
**Status:** ✅ IMPLEMENTED

### What

Added a `discord-notify` job to `.github/workflows/e2e.yml` that posts test results to the `#game-dev` Discord channel after E2E tests complete.

### Design Decisions

1. **Separate job, not a step** — `discord-notify` is its own job with `needs: [e2e, deploy-report]` and `if: always()`. This ensures it runs even when tests fail and has access to both upstream job results.
2. **Secret-gated** — The step checks `env.DISCORD_WEBHOOK_URL != ''` so the workflow doesn't fail in forks or repos without the secret configured.
3. **jq for JSON construction** — All dynamic content (commit messages, PR titles) is escaped through `jq` rather than string interpolation, preventing JSON injection from special characters.
4. **deploy-report outputs** — Added `outputs.page_url` to the `deploy-report` job so the Discord notification can deep-link to the GitHub Pages report.
5. **Squad attribution** — Uses `"username": "Squad: Marathe"` per the Discord webhook skill pattern.

### Impact

- All squad members see E2E results in Discord with direct links to artifacts and reports
- No action needed from other agents — this is purely CI infrastructure
- Requires `DISCORD_WEBHOOK_URL` to be set as a GitHub Actions secret (already exists for other squad workflows)

---

## E2E Test Framework — Phase 2-3 Multiplayer Suite

**Date:** 2026-03-08  
**Author:** Steeply (Tester)  
**Status:** ✅ IMPLEMENTED  
**Issue:** #50

### What

Delivered comprehensive E2E test suite for Phase 2 (Territory & Resources) and Phase 3 (Creatures) multiplayer scenarios. Includes 15 new test cases across `multiplayer.spec.ts` plus audited Phase 2 baseline.

### Test Coverage

**Phase 2 (Territory & Resources):**
- Two-player simultaneous shape placement
- Territory adjacency validation across players
- Shared resource income with multiple HQs
- Player spawn and respawn behavior
- Cross-player tile state synchronization

**Phase 3 (Creatures):**
- Creature spawning with dual HQs active
- Creature movement across player territories
- Creature AI behavior in shared ecosystems

### Test Quality

- **Total E2E tests:** 32 (all passing)
- **Flakiness:** Zero — all tests deterministic, no race conditions
- **Suite run time:** ~45s (serial execution with single shared server instance)

### Files Created/Modified

- `e2e/tests/multiplayer.spec.ts` — 634 lines, 15 new tests
- `e2e/helpers/player.helper.ts` — Player state type interfaces
- `e2e/helpers/state.helper.ts` — Game state assertion helpers
- `e2e/playwright.config.ts` — Dual CI reporter (github + html)

### Verification

- Phase 2 audit: existing tests fully cover territory placement, resource gathering, income mechanics
- Phase 3 audit: creature spawning and basic AI validated via dev-mode tests
- No pre-existing regressions introduced

---

## CI/CD Workflow Audit & Remediation Roadmap

**Date:** 2026-03-08  
**Author:** Marathe (DevOps / CI-CD)  
**Status:** ✅ COMPLETE  
**Scope:** All 16 workflows in `.github/workflows/`

### Executive Summary

Comprehensive audit discovered **3 critical issues**, **6 warnings**, and **7 good practices**. Branching model is well-designed (`dev` → `uat` → `master`), but trigger configurations have inconsistencies and missing optimizations.

### 🔴 Critical Issues (Fix This Week)

1. **Node.js version mismatch:** `e2e.yml` uses Node 20, all other workflows use Node 22. Standardize to 22.
   - File: `.github/workflows/e2e.yml` line 27
   - Change: `node-version: 20` → `node-version: 22`
   - Risk: E2E tests run on different Node than production build; potential version-specific bugs missed

2. **squad-ci.yml redundant triggers:** Both `push` (lines 7-8) and `pull_request` events on same branches.
   - Issue: Every push to `dev`/`insider` triggers tests, then every PR targeting those branches triggers again
   - Fix: Remove push trigger entirely. Keep only pull_request events.
   - Rationale: Validation should happen on PRs *before* merge, not on the branch itself

3. **squad-preview.yml incomplete gate:** Post-push validation only, no pre-merge PR checks.
   - File: `.github/workflows/squad-preview.yml` line 52
   - Issue: Validation fails *after* push lands on preview, missing early PR-level feedback
   - Fix: Add `pull_request` trigger to validate PRs before merge to preview

### 🟡 Warnings (Should Fix This Sprint)

1. **Missing npm cache** in 3 workflows: `squad-ci.yml`, `squad-release.yml`, `squad-insider-release.yml`
   - Impact: 30-60 sec wasted per run downloading dependencies
   - Fix: Add `cache: npm` to `actions/setup-node@v4` steps

2. **No concurrency guards** in 2 workflows: `reset-uat.yml`, `squad-promote.yml`
   - Risk: Git operations can race; multiple concurrent resets could leave branch inconsistent
   - Fix: Add `concurrency` group with `cancel-in-progress` rules

3. **squad-heartbeat.yml cron disabled** — Unclear lifecycle
   - File: `.github/workflows/squad-heartbeat.yml` lines 10-13
   - Issue: Cron commented out without explanation. If events missed, stale issues won't get triaged.
   - Fix: Document why cron was disabled, or re-enable with reasonable interval

4. **squad-main-guard.yml mojibake** in error messages
   - Lines 89, 95, 124 have UTF-8 rendering issues (ΓÇö, ≡ƒÜ½, etc.)
   - Fix: Replace with clean emoji or ASCII (e.g., `≡ƒÜ½` → `⛔`)

### 🟢 Good Practices Identified

1. **e2e.yml** — Excellent artifact strategy: 7-day retention, GitHub Pages auto-deploy, Discord notifications
2. **deploy workflows** — OIDC federated identity (no hardcoded credentials)
3. **squad-promote.yml** — Safe dry-run capability with pre-merge diff
4. **squad-main-guard.yml** — Comprehensive protected-branch enforcement
5. And 3 more documented in full audit

### File Impact Map

| Workflow | Files Touched | Priority |
|----------|---------------|----------|
| e2e.yml | 1 line (node-version) | P1 |
| squad-ci.yml | 2 lines (remove push) + cache | P1+P2 |
| squad-preview.yml | 4 lines (add trigger) | P1 |
| squad-release.yml, squad-insider-release.yml | +cache (2 each) | P2 |
| reset-uat.yml, squad-promote.yml | +concurrency (4 each) | P2 |
| squad-heartbeat.yml | Document + maybe re-enable cron | P2 |
| squad-main-guard.yml | Fix mojibake (3 lines) | P2 |

### Definition of Done

- [ ] P1 critical fixes applied and tested (Node 22, trigger cleanup, pre-merge gate)
- [ ] P2 warnings addressed in next sprint planning
- [ ] Audit report available in team decisions memory
- [ ] Action items assigned to responsible owners

---

## User Directive: E2E Pipeline Branch Targeting

**Date:** 2026-03-08  
**By:** dkirby-ms  
**Status:** ACTIVE  
**Context:** Cloud compute cost optimization for CI pipeline

### Directive

E2E GitHub Action workflow should trigger **only on pushes to `uat` or `master`**, not on `dev`. Do not waste cloud compute running expensive E2E tests on development branch.

### Rationale

- Dev branch tests are fast linters + unit tests (cheap, feedback fast)
- E2E tests are expensive (Playwright, multi-agent simulation, artifact uploads)
- Staging (`uat`) and production (`master`) merit full validation cost
- Dev cost optimizations reduce cloud spend

### Current Trigger

E2E workflow (`.github/workflows/e2e.yml`) was updated to trigger on `push: [uat, master]` and `pull_request` to those branches only.

---

## CI Cherry-Pick Directive

**Date:** 2026-03-10T12:05:04Z  
**By:** dkirby-ms (via Copilot)  
**Status:** ACTIVE  
**Context:** Deployment strategy for CI-only vs. feature changes

### Directive

CI-only changes (workflow fixes, pipeline updates) should be **cherry-picked directly to uat and prod** instead of running full promotion workflows. Full promos are reserved for feature/fix code changes.

### Rationale

- CI-only changes don't affect game logic or features — no risk in direct promotion
- Full promotion workflows should be reserved for substantive code changes
- Cherry-picks are faster and more direct for isolated CI improvements
- Reduces unnecessary wait times and orchestration overhead

### Implementation

When you have CI-only commits (e.g., `.github/workflows/` changes, linter config fixes):
1. Cherry-pick commits to `uat` first
2. Cherry-pick commits to `prod` second
3. Push both branches
4. No need to trigger full promotion pipeline

---

