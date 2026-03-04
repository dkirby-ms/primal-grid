# Orchestration Log: Gately — Pawn Builder Client UI
**Date:** 2026-03-04 22:57  
**Agent:** Gately (Game Dev)  
**Status:** IN_PROGRESS (background agent-13)  
**Mode:** background  

## Objectives
- Remove all shape placement UI and preview
- Add pawn spawn button to HUD
- Strip fiber/berries from resource display
- Implement builder pawn rendering (🔨 local, ⬜ opponent)
- Add HQ territory overlay (alpha 0.15, 2.5px borders)

## Expected Outcome
Shape carousel/placement/preview removed, fiber/berries stripped from HUD, spawn builder button added, builder rendering with progress bars, HQ territory overlay.

## Key Decisions Implemented
- All shape carousel and placement input removed
- Only Wood and Stone resources displayed
- Spawn cost: 10W/5S, cap: 5 builders
- Builder pawns render with build progress bar
- HQ territory distinguishable from expansion territory

## Files Modified
- client/src/HUD/HUD.tsx
- client/src/InputHandler.ts
- client/src/Renderer.tsx
- client/src/game/gameState.ts
- client/src/resources.ts
