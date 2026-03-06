# Implementation Plan: Four Map Visibility Enhancement Issues

**Date:** 2026-03-07  
**By:** Hal (Lead)  
**Branch:** `feature/map-visibility-enhancements`  
**Status:** DECISION — Sequential with parallel batches to avoid file conflicts  

---

## Executive Summary

Four issues will land on the visibility enhancements branch. To avoid merge conflicts, we batch work into **3 sequential groups**: Batch 1 runs in parallel (map size + day/night); Batch 2 (water variants) lands after Batch 1; Batch 3 (fog of war) lands after Batch 2. This keeps overlapping files isolated while keeping each team member productive.

---

## Implementation Order

### **Batch 1: Map Size + Day/Night (PARALLEL) — Week 1**

These two have **zero file conflicts** and can run in parallel.

#### **#11 — Larger Overall Map Size** (Pemulis)
- **Scope:** Increase `DEFAULT_MAP_SIZE` from 64 → 128. Adjust creature spawn counts to maintain density ratios.
- **Files touched:** `shared/src/constants.ts` (only), `server/src/rooms/mapGenerator.ts` (spawn count refs)
- **Complexity:** LOW
- **Duration:** 0.5 days
- **Rationale:** Pure constant change. No schema, no rendering logic. Verify terrain generation still runs <100ms.
- **Validation:** Map generates in <100ms. Creature spawning maintains 32:16 ratio at larger scale. No performance regression on client render loop.

#### **#10 — Day/Night Cycle (Phase 1 — Visual Only)** (Gately + Pemulis)
- **Scope:** Server tracks time-of-day (cycles every N ticks). Client renders cycle in status panel. No gameplay effect yet.
- **Files touched:** `shared/src/constants.ts` (DAY_NIGHT_CYCLE constants), `server/src/rooms/GameState.ts` (schema field: `dayPhase` or similar), `server/src/rooms/GameRoom.ts` (add `tickDayNightCycle()` method), `client/src/ui/HudDOM.ts` (display phase)
- **Complexity:** MEDIUM
- **Duration:** 1.5 days (Pemulis 0.75d server, Gately 0.75d UI)
- **Rationale:** GameState schema change happens once; separate constants. No conflicts with #11's constant additions (different sections of `constants.ts`).
- **Validation:** Cycle ticks forward at configured rate. Client displays phase name/color in status. No server tick overhead measurable.

**Batch 1 Definition of Done:**
- ✅ Map generates at 128×128 without performance regression
- ✅ Creature spawn counts scale correctly (32 herbivores, 16 carnivores per new density)
- ✅ Day/night cycle ticks and displays in status panel
- ✅ No gameplay effect from cycle (Phase 1 is visual only)
- ✅ Steeply writes integration tests for both (map scale + cycle rendering)
- ✅ PR merges to `feature/map-visibility-enhancements`

---

### **Batch 2: Shallow/Deep Water Variants (Sequential after Batch 1) — Week 2**

#### **#15 — Shallow and Deep Water Variants** (Pemulis)
- **Scope:** Split `Water` TileType into `ShallowWater` and `DeepWater`. Update map generation logic. Update client renderer to show distinct tiles.
- **Files touched:**
  - `shared/src/types.ts` (TileType enum: add `ShallowWater`, `DeepWater`, remove/deprecate `Water`)
  - `shared/src/constants.ts` (noise thresholds for shallow vs. deep distinction)
  - `server/src/rooms/mapGenerator.ts` (update biome selection logic)
  - `client/src/renderer/GridRenderer.ts` (add color/sprite for each water type)
- **Complexity:** MEDIUM
- **Duration:** 1.5 days (Pemulis 1d server, Gately 0.5d rendering)
- **Rationale:** **CRITICAL:** We delay #15 until **after Batch 1 merges** because #15 modifies `GridRenderer.ts`, and #16 also needs to modify it. Serializing avoids merge conflicts on rendering logic.
- **Validation:** Map generation correctly distinguishes shallow vs. deep. Client renders both with distinct visuals. No creatures spawn on water (existing logic preserved).

**Batch 2 Definition of Done:**
- ✅ TileType enum updated with both water types
- ✅ Map generation produces ~30% shallow, ~20% deep (tuned via constants)
- ✅ Client renders both water types with distinct colors/sprites
- ✅ Creatures still correctly avoid water (AI pathfinding unaffected)
- ✅ Steeply adds map generation validation (water distribution tests)
- ✅ PR merges to branch

---

### **Batch 3: Fog of War (Sequential after Batch 2) — Week 3**

#### **#16 — Fog of War** (Pemulis + Gately)
- **Scope:** Per-player visibility tracking (explored/unexplored/visible states). Server updates visible tiles per tick. Client renders fog overlay on unexplored/non-visible tiles.
- **Files touched:**
  - `shared/src/types.ts` (VisibilityState enum: `unexplored`, `explored`, `visible`; possibly IVisibilityTile interface)
  - `server/src/rooms/GameState.ts` (add per-player visibility map in PlayerState or separate schema)
  - `server/src/rooms/GameRoom.ts` (add `tickVisibility()` method; update message handler to filter state per player before sending)
  - `client/src/renderer/GridRenderer.ts` (render fog layers based on visibility state; reuse water + creature rendering, add fog alpha overlay)
- **Complexity:** HIGH
- **Duration:** 2.5 days (Pemulis 1.5d server visibility logic + schema, Gately 1d client rendering + state binding)
- **Rationale:** **CRITICAL:** We do this last because it touches both `types.ts` (adding enum) and `GridRenderer.ts` (adding fog overlay). Batches 1–2 land first; #16 merges on clean slate. This also lets us reference both #10 (day/night visual) and #15 (water variants) as already-rendered context beneath the fog.
- **Validation:** Visibility correctly tracks explored/unexplored per player. Fog renders properly. State sync includes only visible tiles to reduce bandwidth. Performance acceptable even at 128×128.

