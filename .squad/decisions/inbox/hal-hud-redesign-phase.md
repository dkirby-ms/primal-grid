# HUD Redesign Phase (4.5) — Proposal

**Author:** Hal (Lead)  
**Date:** 2026-02-26  
**Status:** PROPOSAL  
**Requested by:** dkirby-ms  

---

## Problem Statement

**Current HUD Issues:**
1. **No visual separation:** Health, hunger, inventory, and taming info all render directly on the game canvas at (12, 12) with no background or container.
2. **Blends into the game world:** Text and bars are semi-visible when overlaid on grass, trees, and creatures.
3. **Fixed top-left corner limits design:** As we add more HUD elements (temperature, shelter, status effects in Phase 5+), the top-left will become cramped.
4. **No spatial separation from gameplay:** Player attention is split between the game world and status info in the same viewport.

**User Request:**
Move HUD to a dedicated **side panel** (right side of screen) to:
- Improve readability
- Reduce cognitive load (separate gameplay view from status view)
- Enable more content without crowding the game canvas
- Improve visual polish before Phase 5 (World Events)

---

## Proposed Solution: Phase 4.5 — HUD Redesign

**Scope:** Move from canvas-space HUD to a **dedicated HTML-based side panel** alongside the game canvas.

**Timeline:** ~3 days, post-Phase 4, pre-Phase 5.

**Key Changes:**
- Game canvas resizes from 800×600 to 600×600 (lose 200px width).
- New HTML-based right panel (200px wide) displays all status/inventory/taming info with background and clear sections.
- All HUD elements move out of PixiJS and into styled HTML divs.
- Input handling (craft, build, help) remains canvas-based; new panel is display-only initially.

**Why HTML instead of PixiJS-based panel?**
- Cleaner separation of concerns (game logic on canvas, UI chrome in DOM).
- Easier to style, iterate, and maintain going forward.
- Enables responsive layout for future mobile support (Phase 5+).
- Reduces PixiJS complexity.

---

## Work Breakdown (4.5.1–4.5.4)

### 4.5.1 — Resize Canvas & Create Side Panel Shell (Gately)
**Owner:** Gately (Game Dev)  
**Duration:** ~1 day  
**Dependencies:** None

**Deliverables:**
- Reduce canvas from 800×600 to 600×600.
- Create HTML-based right panel (200px × 600px) alongside canvas.
- Add semantic HTML structure (sections for Health, Inventory, Taming, Creatures).
- Add base CSS (background color, border, padding, font styling).
- No functionality yet — static layout.

**Acceptance:**
- Canvas renders at 600×600.
- Panel is visible, unstyled, with section headings.
- Page layout is flex/grid (canvas on left, panel on right, centered on page).

---

### 4.5.2 — Bind HUD State to DOM (Pemulis + Gately)
**Owners:** Pemulis (Systems), Gately (Game Dev)  
**Duration:** ~1 day  
**Dependencies:** 4.5.1

**Deliverables:**
- Create `HudDOM.ts` (parallel to `HudRenderer.ts`, same interface).
- Listen to Colyseus state updates (players, creatures).
- Populate HTML elements with real-time data:
  - **Health bar:** Numeric + visual (CSS gradient or PixiJS mini-bars embedded).
  - **Hunger bar:** Numeric + visual.
  - **Inventory:** Wood, stone, fiber, berries, meat counts.
  - **Crafted items:** Wall, floor, axe, pickaxe, workbench, farm plot counts.
  - **Creatures:** Total herbivores/carnivores.
  - **Taming:** Owned creature count, trust values, pack size.
- Remove `HudRenderer.ts` from PixiJS; retain logic, port to DOM.

**Acceptance:**
- All HUD data updates correctly in the side panel.
- No visual glitches or missing data.
- Health/hunger still color-code by threshold.

---

### 4.5.3 — Add Visual Polish & Readability (Gately)
**Owner:** Gately (Game Dev)  
**Duration:** ~0.5 day  
**Dependencies:** 4.5.2

**Deliverables:**
- Background color for each section (subtle, readable).
- Icons (emojis or SVG) for each stat type.
- Borders/separators between sections.
- Responsive text sizing.
- Build mode indicator (moved from top-left).
- Help hint relocated if needed.

**Acceptance:**
- Panel is visually clear and easy to read.
- All sections are visually distinct.
- No text overflow or clipping.

---

### 4.5.4 — Integration Testing & Verification (Steeply)
**Owner:** Steeply (Tester)  
**Duration:** ~0.5 day  
**Dependencies:** 4.5.3

**Deliverables:**
- Manual smoke tests: Verify HUD updates correctly during gameplay (move, eat, craft, tame, breed).
- Verify no canvas rendering glitches or lag from DOM updates.
- Check multiplayer: Multiple players' HUDs update independently.
- Verify farm harvest and build mode still work with new layout.
- Document any edge cases for Phase 5.

**Acceptance:**
- All HUD elements update correctly in real-time.
- No performance regression.
- Ready to ship with Phase 5.

---

## Architecture Decisions

**D1: Canvas resizing is safe for Phase 4.**  
- Phase 4 (Creature Systems) is complete. Camera and rendering don't depend on exact canvas size.
- Phase 5 (World Events) will benefit from cleaner layout.

