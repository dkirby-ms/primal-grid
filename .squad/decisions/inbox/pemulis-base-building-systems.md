# Phase 3.1–3.4 — Server-Side Base Building Systems

**Date:** 2026-02-25  
**Author:** Pemulis (Systems Dev)  
**Status:** Active

## Decisions

1. **Flat inventory for crafted items (B1)** — `walls`, `floors`, `workbenches`, `axes`, `pickaxes`, `farmPlots` as individual `@type("number")` fields on PlayerState. Same pattern as `wood`, `stone`, `fiber`, `berries`. Adding new item types requires a new field on PlayerState + schema field + recipe entry.

2. **Structures are 1 tile, 1 entity (B2)** — `StructureState` schema with x/y position, no multi-tile footprint. One structure per tile (PLACE validates no overlap).

3. **Recipes as typed constants (B3)** — `RECIPES` in `shared/src/data/recipes.ts` follows the `CREATURE_TYPES` pattern. `RecipeDef` interface with ingredients, output type, output count.

4. **Tool bonus is passive (B4)** — GATHER handler checks `player.axes >= 1` / `player.pickaxes >= 1` for +1 yield on Wood/Stone. No durability, no consumption, no equip action.

5. **Farm uses existing tile fertility (B5)** — Growth rate = `tile.fertility * FARM.GROWTH_RATE` per tick. No separate soil quality system. Fertile tiles = faster crops.

6. **isWalkable check at query time (B6)** — `GameState.isWalkable()` iterates structures to find blocking types (Wall, Workbench). No cached walkability grid. Acceptable at current structure counts (<100). May need spatial index at scale.

7. **PLACE validates adjacency (B7)** — Player must be adjacent (dx/dy ≤ 1) to placement tile. Prevents remote building.

8. **FarmPlot is structure subtype with growth fields (B8)** — StructureState has `growthProgress` (0–100) and `cropReady` (boolean). Only meaningful for FarmPlot structureType. Other structure types ignore these fields (default 0/false).

9. **Wall/Workbench block movement; Floor/FarmPlot do not** — isWalkable denies tiles containing Wall or Workbench structures. Floor is decorative, FarmPlot is walkable for harvesting.

10. **FarmPlot placement restricted to Grassland/Forest** — Matches the fertility-based growth model. Desert/Highland/Swamp tiles cannot host farms.

## Implications

- Client needs rendering for structures (Gately). StructureState syncs via MapSchema — same binding pattern as creatures.
- Client inventory HUD should show crafted item counts (walls, axes, etc).
- Adding new recipes: add to RECIPES constant + ensure output ItemType has a field on PlayerState.
- Farm tick runs every 8 ticks (2s). Tunable via FARM constants without code changes.
- isWalkable iteration cost grows linearly with structure count. Consider spatial index if players build >200 structures.
