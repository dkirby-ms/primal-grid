# Status Panel UX Redesign

**By:** Gately (Game Dev)
**Date:** 2026-03-10
**PR:** #68
**Status:** IMPLEMENTED

## What Changed
1. **Removed Level/XP from HUD** — no gameplay purpose yet (no unlocks, no gating). Confusing testers.
2. **Renamed headers:** "Inventory" → "Resources", "Creatures" → "Wildlife"
3. **Reordered sections** by importance: Resources > Territory > Builders > Combat > Time of Day > Wildlife

## Why
Dale reported testers were confused by Level/XP (appears functional but does nothing). Headers like "Inventory" and "Creatures" were unclear in context. Panel ordering was arbitrary.

## Impact
- `HudDOM.updateLevelDisplay()` and `onLevelChange` callback removed. If progression is re-implemented, these need to be re-added.
- `xpForNextLevel` is no longer imported in client code (still exists in shared).
- Stat-bar CSS classes removed. If needed for future bars (health, stamina), re-add them.
