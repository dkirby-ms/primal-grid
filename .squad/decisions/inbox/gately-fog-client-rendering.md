# Fog of War — Client Rendering Implementation

**Author:** Gately  
**Date:** 2026-03-07  
**Branch:** `feature/fog-of-war`  
**Status:** IMPLEMENTED — ready for integration testing with Pemulis's StateView filtering

## What Was Built

Phase A MVP of client-side fog of war rendering. Three components:

1. **ExploredTileCache** — Caches `tileType` + `structureType` when tiles enter StateView (cache-on-onAdd). Retains terrain memory after tiles are removed. Tracks explored bounding box.

2. **Fog overlay in GridRenderer** — Pre-allocated Graphics per tile in a dedicated `fogContainer`. Three visual states:
   - Unexplored: solid black
   - Explored: alpha 0.6 dark overlay + faded structure silhouette icons
   - Visible: overlay hidden

3. **Camera bounds clamping** — Camera constrained to explored area with 2-tile padding, 10-tile minimum extent, smooth lerp on expansion.

## Integration Notes for Pemulis

- **No server dependency:** All fog state is derived from which tiles exist in Colyseus state (visible vs absent). Once StateView filters tiles, fog "just works."
- **Container ordering:** Fog container is added to `grid.container` after territory but before creatures. CreatureRenderer container is added after fog in `main.ts` — creature sprites naturally render above fog.
- **Explored cache is public:** `grid.exploredCache` is accessible from main.ts for camera bounds wiring. Could also be used by HUD for explored tile count display.

## Reviewer Must-Fixes Addressed

1. ✅ Cache-on-onAdd (not onRemove) — Steeply's #1 must-fix
2. ✅ structureType cached from day one — Steeply's #2 must-fix  
3. ✅ Structure silhouettes for explored tiles — Steeply's #3 must-fix
4. ✅ Minimum camera bounds padding for 5×5 HQ — Pemulis's #4 must-fix
