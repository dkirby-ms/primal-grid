# Phase 4.5.4 — HUD Test Plan & Verification Checklist

**Author:** Steeply (Tester)  
**Date:** 2026-02-26  
**Status:** READY  
**Depends on:** 4.5.1–4.5.3 completion  

---

## Baseline

- **304 tests across 26 files, all passing** (291 original + 13 new HUD contract tests).
- 1 pre-existing flaky test: breeding cycle integration (creature spawn collision — not HUD related).
- No server changes expected in Phase 4.5 (Decision D4). All existing tests must continue passing.

---

## Automated Tests Written (Phase 4.5.4 — Anticipatory)

**File:** `server/src/__tests__/hud-state-contract.test.ts` (13 tests)

These verify the **server-side state contract** — every field the HUD reads is present, typed correctly, and stays within valid ranges during gameplay:

| Test | What it guards |
|------|---------------|
| New player starts at MAX_HEALTH/MAX_HUNGER | HUD initial display |
| Health stays in [HEALTH_FLOOR, MAX_HEALTH] after starvation | Health bar bounds |
| Hunger stays in [0, MAX_HUNGER] after eating | Hunger bar bounds |
| All inventory fields initialized to 0 | HUD shows 0, not undefined |
| Inventory stays non-negative after gathering | No negative resource display |
| Inventory stays non-negative after crafting | No negative resource display |
| Spawned creatures have valid creatureType | HUD creature counter |
| Tamed creature has ownerID and trust | Taming section display |
| Creature health/hunger in sane ranges after AI | Creature stats display |
| Two players have independent inventory | Multiplayer HUD isolation |
| Two players have independent health/hunger | Multiplayer HUD isolation |
| Taming doesn't affect other player's count | Multiplayer tame count |
| All fields valid after full gameplay sequence | End-to-end state correctness |

---

## Manual / Visual Verification Checklist

> Run through these **after 4.5.1–4.5.3 are complete**. Each item needs a pass from a human playing the game.

### 1. Layout & Canvas

- [ ] Canvas renders at 600×600 (not 800×600)
- [ ] Side panel is visible at 200px wide on the right
- [ ] Page layout is centered (flex/grid)
- [ ] No gap or overlap between canvas and panel
- [ ] Panel does not scroll independently of the page
- [ ] Browser resize doesn't break layout (test at 1024, 1280, 1920 widths)

### 2. Health & Hunger Bars

- [ ] Health bar shows correct numeric value on join (100/100)
- [ ] Hunger bar shows correct numeric value on join (100/100)
- [ ] Health bar color: green (>50), orange (26–50), red (≤25)
- [ ] Hunger bar color: orange (>50), darker orange (26–50), red (≤25)
- [ ] Bars update in real-time as hunger drains
- [ ] Bars update immediately after eating (E key)
- [ ] Health drops when starving (hunger=0) — bar reflects this
- [ ] **Edge case:** Health at HEALTH_FLOOR (1) displays correctly, not 0

### 3. Inventory Display

- [ ] Wood 🪵, Stone 🪨, Fiber 🌿, Berries 🍒, Meat 🥩 — all show 0 on join
- [ ] Gathering increments the correct resource
- [ ] Crafting decrements resources and increments crafted item count
- [ ] Eating decrements berries by 1
- [ ] **Edge case:** Empty inventory (all zeros) — no visual glitch or "NaN"
- [ ] **Edge case:** Large numbers (give player 999 wood) — no text overflow

### 4. Crafted Items Display

- [ ] Walls, Floors, Axes, Pickaxes, Workbenches, Farm Plots — all show counts
- [ ] Crafting updates count immediately
- [ ] Placing a wall decrements wall count in HUD

### 5. Creature Count

- [ ] Total herbivores 🦕 and carnivores 🦖 shown correctly
- [ ] Counts update when creatures die (starvation, hunting)
- [ ] Counts update when creatures respawn
- [ ] **Edge case:** All creatures dead (0/0) — no crash or NaN

### 6. Taming Section

