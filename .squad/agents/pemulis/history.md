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

**Your Role (Pemulis):** Systems Dev — lead Phase 0 scaffolding (monorepo, Colyseus, PixiJS, CI) and Phase 5 (persistence, automation). See `.squad/decisions.md` for full architecture.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### Phase 0 — Server & Shared Package Scaffolding (2026-02-25)

- Created `server/` package (`@primal-grid/server`) with Colyseus 0.15+ setup: WebSocketTransport, GameRoom, GameState schema with tick counter, simulation interval at TICK_RATE.
- Created `shared/` package (`@primal-grid/shared`) with types (`ITileState`, `IPlayerState`, `TileType` enum), constants (`TICK_RATE=4`, `DEFAULT_MAP_SIZE=32`, `SERVER_PORT=2567`), and message definitions (`MOVE`, `GATHER` with typed payloads).
- Colyseus 0.15 patterns: `new Server({ transport })`, `@type()` decorator for Schema fields, `setSimulationInterval` for tick loop, `experimentalDecorators` required in tsconfig.
- Both packages use ESM (`"type": "module"`), strict TypeScript, ES2022 target. Server references shared via `tsconfig.json` project references.
- Shared package is pure types/constants — no runtime dependencies. Server imports constants from shared (e.g., `TICK_RATE`, `SERVER_PORT`).

### Phase 1 — Tile Schema, Player Schema, Room Lifecycle (2026-02-25)

- **Colyseus Schema patterns:** `TileState` and `PlayerState` as standalone Schema classes, composed into `GameState` via `@type([TileState])` for ArraySchema and `@type({ map: PlayerState })` for MapSchema. Each field needs its own `@type()` decorator.
- **ArraySchema indexing:** Use `.at(index)` not bracket notation `[index]` — bracket access returns undefined in test/non-client contexts with Colyseus schemas.
- **Tile grid layout:** Stored as flat `ArraySchema<TileState>` with index = `y * mapWidth + x`. `getTile(x, y)` and `isWalkable(x, y)` helper methods on GameState for bounds-checking and walkability.
- **Movement model:** Direction-based (`dx`, `dy` each -1/0/1), not absolute coordinates. Server validates: integer check, range check (-1 to 1), not (0,0), target tile in bounds and walkable. Invalid moves silently ignored — no error sent to client.
- **Player lifecycle:** `MapSchema<PlayerState>` keyed by `client.sessionId`. Spawn at random walkable tile (100 random attempts, then linear scan fallback). Remove on leave via `.delete()`.
- **Terrain generation:** Deterministic pattern with water ponds (upper-left, center-right), sand borders around water, rock formation (lower-right), scattered edge rocks. No RNG — predictable for testing. ~80% grass coverage.
- **Shared type updates:** `ITileState` now has `type/x/y`, `IPlayerState` has `id/x/y/color`, `MovePayload` changed from absolute `{x,y}` to directional `{dx,dy}`, added `MoveMessage` alias.

### Phase 2.1 — Biome Types & Procedural Map Generation (2026-02-25)

