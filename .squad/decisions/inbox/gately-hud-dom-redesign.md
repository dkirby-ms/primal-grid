# HUD DOM Redesign — Decision Record

**Author:** Gately (Game Dev)
**Date:** 2026-02-26
**Status:** IMPLEMENTED

---

## What Changed

Phase 4.5.1–4.5.3 implemented as a single delivery:

1. **Canvas resized from 800×600 to 600×600.** Side panel occupies the freed 200px on the right. Layout uses flexbox (`#game-wrapper`).

2. **New `HudDOM.ts` replaces `HudRenderer` for all HUD display.** Same `bindToRoom()` interface, same `onStateChange` duck-typed pattern. DOM elements cached at construction time for zero-allocation updates.

3. **`HudRenderer.ts` is retained but no longer instantiated.** It's not imported anywhere. Steeply should verify before deletion.

4. **InputHandler now imports `HudDOM` instead of `HudRenderer`.** Same API surface — `setBuildMode()`, `updatePackSize()`, `localPlayerX`, `localPlayerY`, `onInventoryUpdate`. No keybind changes.

5. **Craft menu and help screen remain as PixiJS canvas overlays.** They work fine at 600×600 and don't need DOM migration.

6. **Connection status stays on canvas (top-right), help hint stays on canvas (bottom-right).**

## Files Changed

- `client/index.html` — Flexbox layout, side panel HTML structure, all CSS
- `client/src/ui/HudDOM.ts` — NEW: DOM-based HUD panel
- `client/src/main.ts` — WIDTH 800→600, import HudDOM, remove `app.stage.addChild(hud.container)`
- `client/src/input/InputHandler.ts` — Import type changed to HudDOM

## Impact on Other Agents

- **Pemulis:** No impact. Zero server changes. Same state schema.
- **Steeply:** Should add integration tests for DOM panel updates. Can verify HudRenderer.ts is safe to delete.
- **Hal:** Architecture decision D2 (HTML side panel preferred over PixiJS panel) is now implemented.
