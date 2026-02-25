# Phase 2.2 + 2.4 — Resources, Gathering, Creatures

**Date:** 2026-02-25  
**Author:** Pemulis (Systems Dev)  
**Status:** Active

## Decisions

1. **Resource representation uses -1 sentinel** — `resourceType = -1` means no resource on tile. Avoids nullable schema fields which Colyseus handles inconsistently across v4 encode/decode.

2. **Player inventory as flat fields, not MapSchema** — Individual `wood`, `stone`, `fiber`, `berries` number fields on PlayerState. MapSchema<number> doesn't serialize correctly in @colyseus/schema v4. Any future resource types need a new field added to PlayerState.

3. **Seeded RNG for resource placement** — Map generator uses a deterministic PRNG (seed + 99991) for resource assignment, so same seed = same resources. Separate from noise RNG to avoid coupling resource layout to terrain noise.

4. **Resource regen runs every 80 ticks** — Not per-tile timers. Single pass over all tiles at interval. Simple and O(n) but sufficient for 1024-tile maps. May need spatial partitioning at larger scales.

5. **Creature data as typed constants** — `CREATURE_TYPES` in `shared/src/data/creatures.ts` uses typed objects (not JSON files) per task spec. Exported from shared index. Interface `CreatureTypeDef` for type safety.

6. **Creature spawning prefers biomes** — 100-attempt random search in preferred biomes first, then falls back to any walkable tile. Matches existing player spawn pattern.

## Implications

- Phase 2.3 (Player Survival) can now use `player.berries` for EAT handler and depends on these inventory fields.
- Phase 2.5 (Creature AI) can use `CreatureState.currentState` as FSM state and `CREATURE_TYPES` for behavior parameters.
- Client needs rendering updates for resources on tiles and creatures on map (Gately's domain).
- Adding new resource types requires: enum value in ResourceType, field on PlayerState schema, case in GATHER switch, biome mapping in both mapGenerator and GameRoom.getDefaultResourceType.