**D2: HTML side panel is preferred over PixiJS panel.**  
- Cleaner, more maintainable, easier to style.
- Prepares codebase for future DOM-based UI (inventory screen, settings menu, etc.).

**D3: HudDOM and HudRenderer are parallel (not inheritance).**  
- Both implement the same `bindToRoom()` interface.
- Remove `HudRenderer` entirely (no dual rendering).
- Simplifies test surface.

**D4: No new gameplay features in 4.5.**  
- Pure UI refactor. All player actions (craft, build, tame, breed) remain unchanged.
- Input bindings, game logic, server-side—all unchanged.

**D5: Build mode indicator moves to side panel.**  
- No longer a floating PixiJS text; becomes a styled DOM section.
- Visibility controlled by `InputHandler` calling `HudDOM.setBuildMode()`.

---

## Scope Fence (What's NOT in 4.5)

- **Inventory screen / detailed breakdown:** Deferred (Phase 5 or 6).
- **Status effects / buffs:** Deferred (Phase 5+).
- **Skill display / stats:** Deferred (Phase 6+).
- **Mobile responsive panel:** Deferred (Phase 7 or later).
- **Keyboard shortcuts overlay:** Deferred (help screen already exists).
- **Search/filter in inventory:** Deferred.
- **Drag-to-equip or item preview:** Deferred.

---

## Integration Points

**InputHandler (client/src/input/InputHandler.ts):**
- Call `hudDOM.setBuildMode()` on build mode toggle (no change to logic).
- Call `hudDOM.updatePackSize()` on F key (no change to logic).

**main.ts (client/src/main.ts):**
- Remove `app.stage.addChild(hud.container)`.
- Create `HudDOM` instance instead of `HudRenderer`.
- Pass DOM instance to `InputHandler` instead of PixiJS instance.

**Network updates:**
- No server changes.
- Same state schema, same message protocol.

---

## Success Criteria (Definition of Done)

1. ✅ Canvas resized to 600×600; side panel visible (600×200 or similar).
2. ✅ All HUD data (health, hunger, inventory, creatures, taming, pack) updates correctly.
3. ✅ Build mode indicator displays correctly.
4. ✅ No visual glitches, text overflow, or layout shifts during gameplay.
5. ✅ No performance regression (DOM updates < 1ms per frame).
6. ✅ Farm harvest, crafting, building, taming, breeding all work end-to-end.
7. ✅ Multiplayer tested: Each player sees correct data for their session.
8. ✅ Code is clean: No dead `HudRenderer.ts` code; no technical debt introduced.
9. ✅ All 300+ Phase 4 tests still pass; no new failures.

---

## Schedule

| Sub-Phase | Owner | Duration | Start | End | Status |
|-----------|-------|----------|-------|-----|--------|
| 4.5.1 | Gately | 1d | Day 1 | Day 1 | Pending |
| 4.5.2 | Pemulis + Gately | 1d | Day 2 | Day 2 | Pending |
| 4.5.3 | Gately | 0.5d | Day 3 AM | Day 3 AM | Pending |
| 4.5.4 | Steeply | 0.5d | Day 3 PM | Day 3 PM | Pending |

**Critical path:** 4.5.1 → 4.5.2 → 4.5.3 → 4.5.4 (linear). ~3 days total.

---

## Risk Mitigation

**Risk 1: Canvas resize breaks rendering.**  
- **Mitigation:** Test in isolation before full integration. Verify camera still pans correctly.

**Risk 2: DOM updates cause layout thrashing.**  
- **Mitigation:** Batch DOM updates; avoid per-frame reflows. Test frame rate.

**Risk 3: Multiplayer HUD data conflicts.**  
- **Mitigation:** Each player instance has separate `HudDOM`; each listens to its own session ID. Test multi-player in room.

---

## Notes for Future Phases

**Phase 5 (World Events):**
- Can add temperature, shelter indicators to side panel without layout work.
- Weather status / disaster alerts can be visual alerts in panel.

**Phase 6+ (Late Game):**
- Tech tree, skill points, achievements can expand side panel or open separate DOM screens.
- No canvas size changes needed; all new UI is DOM-based.

---

## Questions for dkirby-ms (User)

1. ✅ Is 600×600 canvas size acceptable, or should it be different?
2. ✅ Prefer side panel on right, or on left?
3. ✅ Any color/style preferences for panel background?
4. ✅ Should we add a "mode indicator" (e.g., "Gameplay" vs "Build") in the panel?

**Assumed answers (based on request):**
- Side panel on right side ✓
- 200px width is sufficient ✓
- Dark background (to match game aesthetic) ✓

---

## References

- **Current HUD:** `client/src/ui/HudRenderer.ts` (lines 1–308)
- **Main entry:** `client/src/main.ts` (lines 76–79)
- **HTML layout:** `client/index.html`
- **Phase 4 history:** `.squad/log/2026-02-25T22:48:00Z-phase4-kickoff.md`
- **Design doc:** `docs/design-sketch.md` (section 13: UI & UX)

---

**Next Step:** Hal will append learnings to history; Coordinator will review for approval before kickoff.