- **TileType enum expanded:** Grassland (renamed from Grass), Forest, Swamp, Desert, Highland, Water, Rock, Sand — 8 biome types total. Numeric values: Grassland=0 through Sand=7.
- **Tile properties added:** `fertility` (0–1) and `moisture` (0–1) on both `ITileState` (shared) and `TileState` schema (server). Computed from noise during generation.
- **Procedural map generator:** `server/src/rooms/mapGenerator.ts` — inline 2D simplex noise with seeded permutation tables. Two independent noise layers: elevation (seed) and moisture (seed+31337). Fractal Brownian motion (fBm) for multi-octave detail.
- **Biome assignment logic:** Elevation determines Water (<0.35), Rock (>0.80), Highland (>0.65). Mid-range biomes selected by moisture: Swamp (high moisture + low elevation), Forest (high moisture), Desert (low moisture), Sand (medium-low), Grassland (default).
- **Noise params in shared constants:** `NOISE_PARAMS` object in `shared/src/constants.ts` — all thresholds and scale factors centralized, typed as `const`.
- **Seed-based reproducibility:** `mapSeed` added to `GameState` schema. `GameRoom.onCreate()` accepts `options.seed` or defaults to `DEFAULT_MAP_SEED` (12345). Same seed always produces same map.
- **Generator accepts arbitrary size:** `generateProceduralMap(state, seed, width, height)` — not hardcoded to 32×32.
- **Walkability unchanged:** Water and Rock are non-walkable; all other biomes (including new ones) are walkable. `isWalkable()` logic unchanged.
- **Encoder buffer bumped:** 64KB → 128KB in `server/src/index.ts` to handle expanded tile schema (5 number fields per tile × 1024 tiles).
- **Test strategy for procedural maps:** Tests must find tiles dynamically (scan for types/walkability) rather than asserting specific coordinates. Seed reproducibility and biome diversity tested explicitly.
- **Critical gotcha:** When adding exports to `shared/src/constants.ts`, the shared package must be rebuilt (`tsc`) before server tests can see new exports — vitest resolves `@primal-grid/shared` via the compiled `dist/` files.

### Phase 2.1 — Completion & Handoff (2026-02-25)

- **Phase 2.1 complete:** Biome types, procedural map generation, tile properties (fertility/moisture), mapSeed. 60 tests passing. Gately completed client colors + HMR cleanup. Steeply added 30 tests for biome distribution and seed determinism.
- **Decision record merged:** `hal-phase2-scoping.md`, `pemulis-procedural-map-gen.md`, `gately-biome-colors-and-hmr.md` merged to `.squad/decisions.md` (orchestration log at `.squad/orchestration-log/2026-02-25T15:23:41Z-pemulis.md`).
- **Next:** Phase 2.2 (Resources & Gathering) is next parallel track. Pemulis leads. Depends on 2.1 (biomes ready). 2.3 and 2.4 also parallel-ready after their prereqs.

### Phase 2.2 — Resources & Gathering (2026-02-25)

- **ResourceType enum:** Wood=0, Stone=1, Fiber=2, Berries=3 in `shared/src/types.ts`. Uses number representation (-1 = none) in schema fields for Colyseus compatibility.
- **TileState resource fields:** `resourceType` (number, -1 for none) and `resourceAmount` (number, 0-10) added with `@type("number")` decorators.
- **Biome→resource mapping:** Deterministic via seeded RNG in `mapGenerator.ts`. Forest→Wood, Grassland→Fiber|Berries (50/50), Highland→Stone, Sand→Fiber (30% chance). Desert/Swamp/Water/Rock get no resources.
- **Player inventory:** Individual `@type("number")` fields (wood, stone, fiber, berries) on PlayerState — NOT MapSchema. MapSchema<number> doesn't serialize well in Colyseus schema v4.
- **GATHER handler:** Validates adjacency (dx/dy ≤ 1), decrements tile resource, increments player inventory field via switch on ResourceType. Depleted tiles get resourceType set to -1.
- **Resource regeneration:** Runs every `RESOURCE_REGEN.INTERVAL_TICKS` (80 ticks = 20s). Existing resources regen +1 toward MAX_AMOUNT (10). Depleted tiles regrow based on biome mapping. Constants in `shared/src/constants.ts`.
- **ITileState/IPlayerState interfaces updated:** Added resourceType, resourceAmount to ITileState; wood, stone, fiber, berries to IPlayerState.

### Phase 2.4 — Creature Schema & Spawning (2026-02-25)

- **CREATURE_TYPES data:** Typed constants (not JSON) in `shared/src/data/creatures.ts`. Herbivore (Parasaurolophus, 100hp, preferred Grassland/Forest, green) and Carnivore (Raptor, 80hp, preferred Forest/Highland, red).
- **CreatureState schema:** id (string), creatureType (string), x/y (number), health (number), hunger (number), currentState (string, default "idle"). All `@type()` decorated.
- **GameState.creatures:** `MapSchema<CreatureState>` keyed by creature id string.
- **Spawn strategy:** 8 herbivores + 4 carnivores (constants in CREATURE_SPAWN). Preferred-biome-first placement (100 random attempts in preferred biomes, then fallback to any walkable tile). Uses same pattern as player spawn.
- **No AI yet:** Creatures spawn with currentState="idle" and don't move. AI is Phase 2.5.
- **All 89 existing tests pass** after both phases.

