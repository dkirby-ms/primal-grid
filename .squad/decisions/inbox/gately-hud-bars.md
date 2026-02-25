# Decision: Phase 2.3 — HUD Rendering Architecture

**Date:** 2026-02-25  
**Author:** Gately (Game Dev)  
**Status:** Active

## Decisions

1. **HUD is screen-fixed on `app.stage`** — not on `grid.container`. Bars stay in viewport top-left regardless of camera pan/zoom.
2. **HudRenderer follows existing binding pattern** — `bindToRoom(room)` with duck-typed `Record<string, unknown>` state access. Same pattern as PlayerRenderer, CreatureRenderer, GridRenderer.
3. **Defaults to 100/100** — if server hasn't sent `health` or `hunger` fields yet, bars render full. No visual glitch, no crash.
4. **Color thresholds for bar fill** — health and hunger bars shift color based on value (green/orange→orange→red). Provides at-a-glance status without reading numbers.
5. **`connectToServer` now receives `app`** — needed so HUD can be added to `app.stage` (fixed screen space) rather than world container.

## Implications

- Any new HUD elements (inventory, status effects) should follow the same pattern: create in `connectToServer`, add to `app.stage`.
- Pemulis's `hunger` and `hunger` fields on PlayerState will be picked up automatically when they land — no client rebuild needed.