**Batch 3 Definition of Done:**
- ✅ Visibility state schema added to GameState
- ✅ Server computes per-player visible tiles each tick (based on creature/structure sight radius)
- ✅ Client receives only visible + previously explored tiles
- ✅ Fog overlay renders on unexplored and non-visible tiles
- ✅ Bandwidth optimization: state sync only includes visible + border tiles (not full map)
- ✅ Steeply validates visibility logic (exploration, re-hiding on darkness, sight radius)
- ✅ PR merges to branch

---

## File Conflict Resolution Matrix

| File | #11 | #10 | #15 | #16 | Strategy |
|------|-----|-----|-----|-----|----------|
| `constants.ts` | ✓ (MAP_SIZE) | ✓ (DAY_CYCLE) | ✓ (NOISE) | — | All in different sections; no merge conflict. Run #11+#10 parallel. |
| `types.ts` | — | — | ✓ (TileType) | ✓ (VisibilityState) | **CONFLICT.** Serialize #15→#16 (2 TileType additions can coexist, but easier separate). |
| `GameState.ts` | — | ✓ (dayPhase field) | — | ✓ (visibility map) | **CONFLICT.** Can coexist if we're careful with field ordering, but serializing #10→#15→#16 keeps it clean. |
| `GameRoom.ts` | — | ✓ (tickDayNight) | — | ✓ (tickVisibility) | No conflict if separate methods. Can add both in sequence. |
| `GridRenderer.ts` | — | — | ✓ (water colors) | ✓ (fog overlay) | **CONFLICT.** Serialize #15→#16. After #15 merges, #16 adds fog layer on top. |

---

## Agent Assignments

| Agent | Role | Batch 1 | Batch 2 | Batch 3 |
|-------|------|---------|---------|---------|
| **Pemulis** | Systems/Server | #11 (map size) + #10 (cycle server) | #15 (water gen + schema) | #16 (visibility logic) |
| **Gately** | Game Dev/Client | #10 (cycle UI) | #15 (water rendering) | #16 (fog rendering) |
| **Steeply** | Tester | Integration tests for #11+#10 | Map gen validation for #15 | Visibility logic tests for #16 |

---

## Scope Cuts & Deferrals

**Deferred from #10 (Day/Night):**
- Gameplay effects (creature behavior changes at night) → Phase 6 (World Events)
- Dynamic lighting (darker tiles at night) → Phase 6 (performance TBD)
- Dawn/dusk transitions (smooth gradient) → Phase 6 (animation polish)
- **This release:** Visual cycle only (phase label in HUD)

**Deferred from #15 (Water Variants):**
- Movement penalty in shallow water → Phase 6 (creature traversal)
- Special biome effects (marsh spawning) → Phase 6 (ecosystem)
- Fishing mechanic (water-exclusive resource) → Phase 7 (new economy)

**Deferred from #16 (Fog of War):**
- Multi-tier sight (scout units have longer range) → Phase 5 (unit abilities)
- Fog dynamics (units leave trails) → Phase 6 (visual polish)
- Minimap (shows explored map) → Phase 5 (UI polish)

---

## Risk Mitigation

### Risk: Map size explosion causes performance regression
**Mitigation:** Pemulis validates render loop < 60 FPS at 128×128 with full creature load (48 creatures). If fails, revert to 96×96.

### Risk: #15 water variants break biome distribution
**Mitigation:** Steeply samples 10 generated maps, validates water ratio (30% shallow, 20% deep, no isolated tiles).

### Risk: #16 visibility sync bloats message size
**Mitigation:** Gately implements incremental visibility updates (only send changes, not full map each tick). Target <5KB per update.

### Risk: Merge conflicts on `GridRenderer.ts` between #15 and #16
**Mitigation:** **This plan serializes #15→#16**, so #16 rebases cleanly after #15 merges. Minimal risk.

---

## Definition of Done (Branch-Level)

✅ All four issues implemented  
✅ No merge conflicts on primary files  
✅ Steeply: 380+ tests passing (baseline 273 + new ~100)  
✅ Pemulis: All constants centralized, no hardcoded tuning  
✅ Gately: All rendering optimized, 60 FPS maintained  
✅ Full map generates, creatures spawn, cycle displays, fog renders end-to-end  
✅ Code review passed, linting clean  
✅ Ready for merge to main  

---

## Summary Table

| Issue | Batch | Agent(s) | Duration | Conflicts | Status |
|-------|-------|----------|----------|-----------|--------|
| #11 | 1 | Pemulis | 0.5d | None | Ready |
| #10 | 1 | Pemulis + Gately | 1.5d | None | Ready |
| #15 | 2 | Pemulis + Gately | 1.5d | GridRenderer (deferred) | Waiting for Batch 1 |
| #16 | 3 | Pemulis + Gately | 2.5d | types.ts + GridRenderer (deferred) | Waiting for Batch 2 |
| **Total** | — | — | **5.5d critical** | **Serialized** | **Go** |

---

## Next Steps

1. **Batch 1 kickoff:** Pemulis starts #11 (map size). Gately + Pemulis start #10 (day/night cycle) in parallel.
2. **Batch 2 wait:** After Batch 1 PR merges, Pemulis + Gately pull and start #15 (water variants).
3. **Batch 3 wait:** After Batch 2 PR merges, Pemulis + Gately pull and start #16 (fog of war).
4. **Scribe:** Update orchestration log as each batch lands.

---

**Approved by:** Hal (Lead)  
**For execution:** Pemulis, Gately, Steeply
