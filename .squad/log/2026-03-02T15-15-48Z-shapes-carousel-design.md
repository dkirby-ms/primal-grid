# Session Log: Shapes Carousel Design — Build Mode Removal

**Date:** 2026-03-02T15:15:48Z  
**Topic:** Build mode removal, shapes carousel to always-visible  
**Duration:** Parallel agent work (Hal design + Gately UI layout)  
**Outcome:** Two complete design proposals ready for implementation  

## Summary

Hal and Gately authored complementary designs to remove explicit build mode (B-key toggle) and move shapes carousel below creatures in status panel. Both designs converge on "select-to-place" model: carousel always visible, clicking a shape arms it for placement, Escape/right-click deselects, stay armed after placement for rapid building.

**Hal's proposal:** Select-to-Place interaction model, state change (`buildMode` → `selectedShapeIndex`), zero server changes, ~80 lines client code.

**Gately's proposal:** UI layout (carousel below creatures), visual feedback (gold highlight + hint bar), space calc (fits 600px panel), interaction table (click, number keys, Q/E/R, Escape, right-click).

Both ready for implementation pending dkirby-ms approval.

## Files Modified

- `.squad/decisions/inbox/hal-remove-build-mode.md` — design proposal
- `.squad/decisions/inbox/gately-always-active-carousel.md` — UI/interaction design

## Next Steps

1. dkirby-ms review + approval
2. Merge inbox → decisions.md (both designs)
3. Implementation: Pemulis/Gately coordinate on code changes

---

**Decisions merged:** Pending admin (Scribe task).