- [ ] Owned creature count displays after taming (I key)
- [ ] Trust values shown per tamed creature
- [ ] Trust updates as player stays near owned creature
- [ ] Trust decays when player moves far away
- [ ] Auto-abandon at 50 zero-trust ticks — creature removed from owned list
- [ ] Pack size (X/8) updates on F key toggle
- [ ] **Edge case:** Pack full (8/8) — attempting to add 9th shows correct count
- [ ] **Edge case:** All creatures abandoned — section shows 0 owned

### 7. Build Mode Indicator

- [ ] Build mode text appears in side panel on V key
- [ ] Build mode shows current item name (Wall, Floor, etc.)
- [ ] 1–9 keys cycle build item — indicator updates
- [ ] Exiting build mode (V or B) hides indicator
- [ ] **Edge case:** Rapid V key toggling doesn't leave stale indicator

### 8. Keyboard Shortcuts Still Work

- [ ] Arrow keys: movement (no change expected)
- [ ] Space: camera track toggle
- [ ] ?: help screen
- [ ] C: craft menu
- [ ] V: build mode toggle
- [ ] 1–9: build item selection / craft index
- [ ] B: breed / exit build
- [ ] H: farm harvest
- [ ] G: gather
- [ ] E: eat
- [ ] I: tame
- [ ] F: pack selection toggle

### 9. Farm Integration

- [ ] Farm harvest (H key) still works with new layout
- [ ] Farm plot growth is not affected by HUD change
- [ ] Harvest updates berry count in side panel

### 10. Multiplayer

- [ ] Player 1's HUD shows only Player 1's data
- [ ] Player 2's HUD shows only Player 2's data
- [ ] Player 1 gathering doesn't update Player 2's inventory
- [ ] Player 1 taming doesn't show in Player 2's tamed list
- [ ] Both players see correct creature counts (same world state)

---

## Performance Concerns

| Concern | What to check | Acceptable threshold |
|---------|---------------|---------------------|
| DOM update frequency | HUD should update on state change, not every frame | Batch updates, no per-tick DOM writes |
| Layout thrashing | Setting innerHTML or style in a loop | Use requestAnimationFrame or batch reads/writes |
| Frame rate impact | Monitor FPS before and after HUD switch | < 5% FPS drop at 60 FPS target |
| Memory leaks | DOM event listeners on room state | Listeners cleaned up on disconnect |
| Text reflow | Changing text content causes layout recalc | Use fixed-width containers, avoid width-dependent text |

### Performance Test Protocol

1. Open browser DevTools Performance tab
2. Record 30 seconds of gameplay (move, gather, craft, eat)
3. Check for: layout recalculations > 5ms, forced reflows, DOM node count growth
4. Compare FPS with old HUD (HudRenderer) vs new HUD (HudDOM) — should be equivalent or better

---

## Server-Side Tests Affected by Refactor

**None.** Decision D4 explicitly states no server changes. All 304 existing tests should pass unchanged. The HUD redesign is purely client-side DOM work.

If any server test breaks after 4.5.1–4.5.3, it's a regression bug, not an expected change.

---

## Edge Cases Summary

| Category | Edge case | Risk |
|----------|-----------|------|
| Empty state | Join game, do nothing — all zeros display | Low (tested) |
| Max values | 999+ resources, 100 health/hunger | Medium (text overflow) |
| Rapid state changes | Spam G/E/C keys rapidly | Medium (DOM update batching) |
| Disconnect/reconnect | Player leaves and rejoins | Medium (listener cleanup) |
| Zero creatures | All creatures dead before respawn tick | Low (tested) |
| Full pack | 8/8 tamed creatures | Low (tested) |
| Starvation edge | Health at floor (1), hunger at 0 | Low (tested) |
| Build mode + HUD | Toggle build mode while crafting | Low |
| Window resize | Resize browser during gameplay | Medium (CSS layout) |

---

## Regression Gate

Before shipping Phase 4.5:
1. `npx vitest run` — all 304 tests pass
2. Manual checklist above — all items checked
3. Performance test protocol — no FPS regression
4. No pre-existing flaky test becomes permanently broken
