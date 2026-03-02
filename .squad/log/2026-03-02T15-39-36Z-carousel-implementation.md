# Session Log: Carousel Implementation
**Timestamp:** 2026-03-02T15:39:36Z
**Agent:** Gately

## Summary
Removed build mode and implemented always-active carousel. Direct shape selection via number keys, Q/E, or carousel clicks with toggle deselect. Escape and right-click deselect supported.

## Changes
- Modified input handler to remove B-key build mode toggle
- Moved carousel to HUD below creatures
- Added escape/right-click deselect
- Shape selection is now always one keypress away
- TypeScript compilation passes

## Decision Impact
Affects input system architecture. Pemulis (Input) may need awareness of deselect mechanics.
