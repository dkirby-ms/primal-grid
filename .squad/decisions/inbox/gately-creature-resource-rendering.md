# Decision: Phase 2.2/2.4 Client Rendering Conventions

**Date:** 2026-02-25  
**Author:** Gately (Game Dev)  
**Status:** Active

## Decisions

1. **Creature visual language** — Herbivores are green circles, carnivores are red triangles. Consistent shape+color encoding for quick player identification. Radius 6px (half of player's 12px) so creatures are visually distinct from players.

2. **Resource indicator placement** — 5×5px colored square in the top-right corner of each tile. Pre-allocated at grid build time (hidden by default) to avoid per-frame allocation. Colors: Wood=brown, Stone=gray, Fiber=light green, Berries=orchid/purple.

3. **ResourceType enum values** — `Wood=0, Stone=1, Fiber=2, Berries=3` in `shared/src/types.ts`. Pemulis should use these enum values in server-side schemas and data files.

4. **ITileState extended with optional resource fields** — `resourceType?: ResourceType` and `resourceAmount?: number` added as optional fields so existing tile code continues to work without resources present.

5. **ICreatureState interface** — `id`, `creatureType` (string: "herbivore"|"carnivore"), `x`, `y`, `health`, `hunger`, `currentState` — matches the spec for Pemulis's CreatureState schema.

## Impact

- Pemulis: Server-side CreatureState and TileState schemas should expose fields matching these interfaces.
- All agents: Use `ResourceType` enum values (not raw numbers) when referencing resource types.
- Future creature types should get unique shape+color entries in `CreatureRenderer.createCreatureGraphic()`.
