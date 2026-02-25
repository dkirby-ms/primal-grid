# Phase 2.6 — Ecosystem Integration: Creature Respawning

**Date:** 2026-02-25  
**Author:** Pemulis (Systems Dev)  
**Status:** Active

## Decisions

1. **Population threshold respawn** — Per architecture decision A8, creatures respawn via population threshold, NOT breeding. When creature count of a type drops below `minPopulation`, new creatures spawn in preferred biomes using existing spawn logic.

2. **minPopulation on CreatureTypeDef** — Respawn thresholds are data-driven per creature type (`minPopulation` field): herbivore=4, carnivore=2. Adding new creature types automatically gets respawn behavior by setting this field.

3. **CHECK_INTERVAL = 100 ticks (25s)** — Respawn check runs every 100 game ticks. Infrequent enough to avoid spawn spam, frequent enough to prevent prolonged extinction. Configurable in `CREATURE_RESPAWN` constants.

4. **Persistent creature ID counter** — `nextCreatureId` on GameRoom instance ensures unique IDs across initial spawn and respawns. Includes null guard for test compatibility (tests use `Object.create` to skip constructor).

## Implications

- New creature types must include `minPopulation` in their `CreatureTypeDef`.
- Respawn uses the same biome-preferred placement as initial spawn.
- Ecosystem is self-sustaining: grazing depletes resources → regen restores them → respawn restores populations.