### Phase 2.3 — Player Survival (Hunger & Health) (2026-02-25)

- **PlayerState schema extended:** Added `hunger` (default 100) and `health` (default 100) as `@type("number")` fields on PlayerState. IPlayerState interface updated in shared.
- **Hunger drain:** Runs every `PLAYER_SURVIVAL.HUNGER_TICK_INTERVAL` (8 ticks = 2s). Decrements hunger by 1 per interval.
- **Starvation:** When hunger hits 0, health drains by 1 per hunger tick. Health floors at 1 (decision A7: no player death).
- **EAT message:** New `"eat"` message constant in `shared/src/messages.ts`. No payload — consumes 1 berry from `player.berries`, restores 20 hunger. Rejected if no berries or already full.
- **All survival constants** centralized in `PLAYER_SURVIVAL` object in `shared/src/constants.ts`: MAX_HUNGER, MAX_HEALTH, HUNGER_TICK_INTERVAL, HUNGER_DRAIN, STARVATION_DAMAGE, HEALTH_FLOOR, BERRY_HUNGER_RESTORE.

### Phase 2.5 — Creature AI FSM (2026-02-25)

- **New file:** `server/src/rooms/creatureAI.ts` — standalone `tickCreatureAI(state)` function. Pure logic, no Room dependency.
- **FSM states:** idle, wander, eat, flee, hunt. Stored in `creature.currentState` string field.
- **Herbivore behavior:** Flee (carnivore within detection radius) > Eat (on tile with resources, when hungry) > Wander toward nearest resource (when hungry) > Idle/Wander cycle.
- **Carnivore behavior:** Hunt (herbivore within detection radius, when hungry) > Attack (adjacent to prey, deals HUNT_DAMAGE=25) > Idle/Wander cycle. Kills prey when health ≤ 0.
- **Movement:** Greedy Manhattan — `moveToward`/`moveAwayFrom` reduce dx or dy by 1 per step. Tries primary axis first, then secondary. No pathfinding.
- **Hunger/death:** Every AI tick drains 1 hunger. At hunger=0, health drains by 2/tick. Creatures die (removed from GameState.creatures) when health ≤ 0.
- **Herbivore grazing:** Depletes tile resources (GRAZE_AMOUNT=1). Sets tile to resourceType=-1 when empty.
- **AI tick interval:** Configured via `CREATURE_AI.TICK_INTERVAL` (2 ticks = 0.5s). Decoupled from game tick per decision A3.
- **All constants** in `CREATURE_AI` object in shared constants: TICK_INTERVAL, HUNGER_DRAIN, STARVATION_DAMAGE, EAT_RESTORE, HUNGRY_THRESHOLD, IDLE_DURATION, GRAZE_AMOUNT, HUNT_DAMAGE.
- **Detection radius:** Uses `detectionRadius` from `CREATURE_TYPES` data (herbivore: 4, carnivore: 6).

### Phase 2.6 — Ecosystem Integration & Demo Polish (2026-02-25)

- **Creature respawning:** `tickCreatureRespawn()` in `GameRoom.ts` checks every `CREATURE_RESPAWN.CHECK_INTERVAL` (100 ticks = 25s). Counts creatures by type, spawns new ones via `spawnOneCreature()` when below `minPopulation` threshold. Per decision A8: population threshold, NOT breeding.
- **minPopulation field:** Added to `CreatureTypeDef` interface and creature data. Herbivore: 4, Carnivore: 2. Configurable per creature type in `shared/src/data/creatures.ts`.
- **CREATURE_RESPAWN constants:** New `CREATURE_RESPAWN` object in `shared/src/constants.ts` with `CHECK_INTERVAL`.
- **Refactored spawnCreatures:** Extracted `spawnOneCreature(typeKey)` for reuse by both initial spawn and respawn. Uses persistent `nextCreatureId` counter on GameRoom instance (with null guard for test compatibility where constructor is skipped via `Object.create`).
- **All prior systems verified:** Herbivore grazing (creatureAI.ts) depletes tile resources ✅, carnivore kills remove prey ✅, resource regeneration (80 ticks) still works alongside grazing ✅.
- **Ecosystem stability validated:** 23/26 integration tests pass. 3 pre-existing failures in carnivore hunting tests (herbivore flees before attack due to forEach iteration order — not a system bug, test setup issue). Ecosystem sustains 5+ minutes (1200 ticks) without extinction or resource depletion.

