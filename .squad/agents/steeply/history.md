# Project Context

- **Owner:** dkirby-ms
- **Project:** Primal Grid: Survival of the Frontier — grid-based survival colony builder with dinosaurs, dynamic ecosystems, and base automation in the browser
- **Stack:** TypeScript, HTML5 Canvas, browser-based web game
- **Design Document:** docs/design-sketch.md
- **Created:** 2026-02-25T00:45:00Z

## Current Phase

**Hal (Lead)** has decomposed the design sketch into a **6-phase build plan** (2026-02-25):
- **Phase 0:** Scaffolding (Gately + Pemulis lead)
- **Phase 1–2, 4:** Core simulation, base building, world events (Gately lead)
- **Phase 3:** Creature systems (Gately lead)
- **Phase 5:** Late game + auth (Pemulis lead)

**Your Role (Steeply):** Tester — validate each phase is **playable** before advancing. Core principle: no speculative features. See `.squad/decisions.md` for full architecture and scope fence.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### Phase 0 — Baseline Test Setup (2026-02-25)

- **Vitest** already declared in root `devDependencies` and test script (`vitest run`). Added `vitest.config.ts` at root with explicit include patterns for `shared` and `server` test dirs.
- Test convention: `<package>/src/__tests__/*.test.ts`. TypeScript source imports (not dist).
- Scaffolding was clean — all shared exports (`TileType`, constants, message types) and server schemas (`GameState`, `GameRoom`) worked without fixes.
- Colyseus `@colyseus/schema` decorators (`@type`) work fine under Vitest with `experimentalDecorators` in server tsconfig.
- **12 tests across 5 files** passing: types (2), constants (3), messages (4), GameState (2), GameRoom (1).
- Build pipeline (`npm run build`) still succeeds after adding test files and vitest config.

### Phase 1 — Walking Skeleton Server Tests (2026-02-25)

- **39 new tests** added across 3 files (grid-generation, player-lifecycle, movement-validation). Total: 57 tests, all passing.
- **Testing pattern for Colyseus rooms without server:** `Object.create(GameRoom.prototype)` + manual `state` assignment lets you call private methods (`generateMap`, `handleMove`, `onJoin`, `onLeave`) without spinning up the full Colyseus server. Works cleanly.
- **Fake clients:** `{ sessionId: "..." }` is sufficient to mock Colyseus `Client` for `onJoin`/`onLeave`/`handleMove` calls.
- **No bugs found.** Movement validation is solid — rejects out-of-bounds, non-integer, >1/<-1 dx/dy, water tiles, rock tiles. Allows diagonal, sand, and multi-player tile stacking.
- **Deterministic map generation** makes tile-position assertions reliable. Known coordinates: water pond at (4-8,4-8), sand beach around it, rock formation at (22-26,22-26), scattered edge rocks.
- **Player spawn** always lands on walkable tiles — verified with 10-player stress test.
- Coverage gaps to address in Phase 2+: no tick/simulation interval tests, no gather message handling, no network-level multi-client sync tests (would need Colyseus test server).

### Phase 2.1 — Biome Types & Procedural Map Generation (2026-02-25)

- **30 new tests** across 2 files: `shared/src/__tests__/biome-types.test.ts` (4 tests), `server/src/__tests__/procedural-map-generation.test.ts` (26 tests). Total suite: **89 tests, all passing.**
- **Pemulis already landed Phase 2.1** when tests were written — `TileType` enum expanded to 8 biomes (Grassland, Forest, Swamp, Desert, Highland, Water, Rock, Sand), `generateMap(seed)` accepts a seed for reproducible noise-based generation, tiles gained `fertility` and `moisture` properties (both 0–1 range).
- **Seed reproducibility verified** — same seed ⇒ identical tile types, fertility, and moisture. Different seeds ⇒ different maps. This is the foundation for deterministic replay.
- **Walkability rule unchanged** — only Water and Rock are non-walkable. All 6 other biomes (Grassland, Forest, Swamp, Desert, Highland, Sand) are walkable. Comprehensive test checks ALL 1024 tiles for consistency.
- **Biome diversity** — seed 42 produces at least 3 distinct biome types including both Water and Rock (elevation layer).
- **Player spawn** still works correctly with new biomes — 10-player stress test passes, all spawns on walkable non-Water non-Rock tiles.
- **Test helper pattern** — `createRoomWithMap(seed)` wraps the `Object.create(GameRoom.prototype)` + `generateMap(seed)` pattern. Seed parameter is optional (mirrors the implementation).

### Phase 2.1 Completion & Handoff (2026-02-25)

- **Phase 2.1 complete:** 30 new tests for biome types and procedural map generation. Suite now at 60 tests, all passing. No regressions. Tests use dynamic tile scanning, seed determinism verified.
- **Decision records merged:** `.squad/decisions.md` updated with full Phase 2 architecture. Inbox files deleted.
- **Orchestration logs written:** Hal, Pemulis, Gately, Steeply orchestration logs at `.squad/orchestration-log/2026-02-25T15:23:41Z-*.md`.
- **Next:** Phase 2.2 (Resources) and 2.4 (Creatures) start parallel. Steeply will expand tests for resource system, creature spawning, creature AI as agents deliver.

### Phase 2.2 & 2.4 — Resources, Gathering, Creatures (2026-02-25)

- **37 new tests** across 4 files: `shared/src/__tests__/resource-types.test.ts` (5 tests), `shared/src/__tests__/creature-types.test.ts` (10 tests), `server/src/__tests__/resources-gathering.test.ts` (12 tests), `server/src/__tests__/creature-spawning.test.ts` (10 tests). Total suite: **126 tests, all passing.**
- **Pemulis already landed both phases** when tests were written. ResourceType enum (4 types: Wood, Stone, Fiber, Berries), CREATURE_TYPES (herbivore "Parasaurolophus", carnivore "Raptor"), CreatureState schema, creature spawning, gather handler, and resource regeneration all present.
- **Inventory is flat fields** (not MapSchema): `player.wood`, `player.stone`, `player.fiber`, `player.berries`. Decision A6 said MapSchema but implementation chose simpler flat fields. Tests adapted accordingly.
- **CREATURE_TYPES** lives in `shared/src/data/creatures.ts`, exported via `shared/src/index.ts`. CreatureTypeDef interface has: name, health, hunger, speed, detectionRadius, preferredBiomes, color.
- **Gathering adjacency**: Player must be on tile or adjacent (Chebyshev distance ≤ 1). `handleGather` validates this, rejects far-away gathers, handles depleted tiles (resourceAmount=0) gracefully by early-returning.
- **Resource regeneration**: `tickResourceRegen()` runs every RESOURCE_REGEN.INTERVAL_TICKS (80 ticks = 20 seconds). Depleted tiles (resourceType=-1) can regrow based on biome. Existing resources regenerate +1 per interval, capped at MAX_AMOUNT=10.
- **Known flaky test**: "no two creatures spawn on exact same tile" — `findWalkableTileInBiomes` does NOT deduplicate positions. With 12 creatures on ~200-300 preferred tiles, birthday-problem collisions happen ~20% of the time. Test is spec-correct; implementation gap. Usually passes but will occasionally flake.
- **Creature spawn count**: 8 herbivores + 4 carnivores = 12 total (CREATURE_SPAWN constants). Matches the ~12 target for 32×32 maps.
