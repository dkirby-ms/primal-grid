# Phase 3.5+3.6 — Structure Rendering, Inventory HUD & Build Mode

**Date:** 2026-02-25  
**Author:** Gately (Game Dev)  
**Status:** Active

## Decisions

1. **StructureRenderer follows CreatureRenderer pattern** — `bindToRoom()`, duck-typed state access, seen-set cleanup for reactive add/remove. Structures rendered as pre-allocated Graphics at tile coordinates.

2. **Structure visual language** — Wall: brown outline (stroke only, no fill). Floor: translucent tan overlay. Workbench: brown fill with white "T" text. FarmPlot: brown soil with growth indicator. Each type has distinct visual identity at 32px tile size.

3. **Farm growth stages are threshold-based** — Four visual bands: empty soil (0-33), sprout dot (34-66), medium green rect (67-99), harvest-ready (cropReady=true with berry dots). Growth indicator is a separate pre-allocated Graphics object, only redrawn when values change.

4. **HUD inventory display uses emoji labels** — Resource counts (🪵🪨🌿🫐) and crafted item counts shown below creature counts. Same monospace 11px style, `#aaaaaa` fill.

5. **CraftMenu is a screen-fixed PixiJS overlay** — Toggled by C key. Shows all recipes from `shared/src/data/recipes.ts` with costs. Number keys craft by index. Gray text for unaffordable recipes, white for affordable.

6. **Build mode is a client-side toggle** — B key toggles. Click sends PLACE message instead of MOVE. Number keys 1-4 select placeable item (Wall, Floor, Workbench, FarmPlot). HUD shows build mode indicator.

7. **InputHandler uses setter methods for optional dependencies** — `setCraftMenu()` and `setHud()` allow InputHandler to interact with craft/build/harvest features without constructor coupling. Graceful no-ops if not wired.

8. **Farm harvest sends player position** — H key sends FARM_HARVEST with the local player's current tile coordinates. Server is responsible for finding adjacent farm plots and validating adjacency.

## Implications

- Pemulis: Server needs `state.structures` collection (MapSchema or similar) with `forEach` support, fields matching `IStructureState`.
- Pemulis: CRAFT handler should validate recipes using `canCraft()` from shared, deduct resources, increment item counts.
- Pemulis: PLACE handler should validate item ownership, tile availability, and create StructureState entries.
- Pemulis: FARM_HARVEST handler should check player adjacency to a FarmPlot with `cropReady=true`.
- Future placeable items need entries added to `PLACEABLE_ITEMS` array in InputHandler.
- Future recipes are automatically picked up by CraftMenu (reads from shared RECIPES object).