### Phase 3.1–3.4 — Base Building Systems (server-side) (2026-02-25)

- **ItemType enum:** Wall=0, Floor=1, Workbench=2, Axe=3, Pickaxe=4, FarmPlot=5 in `shared/src/types.ts`. Mirrors CREATURE_TYPES pattern — data-driven typed constants.
- **Recipe system:** `shared/src/data/recipes.ts` with `RecipeDef` interface, `RECIPES` constant (6 recipes), `canCraft()` utility, and `getItemField()` helper. Same pattern as CREATURE_TYPES.
- **Flat inventory extension:** PlayerState gets `walls`, `floors`, `workbenches`, `axes`, `pickaxes`, `farmPlots` — all `@type("number")`, default 0. Per decision B1: flat fields, not MapSchema.
- **CRAFT handler:** Validates recipe exists, checks canCraft(), decrements ingredients, increments output item field. Uses dynamic field access via `getItemField()`.
- **Tool bonuses in GATHER:** If player has axes ≥ 1, Wood yield +1. If pickaxes ≥ 1, Stone yield +1. Passive check per decision B4 — no durability, no consumption.
- **StructureState schema:** id (string), structureType (number/ItemType), x, y, placedBy (string), growthProgress (number, 0-100), cropReady (boolean). Added to GameState as `MapSchema<StructureState>`.
- **PLACE handler:** Validates player has item, tile is walkable, no existing structure, player adjacent/on tile. Wall/Workbench make tile non-walkable; Floor/FarmPlot do not. FarmPlot restricted to Grassland/Forest.
- **isWalkable updated:** Query-time check (decision B6) — iterates structures to check for Wall/Workbench at coordinates. Creatures automatically path around structures.
- **Farm system:** Growth ticks every FARM.TICK_INTERVAL (8 ticks = 2s). Growth = fertility × GROWTH_RATE per tick. cropReady=true at 100. FARM_HARVEST gives berries scaled by tile fertility, resets growth.
- **New messages:** CRAFT (CraftPayload), PLACE (PlacePayload), FARM_HARVEST (FarmHarvestPayload) in `shared/src/messages.ts`.
- **FARM constants:** `FARM` object in `shared/src/constants.ts` — TICK_INTERVAL, GROWTH_RATE, READY_THRESHOLD, BASE_HARVEST_YIELD.
- **All 194 existing tests pass** — zero regressions.

---

## Phase 3 Complete (2026-02-25T21:50:00Z)

**Status:** COMPLETE — Phase 3 Server Implementation Verified

Phase 3 is complete as of 2026-02-25T21:50:00Z. Pemulis's Phase 3.0–3.2 deliverables (StructureState model, CRAFT/PLACE/FARM_HARVEST handlers, structure tick system, farm growth, integration with creature pathfinding) have been verified by Steeply's integration test suite: 273 total tests passing, no bugs found.

All Phase 3 server-side features working as specified:
- Placement adjacency and terrain restrictions enforced
- Craft recipes validate and deduct resources correctly
- Farm plots grow on schedule and yield berries scaled by fertility
- Creature pathfinding respects wall/workbench blocking
- Multiplayer race conditions handled (inventory only decremented on successful PLACE)
- Ecosystem stable at 300+ tick duration

**Phase 3 Definition of Done:** ✅ Code-complete, test-complete, no regressions, ready for Phase 4.

Phase 4 (Creature Systems) can proceed with high confidence in the Phase 3 platform.
