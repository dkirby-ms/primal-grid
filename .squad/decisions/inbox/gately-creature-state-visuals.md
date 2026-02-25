# Phase 2.6 — Creature State Visual Feedback Conventions

**Date:** 2026-02-25  
**Author:** Gately (Game Dev)  
**Status:** Active

## Decisions

1. **Creature state color palette** — Each FSM state maps to a color variant per creature type. Eat = brighter/lighter, Hunt = darker/saturated, Idle/Wander = base color. Keeps the visual language consistent with Phase 2.2/2.4 creature shapes.

2. **State indicator symbols** — Flee = "!" (white, above creature), Hunt = "⚔" (white, above creature). Other states have no text indicator. Indicators are pre-allocated PixiJS Text objects toggled via `visible` for zero allocation overhead.

3. **Health opacity threshold at 50%** — Creatures below 50% health render at alpha 0.6. Binary threshold, not continuous gradient — keeps the visual simple and avoids per-frame alpha recalculation.

4. **HUD creature counts use emoji** — `🦕 {herbivores}  🦖 {carnivores}` displayed below hunger bar. Counts derived from `state.creatures` collection in the same `onStateChange` callback as player stats.

5. **Graphic rebuild gating** — CreatureRenderer only clears and redraws a creature's Graphics object when `currentState` or `creatureType` actually changes (tracked via `lastType`/`lastState`). Position updates are always applied.

## Impact

- Future creature types need color entries added to `getCreatureColor()` in CreatureRenderer.
- Future FSM states need indicator mappings in `updateIndicator()`.
- HUD creature count text style is monospace 12px, #cccccc — matches existing HUD text conventions.
