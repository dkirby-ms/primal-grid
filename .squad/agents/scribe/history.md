# Project Context

- **Owner:** dkirby-ms
- **Project:** Primal Grid: Survival of the Frontier — grid-based survival colony builder with dinosaurs, dynamic ecosystems, and base automation in the browser
- **Stack:** TypeScript, HTML5 Canvas, browser-based web game
- **Created:** 2026-02-25T00:45:00Z

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

- **First orchestration (2026-02-25 Phase 2 Kickoff):** Scribe wrote 4 orchestration logs (Hal, Pemulis, Gately, Steeply) for Phase 2.1 completion. Merged 3 inbox decision files into `.squad/decisions.md` (hal-phase2-scoping, pemulis-procedural-map-gen, gately-biome-colors-and-hmr). Deleted inbox files. Updated agent history.md files with team updates. Session log: `.squad/log/2026-02-25T15-phase2-kickoff.md`. All artifacts use ISO 8601 UTC timestamps. Git commit pending.

- **Phase A Completion (2026-02-27T01:00:00Z):** All 10 Phase A items complete across Pemulis, Gately, Steeply. Game pivot from avatar-based to colony commander mode. Created orchestration log (`.squad/orchestration-log/2026-02-27T01:00:00Z-phase-a.md`), session log (`.squad/log/2026-02-27T01:00:00Z-phase-a-complete.md`). Merged 4 inbox decision files into `.squad/decisions.md` (A1, A2+A3, A4, A10). Deleted all inbox files. Updated all agent history.md files with Phase A completion details. Tests: 240/240 passing. Ready for Phase B. Git commit message prepared with Co-authored-by trailer.

### 2026-03-02 Resource Display Research Session Logging

Scribe processed 3-agent parallel research on resource display UX:

**Tasks completed:**
1. Wrote orchestration logs for Hal, Gately, Pemulis (2026-03-02T20-00-16Z)
2. Wrote session log (2026-03-02T20-00-16Z-resource-display-research.md)
3. Merged decision inbox (3 files) into decisions.md, deleted inbox files
4. Propagated cross-agent updates to Hal, Gately, Pemulis history.md files
5. Committed .squad/ changes to git

**Decisions merged:**
- Hal: Resource Display Design (Option A — Quantity Bar recommended, Option C backup)
- Gately: Resource Rendering UX (Pie Chart Wedge proposed)
- Pemulis: Resource Data Model Analysis (confirms viability, no backend changes needed)

**Files created:** 6 orchestration logs (Hal, Gately, Pemulis), 1 session log
**Files merged:** 3 decision inbox files → decisions.md
**Files deleted:** 3 inbox files (deduplicated)
**Git status:** `.squad/` staged and committed (94 lines additions, 0 deletions)

**Cross-agent context:** All three decisions depend on dkirby-ms's preference (bars vs. pie). Pemulis's confirmation that all approaches are viable removes data as a blocker. Awaiting stakeholder decision to proceed with implementation by winning agent (Hal's bars or Gately's pie).

### 2026-03-07 Enemy Spawn Interval Bug Fix — Pemulis Session Logging

Scribe processed single-agent fix by Pemulis (Systems Dev) on enemy base spawn interval bug:

**Tasks completed:**
1. Wrote orchestration log (2026-03-07T21-33-26Z-pemulis.md)
2. Wrote session log (2026-03-07T21-33-26Z-enemy-spawn-fix.md)
3. No decision inbox files to merge
4. Pemulis history.md already documented the fix across multiple sessions
5. Committed .squad/ changes to git

**What was fixed:**
- `shared/src/constants.ts`: `BASE_SPAWN_INTERVAL_TICKS` 480 → 120
- Root cause: Old value aligned with full cycle length, breaking spawn gate logic (modulo check only fired at dawn; night phase blocked it)
- Solution: New interval hits 4× per cycle; dayTick 360 (75%) lands in night phase (65–100%)
- All 520 tests pass

**Cross-agent impact:** None — constant change is purely systems-level and doesn't break other agents' contracts.

**Git status:** `.squad/` staged and committed (new logs only, no substantial changes)

- **Session: Lobby Improvements + ESLint Cleanup (2026-03-12):** Logged work by Hal and Pemulis. Hal decomposed #161 (lobby improvements) into 4 sub-issues with architecture decisions. Pemulis fixed 47 ESLint no-unused-vars errors (0 lint, 944 tests). Merged decisions to decisions.md, deleted inbox files, updated team histories. Committed .squad/ changes.

