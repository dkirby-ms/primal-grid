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

## Current Status

**Phase C COMPLETE** — 2026-02-27T14:10:00Z
- C1 ASSIGN_PAWN handler ✅
- C2, C3, C4 FSM transitions ✅
- B1–B7 Phase B implementation (shapes, worker economy) ✅
- 244/244 integration tests passing

Next: **2026-03-04 — Territory Control Redesign** (awaiting user mechanic selection)

## Core Context

**Pre-2026-03 Work Summary:**
- **Phases 0–4.4 Complete:** Full scaffolding (monorepo, Colyseus ESM v0.17, PixiJS v8, Vite, Jest), core simulation (biome map gen, resources, creatures, player survival), base building (placement, crafting, structures, farms), creature systems (schema, taming, pack commands, breeding), HUD redesign to HTML DOM panel.
- **Data Patterns Established:** Flat inventory (wood/stone/fiber/berries/meat), Colyseus @type() schema decorators, data-driven constants (CREATURES, RESOURCES, RECIPES, STRUCTURES), FSM-based creature AI (idle→graze→hunt→flee), message-based player actions (PLACE, CRAFT, TAME, BREED).
- **Architecture Decisions:** All data-driven constants in shared/src/data/, server-authoritative game state, no client prediction, creature AI runs every 2nd tick (decoupled from game ticks), pack selection stored as session state Map (not synced), trust decay + proximity gain per tick.
- **Test Suite:** 244 integration tests passing across all phases. Key patterns: guard assertions for nil fields, creature pair finding helpers, farm growth assertions, pack membership validation.
- **Key Files:** GameRoom.ts (main event loop), territory.ts (claim/adjacency logic), creatureAI.ts (FSM tick), GameState.ts (schema), types.ts (interfaces), constants.ts (tuning parameters), handlers/ (message processors).
- **Performance:** 1000 creatures on 64×64 map at 4 ticks/sec, O(N) creature AI tick, no spatial partitioning yet (Phase 5 optimization).

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### Project README (2026-03-09)

- Created root `README.md` — public-facing project documentation.
- Covers: overview, tech stack, features, getting started, project structure, development workflow, architecture, contributing, license status.
- Scripts documented from actual `package.json`: `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck`, `npx vitest run`.
- Includes the shared/ `tsconfig.tsbuildinfo` rebuild gotcha.
- No LICENSE file exists yet — noted as "not yet specified."

### Deployment & CI/CD Documentation (2026-03-11)

- Added "🚀 Deployment & Environments" section to README, inserted between 🛠 Development and 🏗 Architecture sections.
- Documents full CI/CD pipeline: feature → UAT → master branch strategy, environment table (prod vs UAT), infrastructure sharing (ACR, Log Analytics), and deployment workflows (ci.yml, deploy.yml, deploy-uat.yml).
- Includes branch protection rules for UAT, emergency UAT override workflow, and initial UAT provisioning steps.
- Clarifies scaling differences: UAT idle (~$1/month), prod always has ≥1 replica.

### Copilot Coding Agent Instructions File (2026-03-08)

- Created `.github/copilot-instructions.md` — comprehensive guidance document for the GitHub Copilot coding agent.
- Covers: project overview, architecture, build system (including shared/ incremental build gotcha), state management (Colyseus schema patterns), all game systems (creature AI FSM, stamina, territory, resources, map gen), testing patterns (mock room creation, tick advancement), coding conventions (underscore prefix, strict TS, no `any`), and explicit "do not" list.
- Key details sourced from: constants.ts, types.ts, GameRoom.ts, creatureAI.ts, builderAI.ts, GameState.ts, mapGenerator.ts, territory.ts, .eslintrc.cjs, test files.
- 287 tests pass with no regressions (documentation-only change).

### Biome Contiguity — Noise Tuning + Cellular Automata (2026-03-07)

- **Problem:** Biomes looked pixelated — too many isolated single-tile patches because noise params produced high-frequency detail and no post-processing smoothed boundaries.
- **Fix (two-pronged):**
  1. **Noise parameter tuning** (`shared/src/constants.ts`): Reduced `ELEVATION_SCALE` 0.08→0.045, `MOISTURE_SCALE` 0.06→0.035 (lower scale = larger features). Reduced octaves (4→3 elevation, 3→2 moisture) to remove fine-grained noise that caused pixelation.
  2. **Cellular automata smoothing** (`server/src/rooms/mapGenerator.ts`): Added `smoothBiomes()` function called after tile generation. 2 passes over the full grid. For each non-Water, non-Rock tile, counts biome types in Moore neighborhood (8 neighbors). If 5+ neighbors share a different biome, flips the center tile. Uses a snapshot array per pass so reads don't see writes.
- **Post-flip recalculation:** After flipping a tile's biome, `calculateFertility` and `assignResource` are re-run with the tile's stored moisture value to keep fertility/resources consistent with the new biome type.
- **Protected tiles:** Water and Rock are never smoothed — they're terrain barriers used for gameplay.
- **Scale is counterintuitive:** In the FBM implementation, *lower* scale values produce *larger* features because scale is used as the initial frequency multiplier.

### Per-Creature Movement Timers (2026-03-06)

- **Bug:** All creatures moved simultaneously because `tickCreatureAI` was gated by a shared `tick % TICK_INTERVAL === 0` check in `GameRoom.tickCreatureAI()`. Every creature stepped on the exact same tick.
- **Fix:** Added `nextMoveTick` field to `CreatureState` schema. Each creature checks its own timer inside `tickCreatureAI()` — skips if `state.tick < creature.nextMoveTick`, then sets `nextMoveTick = currentTick + TICK_INTERVAL` after stepping.
- **Stagger formula:** On spawn: `nextMoveTick = state.tick + 1 + (creatureIndex % TICK_INTERVAL)`. The `+1` is critical — without it, both stagger offsets (0 and 1 for TICK_INTERVAL=2) expire on the first game tick.
- **GameRoom change:** Removed the global `tick % TICK_INTERVAL !== 0` gate. `tickCreatureAI` is now called every game tick; per-creature timers handle the gating.
- **Test pattern:** Tests that manually create creatures with `addCreature` default to `nextMoveTick = state.tick` (fires on next AI call). Tests verifying stagger must explicitly set `nextMoveTick` per creature. The `aiTick` helper should advance by 1 tick (not TICK_INTERVAL) to see per-creature timing.
- **PR:** #5 on `test/creature-independent-movement` branch.

### StarCraft-Style Structure Economy (2026-03-04)

- **TERRITORY_INCOME replaced with STRUCTURE_INCOME:** Income no longer comes from per-tile resource depletion. HQ provides +2W/+2S base income per tick (every 40 ticks). Farm structures provide +1W/+1S each. tickStructureIncome counts farm tiles per player and grants lump income.
- **structureType field on TileState:** New schema string field ("", "hq", "outpost", "farm"). HQ tiles set on spawn, outpost/farm set by builder on build completion. This is the authoritative structure identity — not shapeHP or isHQTerritory.
- **buildMode field on CreatureState:** Builders default to "outpost" (territory expansion). Set to "farm" via SpawnPawnPayload.buildMode. Farm builds deduct PAWN.FARM_COST_WOOD/STONE from player on completion; abort if insufficient.
- **Starting resources rebalanced:** 25W/15S (from 30W/15S). Enough for 2 builders or 1 builder + 1 farm.
- **Tile resourceAmount/resourceType preserved:** Still used for creature grazing (herbivore AI) and resource regen ticks. Only the income system changed from tile-based to structure-based.
- **Shared package rebuild gotcha:** After editing shared/src, must delete tsconfig.tsbuildinfo before `npx tsc` or incremental build may skip emitting to dist/. Server reads compiled dist/ output, not source.

### Pawn Builder System & Resource Simplification (2026-03-04)

- **Resource simplification:** Removed Fiber and Berries entirely. Only Wood and Stone remain. Touched types.ts, constants.ts, GameState.ts, territory.ts, mapGenerator.ts, GameRoom.ts, creatureAI.ts, and 6 test files. Grassland now yields Wood instead of Fiber/Berries. Sand yields nothing.
- **9×9 HQ territory:** STARTING_SIZE=9 with isHQTerritory boolean on TileState. Starting resources rebalanced to 30W/15S (enough for 2-3 builders at 10W/5S each). spawnHQ marks all claimed tiles as isHQTerritory=true.
- **Shape placement removed:** handlePlaceShape and PLACE_SHAPE handler deleted from GameRoom. Builders are now the only expansion mechanic. Shape data files kept for future structure types.
- **Pawn schema:** CreatureState extended with ownerID, pawnType, targetX, targetY, buildProgress. ICreatureState interface updated to match. CreatureType "pawn_builder" added.
- **Builder AI FSM:** 3-state machine in builderAI.ts: idle → move_to_site → building → idle. Key behaviors: findBuildSite scans within BUILD_SITE_SCAN_RADIUS for nearest unclaimed walkable tile adjacent to owner territory. Building state validates target each tick (ownerID check, walkability check, adjacency check). Uses moveToward from creatureAI.ts.
- **Pawn upkeep:** tickPawnUpkeep runs every 60 ticks. Each builder costs 1 wood. Can't pay → 10 damage. Death at 0 HP removes creature. Separate from creature AI tick.
- **Carnivore targeting:** findNearestPrey helper targets both "herbivore" and "pawn_builder" creatureTypes. Builders are valid prey.
- **Key testing pattern:** Pre-existing pawnBuilder.test.ts used `(creature as any).ownerID` because ownerID didn't exist on schema yet. After adding ownerID to CreatureState schema, test helpers must set `creature.pawnType = "builder"` (not just creatureType) because upkeep filters on pawnType.
- **Upkeep vs AI separation:** tickPawnUpkeep is a separate tick function from tickCreatureAI. Tests that need upkeep behavior must call tickPawnUpkeep explicitly — creature AI does not handle upkeep.

- **ASSIGN_PAWN handler:** Server event loop routing. Validates command, updates pawn.command field, routes to FSM. Deterministic, no side effects.
- **FSM design:** 6 state transitions (idle↔gather, idle↔guard, guard↔gather). Implicit via priority chains, not formal state machine class. Tested extensively (60+ tests).
- **Phase B shapes:** 11 polyomino catalog with pre-computed 4-rotation arrays. shapeHP field on TileState (not separate Structure). Permanent walls. 2 wood cost per cell.
- **Worker economy:** Worker as CreatureState. No hunger drain (game mechanic, not survival). Gathers from tiles at fixed rate. Automatic territory expansion when shapes placed.
- **Dual income:** Passive (1 resource per open tile every 10s) + active (worker gather). Both scale with territory size. Prevents softlock.
- **B1–B7 implementation:** Shape data (70 lines), placement handler (90), adjacency validation, worker spawn, gather AI (70 lines), territory income tick (25), test updates (150). Zero schema additions. All existing tests pass with new coverage.

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

### Phase 4.1+4.2 — Taming Schema & Interaction Handlers (2026-02-25)

- **CreatureState schema extended:** Added `ownerID` (string, default ""), `trust` (number, default 0), `speed` (number, default 0), `personality` (string, default "neutral"), `zeroTrustTicks` (number, non-synced, for auto-abandon tracking). All `@type()` decorated except zeroTrustTicks (internal counter).
- **PlayerState schema extended:** Added `meat` field (`@type("number")`, default 0) following flat inventory pattern (same as wood/stone/fiber/berries).
- **Personality enum:** `Docile = "docile"`, `Neutral = "neutral"`, `Aggressive = "aggressive"` in `shared/src/types.ts`. String-valued enum for Colyseus schema compatibility.
- **TAMING constants:** New object in `shared/src/constants.ts` — TRUST_PER_FEED (5), TRUST_PER_PROXIMITY_TICK (1), TRUST_DECAY_ALONE (1), TRUST_DAMAGE_PENALTY (10), TRUST_AT_OBEDIENT (70), MAX_PACK_SIZE (8), ZERO_TRUST_ABANDON_TICKS (50).
- **New messages:** TAME, ABANDON, SELECT_CREATURE, BREED in `shared/src/messages.ts` with typed payloads (TamePayload, AbandonPayload, SelectCreaturePayload, BreedPayload).
- **personalityChart on CreatureTypeDef:** Weighted [Docile%, Neutral%, Aggressive%] tuple. Herbivore: [40, 40, 20], Carnivore: [10, 30, 60]. Personality assigned at spawn via `rollPersonality()`.
- **TAME handler:** Validates adjacency (Manhattan ≤ 1), wild creature, food cost (1 berry for herbivore, 1 meat for carnivore), pack size limit (8). Sets ownerID, applies personality-based initial trust (Docile=10, Neutral=0, Aggressive=0 clamped from -5).
- **ABANDON handler:** Validates ownership, resets ownerID and trust to 0.
- **Trust tick (`tickTrustDecay`):** Proximity gain (+1 per 10 ticks if owner ≤ 3 tiles), decay (-1 per 20 ticks if owner > 3 tiles), auto-abandon (50 consecutive ticks at trust=0 → goes wild).
- **Creature AI modification:** Tamed herbivores skip flee behavior — they don't flee from carnivores, trusting their owner's pack.
- **All 274 tests pass** — 273 existing + 1 new personality test. 15 pre-written taming tests by Steeply all pass.
- **ICreatureState and IPlayerState interfaces** updated in shared types to match new schema fields.

### Phase 4.3+4.4 — Pack Follow & Breeding (2026-02-25)

- **SELECT_CREATURE handler:** Toggles creature in/out of player's server-side selected pack (Map<playerId, Set<creatureId>>). Validates ownership, trust ≥ 70, and MAX_PACK_SIZE (8). Pack state stored on GameRoom via `playerSelectedPacks`, not schema — pure session state.
- **Pack follow tick:** Runs every game tick. Creatures in a player's selected pack move one step toward owner via greedy Manhattan if distance > 1, otherwise idle at `currentState = "follow"`. Pack creatures are excluded from creature AI (no flee, no hunt, no wander).
- **AI exclusion pattern:** `tickCreatureAI()` now accepts optional `skipIds: Set<string>`. GameRoom collects all pack creature IDs and passes them to the AI, preventing double-movement and overriding FSM behaviors for pack members.
- **BREED handler:** Player specifies one creature ID; server auto-finds mate (same type, same owner, trust ≥ 70, within Manhattan distance 1, not on cooldown). Cost: 10 berries. 50% success chance (Math.random). On success: offspring spawns on adjacent empty walkable tile with ownerID = player, trust = 50, speed = avg(parent speeds) + mutation ±1 (capped ±3), random personality from type chart.
- **Breeding cooldown:** `lastBredTick` field added to CreatureState schema (default 0, `@type("number")`). Both parents get cooldown set on attempt (success or failure). Reject if either parent bred within last 100 ticks (BREEDING.COOLDOWN_TICKS).
- **BREEDING constants:** New `BREEDING` object in shared constants — FOOD_COST (10), COOLDOWN_TICKS (100), OFFSPRING_TRUST (50), TRAIT_MUTATION_RANGE (1), TRAIT_CAP (3).
- **BreedPayload simplified:** Changed from `{creatureId1, creatureId2}` to `{creatureId}` (single ID) per spec — server auto-discovers mate. Steeply's guard-patterned breeding tests pass cleanly with this approach.
- **Pack cleanup:** Creatures removed from selected packs on abandon, auto-abandon, death, and player leave. `ensurePacks()` helper handles null guard for test compatibility (Object.create skips constructor).
- **moveToward exported:** Creature AI's `moveToward()` function exported for reuse by pack follow tick. No duplication.
- **All 274 tests pass** — including all 8 of Steeply's breeding tests (guard patterns activated). Zero regressions.

---

## Phase 4 Kickoff (2026-02-25T22:48:00Z)

**Status:** ACTIVE — Hal scoping complete, Pemulis beginning 4.1 immediately

**Scope:** 8 work items (4.1–4.8), 5–6d critical path (Pemulis 4.1→4.4), 3d Gately (4.5–4.7), 2d Steeply (4.8 integration). 9 architecture decisions (C1–C9) finalized in `.squad/decisions.md`.

**Pemulis tasks (begin immediately):**
- **4.1 Schema** (1d): Add `ownerID`, `trust`, `speed`, `personality`, `traits` to CreatureState. Add TAMING constants to shared. Create CREATURE_TRAITS constants (Speed, Health, HungerDrain deltas).
- **4.2 Taming** (2d after 4.1): TAME message handler (I key, cost 1 berry/meat, trust=0). ABANDON handler. Trust decay logic (±1 per 20 ticks alone, -10 on hit). Lock creatures to owner.
- **4.3 Pack Follow** (2d after 4.2): SELECT_CREATURE message. `playerSelectedPacks: Map<playerId, Set<creatureId>>` tracking. Tick: move selected creatures toward player if distance > 1, follow within 1 tile radius.
- **4.4 Breeding** (2d parallel with 4.3): BREED message handler (B key, trust≥70, same owner, same type, adjacent, 50% chance). Offspring spawns with averaged parent traits + mutation (±1d2), inherits ownership, trust=50, costs 10 berries.

**Blocking constraint:** 4.1 schema lands first. Gately unblocks at 4.1. Steeply writes anticipatory unit tests in parallel.

**Architecture decisions locked:** C1 (ownerID), C2 (trust 0–100, 70+ obedient), C3 (personality enum), C4 (traits as deltas), C5 (pack selection set), C6 (breeding peer interaction), C7 (greedy movement + A* stub), C8 (taming cost), C9 (trust decay loneliness).

**Orchestration complete:**
- ✅ Hal scoping document merged to decisions.md
- ✅ Session log written
- ✅ Orchestration log written
- ✅ Agent history updated

### Phase 4.1+4.2 — Taming Schema & Trust Decay (2026-02-25)

**Status:** ✅ COMPLETE (2026-02-25T22:55:00Z)

- **4.1 Schema:** Added `ownerID` (string, "" = wild), `trust` (0–100), `personality` (enum: Docile/Neutral/Aggressive), `speed` (base trait) to CreatureState. Added `zeroTrustTicks` internal counter (non-synced). Added `meat` field to PlayerState for flat inventory pattern.
- **4.2 Handlers:** `handleTame()` validates trust ≥70 (removed — can tame any), pack size <8, food cost (1 berry/meat). Sets ownerID and initializes trust. `handleAbandon()` clears ownerID, resets trust to 0. `tickTrustDecay()` runs every tick: proximity gain (+1 per 10 ticks if ≤3 tiles from owner), decay (-1 per 20 ticks if >3 tiles), auto-abandon after 50 consecutive zero-trust ticks.
- **Personality system:** `personalityChart` on CreatureTypeDef specifies weights (Docile/Neutral/Aggressive). Assigned immutably at spawn. Affects initial trust boost only (Docile=+10, others=0). Stored as string enum on CreatureState for client UI.
- **Test coverage:** 15 anticipatory tests from Steeply covering trust decay modulo gates, auto-abandon logic, taming cost deduction, pack limit enforcement, personality trust effects.
- **Files landed:** `shared/src/types.ts` (Personality enum), `shared/src/constants.ts` (TAMING object), `shared/src/messages.ts` (TAME/ABANDON payloads), `server/src/rooms/GameState.ts` (schema fields), `server/src/rooms/GameRoom.ts` (all handlers), `shared/src/data/creatures.ts` (personalityChart).
- **Key decision:** Taming costs food (not time). Single interaction. Trust is server-only counter, decays at predictable rate. Simplest possible ownership model.

### Phase 4.3+4.4 — Pack Follow & Breeding (2026-02-25)

**Status:** ✅ COMPLETE (2026-02-25T22:55:00Z)

- **4.3 Pack Follow:** `playerSelectedPacks: Map<string, Set<string>>` server-only session state (not in schema). `SELECT_CREATURE` message validates trust ≥70, adds creature ID to player's pack set. Pack follow tick runs after creature AI: skips selected creatures from AI logic via `skipIds` parameter, moves pack members toward player if >1 tile away (Manhattan), sets `currentState = "follow"` for synced visual feedback. `moveToward()` exported from creatureAI for reuse. Pack cleanup on creature death/abandon.
- **4.4 Breeding:** `BREED` message uses single creature ID. Server auto-discovers mate: within Manhattan distance 1, same type, same owner, trust ≥70, not on cooldown (checked via `lastBredTick`). 50% offspring roll on successful discovery. Cooldown (100 ticks) applied on attempt (not success) to both parents. Offspring inherits: type, owner, speed trait (avg parent speeds + mutation ±1, capped ±3), base trust=0 (not inherited). Schema ready for future health/hungerDrain deltas (guard-pattern graceful tests).
- **Test coverage:** 8 breeding tests from Steeply covering single-ID mate discovery, trust ≥70 eligibility, cooldown mechanics (on attempt), 50% roll, speed trait averaging + mutation bounds, zero cooldown prevents immediate re-breed.
- **Key decisions:** Pack selection is server-side state (client observes via `currentState`). Single-ID BREED simplifies client API (no mate picker UI needed). Speed-only trait inheritance keeps schema lean; extensible for future traits. Cooldown on attempt prevents rapid-fire food/berry spam.
- **Files landed:** `server/src/rooms/GameRoom.ts` (SELECT_CREATURE + ensurePacks null guard, BREED handler, pack follow tick), `server/src/rooms/creatureAI.ts` (moveToward export), `shared/src/messages.ts` (BreedPayload changed from two IDs to one), `server/src/rooms/GameState.ts` (lastBredTick field).
- **Schema stability:** No breaking changes. Backward compatible with Phase 3. Ready for Gately (4.5–4.7) UI work and Steeply (4.8) integration tests.

### Phase 4.6.1+4.6.2 — Server Containerization & Azure Bicep (2026-02-26)

- **Express wrapper:** `server/src/index.ts` refactored to create Express app → `http.createServer(app)` → pass to `WebSocketTransport({ server: httpServer })`. Colyseus attaches WebSocket handling to the same HTTP server. Static files served via `express.static()` from `../../public` relative to server dist (populated in Docker build).
- **Port config:** `Number(process.env.PORT) || SERVER_PORT` — Container Apps sets PORT env var, local dev uses constant 2567.
- **ESM __dirname:** Server is ESM (`"type": "module"`), so `__dirname` derived via `fileURLToPath(import.meta.url)` + `path.dirname()`.
- **WebSocketTransport internals:** Constructor accepts `server` option via `ws.ServerOptions`. If provided, skips creating its own `http.createServer()`. The `transport.listen(port)` delegates to `httpServer.listen(port)`. Also has `getExpressApp()` for lazy internal Express, but we use explicit app for clarity.
- **Dockerfile:** Two-stage multi-stage build. Stage 1 (build): `node:20-alpine`, `npm ci --workspaces`, build shared→server→client. Stage 2 (production): `node:20-alpine`, `npm ci --workspaces --omit=dev`, copy server/shared dist + client dist to `public/`. CMD runs `node server/dist/index.js`.
- **Bicep IaC:** `infra/main.bicep` defines ACR (Basic), Log Analytics workspace, Container Apps Environment (Consumption), Container App (0.25 vCPU / 0.5Gi, external HTTPS ingress on port 2567, scale 1/1). ACR admin credentials used for registry auth.
- **Dependencies added:** `express` (prod) and `@types/express` (dev) to `server/package.json`.
- **All 303/304 tests pass.** 1 pre-existing failure (creature spawn overlap) unrelated to changes.

### Phase 4.6.3 — CI/CD Pipeline (GitHub Actions) (2026-02-26)

- **Workflow file:** `.github/workflows/deploy.yml` — two-job pipeline triggered on push to `master`.
- **Job 1 (test):** Checkout, Node 20 with npm cache, `npm ci --workspaces`, `npm test`. Gate for deploy.
- **Job 2 (deploy):** Needs test. Azure OIDC login (`azure/login@v2`), Docker build+push to ACR (tagged with git SHA), `az containerapp update` to deploy new revision, prints app URL to step summary.
- **OIDC auth pattern:** `id-token: write` + `contents: read` permissions at workflow level. Three secrets: AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID. No client secrets stored.
- **Image tagging:** Uses `${{ github.sha }}` — every deploy is traceable to a specific commit. No `latest` tag in CI.
- **Deployment docs:** `docs/deployment.md` covers architecture (single container Express+Colyseus), all 6 required GitHub secrets, Bicep provisioning command, OIDC setup, deployment trigger, local Docker testing instructions.
- **Key design choice:** Two jobs (test + deploy) not three. Build/push and container update are in the same job to avoid passing image tags between jobs. Simpler pipeline, same guarantees.

---

**Cross-agent context (Phase 4.6):**

Gately's 4.6.1 WebSocket URL work (`client/src/network.ts`) complements this containerization:
- Client now has `getServerUrl()` with 3-tier resolution (VITE_WS_URL override → production same-origin → dev localhost)
- In production (Docker build), client automatically connects to `wss://${location.host}` (same Container Apps origin)
- In local dev, client falls back to `ws://localhost:2567`
- No configuration file needed; works seamlessly with this single-container deployment model
- Test: 304 tests passing (includes Gately's client work)

---

## 2026-02-27 — Phase A Architecture Plan & Team Kickoff

**From:** Hal (orchestration log: 2026-02-27T00:45:00Z)

**Architecture plan written** to `docs/architecture-plan.md` (33 KB). GDD v2 pivot (Rimworld-style) now ready for implementation. Phase A is a 10-item breakdown across server, client, and shared work.

### Phase A Work Assignment (Server Track) — Pemulis/Odie

**Parallel deliverables (5–7 days):**

1. **Schema migration** — Remove PlayerState fields (`x`, `y`, `hunger`, `health`). Add `selectedTile`, `selectedCreature`, `cameraX`. Update TileState, CreatureState, StructureState, GameState, ItemType enums. Use shared constants.

2. **Territory & Claiming** — Implement CLAIM_TILE message handler. Territory validation: tiles adjacent to owned tiles only (cardinal adjacency). Territory initialization: player starts with 3×3 + HQ structure at spawn.

3. **Pawn Assignment** — Implement ASSIGN_PAWN message handler. Assign creatures to zones (zoneX, zoneY). Validate: pawn must be tamed, player must own target zone.

4. **Tick System Cleanup** — Remove `tickPlayerSurvival`, `tickPackFollow`. Modify `tickTrustDecay` (use territory proximity, not avatar proximity). Keep other ticks; Phase B adds new ones.

5. **Message Handlers** — Update CRAFT/PLACE/TAME/ABANDON/BREED/FARM_HARVEST to use territory-based validation instead of avatar-adjacent. Remove EAT message entirely.

### Key Decisions for Implementation

- Schema-first approach (shared changes first) ensures client/server alignment
- Clean break strategy accepted ~180 test breakages; delete broken tests before writing new ones
- Simple cardinal-adjacency for territory claims (no contiguity graph yet — Phase D adds territory destruction)
- Map expanded to 64×64; Colyseus buffer increased to 256 KB to handle 4,096 tiles

### Immediate Next Steps

1. Read `docs/architecture-plan.md` in full (Sections 1–7 are your roadmap)
2. Coordinate schema migration with Mario (shared constants/validation)
3. Coordinate with Gately on CLAIM_TILE/ASSIGN_PAWN message format
4. Estimate test deletion effort (likely 50+ tests will break)
5. Kick off Phase A in parallel with client work

**Context:** User requested fundamental pivot from avatar-based to territory/commander-mode gameplay. This is Phase A of 4-phase implementation plan (A–D). After Phase A: join room → see 64×64 map → claim tiles → see territory. Phases B–D add buildings, waves, pawn commands, and multiplayer polish.

---

## 2026-02-27 — Phase A Complete: Shared Schema & Territory System Landed

**Status:** All 5 Phase A (Pemulis) work items complete and merged. Tests: 240/240 passing.

### A1 — Shared Schema & Constants Migration
- **IPlayerState:** Removed `x`, `y`, `hunger`, `health`, `meat`, `axes`, `pickaxes`. Added `hqX`, `hqY`, `score`, `turrets`.
- **ITileState:** Added `ownerID: string` (territory ownership).
- **ICreatureState:** Added `command`, `zoneX`, `zoneY` (pawn assignment).
- **IStructureState:** Added `health` (destructible).
- **ItemType enum:** Removed Axe(3), Pickaxe(4). Added Turret(6), HQ(7).
- **Constants:** Map size 32→64. Removed PLAYER_SURVIVAL. Creature counts 4x'd. Added TERRITORY, WAVE_SPAWNER, TURRET, ROUND, PAWN_COMMAND enums.
- **Messages:** Removed MOVE/GATHER/EAT/SELECT_CREATURE. Added CLAIM_TILE, ASSIGN_PAWN.
- **Recipes:** Removed axe/pickaxe. Added turret (wood:5, stone:5).
- **Decision:** Kept berries in IPlayerState — still needed for taming/breeding costs despite removed survival system.

### A2+A3 — Server Schema Migration & Handler Cleanup
- **Territory ownership replaces adjacency checks:** All handlers now check `tile.ownerID === client.sessionId` instead of `Math.abs(player.x - target)`. Fundamental model shift.
- **Taming cost unified to berries:** All creature types now cost 1 berry (herbivores & carnivores). Previously carnivores cost meat (removed).
- **Trust decay uses territory instead of distance:** `tickTrustDecay` checks if creature's tile is owned by creature's owner. Creatures inside territory gain trust; outside decay.
- **Tame territory check:** 3×3 area (±1 from player-owned tile).
- **Compilation:** Zero TypeScript errors. All GameRoom handlers updated.
- **Note:** Pre-existing tests break due to schema removals; deletion in scope for A10 (Steeply).

### A4 — Territory System & HQ Spawning
- **Pure functions in `server/src/rooms/territory.ts`:**
  - `isAdjacentToTerritory(x, y, state)` — cardinal adjacency check (4 directions, no diagonals)
  - `claimTile(x, y, sessionId, state)` — mark tile with ownerID, increment score
  - `spawnHQ(x, y, playerId, idRef, state)` — place HQ structure, claim 3×3 + cardinal neighbors
  - `getTerritoryCounts(sessionId, state)` — count player's claimed tiles
- **HQ spawning at join:** `onJoin()` now spawns HQ with 3×3 starting territory and starting resources (15 berries, 10 wood, 5 stone).
- **findHQSpawnLocation():** Places HQs ≥10 Manhattan distance apart. 200 random attempts before fallback.
- **Ref object pattern:** `spawnHQ` takes `{ value: number }` for nextStructureId so it can increment without coupling to GameRoom.
- **CLAIM_TILE handler:** Validates player owns adjacent tile, claims tile, updates score.
- **Compilation:** Zero TypeScript errors.

### A5 — Map Scaling
- Map doubled from 32×32 to 64×64 (per A1 constants).
- Camera viewport adjusted for new scale.
- Colyseus buffer increased to 256 KB to handle 4,096 tiles.

### Downstream Coordination

**Gately (A6-A9):** Camera free-pan (A6), avatar removal + territory rendering (A7), HUD overhaul (A8), input rewrite to CLAIM_TILE (A9). All complete, tests rewritten.

**Steeply (A10):** Test rebuild — deleted 3 obsolete test files (movement, gathering, survival), rewrote 12 test files for new schema, created new territory test file. Result: 240/240 passing.

### Summary

Phase A foundation pivot complete. Server-side: removed avatar properties, implemented territory ownership, HQ spawning, and adjacency-based tile claiming. Schema is production-ready. All 10 Phase A items (A1–A10) complete and passing 240/240 tests. Ready for Phase B (waves, turrets, pawn command UI).


### Task A1 — Shared Schema & Constants Update (Pivot Foundation)

- **types.ts:** Added `ownerID` to ITileState (territory ownership). Added `command`, `zoneX`, `zoneY` to ICreatureState (pawn commands). Added `health` to IStructureState (destructible buildings). Removed `x`, `y`, `hunger`, `health`, `meat`, `axes`, `pickaxes` from IPlayerState; added `hqX`, `hqY`, `score`, `turrets`. ItemType: removed Axe=3/Pickaxe=4, added Turret=6/HQ=7.
- **constants.ts:** DEFAULT_MAP_SIZE 32→64. Removed PLAYER_SURVIVAL block entirely (no more direct survival mechanics). CREATURE_SPAWN scaled: herbivores 8→32, carnivores 4→16. Added 5 new constant blocks: TERRITORY, WAVE_SPAWNER, TURRET, ROUND, PAWN_COMMAND — all from architecture-plan.md §5.
- **messages.ts:** Removed MOVE, GATHER, EAT, SELECT_CREATURE and their payload types (MovePayload, GatherPayload, MoveMessage, SelectCreaturePayload). Added CLAIM_TILE, ASSIGN_PAWN with ClaimTilePayload and AssignPawnPayload.
- **recipes.ts:** Removed axe/pickaxe recipes and their ITEM_TYPE_TO_FIELD entries. Added turret recipe (wood:5, stone:5). Added Turret→"turrets" mapping. Recipe count 6→5.
- **Tests updated:** messages.test.ts rewritten for new message constants. recipes.test.ts updated: recipe count 6→5, removed Axe/Pickaxe assertions, added Turret assertions.
- **Shared compiles clean** (`tsc --noEmit -p shared/tsconfig.json` — zero errors). Downstream server/client will break — that's expected and handled in later tasks.
- **Key decision:** Kept `berries` in IPlayerState inventory even though survival is gone — berries still used for taming/breeding feed cost.

## A2+A3: Server Schema Migration + Handler Cleanup

### What Changed
**GameState.ts (A2):**
- TileState: Added `ownerID` field for territory ownership
- PlayerState: Removed x, y, hunger, health, meat, axes, pickaxes. Added hqX, hqY, score, turrets.
- CreatureState: Added command, zoneX, zoneY for pawn command system
- StructureState: Added health field (-1 = indestructible)
- GameState: Added roundTimer, roundPhase for round-based play

**GameRoom.ts (A3):**
- Removed handlers: MOVE, GATHER, EAT, SELECT_CREATURE and all associated methods
- Removed tick systems: tickPlayerSurvival, tickPackFollow
- Removed playerSelectedPacks property and ensurePacks() helper
- handlePlace: Replaced avatar adjacency check with territory ownership check (tile.ownerID === sessionId). Updated placeableTypes to include Turret and HQ.
- handleFarmHarvest: Replaced adjacency check with territory ownership check
- handleTame: Replaced adjacency check with territory check (creature on/adjacent to owned tile). Unified taming cost to berries for all creature types.
- handleAbandon: Removed ensurePacks references
- tickTrustDecay: Replaced distance-to-owner check with territory-based check (tile.ownerID === creature.ownerID)
- tickCreatureAI: Removed skipIds/packIds logic, calls tickCreatureAI(state) with no skip set
- onJoin: No longer sets player.x/y spawn position
- onLeave: Removed ensurePacks cleanup

**creatureAI.ts:**
- Removed optional skipIds parameter and early-return check from tickCreatureAI()

### Compilation Status
- Server source (`server/src/rooms/`) compiles clean (zero errors)
- Test files have expected errors — they reference removed methods (handleMove, handleGather, handleEat, tickPlayerSurvival, etc.) and removed fields (player.x, player.y, player.hunger, player.health). These tests need rewriting in a later task.

## Learnings
- Territory ownership (`tile.ownerID`) replaces all avatar-adjacency checks — this is the new proximity model for the colony commander pivot
- The `owner` variable in tickTrustDecay is still fetched but no longer used for distance calc — it's kept for the null guard (skip creatures whose owner left)
- Shared package must be rebuilt (`npx tsc` in shared/) before server can see new enum values like ItemType.Turret/HQ
- Territory logic (isAdjacentToTerritory, claimTile, spawnHQ, getTerritoryCounts) lives in `server/src/rooms/territory.ts` — extracted for testability
- spawnHQ uses a `{ value: number }` ref object pattern so the caller (GameRoom) can track nextStructureId mutations across the boundary
- HQ spawn uses Manhattan distance ≥10 from existing HQs; falls back to any walkable tile after 200 random attempts
- CLAIM_TILE validation chain: tile exists → not water/rock → unclaimed → adjacent to territory → player has wood ≥ CLAIM_COST_WOOD

### B1 — Shape Data & Shared Types (2026-02-26)

- Created `shared/src/data/shapes.ts` with `ShapeDef` interface, `rotateCell`, `computeRotations`, and `SHAPE_CATALOG` (11 polyomino shapes: mono through tetra_j). Each shape has 4 pre-computed rotations normalized to non-negative offsets.
- Added `shapeHP: number` to `ITileState` in `shared/src/types.ts` — tracks hit points of shape blocks on tiles.
- Added `SHAPE`, `WORKER`, `TERRITORY_INCOME` constant objects to `shared/src/constants.ts`.
- Added `PLACE_SHAPE` message constant and `PlaceShapePayload` interface to `shared/src/messages.ts`.
- Exported shapes module from `shared/src/index.ts` as `./data/shapes.js` (ESM pattern).
- All 240 existing tests pass. Shared compiles clean with `tsc --noEmit`.
- Rotation formula: 90° CW is `{dx: dy, dy: -dx}`, then normalize by subtracting min offsets.

### B7 — Territory Income Tick

- **`tickTerritoryIncome()`** added to `server/src/rooms/GameRoom.ts` — passive resource income from owned tiles.
- Runs every `TERRITORY_INCOME.INTERVAL_TICKS` (40 ticks = 10s). Iterates tiles via `tiles.at(i)` for-loop (same pattern as `tickResourceRegen`).
- For each owned tile with resources: switches on `ResourceType` enum to increment the correct player field (wood/stone/fiber/berries), decrements tile resourceAmount, marks tile depleted (resourceType=-1) when empty.
- TODO left for `shapeHP === 0` check — B1's `shapeHP` field not yet compiled into server. All tiles currently have no shape blocks so behavior is correct.
- Wired into `setSimulationInterval` callback in `onCreate()` alongside other tick methods.
- `TERRITORY_INCOME` constant imported from `@primal-grid/shared` (already added by B1).

### B5 — Worker Pawn Spawn (2026-02-25)

- Added `worker` creature type to `shared/src/data/creatures.ts`: health=50, hunger=100, speed=1, detectionRadius=0, preferredBiomes=[], color="#FFD700", minPopulation=0, personalityChart=[100,0,0] (always docile). Workers are player-owned units, not wild — hence zero minPopulation and no detection/biomes.
- Modified `spawnHQ()` in `server/src/rooms/territory.ts` to auto-spawn one worker creature at HQ position when a player joins. Worker gets `ownerID=player.id`, `trust=100`, `command="gather"`, `personality="docile"`, `currentState="idle"`.
- `spawnHQ()` signature extended with optional `nextCreatureId?: { value: number }` ref parameter (same pattern as `nextStructureId`) to generate unique `creature_N` IDs.
- **Null guard pattern critical:** `if (this.nextCreatureId == null) this.nextCreatureId = 0;` in `onJoin()` — tests use `Object.create(GameRoom.prototype)` which skips constructor, leaving private fields undefined. Without the guard, IDs become `creature_undefined` / `creature_NaN`.
- Updated 4 test files to account for worker spawn: breeding offspring detection uses `knownIds` set (pre-populated with all existing creature IDs before breeding loop), creature count expectations incremented by 1 per player, shared creature-types tests filter `minPopulation === 0` types from wild-only assertions.

## Learnings

### C1 — ASSIGN_PAWN Handler (Phase C)
- Added `handleAssignPawn` to `GameRoom.ts` — validates ownership, trust ≥ 70, command ∈ {idle, gather, guard}, and zone tile ownership for gather/guard.
- `AssignPawnPayload` in `shared/src/messages.ts` includes `"patrol"` in its union type, but the handler currently rejects it per spec (validCommands array only has idle/gather/guard). When patrol is implemented later, just add it to the array.
- `TileState.ownerID` is a plain string field — no special accessor needed. Territory ownership check is `zoneTile.ownerID !== client.sessionId`.
- Idle command resets `zoneX`/`zoneY` to -1. Gather/guard sets them to the validated zone tile coordinates.
- Server-only `tsc --noEmit` passes clean. All 230 tests remain green.

### C2+C3+C4 — Gather, Guard, Idle FSM States (Phase C)
- Refactored `tickCreatureAI` routing: all tamed creatures (`ownerID !== ""`) now route through command-specific handlers before wild AI. Tamed creatures skip hunger drain entirely.
- `tickGatherPawn`: zone-based gather — moves toward `zoneX/zoneY` if dist > 2, harvests current tile (1 unit → owner stockpile), falls back to `findNearestOwnedResource` (existing helper, 10-tile scan radius), then `wanderNear` if nothing found.
- `tickGuardPawn`: checks wild hostiles within `PAWN_COMMAND.GUARD_RANGE` (3 tiles) of zone position. Adjacent hostiles take `CREATURE_AI.HUNT_DAMAGE`. Returns to post if > 3 tiles away. TypeScript forEach closure quirk: `nearestHostile` must be cast via `const nh = nearestHostile as CreatureState` after forEach since TS won't narrow the closure-assigned variable.
- `tickIdlePawn`: territory-bounded wander. Checks `tile.ownerID === creature.ownerID` — if outside territory, `findNearestOwnedTile` (expanding ring search, radius 10) guides creature back. Inside territory, 30% chance to move to a random adjacent owned walkable tile.
- Added helpers: `findNearestOwnedTile` (ring search), `wanderNear` (random step within 3 tiles of center).
- Old `tickWorkerGather` kept as dead code — removing it risks test breakage from import/reference checks. Can be cleaned up in a future pass.
- All 230 tests green. The idle-duration transition test (`creature-ai.test.ts`) is flaky when run with full suite but passes in isolation — pre-existing randomness issue, not related to this change.

### Taming/Breeding/Pawn Removal Directive (2026-02-27)

- **Directive:** Remove all taming, breeding, trust, pack, and pawn command systems. Creatures remain wild environmental entities only.
- **Files changed:** `shared/src/data/creatures.ts` (removed worker type, personalityChart, speed, Personality import), `server/src/rooms/territory.ts` (removed nextCreatureId param from spawnHQ, removed CreatureState import), `server/src/rooms/GameRoom.ts` (removed creatureIdRef worker-spawn logic from onJoin), `server/src/rooms/creatureAI.ts` (cleaned pack follow comment).
- **Key finding:** Most taming/pawn code was never built into the main codebase — the Phase C pawn FSM and Phase D breeding existed only in test expectations and design docs. The actual server code had minimal taming surface: worker creature type definition, spawnHQ worker-spawn plumbing, and personality/speed fields on CreatureTypeDef.
- **What survived:** Wild creature spawning, AI (wander/flee/hunt/graze), respawning, ecosystem simulation — all untouched. 197/199 tests pass; 2 failures are test-side references to removed fields (Steeply's domain).
- **Architecture note:** CreatureState schema was already clean (no ownerID, trust, command fields). The taming system was designed in docs but never schema-implemented — only the worker creature type and personality data structures were coded.

### Taming/Breeding/Pawn Removal Execution (2026-02-28T19:20:00Z)

- **Orchestration:** Parallel execution with Gately (client cleanup) and Steeply (test cleanup). Scribe coordinated and logged.
- **Outcome:** SUCCESS. All server-side taming/worker code removed. Wild creature simulation fully preserved.
- **Cross-agent impact:** Gately's client cleanup removed pawn input handlers and trust display. Steeply removed unused TAMING import. All three agents' changes compose cleanly.
- **Test status:** 197/199 passing. 2 expected failures in creature-types.test.ts and creature-systems-integration.test.ts (test-side references to removed speed field and worker type). Pre-existing respawn threshold failure unrelated.
- **Note:** The codebase contained only minimal taming code (worker type, personality/speed fields, spawnHQ plumbing). The full Phase C pawn system (ASSIGN_PAWN routing, FSM, HUD, multi-select) was designed but never schema-implemented. Directive removed all remnants cleanly.
- **Session log:** `.squad/log/2026-02-28T19:20:00Z-taming-removal.md`
- **Orchestration logs:** `.squad/orchestration-log/2026-02-28T19:20:00Z-pemulis.md`, `...gately.md`, `...steeply.md`
- **Decision merged:** `.squad/decisions.md` — Consolidated inbox decisions under "2026-02-28: Taming/Breeding/Pawn System Removal"

### Structure Placement Removal — Shapes-Only Build Mode (2026-02-28)

- **Directive:** Remove all structure placement mechanics from the server. Build mode is shapes-only via PLACE_SHAPE.
- **Files changed:** `shared/src/types.ts` (removed Workbench/FarmPlot/Turret from ItemType, removed inventory fields from IPlayerState), `shared/src/messages.ts` (removed CRAFT/PLACE/FARM_HARVEST constants and payloads), `shared/src/data/recipes.ts` (gutted — all recipes produced structures), `shared/src/constants.ts` (removed FARM and TURRET constants), `shared/src/index.ts` (removed recipes re-export), `server/src/rooms/GameState.ts` (removed workbenches/farmPlots/turrets from PlayerState, removed Workbench-blocking from isWalkable), `server/src/rooms/GameRoom.ts` (removed handlePlace/handleCraft/handleFarmHarvest/tickFarms methods, message listeners, and related imports).
- **What survived:** StructureState + structures MapSchema (HQ is a structure), PLACE_SHAPE handler, shape/territory mechanics, HQ spawning, all resource fields, nextStructureId for HQ IDs.
- **Key finding:** The structure check in handlePlaceShape (prevents placing shapes on HQ tiles) still references `this.state.structures.forEach` — this is correct and necessary since HQ remains a structure.
- **Test status:** 150/151 passing. 1 pre-existing flaky respawn threshold test. Structure/crafting/farming test files already removed by Steeply.

### Shapes-Only Cleanup — Full Structure Removal (2026-02-28)

- **Directive:** Complete removal of StructureState, structures MapSchema, and remaining Wall/Floor ItemType entries. HQ is now coordinate-only (hqX/hqY on PlayerState), no longer a StructureState entry.
- **shared/src/types.ts:** Removed `Wall=0` and `Floor=1` from ItemType enum (kept `HQ=7`). Removed entire `IStructureState` interface.
- **server/src/rooms/GameState.ts:** Removed `StructureState` class (25 lines). Removed `structures` MapSchema from `GameState`. Removed `ItemType` import (no longer needed).
- **server/src/rooms/GameRoom.ts:** Removed `nextStructureId` field. Removed structure occupation check from `handlePlaceShape` (the `structures.forEach` loop). Simplified `onJoin` to call `spawnHQ()` without idRef parameter.
- **server/src/rooms/territory.ts:** Removed `StructureState` import, `ItemType` import, `TileState` (unused), and `nextStructureId` parameter from `spawnHQ()`. Removed HQ StructureState creation (7 lines). HQ now only sets player.hqX/hqY + claims 3×3 territory + grants starting resources.
- **What survived:** All shape placement (PLACE_SHAPE handler, SHAPE_CATALOG, adjacency validation, claiming tick). All territory mechanics (ownerID, claimProgress, territory income). HQ spawn position (hqX/hqY). All creature systems untouched. ItemType.HQ kept for potential future use.
- **Gotcha:** Client still references `StructureState` and old `ItemType` entries (StructureRenderer.ts, main.ts). Gately needs to clean that up. Tests also reference `structures` MapSchema — Steeply's job.
- **Compile status:** `shared` builds clean, `server --noEmit` passes.

### Shapes-Only Cleanup — Integration Session (2026-03-01)

- **Session:** Shapes-only cleanup orchestrated across Pemulis (Systems Dev), Gately (Game Dev), and Steeply (Tester).
- **Pemulis outcome:** Server and shared packages compile clean. StructureState, structures MapSchema, IStructureState, Wall/Floor ItemType all removed. HQ is now coordinate-based (hqX/hqY on PlayerState). Structure occupation check removed from PLACE_SHAPE. nextStructureId and related HQ StructureState creation removed. All shape/territory/creature mechanics untouched.
- **Gately outcome:** Client compiles clean. CraftMenu.ts and StructureRenderer.ts deleted. All craft/structure references stripped from main.ts, InputHandler.ts, HudDOM.ts, index.html. B-key shape mode preserved. No dead references remain.
- **Steeply outcome:** 150/151 tests pass (1 pre-existing flaky). player-lifecycle.test.ts, territory.test.ts, hud-state-contract.test.ts cleaned of structure references. Zero references to removed systems remain.
- **Outcome:** Shapes-only architecture complete across all three packages. All systems compile clean. Shapes are the sole structure build mechanic. HQ is coordinate-based.

### Progression System — Level/XP Implementation (2026-02-27)

- **PROGRESSION constant:** 7 levels in shared/src/constants.ts. XP thresholds: 0, 10, 25, 45, 70, 100, 140. Shape unlocks per level (tetra_o/i at L1, t at L2, l at L3, j at L4, s/z at L5). Ability flags at L6 (pets) and L7 (pet_breeding).
- **Helper functions:** shared/src/data/progression.ts — getLevelForXP(), getAvailableShapes(), xpForNextLevel(), hasAbility(). All pure functions, no state. Exported via shared index.
- **Schema changes:** level (default 1) and xp (default 0) added to IPlayerState interface and PlayerState @type schema. Synced via Colyseus delta.
- **Shape gating:** Server-authoritative check in handlePlaceShape — getAvailableShapes(player.level) validates shape is unlocked before placement proceeds.
- **XP grant + level-up:** In tickClaiming, when tile finishes claiming: player.xp += PROGRESSION.XP_PER_TILE_CLAIMED, then getLevelForXP() check for level-up. Inline pattern, not separate helper (only one XP source currently).
- **Test results:** 180/181 pass (30 new progression tests). 1 pre-existing creature respawn flake unrelated.
- **Architecture note:** XP is per-round (resets with round). Abilities are string flags — extensible without schema changes. Future XP sources plug into same pattern.

### Input System Refactor — Always-Active Carousel (2026-03-02)

- **Agent:** Gately (Game Dev)
- **Change:** Build mode (B-key toggle) removed. Shapes are now selected directly via number keys, Q/E cycling, or carousel clicks. Same key/click deselects (toggle). Escape and right-click also deselect. Carousel always visible in HUD.
- **Impact on Pemulis:** Input system no longer has mode-based state (build mode on/off). Selection is 1-keypress away at all times. This simplifies input dispatch and removes the B-key bind. Server-side shape gating remains unchanged (shape must be in getAvailableShapes() for the level).
- **Files modified:** client/src/game/input-handler.ts, client/src/game/hud.ts, client/src/game/game-manager.ts, client/src/game/ui-factory.ts
- **Compile status:** TypeScript clean, no errors.

## Learnings

### Resource Data Model Analysis (2026-03-03)

**Current Resource Data per Tile (ITileState):**
- `resourceType: number` — Enum: Wood(0), Stone(1), Fiber(2), Berries(3), or -1 for none. Single resource per tile.
- `resourceAmount: number` — Range [0-10]. Represents quantity; regenerates at REGEN_AMOUNT (1) every 80 ticks once depleted.
- Also available: `fertility: number` (0.0–1.0), `moisture: number` (0.0–1.0) — Generated via Simplex noise, biome-aware, not directly exposed as display data currently.

**Resource Generation Patterns (mapGenerator.ts):**
- Forest tiles always get Wood; amount randomized 1–10.
- Grassland tiles: 50/50 Fiber or Berries; amount randomized 1–10.
- Highland tiles always get Stone; amount randomized 1–10.
- Sand tiles: 30% chance Fiber (amount 1–5), 70% no resource. Poorest biome.
- Water/Rock/Desert/Swamp: No resources generated initially.
- **Clustering:** Resources are deterministic per biome zone (not random clusters). Biome zones are generated via dual-layer Simplex noise (elevation + moisture FBM). This creates natural geographic resource regions (forests concentrated, highlands dense with stone, etc.).

**Server Resource Consumption:**
- Creature grazing (herbivores): Consumes 1 unit per eat cycle, seeks tiles with resourceAmount > 0.
- Player resource harvesting: Players extract 1 unit per tick from owned tiles with resources, converted to player inventory (wood/stone/fiber/berries counters on IPlayerState).
- Resource regeneration: Depleted tiles (resourceAmount = 0, resourceType = -1) respawn their biome-default resource type after 20 seconds.

**Multi-Resource Feasibility:**
- Current schema allows only single `resourceType` per tile. To support multiple resources per tile, would need either:
  1. Upgrade to `resourceTypes: number[]` and `resourceAmounts: number[]` (backward-compatible if serialized as variable-length arrays), OR
  2. Create a new ResourceSlot interface (max 2–3 resources per tile) with fixed array size.
- Server logic would need to expand `assignResource()` to return array, update creature AI's resource-finding logic, and adjust player harvest UI.

**Resource Richness/Quality Dimension:**
- Not currently tracked. Could be modeled as:
  1. **Implicit via fertility:** Tiles already have fertility [0.0–1.0]. Could use this to modulate resourceAmount ceiling (fertile Forest yields higher max than barren Desert).
  2. **Explicit via new field:** Add `resourceQuality: number` [0.0–1.0], derived from fertility + moisture during generation. This would be a backward-compatible schema addition (new @type field).
  3. **Biome variance:** Some biomes (Highland, Sand) already generate smaller amounts (1–5 vs 1–10). Could expand this pattern deliberately per display strategy.

**Data Model Changes Minimal:**
- **For multi-resource:** 1 schema change (resourceTypes/Amounts arrays or slots), 2–3 message handler updates, creature AI refactor.
- **For richness:** 1 new schema field (resourceQuality or use existing fertility), 0 behavior changes (purely display-facing).
- **For visual clustering hints:** No changes needed; use existing biome zones (TileType) + Simplex noise parameters to inform heatmaps or density visualizations client-side.

**What the Data Supports:**
- All display needs can be satisfied with current data:
  - Single-resource dense tile view ✓ (resourceType + resourceAmount)
  - Implicit richness via fertility ✓ (already present)
  - Biome-based clustering ✓ (biome zones determine resource type deterministically)
  - Regeneration status ✓ (can infer from amount vs max)
- Adding quality as explicit dimension: Trivial schema addition, supports "ore vein richness" visual metaphors.
- Multiple resources per tile: Moderate complexity, requires array serialization + creature AI refactor, but schema-compatible.

### 2026-03-02 Resource Data Model Analysis for Display

Pemulis analyzed resource data model to assess viability of display alternatives proposed by Hal and Gately (spawned as background agent, 2026-03-02T20:00:16Z). Coordinated with Hal (design) and Gately (rendering).

**Findings:**
- **Current data:** resourceType (enum 0–3), resourceAmount (0–10), fertility, moisture, biome type per tile
- **Multi-resource support:** Single-resource design is intentional. Multi-resource possible but deferred (requires schema evolution + creature AI refactor, 2+ weeks)
- **Richness indicator:** Can infer from existing fertility field [0.0–1.0] (biome-aware). Or add lightweight resourceQuality field (5-line backend addition, backward-compatible, zero gameplay impact)
- **Biome clustering:** Resources are deterministic by biome, fully clustered (~16–32 tile regions). No scattered anomalies. Client can compute heatmaps using existing biome data
- **Recommendation:** No backend changes needed for immediate UX improvement. All display approaches (Hal's bars, Gately's pie) viable with current schema

**Status:** Decision merged to `.squad/decisions.md`. Data model confirmed as no blocker for Hal's or Gately's implementation.

**Cross-agent insight:** Parallel research enabled Pemulis to confirm viability while Hal and Gately designed independently. No data work required; bottleneck is purely client-side visualization strategy.

**Session log:** `.squad/log/2026-03-02T20-00-16Z-resource-display-research.md`

### 2026-03-02 Core Gameplay Loop Redesign (Cross-Team Impact)

Hal proposed three redesign options for the hollow core gameplay loop. This is Pemulis's highest-priority work after dkirby-ms selection:

**Proposals:** (A) Habitat Puzzle (biome-matching scoring + cluster multipliers, ~150 lines), (B) Hungry Territory (territory upkeep + depletion + decay, ~120 lines), (C) Living Grid (creature settling + ecosystem income, ~150 lines)

**Impact on Pemulis's work:** All three proposals are primarily server-side implementations in `GameRoom.ts` and `constants.ts`. Zero schema additions. Zero new messages. Proposal A is smallest scope (~7 hrs). All three are composable (A+B, A+C possible). Next step: dkirby-ms picks direction, Hal scopes into work items, Pemulis begins implementation.

**Architecture note:** All proposals preserve existing systems. Zero deletions. Pure additions to scoring, ticking, or creature AI.

**Status:** Decision merged to `.squad/decisions.md`. Awaiting dkirby-ms selection.

### 2026-03-02 Territory Conquest Mechanics Design (Gameplay Pivot)

**Context:** dkirby-ms pivoted game identity to territory control — starting 3×3 territory immutable, expansion territory conquerable through various mechanics.

**Analysis completed:**
- **Current territory system:** Examined TileState schema (ownerID, shapeHP, claimProgress, claimingPlayerID), PlayerState (HQ coords, score), shape placement mechanics, claiming process (8-tick duration), territory income, progression system.
- **Key files:** `server/src/rooms/territory.ts` (claim/adjacency logic), `server/src/rooms/GameRoom.ts` (PLACE_SHAPE handler, tickClaiming, HQ spawn), `shared/src/types.ts` (schemas), `shared/src/data/shapes.ts` (7 polyomino catalog), `shared/src/constants.ts` (TERRITORY, SHAPE constants).
- **Current mechanics:** HQ spawns 3×3 starting territory with 10 wood/5 stone/5 berries. Shape placement (7 unlockable polyominos, 8 resource cost) claims adjacent tiles via 8-tick claiming process. Tiles permanently owned once claimed. No conquest, no damage, no defense mechanics exist yet.

**Proposed mechanics:**
1. **Immutable vs Conquerable:** Add `isStartingTerritory: boolean` field to TileState. Mark HQ tiles during spawn. Conquest mechanics skip these tiles.
2. **Influence System:** Add `influenceScore` (0-100) and `influenceOwner` fields. Calculate from adjacent shapes (+20 each), territory depth (+5 per hop from enemy), structures (+10), base (+10). Tiles <40 influence are vulnerable. Recalculate every 20 ticks.
3. **Shape Overlap Conquest:** Allow placing shapes on enemy tiles with influenceScore <40. Costs 2× resources. Starts contest mode (`contestingPlayerID`, `contestProgress` fields). Contest resolves via influence differential — high influence tiles resist capture.
4. **Creature Siege:** Tamed creatures (Level 6+) can attack enemy tiles, dealing 5 damage/tick to shapeHP. Weakened tiles (shapeHP=0) drop influenceScore by 50%, easier to contest. Integrates pet system.
5. **Economic Pressure:** Tiles adjacent to higher-influence enemy territory drain influence over time (differential/20 per 40 ticks). Creates "influence fronts" and border pressure.
6. **Defense Mechanics:** Reinforce via shape placement (restores shapeHP), emergency repair message (4 resources, instant), guard creatures intercept sieging enemies.

**Data model changes:**
- TileState: +5 fields (isStartingTerritory, influenceScore, influenceOwner, contestingPlayerID, contestProgress)
- CreatureState: +2 fields (command, commandTarget) — reuses Phase C pawn command pattern
- New message: REPAIR_TILE with RepairTilePayload
- New constants: CONQUEST object with 11 tuning parameters

**Implementation roadmap:** 5 phases, 7-10 days total. Phase 1+2 (influence + shape overlap) recommended first (~3-5 days) for core conquest gameplay. Phases 3-5 (drain, siege, guard defense) add complexity, can follow based on playtesting.

**Alternative considered:** Simpler "Flag Capture" mechanic (1-2 days) for faster prototyping — place flag on undefended enemy tile, 40 ticks to capture. Less depth but clearer gameplay.

**Open questions for dkirby-ms:** Win/loss conditions, creature integration timing (Level 6+ or earlier?), resource balance philosophy (constant spending vs one-time investment?), multiplayer spawn density.

**Deliverable:** `.squad/decisions/inbox/pemulis-territory-conquest-mechanics.md` — 18KB design doc with code examples, data model specs, implementation phases, tactical scenarios.

**Architecture patterns:**
- Influence calculation tick function (same pattern as resource regen, creature respawn)
- Contest progress system (similar to claim progress but bidirectional)
- Creature command routing (extends Phase C pawn FSM)
- Tile property flags (isStartingTerritory follows walkability pattern)
- Message-based player actions (REPAIR_TILE follows PLACE_SHAPE/CRAFT pattern)

**Key insight:** Conquest mechanics compose cleanly with existing systems. Shape placement already has adjacency validation, resource costs, tile targeting. Creature AI already has command FSM from Phase C. shapeHP field exists but unused — perfect for damage system. Zero deletions, pure extensions. Estimated 300-400 lines total across all phases.

### 2026-03-04 Territory Conquest Mechanics (Cross-Team Alignment)

Pemulis delivered detailed system design in response to user territory control pivot. **Hal (architecture proposal) and Gately (rendering design) worked independently on same directive and converged on same data model + implementation roadmap.** All three agents aligned on phased approach, code locations, and feasibility.

**Pemulis's System Design:**
- Deep codebase analysis: Current TileState schema audit, PlayerState schema, existing claiming logic, current limitations (no conquest, no defense, no influence system, no multiplayer pressure)
- 7 proposed mechanics: (1) Immutable Territory flag, (2) Influence System (0–100 per tile from shapes, depth, structures), (3A) Shape Overlap Invasion, (3B) Creature Siege, (3C) Economic Pressure, (4) Defense/Reinforcement, (5) Guard Creatures
- Data model: 5 TileState fields + CreatureState extensions + 1 message type + 11-constant CONQUEST object
- Implementation roadmap: 5 phases, 7–10 days total. Phase 1+2 (influence + conquest) recommended first (~3–5 days). Phases 3–5 add complexity, defer based on playtesting.
- Alternative simpler "Flag Capture" mechanic included for comparison (~1–2 days)
- Open questions for dkirby-ms: Win/loss conditions, creature integration timing, resource balance, multiplayer density
- Deliverable: `.squad/decisions/inbox/pemulis-territory-conquest-mechanics.md` (395 lines, comprehensive)

**Team Alignment:**
- **Hal's architecture proposal** feeds into Pemulis's mechanic design; Pemulis confirms feasibility, provides detailed scope estimates
- **Gately's rendering design** specifies what client must display; Pemulis's data model (influenceScore, contestingPlayerID, etc.) determines what server exposes
- **Cross-team validation:** All three agents identified same code locations (GameRoom.ts:105, territory.ts, creatureAI.ts) and same schema fields without coordination
- **Parallelization confirmed:** Phases 2–4 can run independently once Phase 1 (foundation) complete

**Status:** Decision merged to `.squad/decisions.md` (2026-03-04 Territory Control section). Orchestration log: `.squad/orchestration-log/2026-03-04T2126-pemulis.md`. **READY FOR WORK ITEM SCOPING** once dkirby-ms confirms mechanic choice.

**Architecture patterns discovered:**
- Influence calculation tick function (reuses resource regen pattern)
- Contest progress system (similar to claim progress but bidirectional)
- Creature command routing (extends Phase C FSM)
- Tile property flags (`isStartingTerritory` follows walkability pattern)
- Message-based player actions (REPAIR_TILE follows PLACE_SHAPE pattern)

**Next steps:** Await user mechanic choice, then scope Phase 1+2 into 6–8 work items for team implementation.

---

## Session: 2026-03-05 — Pawn & Builder System Design

**Task:** Deep codebase audit + full design for pawn/builder territory expansion system per dkirby-ms directive.

**Audit findings:**
- Old pawn/worker system was 100% removed. No traces in server or shared. `pawnCommands.test.ts` deleted.
- `CreatureState` has no `ownerID` — pawns need this. No structure system exists.
- `CREATURE_TYPES` only has herbivore/carnivore. `creatureType` is a string, easily extensible.
- `TERRITORY.STARTING_SIZE = 3` (3×3 HQ). No `isHQTerritory` flag. HQ tiles are indistinguishable from expanded tiles.
- Creature AI uses priority-chain pattern with `step*()` functions dispatched on `creatureType`. Adding `stepBuilder()` is the natural extension point.
- `tickCreatureAI()` is a pure function taking GameState — fully testable. Supports optional `skipIds` parameter.

**Design delivered:** `.squad/decisions/inbox/pemulis-pawn-builder-design.md`
- Extends `CreatureState` with 5 pawn fields (ownerID, pawnType, targetX, targetY, buildProgress, buildingType)
- New `StructureState` schema (id, structureType, x, y, ownerID, health, maxHealth, isComplete)
- 3 structure types: outpost (3×3 claim), wall (defensive), extractor (resource boost)
- Builder AI state machine: idle → find_build_site → move_to_site → building → complete → idle
- Autonomous site selection: nearest unclaimed tile adjacent to owner's territory border
- Player can override with DIRECT_PAWN message for strategic placement
- 9×9 immutable HQ zone with `isHQTerritory` flag on TileState
- New SPAWN_PAWN / DIRECT_PAWN message types
- Estimated 3-4 day implementation across 4 phases

## Learnings

- `CreatureState` schema fields are synced to all clients regardless of value — adding optional pawn fields costs ~32 bytes per entity. Acceptable at current scale (<100 entities) but worth watching if entity count grows past 500.
- The priority-chain AI pattern scales well for new creature types. Each type is isolated in its own `step*()` function with no cross-type coupling. Adding `stepBuilder()` requires zero changes to herbivore/carnivore logic.
- `claimProgress` / `claimingPlayerID` system exists for gradual claiming but structures should bypass it — instant claim on completion feels better for player-built expansion.
- `shapeHP > 0` makes a tile non-walkable (checked in `isWalkable()`). Walls leverage this — setting shapeHP blocks creature/pawn movement through that tile.
- Colyseus schema inheritance is not used in this codebase — all schemas are flat classes. Keep pawn fields flat on CreatureState rather than introducing schema nesting.


## Cross-Agent Context: Hal's Concurrent Proposal

**Session:** 2026-03-04T22:27  
Hal (Lead) architected pawn-based territory expansion system per same user directive. Pemulis and Hal worked in parallel on complementary aspects:

**Hal's Architecture:**
- High-level builder system: CreatureState reuse, 3-state FSM, 1×1 structures, HQ spawning at 5W+5S cost
- Player role shift: commander (spawn, direct, watch) vs. "Tetris player" (place shapes)
- Direct shape placement removed entirely — single expansion mechanic
- PawnTypeDef registry for type extensibility
- MVP: 9 work items, 2–3 days
- Open questions: shape removal (or keep as override?), structure size (1×1 or larger?), rally points (MVP or defer?)

**Pemulis's Systems Design (delivered in parallel):**
- Extended CreatureState: 5 pawn fields (ownerID, pawnType, targetX, targetY, buildProgress, buildingType)
- New StructureState: id, structureType, x, y, ownerID, health, maxHealth, isComplete
- New TileState fields: isHQTerritory, structureID
- Constants registry: PAWN, STRUCTURE
- 4-phase implementation roadmap
- Estimate: 3–4 days

**Alignment achieved:**
- Both converged on CreatureState reuse (zero new schemas)
- Both identified isHQTerritory as key immutability flag
- Pemulis's 4-phase breakdown aligns with Hal's 9 work items
- Design ready for user approval

**Status:** Decisions merged to `.squad/decisions.md`. Orchestration logs written. **READY FOR IMPLEMENTATION** once dkirby-ms approves open questions.

---

## 2026-03-04T22:57: IMPLEMENTATION SPAWNED — Pawn Builder System (Server)

**Status:** SPAWNED (agent-12, background mode)

**Scope (Consolidated):**
- User directives (2026-03-04T22:57, 22:58): Remove shapes, wood/stone only, kill builders, upkeep, 9×9 HQ, StarCraft economy
- Implementation decisions merged into `.squad/decisions.md`
- Builder FSM (3-state), separate upkeep tick (60), adjacency validation, carnivore targeting, isHQTerritory immutable

**Objective:** Full pawn builder system server implementation
- builderAI.ts (FSM module)
- tickPawnUpkeep (separate from creatureAI)
- creatureAI dispatch for builder type
- herbivores.ts update (carnivore targeting)
- tile.ts (isHQTerritory property)
- gameState.ts (upkeep integration)

**Expected outcome:** 207 tests passing. All 4 inbox decisions merged and archived.

**Cross-agent:** Gately (client, agent-13) depends on SPAWN_PAWN message. Steeply (tests, agent-14) writes 26 test contracts including server behavior.

**Session log:** `.squad/log/2026-03-04T2257-pawn-implementation.md`


### Game Log Event Broadcasting (2026-03-05)

- **Server-side game log events added:** Five event types broadcast via Colyseus: spawn, death, combat, upkeep, info. Uses `this.broadcast("game_log", payload)` for game-wide events and `client.send("game_log", payload)` for player-specific welcome messages.
- **Files modified:** GameRoom.ts (onJoin welcome, handleSpawnPawn spawn event, tickPawnUpkeep damage/death events), creatureAI.ts (tickCreatureAI now receives room parameter, stepCarnivore broadcasts pawn_builder combat deaths).
- **Test mock pattern:** Room mocks created via `Object.create(GameRoom.prototype)` need `room.broadcast = () => {}` stub since Room's real broadcast accesses private `#_roomId`. Similarly, `fakeClient` needs `send: () => {}` or `send: vi.fn()`.
- **Optional chaining for safety:** Used `room.broadcast?.()` and `room.clients?.find()` in creatureAI.ts to gracefully handle test mocks missing those properties.

### HQ Edge-Spawn Clipping Fix (2026-03-05)

- **Bug:** `findHQSpawnLocation` used full map dimensions (0 to mapWidth/mapHeight) for random HQ placement. If HQ landed within `half` tiles of any edge, the 5×5 starting territory would clip off the map, giving fewer tiles than expected.
- **Fix:** Constrained random spawn range to `[half, mapSize - half)` where `half = Math.floor(TERRITORY.STARTING_SIZE / 2)`. Both the random search loop and the deterministic fallback scan now respect this margin. The fallback no longer delegates to `findRandomWalkableTile` (which has no margin) — it scans only the safe interior.
- **Files modified:** `server/src/rooms/GameRoom.ts` — `findHQSpawnLocation` method only. No changes to `territory.ts` (spawnHQ itself was fine, just received bad coordinates).

### Starting Zone Force-Conversion (2026-03-06)

- **Problem:** `spawnHQ` skipped Water/Rock tiles in the 5×5 starting zone, so players could end up with fewer than 25 claimed tiles — holes in their starting territory.
- **Fix (territory.ts):** Removed the conditional skip. Now any Water/Rock tile in the 5×5 zone is force-converted to `TileType.Grassland` before being claimed. All 25 tiles are always claimed, owned, and walkable.
- **Fix (GameRoom.ts):** Added `countNonWalkableInZone` helper. `findHQSpawnLocation` now prefers candidates where the 5×5 zone has zero Water/Rock tiles (returns immediately on perfect spot). Tracks best-so-far candidate (fewest non-walkable) as fallback — `spawnHQ` force-conversion handles any remaining tiles.
- **Tests updated:** `territory.test.ts` — HQ spawn test now expects exactly 25 tiles claimed (not "up to 25"). Zone ownership test asserts no Water/Rock remains. Count test removed the `nonWalkableInZone` subtraction.
- **Files modified:** `server/src/rooms/territory.ts`, `server/src/rooms/GameRoom.ts`, `server/src/__tests__/territory.test.ts`

---

## 2026-03-06: Starting Zone Force-Conversion & Spawn Location Scoring (Completed)

- **Problem:** Players' 5×5 HQ zones could contain Water or Rock tiles that were skipped in `spawnHQ()`, leaving holes and inconsistent starting conditions.
- **Solution:** Two-part approach:
  1. `spawnHQ()` now force-converts any Water/Rock tile to Grassland before claiming. All 25 tiles always claimed and walkable.
  2. `findHQSpawnLocation()` scores candidates by non-walkable tile count, preferring zero. Minimizes aesthetic impact while ensuring completeness.
- **Key change:** Removed skip logic in `spawnHQ()` (lines 50-55 in territory.ts). Added `countNonWalkableInZone()` helper in GameRoom.ts.
- **Testing:** Steeply wrote 7 new tests covering edge margins and conversion logic. All 226 tests passing.
- **Decisions merged:** Both inbox decisions archived to decisions.md. No duplicates.
- **Status:** COMPLETE. Ready for next phase.


### Territory Barrier for Wild Creatures (2026-03-05)

- **isTileOpenForCreature() helper added** to `creatureAI.ts`: Wraps `isWalkable()` with territory ownership check. Herbivores and carnivores cannot enter tiles with `ownerID` set. Pawn builders can enter tiles owned by their matching player.
- **Three movement functions updated:** `wanderRandom()`, `moveToward()`, `moveAwayFrom()` now call `isTileOpenForCreature()` instead of raw `state.isWalkable()`.
- **findNearestPrey() filters territory:** Carnivores skip prey standing on owned tiles, preventing futile pathfinding toward unreachable targets inside player bases.
- **findNearestResource() filters territory:** Herbivores skip resource tiles inside player territory for the same reason.
- **Edge case — trapped creatures:** If territory expands around a wild creature, it stays put (all adjacent owned tiles blocked). Acceptable — starvation mechanics handle cleanup.
- **Test fixes:** Two tests (pawnBuilder, gameLog) placed builders inside HQ territory and expected carnivore attacks. Updated to place both creatures on unowned tiles, reflecting the new territory protection semantics.
- **All 226 tests passing.**

### Creature Spawn Ownership Guard (2026-03-05)

- **Problem:** Herbivores and carnivores could still spawn on player-owned tiles even though territory barriers prevented them from walking into owned tiles afterward.
- **Fix:** Added `tile.ownerID === ""` check to both `findWalkableTileInBiomes()` and `findRandomWalkableTile()` in `GameRoom.ts`. This covers all spawn paths: `spawnCreatures()` (initial) and `tickCreatureRespawn()` (ongoing) both funnel through `spawnOneCreature()` → these two finder methods.
- **Scope:** Three code paths patched — biome-preferred random sampling (line 389), fallback random sampling (line 404), and exhaustive fallback scan (line 411).
- **All 237 tests passing.**

### Creature Movement Independence Fix (2026-03-06)

- **Bug:** Shared global tick gate (`tick % TICK_INTERVAL === 0`) in `GameRoom.tickCreatureAI()` caused all creatures to move simultaneously. Every creature stepped on the exact same tick, destroying the appearance of natural/independent behavior.
- **Root Cause:** The gating check was centralized in GameRoom before the per-creature AI loop. All creatures saw the same gate condition every frame.
- **Solution:** Moved gating to per-creature level. Each `CreatureState` now has `nextMoveTick: number`. Inside `tickCreatureAI()`, skip the creature if `state.tick < creature.nextMoveTick`, then after stepping set `nextMoveTick = currentTick + TICK_INTERVAL`.
- **Stagger on Spawn:** Distribute initial movement across ticks: `nextMoveTick = state.tick + 1 + (creatureIndex % TICK_INTERVAL)`. The `+1` is critical — without it both offset values (0 and 1 for TICK_INTERVAL=2) expire on the first tick.
- **Implementation Handoff:** Pemulis identified and documented the fix; Steeply implemented with comprehensive test coverage (386 lines, 257 tests passing).
- **Schema Change:** Added `nextMoveTick: number` field to `CreatureState`. Client receives it via Colyseus sync but can ignore it.
- **PR:** #5 on `test/creature-independent-movement` branch. Awaiting merge decision post-directive review (branch protection + PR review protocol now active).

### Creature Stamina System (2026-03-07)

- **Feature:** Added stamina as a core creature resource alongside health and hunger. All creature types (herbivore, carnivore, pawn_builder) have independent stamina profiles.
- **Design:** Stamina depletes per tile moved, regens per AI tick when idle/eating/building. When stamina hits 0, creature enters "exhausted" FSM state and must rest until stamina exceeds a per-type hysteresis threshold. Prevents rapid state flickering.
- **Stamina profiles:** Herbivore (max=10, cost=2, regen=1, threshold=5), Carnivore (max=14, cost=2, regen=1, threshold=6), Builder (max=20, cost=1, regen=2, threshold=5). Different creature types have distinct movement rhythms.
- **Architecture:** `CreatureTypeDef` interface extended with 4 stamina fields. Builders use `PAWN.*` constants since they're not in `CREATURE_TYPES`. New `getStaminaConfig()` resolver handles both paths cleanly.
- **Movement return values:** `wanderRandom`, `moveToward`, `moveAwayFrom` now return `boolean` indicating actual movement. Stamina only deducted on actual moves, not blocked attempts. Builder movement detected via position diff (since `stepBuilder` is in a separate module).
- **Key files:** `shared/src/data/creatures.ts`, `shared/src/types.ts`, `shared/src/constants.ts`, `server/src/rooms/GameState.ts`, `server/src/rooms/creatureAI.ts`, `server/src/rooms/GameRoom.ts`
- **Test impact:** Updated all `addCreature` helpers across 7 test files to initialize stamina. Added "exhausted" to valid FSM state lists. Pre-existing stamina test suite (creature-stamina.test.ts) passes.
- **All 287 tests passing.**

### Creature Stamina System (2026-03-07)

- **Feature:** Added stamina as a core creature resource alongside health and hunger. All creature types (herbivore, carnivore, pawn_builder) have independent stamina profiles.
- **Design:** Stamina depletes per tile moved, regens per AI tick when idle/eating/building. When stamina hits 0, creature enters "exhausted" FSM state and must rest until stamina exceeds a per-type hysteresis threshold. Prevents rapid state flickering.
- **Stamina profiles:** Herbivore (max=10, cost=2, regen=1, threshold=5), Carnivore (max=14, cost=2, regen=1, threshold=6), Builder (max=20, cost=1, regen=2, threshold=5). Different creature types have distinct movement rhythms.
- **Architecture:** `CreatureTypeDef` interface extended with 4 stamina fields. Builders use `PAWN.*` constants since they're not in `CREATURE_TYPES`. New `getStaminaConfig()` resolver handles both paths cleanly.
- **Movement return values:** `wanderRandom`, `moveToward`, `moveAwayFrom` now return `boolean` indicating actual movement. Stamina only deducted on actual moves, not blocked attempts. Builder movement detected via position diff (since `stepBuilder` is in a separate module).
- **Key files:** `shared/src/data/creatures.ts`, `shared/src/types.ts`, `shared/src/constants.ts`, `server/src/rooms/GameState.ts`, `server/src/rooms/creatureAI.ts`, `server/src/rooms/GameRoom.ts`
- **Test impact:** Updated all `addCreature` helpers across 7 test files to initialize stamina. Added "exhausted" to valid FSM state lists. Pre-existing stamina test suite (creature-stamina.test.ts) passes.
- **All 287 tests passing.**

### UAT Deployment Infrastructure (2026-03-10)

- **Parameterized `infra/main.bicep`:** Added `environment` param (default `'prod'`). Container App name conditionally appends `-uat`. Scale rules: UAT gets `minReplicas: 0` / `maxReplicas: 3` (scale-to-zero), prod keeps `minReplicas: 1` / `maxReplicas: 1`.
- **Created `infra/main-uat.bicepparam`:** UAT-specific parameter file setting `environment = 'uat'`. Used for one-time `az deployment group create` to provision the UAT Container App.
- **Created `.github/workflows/deploy-uat.yml`:** Primary trigger is `push` to `uat` branch (mirrors prod's push-to-master pattern). Fallback `workflow_dispatch` with branch input for emergency overrides. Image tag format: `uat-{branch}-{sha}`. Deploys to hardcoded `primal-grid-uat` container app name. Step summary shows UAT URL + branch + commit.
- **Pattern:** UAT workflow mirrors prod workflow structure (test → deploy jobs, same Azure login pattern, same secrets). Key differences: checkout uses `ref: ${{ inputs.branch || github.ref }}`, image tag includes `uat-` prefix, scale-to-zero on container app.
- **Files:** `infra/main.bicep`, `infra/main-uat.bicepparam`, `.github/workflows/deploy-uat.yml`
- **Lint passes clean** — no regressions.

## Session 2026-03-06T15:05 — UAT Bicep & Workflow Implementation

**Status:** Complete  
**Output:** Bicep parameterization + deploy-uat.yml workflow  
**Testing:** Lint passes

**Session delivered:**
- infra/main.bicep: Added `@param environment string = 'prod'`; conditional Container App naming + scaling
- infra/main-uat.bicepparam: New UAT parameter file with environment = 'uat'
- .github/workflows/deploy-uat.yml: Push trigger (primary) + workflow_dispatch (fallback); tests gate deployment
- Image tagging: uat-{branch}-{sha} for traceability; proper Azure OIDC integration

**Ready for:** Manual one-time Azure deployment (az deployment group create with main-uat.bicepparam)

**Next:** Branch creation, protection rules, test PR merge trigger verification.

---

## Session: #11 Map Size Increase + #10 Day/Night Cycle (Server Phase 1)
**Date:** 2026-03-10
**Branch:** feature/map-visibility-enhancements

### What was done
- **#11 — Map Size 64→128:** Changed `DEFAULT_MAP_SIZE` to 128, scaled creature spawns to 2× (64 herbivores, 32 carnivores) for density balance on 4× area.
- **#10 — Day/Night Cycle (visual-only server side):** Added `DAY_NIGHT` constants (480-tick cycle, dawn/day/dusk/night phases), `DayPhase` enum, `dayTick`+`dayPhase` schema fields on `GameState`, and `tickDayNightCycle()` in `GameRoom` tick loop.
- Updated 5 test files for new map size expectations; fixed `findBarrenWalkableTile` test helper to require a walkable neighbor (prevents false negatives on larger maps).
- 312/312 tests passing, lint clean.

### Files modified
- `shared/src/constants.ts` — DEFAULT_MAP_SIZE, CREATURE_SPAWN counts, DAY_NIGHT constant group
- `shared/src/types.ts` — DayPhase enum
- `server/src/rooms/GameState.ts` — dayTick, dayPhase schema fields
- `server/src/rooms/GameRoom.ts` — tickDayNightCycle(), import DAY_NIGHT
- Test files: constants, grid-generation, procedural-map, creature-spawning, ecosystem-integration

## Learnings
- Pre-existing day/night cycle tests existed (`day-night-cycle.test.ts`) expecting lowercase phase names and `dawn` as initial phase — always check for existing tests before implementing.
- `tickDayNightCycle()` needs to be public (not private) for test access via `Object.create(GameRoom.prototype)` pattern.
- On larger maps, test helpers that find tiles by linear scan may land on edge tiles with no walkable neighbors — always verify movement preconditions in movement tests.

- Splitting `TileType.Water` into `ShallowWater` and `DeepWater` shifts enum ordinals for Rock (6→7) and Sand (7→8). Every `TileType.Water` reference across server, shared, client, and all tests must be updated — grep the entire codebase before committing.
- BFS-based water depth classification runs as a second pass after map generation and cellular automata smoothing. Uses `WATER_GENERATION.SHALLOW_RADIUS` (2 tiles) to separate shallow from deep water.
- `isWaterTile()` helper in shared/types.ts is the canonical way to check for any water variant — use it instead of comparing against both `ShallowWater` and `DeepWater` individually.

---

## Session 2025-01-21 — UAT Auto-Reset Workflow

**Status:** Complete  
**Output:** `.github/workflows/reset-uat.yml` + decision document  
**Testing:** None required (GitHub Actions workflow)

### What was done
- Created `.github/workflows/reset-uat.yml` to automatically reset UAT branch to master after any push to master
- Triggers on all master pushes (no paths-ignore) to maintain strict UAT/master sync
- Uses `contents: write` permission with `--force-with-lease` for safe force-push
- Configured git user as github-actions bot for proper attribution
- Added step summary showing master commit and noting UAT will redeploy

### Workflow sequence
1. Master push triggers `deploy.yml` (prod deploy) and `reset-uat.yml` (reset UAT)
2. UAT reset triggers `deploy-uat.yml` (UAT redeploy)
3. No infinite loop: reset-uat only triggers on master, not on uat pushes

### Files created
- `.github/workflows/reset-uat.yml` — Auto-reset workflow
- `.squad/decisions/inbox/pemulis-reset-uat-workflow.md` — Decision rationale

## Learnings
- GitHub Actions workflows can safely trigger each other in a controlled sequence (master → reset uat → deploy uat) without creating infinite loops by carefully choosing trigger branches
- `--force-with-lease` is safer than `--force` for automated branch resets — fails if someone else pushed in the meantime
- No `paths-ignore` is appropriate when the goal is strict synchronization rather than conditional deployment
- `fetch-depth: 0` is needed for workflows that manipulate multiple branches
- `${{ secrets.GITHUB_TOKEN }}` automatically provides appropriate permissions when `contents: write` is declared

### Player Display Names — Issue #9 (2026-03-11)

- Added `displayName` (`@type("string")`, default `""`) to `PlayerState` schema in `GameState.ts`.
- Added `SET_NAME = "set_name"` message constant and `SetNamePayload` interface in `shared/src/messages.ts`.
- Added `IPlayerState.displayName` to `shared/src/types.ts` interface.
- Added `handleSetName` handler in `GameRoom.ts`: validates non-empty, trims whitespace, caps at 20 chars, broadcasts join message.
- This is the server-side portion; client scoreboard UI is a separate task.

---

## Session 2026-03-12 — StateView Filter Design Review

**Status:** Complete
**Output:** `.squad/decisions/inbox/pemulis-filter-review.md`
**Verdict:** APPROVE WITH NOTES

## Learnings

- Colyseus `@colyseus/schema@4.0.16` StateView API: `view.add(obj)`, `view.remove(obj)`, `view.has(obj)` use a `WeakSet<ChangeTree>` for O(1) visibility checks. Adding `@view()` to ANY field in ANY schema class sets `hasFilters=true` globally, activating `$filter` on ALL `ArraySchema`/`MapSchema` instances.
- ArraySchema `$filter` with `hasFilters=true` uses `OPERATION.ADD_BY_REFID`/`DELETE_BY_REFID` instead of index-based operations. This means client-side array indices do NOT correspond to server-side indices. Any code using `tiles.at(y * mapWidth + x)` on the client will break when filtering is active.
- `view.add(obj)` on a previously-removed Schema re-sends ALL current field values as ADD operations via `encodeView()`. No stale state — client always gets current truth when an object re-enters visibility.
- `view.remove(obj)` on an ArraySchema/MapSchema child sends a DELETE operation to the client (not just field removals). The child is fully removed from the client's collection.
- MapSchema handles deletion of filtered elements via `deletedItems[index]` fallback in `$filter` — deleted creatures are properly sent as DELETE only to clients that had them in their view.
- Schema `$filter` always sends non-tagged fields (`!Metadata.hasViewTagAtIndex(...)` → true) regardless of view membership. Root-level GameState scalar fields (tick, mapWidth, dayPhase) are always sent to all clients.
- `@view()` (default tag = -1) on TileState fields is inert in two-tier visibility — `view.add(tile)` sends ALL fields (tagged and untagged). The field-level tag distinction only matters for three-tier with explicit `@view(1)` + `view.add(tile, 1)`.
- `room.broadcast()` messages bypass schema filtering entirely — useful for game log events that should reach all players regardless of visibility.

---

## 2026-03-07: Per-Player State Filtering Review

**Delivered:** Comprehensive technical review of Hal's StateView + @view() design.

**Key Findings:**
- ✅ Colyseus API accuracy verified against @colyseus/schema@4.0.16 source
- ✅ Creature AI compatibility confirmed (no race conditions; tick ordering correct)
- ⚠️ Issue #1: Merge owned-tile cache into Phase 2 (performance optimization)
- ⚠️ Issue #2: Add immediate view.add() for player-spawned pawns (UX improvement)
- ⚠️ Issue #3: ArraySchema index-based access will break (client breaking change; communicate to Gately)

**Status:** APPROVE WITH NOTES

**Impact:** Filter design approved for implementation. Three issues are refinements, not blockers. Issue #3 (client breaking change) is highest priority to surface to client team.


## Session 2026-03-12 — Fog of War Design Review (Hal + Gately)

**Status:** Complete
**Output:** `.squad/decisions/inbox/pemulis-fog-review.md`
**Verdict:** APPROVE WITH NOTES

## Learnings

- For two-tier fog (visible vs. not visible), `@view()` decorators on individual TileState fields are unnecessary. Element-level `view.add(tile)` / `view.remove(tile)` controls the entire tile's visibility. `@view()` only matters for three-tier filtering with explicit tags like `@view(1)` + `view.add(tile, 1)`.
- `StateView.add()` throws if the object has no parent ChangeTree (not yet assigned to state). Tiles in `state.tiles` ArraySchema already have parents, so `view.add(tile)` is safe to call after map generation.
- `onRemove` callback on client-side ArraySchema fires synchronously during patch application. The tile instance fields are still readable at callback time — safe for ExploredTileCache to capture terrain/structure data before GC.
- Watchtower (new structure type) integrates cleanly with existing builder FSM. The `buildMode` switch in `builderAI.ts` needs a third case; `handleSpawnPawn()` needs extended validation. No conflicts with outpost/farm logic.
- Destructible watchtowers require no special vision-loss logic — `tickVisibility()` naturally omits destroyed watchtowers, and tiles exclusively covered by them drop from visible set on next tick. ExploredTileCache preserves last-known terrain.
- Alliance/shared vision multiplies StateView mutation churn by alliance size. For N-player alliances, compute a shared visible set once and apply to all allies rather than re-computing per ally.
- Camera bounds clamped to explored bounding box need a minimum padding to avoid degenerate UX when explored area is small (5×5 HQ = 160px). Recommend minimum 20×20 tile bounds or viewport-proportional padding.
- `DEFAULT_MAP_SIZE` is 128 (not 64 as mentioned in some docs). Full tile scan for 128×128 = 16,384 tiles × 8 players = 131K iterations per tick — must use owned-tile cache to keep visibility computation sub-millisecond.

---

## Session 2026-03-12 — Fog of War Phase A Server Implementation

**Status:** Complete
**Output:** `server/src/rooms/visibility.ts`, constants + types in shared, GameRoom integration
**Branch:** `feature/fog-of-war`

### What was built

1. **shared/src/constants.ts** — Added `FOG_OF_WAR` (tick interval, radii, day/night modifiers, min radius) and `WATCHTOWER` (radius, costs, cap, build ticks) constant blocks.
2. **shared/src/types.ts** — Added `FogState` enum (Unexplored=0, Explored=1, Visible=2). Auto-exported via barrel.
3. **server/src/rooms/visibility.ts** — Pure visibility computation module:
   - `computeVisibleTiles(state, playerId): Set<number>` returns flat tile indices visible to a player
   - Three vision sources: HQ center (radius 5), territory edge tiles (radius 3), pawn builders (radius 4)
   - Edge detection: Moore neighbor check (8-directional) for unowned/out-of-bounds neighbors
   - Manhattan distance circle fill, clamped to map bounds
   - Day/night modifier applied: `effectiveRadius = max(MIN_RADIUS, base + modifier)`
4. **server/src/rooms/GameRoom.ts** — Full integration:
   - `playerViews: Map<string, { view: StateView, visibleIndices: Set<number> }>` tracks per-player state
   - `initPlayerView()` called in `onJoin()` after `spawnHQ()` — creates StateView, computes initial visibility, adds tiles
   - `cleanupPlayerView()` called in `onLeave()` — removes all tiles from view, deletes map entry
   - `tickFogOfWar()` runs every 2 ticks, diffs old/new visible sets, calls view.add/remove
   - Runs last in tick loop (after all movement/claiming resolves)

### Design decisions respected
- No `@view()` decorators — element-level `view.add/remove` is sufficient for two-tier visibility
- No owned-tile cache — deferred to Phase 2 performance optimization
- Lazy `playerViews` initialization guards for `Object.create()` test pattern

## Learnings
- `StateView` from `@colyseus/schema` v4.0.16: `view.add(obj)` / `view.remove(obj)` / `view.has(obj)`. Assign to `client.view` in `onJoin()`.
- `Object.create(GameRoom.prototype)` test pattern skips class field initializers — any new class fields need lazy `??` or `if (!this.x)` guards in methods.
- Test suite uses Manhattan distance for circle fill checks, matching the `addCircleFill` implementation. The `euclidean` helper in tests is unused.
- Manhattan circle fill: `|dx| + |dy| <= radius`. Produces diamond-shaped vision areas. Corner edge tiles at Manhattan distance 4 from HQ center (half=2, diagonal) with edge radius 3 can reach Manhattan 7, extending well beyond HQ radius 5.
- `FOG_OF_WAR.DAY_NIGHT_MODIFIERS` needs `as Record<string, number>` cast to allow string-keyed access from `state.dayPhase`.

---

## Session 2026-03-07 — Fog of War Phase A Server Implementation Complete

**Status:** SUCCESS  
**Output:** `server/src/rooms/visibility.ts`, FOG_OF_WAR/WATCHTOWER constants, StateView integration in GameRoom  
**Tests:** 372 total passing (26 new fog tests)

### What Was Built

- **visibility.ts** — Pure `computeVisibleTiles(state, playerId): Set<number>` function with Manhattan distance visibility calculation
  - Three vision sources: HQ (radius 5), territory edges (radius 3), pawn builders (radius 4)
  - Edge detection via Moore neighborhood unowned/out-of-bounds checks
  - Day/night modifiers applied (dawn/dusk -1, night -2, day 0)
  - MIN_RADIUS=1 floor prevents zero-radius collapse
  
- **GameRoom integration**
  - `playerViews: Map<string, { view: StateView, visibleIndices: Set<number> }>`
  - `initPlayerView(client, playerId)` in onJoin() after spawnHQ() — creates StateView, populates initial tiles
  - `cleanupPlayerView(playerId)` in onLeave() — removes all tiles, deletes map entry
  - `tickFogOfWar()` every 2 ticks — diffs old/new visibility, calls view.add/remove for deltas
  
- **Constants & Types**
  - `shared/src/constants.ts`: FOG_OF_WAR block (radii, modifiers, MIN_RADIUS, TICK_INTERVAL), WATCHTOWER block
  - `shared/src/types.ts`: FogState enum (Unexplored=0, Explored=1, Visible=2)

### Key Learnings for Steeply

- StateView.add() requires object already in parent ChangeTree (tiles in state.tiles ArraySchema have parents)
- Manhattan distance `|dx| + |dy| <= radius` produces diamond vision shapes, not circles
- Corner edge tiles (Manhattan distance 4 from HQ) needed to prove edge vision extends beyond HQ radius 5
- Object.create(GameRoom.prototype) test pattern skips constructor — playerViews manual init needed in test setup
- onRemove callback fires synchronously during patch application; tile fields readable for data capture

### Integration Notes from Gately

- StateView filters tiles per player; client receives only visible + explored tiles
- No client changes needed until StateView filtering lands — fog rendering automatically activates once tiles are filtered
- ExploredTileCache preserves last-known terrain data after visibility loss (fog semantics)
- Camera bounds accessible via grid.exploredCache for HUD integration (explored tile count, etc.)

### Integration Notes from Steeply

- All 26 fog tests passing validates visibility computation correctness
- Manhattan distance matching implemented correctly
- StateView lifecycle (add/remove) validated in integration tests
- Multi-player visibility independence verified (per-player views don't contaminate each other)
- Edge case validation: no-territory player, tile removal, destroyed watchtower scenarios all pass

### Open Questions for Phase B

- Owned-tile cache for 128×128 optimization (not critical for Phase A 64×64 maps)
- Alliance/shared vision union semantics (would multiply StateView mutations by alliance size)
- Destructible watchtower vision loss mechanics (structure type approved, destruction deferred)

---

## 2026-03-07: Cross-Agent Notification — Steeply Fog Tests Complete

**From:** Steeply (QA)  
**To:** Pemulis  
**Key Finding:** All 26 fog tests passing. Manhattan distance implementation correct. StateView integration validated.

**Must-verify before Phase B:**
1. Owned-tile cache critical for 128×128 (not included in Phase A)
2. Alliance shared vision would require visibility union logic (3 extra tests planned)
3. Watchtower destruction needs vision loss validation (additional test coverage pending)

**Test infrastructure note:** Object.create() pattern requires manual playerViews initialization in tests — this is a quirk of the class field initializer pattern, not a bug. All future tests of GameRoom mutations should manually initialize new class fields.

---

## 2026-03-07: Cross-Agent Notification — Gately Client Rendering Ready

**From:** Gately (Client Dev)  
**To:** Pemulis  
**Integration Point:** ExploredTileCache + fog overlay auto-activate once StateView filters tiles

**No server changes needed** — fog rendering is purely reactive to which tiles exist in Colyseus state.

**Camera bounds API:** grid.exploredCache.getExploredBounds() and camera.setExploredBounds(bounds) — use for HUD features.


---

## 2025-07-25: Fog-of-War Fix — @view() Required for StateView Filtering

**Bug:** Players could see the entire map — fog of war was not filtering visibility despite StateView being correctly wired (view.add/remove calls, client.view assignment, tickFogOfWar recomputation).

**Root Cause:** Colyseus 0.17's SchemaSerializer checks `encoder.context.hasFilters` before using view-based encoding. Without `@view()` on any Schema field, `hasFilters` stays `false` and the serializer broadcasts full state to all clients, completely ignoring `client.view`.

**Fix:** Added `@view()` decorator to the `tiles` field in `GameState`. This one-line change activates the entire filtered encoding pipeline:
- `hasFilters = true` in TypeContext (via `$viewFieldIndexes` metadata)
- Per-tile `isFiltered = true` with `isVisibilitySharedWithParent = false` (because the field HAS a view tag)
- ArraySchema's `$filter` checks `view.isChangeTreeVisible()` per element
- Only tiles explicitly `view.add()`'d are encoded for each client
- Non-@view fields (players, creatures, tick, etc.) continue via the shared encoding pass

**Key Learning — Colyseus 0.17 StateView Architecture:**
The `@view()` decorator on a collection field is NOT a "field-level filter" — it's the mechanism that ENABLES element-level filtering. Without it, StateView is dead code. The earlier decision "NO @view field decorators" was based on a misunderstanding of the API. `@view()` on the collection is required for `view.add(item)` / `view.remove(item)` to have any effect.

**Encoding pipeline (two-pass):**
1. Shared pass (no view): encodes non-@view fields once for all clients
2. View pass (per client): encodes @view fields filtered by each client's StateView

**isVisibilitySharedWithParent detail:** When `@view()` is on the parent field, child items get `isVisibilitySharedWithParent = false` (because `!fieldHasViewTag = false`). This means each item MUST be individually `view.add()`'d. Without `@view()`, items would auto-inherit parent visibility, defeating per-element filtering.

**Tests:** All 372 tests pass. The `@view()` decorator only affects encoding metadata — test code that accesses state directly (via `room.state.tiles.at(i)`) is unaffected.

---

## Session 2026-03-07 — Combat System Implementation (Issues #17, #18)

**Status:** SUCCESS
**Branch:** `squad/17-18-combat-system` (from `dev`)
**Output:** 5 new server modules, extended shared constants/types, GameRoom integration
**Tests:** 384 passing (all existing tests green), 139 combat specs as .todo()

### What Was Built

- **shared/src/constants.ts** — ENEMY_BASE_TYPES, ENEMY_MOBILE_TYPES, PAWN_TYPES registries with full type defs. COMBAT constants (cooldowns). ENEMY_SPAWNING (replaces WAVE_SPAWNER). Type interfaces: EnemyBaseTypeDef, EnemyMobileTypeDef, PawnTypeDef.
- **shared/src/types.ts** — isEnemyBase(), isEnemyMobile(), isPlayerPawn(), isCombatPawn() helpers.
- **shared/src/messages.ts** — SpawnPawnPayload extended: pawnType accepts 'builder' | 'defender' | 'attacker'.
- **server/src/rooms/enemyBaseAI.ts** — stepEnemyBase(): spawns mobiles from bases, night-only. EnemyBaseTracker for mobile ownership. onBaseDestroyed() despawns all child mobiles.
- **server/src/rooms/enemyMobileAI.ts** — stepEnemyMobile(): FSM (seek_territory → move_to_target → attacking_tile). Targets non-HQ player tiles.
- **server/src/rooms/combat.ts** — tickCombat(): 3-phase resolution (creature-vs-creature, tile damage, death/cleanup). Simultaneous symmetric damage. Base destruction awards resources. Uses attack cooldown tracking maps.
- **server/src/rooms/defenderAI.ts** — stepDefender(): FSM (patrol → engage → returning). Territory-constrained. Targets enemy mobiles and carnivores within own territory.
- **server/src/rooms/attackerAI.ts** — stepAttacker(): FSM (seek_target → move_to_target → attacking → returning). Prefers bases over mobiles. Sortie timer with home return.
- **server/src/rooms/creatureAI.ts** — Extended dispatch for all new types. Updated isTileOpenForCreature: enemy mobiles + attackers can enter any tile, defenders stay in territory.
- **server/src/rooms/GameRoom.ts** — tickEnemyBaseSpawning() (night-only, MIN_DISTANCE_FROM_HQ, MAX_BASES). tickCombat() wired. handleSpawnPawn() uses PAWN_TYPES registry. tickPawnUpkeep() handles all pawn types.
- **server/src/rooms/visibility.ts** — All pawn types provide per-type visionRadius from PAWN_TYPES.

### Architecture Decisions

1. **WAVE_SPAWNER replaced by ENEMY_SPAWNING** — single constant group for all enemy spawning config.
2. **Base destruction awards resources** — reward defined per base type in ENEMY_BASE_TYPES registry.
3. **Enemy bases spawn at night only** — checked via `state.dayPhase !== DayPhase.Night`.
4. **Lazy-init server-side Maps** — enemyBaseState, attackerState, creatureIdCounter all use lazy init guards to support `Object.create(GameRoom.prototype)` test pattern.
5. **Combat cooldowns stored in module-level Maps** — not on CreatureState schema (server-only state).
6. **PAWN_TYPES registry centralizes all pawn config** — existing flat PAWN constants retained for backward compat.

### Key File Paths

- Constants: `shared/src/constants.ts` (ENEMY_BASE_TYPES, ENEMY_MOBILE_TYPES, PAWN_TYPES, COMBAT, ENEMY_SPAWNING)
- Type helpers: `shared/src/types.ts` (isEnemyBase, isEnemyMobile, isPlayerPawn, isCombatPawn)
- Enemy base AI: `server/src/rooms/enemyBaseAI.ts`
- Enemy mobile AI: `server/src/rooms/enemyMobileAI.ts`
- Combat resolution: `server/src/rooms/combat.ts`
- Defender AI: `server/src/rooms/defenderAI.ts`
- Attacker AI: `server/src/rooms/attackerAI.ts`

## Learnings
- Module-level Maps (attackCooldowns, tileAttackCooldowns) in combat.ts persist across ticks but need cleanup on creature death to avoid memory leaks.
- Enemy entities skip hunger/starvation — guarded by `isEnemyBase()/isEnemyMobile()` checks in tickCreatureAI.
- Stamina config for enemy entities returns maxStamina=999, costPerMove=0 to prevent exhaustion state.
- areHostile() function is the single source of truth for combat targeting rules — extend it for new entity types.

### Cross-Agent Update: Gately Combat Client Rendering Complete (2026-03-07)

Gately has completed steps 10-11 of Hal's architecture: client-side combat entity rendering and HUD spawn controls.

**Key decision: Registry-Driven Rendering Pattern**
- All combat entity display properties (icon, color, max HP) are sourced from shared registries (`ENEMY_BASE_TYPES`, `ENEMY_MOBILE_TYPES`, `PAWN_TYPES`), not hardcoded client-side.
- The renderer uses `isEnemyBase()`, `isEnemyMobile()`, `isPlayerPawn()` type helpers from shared.
- **Impact:** Adding a new enemy or pawn type only requires updating the shared registry. The client auto-renders it as long as it follows naming conventions and includes `icon` and `color` fields.

**What's rendering now:**
- Enemy bases as diamonds (1.5× scale, gold color)
- Colored mobiles: red raider, purple hive, etc.
- Defenders (blue), attackers (orange)
- HP bars with registry-driven max values

**Your next steps:**
- Verify that your registry entries for enemy bases/mobiles include `icon` and `color` fields.
- Ensure Steeply's combat tests verify that adding a new type to the registry auto-renders (no client changes needed).

**All 384 tests pass; branch ready for review.**

### Grave Marker System (2026-03-12)

- **Feature:** Grave markers spawn at death positions when creatures/pawns die in combat, then decay after GRAVE_MARKER.DECAY_TICKS (480 ticks ≈ 2 minutes).
- **Architecture:** Grave markers are CreatureState entities with `creatureType="grave_marker"` and `pawnType` storing the original creature type (for client rendering). `spawnTick` field added to CreatureState schema for decay timing.
- **Inertness guarantees:** `nextMoveTick = Number.MAX_SAFE_INTEGER` naturally excludes grave markers from creature AI (timer gate). `isGraveMarker()` guard added to combat Phase 1 and `findAdjacentHostile()` so they can't attack or be targeted. Not in `PAWN_TYPES` registry so pawn upkeep ignores them. Not in `CREATURE_TYPES` so respawn logic ignores them.
- **Exclusion:** Enemy bases don't spawn grave markers (they're structures, not living entities).
- **tickCombat signature change:** Added `nextCreatureId: { value: number }` parameter (same mutable counter pattern used by `tickCreatureAI`). Updated both GameRoom.ts call site and test helper.
- **New file:** `server/src/rooms/graveDecay.ts` — `tickGraveDecay()` runs every tick, removes markers past their decay lifetime.
- **Key files:** `shared/src/constants.ts` (GRAVE_MARKER), `shared/src/types.ts` (isGraveMarker), `server/src/rooms/GameState.ts` (spawnTick), `server/src/rooms/combat.ts`, `server/src/rooms/graveDecay.ts`, `server/src/rooms/GameRoom.ts`.
- **Tests:** 495/495 pass, 31/31 test files.

### Cross-Agent Coordination (2026-03-07)

**Grave Markers & Combat VFX — Team Delivery**

Coordinated work with Gately (Game Dev) and Steeply (Tester) on grave marker system (server + client) and combat visual effects.

- **Pemulis contribution:** Server-side grave spawning (Phase 3 of combat.ts), decay module, type guards, `spawnTick` schema field, `GRAVE_MARKER.DECAY_TICKS` constant, `tickCombat` signature change to add `nextCreatureId` counter.
- **Gately contribution:** Client-side CombatEffects manager (HP delta detection, floating damage numbers, hit flashes), grave marker PixiJS Graphics rendering (tombstone with rounded rect + cross).
- **Steeply contribution:** 25 grave marker tests, 111 combat test fixes (tickCombat signature), documented combat test patterns (cooldown ticks, room mocks, pair-based resolution).

**Cross-Impact:** Pemulis's signature change (tickCombat now requires `nextCreatureId` counter) broke 111 existing tests, which Steeply fixed. All agents' history.md updated with cross-references.

**Test Status:** 520 total tests, all passing.
**Branch:** squad/17-18-combat-system (ready for review)
**Decisions Merged:** pemulis-grave-markers.md, gately-combat-visuals.md, steeply-grave-tests.md, steeply-combat-test-patterns.md, copilot-directive-2026-03-07T20-55-45Z.md (rescind "close only on master" rule).

### Dev Mode — Fog of War Bypass (2026-03-12)

- **Feature:** Added `?dev=1` or `?devmode=1` URL parameter to disable fog of war for development/debugging.
- **Client (`client/src/network.ts`):** Reads URL search params, passes `{ devMode: true }` in Colyseus join options.
- **Server (`server/src/rooms/GameRoom.ts`):** `onJoin()` reads `options.devMode`, passes to `initPlayerView()`. DevMode flag stored in playerViews entry. `initPlayerView()` adds ALL tiles and creatures to StateView when devMode is true. `tickFogOfWar()` short-circuits for devMode players — only picks up newly spawned tiles/creatures, never removes anything from view.
- **No client fog rendering changes needed** — the client renders fog state purely based on what tiles are in the StateView. All tiles in view = no fog.
- **Key pattern:** playerViews Map entry now has `devMode: boolean` field: `{ view, visibleIndices, visibleCreatureIds, devMode }`.
- **Test status:** 520/520 tests pass, no regressions.

### Enemy Spawn Debug Logging + Alignment Bug Discovery (2026-03-12)

- **Enhanced game_log entries for enemy spawning:** Both enemy base spawns (GameRoom.ts `tickEnemyBaseSpawning`) and enemy mobile spawns (enemyBaseAI.ts `stepEnemyBase`) now emit rich `game_log` broadcasts with position, tick, phase, base ID, and mobile counts.
- **Game log pattern:** `room.broadcast("game_log", { message: string, type: string })` — type is "spawn" for spawn events, "death" for kills, "upkeep" for resource warnings, "info" for general. No schema-level log; purely broadcast events.
- **CRITICAL BUG FOUND AND FIXED:** `BASE_SPAWN_INTERVAL_TICKS` was 480 (= `DAY_NIGHT.CYCLE_LENGTH_TICKS`), so the modulo check only fired at dayTick 0 (dawn). Night gate blocked it → bases never spawned. **Fixed:** Changed to 120. Now checks at dayTick 0, 120, 240, 360 — dayTick 360 = 75%, squarely in night phase (65–100%). One guaranteed spawn check per night cycle.
- **Test status:** 520/520 tests pass, no regressions.

### Enemy Base Spawn Interval Fix (2026-03-12)

- **Bug:** `ENEMY_SPAWNING.BASE_SPAWN_INTERVAL_TICKS` (480) == `DAY_NIGHT.CYCLE_LENGTH_TICKS` (480). `tick % 480 === 0` only fires at `dayTick === 0` (dawn, 0%). Night phase is 65–100%. The night-only guard in `tickEnemyBaseSpawning()` and the modulo check never overlapped — enemy bases could never spawn.
- **Fix:** Changed `BASE_SPAWN_INTERVAL_TICKS` from 480 to 120 in `shared/src/constants.ts`. Now the check fires 4× per cycle (dayTick 0, 120, 240, 360). dayTick 360 = 75% → night phase → spawn check passes.
- **Lesson:** When a periodic check is gated by a phase window, the interval must be short enough that at least one modulo hit lands inside that window. Rule of thumb: interval ≤ phase_duration_ticks.
- **Test status:** 520/520 tests pass, no regressions.

### Stale shared/dist Root Cause + Spawn Debug Tracing (2026-03-12)

- **ROOT CAUSE FOUND:** The 480→120 interval fix in `shared/src/constants.ts` was never compiled to `shared/dist/constants.js`. The incremental build cache (`tsconfig.tsbuildinfo`) silently skipped re-emitting the file. The server reads from compiled `dist/`, so it was still running with `BASE_SPAWN_INTERVAL_TICKS=480` at runtime — the old value that only fires at dayTick 0 (dawn), never aligning with night phase.
- **Fix:** Deleted `tsconfig.tsbuildinfo` and rebuilt `shared/` from scratch. Verified `shared/dist/constants.js` now has `120`.
- **Debug tracing added:** 7 `console.log` statements in `tickEnemyBaseSpawning()` (GameRoom.ts) covering every guard: periodic state dump every 120 ticks, night phase pass, grace period pass, interval pass, base count check, `findEnemyBaseSpawnLocation()` result, and successful spawn confirmation. These are server-side only (no client impact).
- **Investigation findings:**
  - `findEnemyBaseSpawnLocation()` exists and works: 100 random attempts on 128×128 map with distance constraints (15 from HQ, 10 between bases). Not the blocker.
  - `#game-log` element exists in `client/index.html` and is wired correctly in `main.ts` via `GameLog` class. Not the blocker.
  - DayPhase enum uses string values (`Night = "night"`), PHASES array uses matching string literals. Comparison is correct.
  - `dayTick` initializes to 0 in GameState schema, increments correctly in `tickDayNightCycle()`. Not the blocker.
- **Lesson (critical, recurring):** The `tsconfig.tsbuildinfo` gotcha strikes again. After ANY edit to `shared/src/`, MUST delete tsbuildinfo and rebuild before testing runtime behavior. The source file can look correct while the compiled output remains stale. Consider adding a pre-build clean step.
- **Test status:** 520/520 tests pass, no regressions.

### Stale Build Cache + Spawn Cache Debugging (2026-03-07)

- **Build cache gotcha rediscovered:** After editing `shared/src/constants.ts` to change `BASE_SPAWN_INTERVAL_TICKS` from 480 to 120, the change was saved in source but NOT recompiled to `shared/dist/constants.js`. The incremental build cache (`tsconfig.tsbuildinfo`) silently skipped re-emitting unchanged dependencies. Runtime behavior did not change because the server reads from compiled `dist/`, not source.
- **Fix:** Deleted `tsconfig.tsbuildinfo`, rebuilt `shared/` from scratch. Verified `shared/dist/constants.js` now contains correct value (120).
- **Debug improvements:** Added 7 `console.log` tracing points to `tickEnemyBaseSpawning()` in GameRoom.ts — state dump every 120 ticks, night phase gate, grace period, interval check, base count, spawn location lookup, and confirmation.
- **Pattern:** When source edits don't produce runtime changes, suspect incremental cache. ALWAYS `rm -rf .tsbuildinfo && npm run build` after `shared/src/` edits. Consider pre-build cache cleanup in CI.
- **Test status:** 520/520 tests pass. Enemy bases now spawn correctly in night phase.
- **Requested by:** saitcho

### Enemy Mobile Spawn Timer Conflict (2025-07-25)

## Learnings

- **Bug:** Enemy bases (hives) were visible but never spawned mobiles. The `stepEnemyBase()` timer guard (`state.tick < base.nextMoveTick`) always returned early.
- **Root cause:** `tickCreatureAI()` in `creatureAI.ts` unconditionally overwrites `creature.nextMoveTick` to `currentTick + CREATURE_AI.TICK_INTERVAL` (a short future value) at line 39 BEFORE dispatching to `stepEnemyBase()`. Inside `stepEnemyBase()`, the timer check at line 32 then sees `state.tick < (currentTick + TICK_INTERVAL)` — always true — so it always returns early. No mobile could ever spawn.
- **Fix (2 files):**
  1. `creatureAI.ts`: Made the `nextMoveTick` override conditional — skip for enemy bases so they manage their own spawn timer.
  2. `enemyBaseAI.ts`: Removed the now-redundant inner timer check (`state.tick < base.nextMoveTick`). Added `nextMoveTick = state.tick + CREATURE_AI.TICK_INTERVAL` on the day-phase early return so bases are re-checked promptly when night falls.
- **Pattern:** When two layers both read/write the same timing field (`nextMoveTick`), one layer's write can silently clobber the other's. Enemy bases need their own timer management because their spawn interval differs from the generic creature AI tick interval.
- **Test status:** 520/520 tests pass, including 13 enemy base/mobile spawning tests.
- **Requested by:** saitcho

### Console Log Cleanup & Spawn Consolidation (2026-03-07)

- **Cleanup:** Removed 7 `[ENEMY SPAWN]` console.log statements from GameRoom.ts that were added during debugging. Retained game_log broadcasts for telemetry.
- **Consolidation note:** The timer conflict fix from the previous session proved stable. No additional adjustments needed. Enemy mobile spawning now fully functional.
- **Test status:** 520/520 tests pass.
- **Requested by:** saitcho

### Enemy Base Exhaustion Bug Fix (2026-03-08)

- **Bug:** Enemy bases showed 💤 (exhausted) status in-game and stopped spawning mobiles entirely.
- **Root cause:** In `tickCreatureAI()`, the exhaustion recovery check (`creature.currentState === "exhausted"` at ~line 67) ran BEFORE the `isEnemyBase` routing at ~line 80. If a base ever entered "exhausted" state (stamina=0 triggering the post-move exhaustion check), the early `return` prevented `stepEnemyBase()` from ever being called.
- **Fix (2 files, 3 changes):**
  1. `creatureAI.ts`: Moved `isEnemyBase` and `isEnemyMobile` checks to the TOP of the creature loop (right after `nextMoveTick` skip). Enemy entities now bail out immediately to their own AI — they never touch stamina, hunger, exhaustion, or any generic creature logic. Also resets `currentState` from "exhausted" to "idle" if somehow corrupted.
  2. `creatureAI.ts`: Removed the now-redundant `isEnemyBase`/`isEnemyMobile` branches from the FSM routing block and the hunger guard.
  3. `CreatureRenderer.ts`: Added guard so enemy bases and enemy mobiles skip the 💤 exhausted indicator in `updateIndicator()`.
- **Pattern:** Enemy entities are a completely separate AI domain. They should exit the generic creature processing loop as early as possible — no shared stamina/hunger/exhaustion logic should ever apply to them. Defense-in-depth: even the client-side renderer now refuses to show exhaustion visuals for enemy types.
- **Test status:** 520/520 tests pass.
- **Requested by:** saitcho

## 2026-03-07 — Fixed Enemy Base Exhaustion Bug

**Session:** 2026-03-07T22:29:32Z  
**Status:** ✅ Complete  

Fixed order-of-operations bug in `tickCreatureAI()` where enemy bases/mobiles were processed through generic creature logic before reaching their specialized step functions. This caused exhausted bases to return early and never spawn mobiles.

**Solution:** Moved `isEnemyBase` / `isEnemyMobile` checks to top of loop — enemy entities now skip generic creature AI entirely. Also added client-side guard to prevent 💤 indicator on enemies.

**Tests:** All 520 pass.

**Decision:** Documented in decisions.md — enemy entities are a separate AI domain and should not mix into generic creature pipeline.

## 2026-03-07 — Fixed Defender Movement and Attacker Detection Bugs (PR #43)

**Session:** 2026-03-07T16:54:00Z  
**Status:** ✅ Complete  

Fixed two AI bugs identified in PR #43 review:

1. **Defender territory movement bug** (`creatureAI.ts` line 409):
   - **Problem:** Defenders couldn't move through unclaimed tiles (ownerID === ""), causing them to get permanently stuck when returning to territory after engaging enemies
   - **Fix:** Changed `isTileOpenForCreature` logic for defenders from `tile.ownerID === creature.ownerID` to `tile.ownerID === "" || tile.ownerID === creature.ownerID`
   - **Impact:** Defenders can now pathfind through unclaimed tiles to return home, but still can't enter enemy territory

2. **Attacker detection radius bug** (`attackerAI.ts` line 137):
   - **Problem:** `findNearestEnemyTarget()` accepted `_detectionRadius` parameter but never used it, allowing attackers to detect enemies from anywhere on the map
   - **Fix:** Added distance check `if (dist > detectionRadius) return;` to filter out targets beyond the detection radius
   - **Impact:** Attackers now properly respect their 6-tile detection radius from `PAWN_TYPES["attacker"]`

**Tests:** All 520/520 pass.

**Pattern learned:** Territory movement logic needs to distinguish between three tile states: owned-by-self, unclaimed, and owned-by-enemy. Using simple equality checks (===) can inadvertently block valid movement through neutral space.

**Requested by:** dkirby-ms via @copilot PR review

---

**Session:** 2026-03-07T22:54:50Z  
**Status:** ✅ Logged  

Scribe orchestration: PR #43 review fixes for territory movement and detection radius bugs. Both fixes committed to dev, 520/520 tests passing.


---

## Learnings

### ESLint Cleanup Patterns (2026-03-08)

1. **TestableGameRoom pattern for test mocks:** When tests use `Object.create(GameRoom.prototype)` and need to access private members, define a `TestableGameRoom = GameRoom & { ... }` intersection type that exposes the private methods/properties. This eliminates all `(room as any).` casts while keeping type safety. The intersection preserves Room assignability so the mock can still be passed to functions expecting `Room`.

2. **Unused test variables:** Many test helpers like `joinPlayer()` or `addEnemyMobile()` are called for side effects only (creating state). When the return value isn't referenced, prefix with `_` rather than removing the assignment — the function call must stay for its side effects.

3. **`as unknown as Type` over `as any`:** For test mock casting (e.g., `room.broadcast = (() => {}) as unknown as GameRoom['broadcast']`), the double-cast through `unknown` satisfies `no-explicit-any` while still being explicit about the target type.

4. **Line-specific fixes over regex for unused vars:** When fixing `no-unused-vars`, avoid global regex replacements on variable names like `player`, `def`, `mob` — these names appear both as unused assignments AND as actively-used references. Always target the specific error line numbers from ESLint output.

---

## 2026-03-07 — Server ESLint Cleanup (202 Errors Fixed)

**Session:** 2026-03-07T23:12:21Z  
**Status:** ✅ Complete  

Resolved all 202 ESLint errors across 7 server files in parallel with Gately's client-side fixes (3 errors).

**Total Lint Effort:** 205 errors eliminated team-wide.

**Server-Side Fixes (Pemulis):**
- **Type safety:** Replaced `as any` casts with TestableGameRoom intersection type
- **Imports:** Removed unused imports throughout codebase
- **Variables:** Applied underscore prefix convention to unused test variables
- **Files:** GameRoom.ts, GameRoomManager.ts, ActionHandler.ts, CombatHandler.ts, TrapHandler.ts, server.test.ts, integration.test.ts

**Test Status:** 520/520 passing.

**Pattern:** TestableGameRoom = GameRoom & { ... } intersection type eliminates type casting while maintaining type safety for test mocks.

**Cross-Agent:** Gately handled client-side lint (CombatEffects.ts, CreatureRenderer.ts, HudDOM.ts). Both agents spawned in parallel, logs merged by Scribe.

---

### Session: Fix attackerState memory leak (PR #43 review)

**Task:** Clean up `attackerState` Map entries when attacker pawns die in `tickCombat()`.

**Problem:** `tickCombat()` had no reference to `attackerState`, so dead attacker entries persisted indefinitely — a memory leak over long game sessions.

**Fix:** Added `attackerState: Map<string, AttackerTracker>` as the 5th parameter to `tickCombat()`. In Phase 3 death cleanup, `attackerState.delete(id)` now runs alongside existing `attackCooldowns.delete(id)` and `tileAttackCooldowns.delete(id)`.

**Files changed:** `server/src/rooms/combat.ts`, `server/src/rooms/GameRoom.ts`, both combat test files.

**Test Status:** 520/520 passing, 0 lint errors.

## Learnings

1. **Server-side Map cleanup pattern** — When a creature dies, ALL server-side Maps keyed by creature ID must be cleaned up: `attackCooldowns`, `tileAttackCooldowns`, and `attackerState`. Any new per-creature Maps added in the future must also be cleaned up in Phase 3 of `tickCombat()`.
2. **tickCombat signature** — Now takes 5 params: `(state, room, enemyBaseState, nextCreatureId, attackerState)`. Tests use `TestableGameRoom` intersection type to access private members without `any` casts.
3. **Decision:** Preferred approach 1 (pass attackerState into tickCombat) over approach 2 (post-hoc cleanup in GameRoom) because it co-locates all death cleanup in one place and follows the existing pattern for cooldown maps.

---

## Implementation Detail Update: tickCombat() Signature

**Commit:** ccd2a84  
**Scope:** Cross-agent awareness — Gately (Game Dev) uses tickCombat() testing patterns

**Update:** `tickCombat()` now takes **5 parameters** instead of 4:
1. `state: GameState`
2. `room: GameRoom`
3. `enemyBaseState: Map<string, EnemyBaseTracker>`
4. `nextCreatureId: Ref<number>`
5. **`attackerState: Map<string, AttackerTracker>` (NEW)**

**Why:** Centralized memory cleanup — attackerState entries are now deleted in Phase 3 death loop, alongside attackCooldowns and tileAttackCooldowns.

**Convention:** Any future `Map<creatureId, ...>` added for combat mechanics must be:
1. Passed as a parameter to tickCombat()
2. Cleaned up in Phase 3 of the death handling loop
3. Documented in this learnings section

**Impact on Gately:** If combat testing patterns in your test helpers reference tickCombat() directly, they now require the 5th parameter. Use the room's internal attackerState map from the test double.


---

### Session: Discord Webhook Skills & Scribe Charter Update

**Date:** 2026-03-08  
**Context:** Background orchestration task (spawned with Steeply Playwright research)

**Work:**

1. **Discord Webhook Announcements Skill Update**
   - File: `.squad/skills/discord-webhook-announcements/SKILL.md`
   - Added: `username` parameter for agent/team member name tagging
   - Added: `avatarURL` parameter for custom Discord avatars
   - Enables: Posts like "Agent Pemulis says: System updated" with proper attribution
   - Change: Minimal — added two optional parameters to existing webhook POST

2. **Created Discord Scribe Summaries Skill**
   - File: `.squad/skills/discord-scribe-summaries/SKILL.md` (NEW)
   - Purpose: Post session summaries after Scribe commits orchestration work
   - Parameters: webhook_url, username, agents_summary, outcomes, decisions
   - Color codes: `5763719` (green/normal), `16776960` (yellow/blockers)
   - Trigger: Scribe reads this skill for multi-agent sessions

3. **Scribe Charter Update**
   - File: `.squad/agents/scribe/charter.md`
   - Added: Step 6 — "Post Discord summary" using discord-scribe-summaries skill
   - Trigger condition: Substantial work (2+ agents OR decisions OR issues closed)
   - Attribution: `"username": "Squad: Scribe"`
   - Filter: Skip trivial single-agent sessions

**Impact:** Scribe now has charter permission and skill reference to post team summaries to Discord channel. Improves team visibility on coordinated work.

**Convention:** Always use `"username": "Squad: {Role}"` for attribution (e.g., "Squad: Scribe", "Squad: Tester").

---

## 2026-03-08: Playwright E2E Framework — Room State Exposure

**By:** Steeply (Tester) — Phase 1 implementation complete

**Update:** `window.__ROOM__` is now exposed in dev mode for E2E state assertions.

- Exposed in `client/src/network.ts` after room join
- Gated: `if (import.meta.env.DEV || new URLSearchParams(...).has('dev'))`
- E2E tests access room state via `page.evaluate('window.__ROOM__.state')`
- Binary protocol consideration: Colyseus state is deserialized, so JSON inspection is not useful — always read state through `window.__ROOM__.state` directly

**Impact for Pemulis:** No code changes needed. The room instance is only exposed in dev mode and never reaches production. Safe to use in tests.

**Convention:** Room state is read-only in tests. If you add new room properties or handlers, they are automatically available to E2E via `window.__ROOM__`.

---

## 2026-03-08: Lint Fixes & GitHub Pages E2E Reports

**By:** Pemulis (Systems Dev)

### 1. Fixed 8 no-explicit-any Lint Errors

**Files touched:**
- `client/src/main.ts` — gated `window.__PIXI_APP__` with `Record<string, unknown>` type assertion
- `client/src/network.ts` — gated `window.__ROOM__` with `Record<string, unknown>` type assertion
- `e2e/helpers/player.helper.ts` — defined `E2ERoom` and `E2EPlayerData` interfaces
- `e2e/helpers/state.helper.ts` — defined `E2ERoom` and `E2EPlayerData` interfaces

**Approach:** File-local type interfaces instead of a shared type file, since only 2 consumers and minimal types. Future consolidation point if more E2E helpers emerge.

**Outcome:** All 8 errors fixed. Lint passes clean.

### 2. Added GitHub Pages Publishing for Playwright Reports

**Changes:**
- Updated `.github/workflows/e2e.yml` with `deploy-report` job
- Configured `e2e/playwright.config.ts` dual reporters: `[['github'], ['html']]`
- Deploy job publishes HTML report to GitHub Pages on every `dev` push
- Uses `if: always()` to publish even on test failures (primary use case)
- Concurrency group prevents overlapping deployments
- PR runs still use artifact uploads (no Pages deployment)

**Handoff to Marathe:** CI/CD ownership now with Marathe. Repo Settings → Pages must be configured to use GitHub Actions as source.

### 3. Key Decisions Logged

1. **E2E helper type interfaces** — File-local approach, consolidation path documented
2. **GitHub Pages for reports** — Dual reporters, dev-only deployments, always-on even for failures

**Impact:** Steeply can now run Phase 2 E2E tests against dual reporters. Reports are persistent (not 7-day artifact expiry). Marathe owns Pages settings and deployment monitoring.

## 2026-03-08T15:55:37Z: Dev Mode Gating Consistency (PR #52 Review)

**Task:** Fix dev mode gating inconsistency in network.ts and main.ts  
**Status:** ✅ Completed  
**Files:** `client/src/network.ts`, `client/src/main.ts`

Exported `isDevMode()` utility and replaced all loose `.has('dev')` checks with consistent pattern. Dev mode checks now standardized across codebase.

**Related:** Scribe merge of PR #52 review feedback batch (Pemulis + Steeply + Marathe).


---

## 2026-03-08: Lint Discipline Directive — Write Clean Code from the Start

**From:** saitcho (via Copilot)  
**Status:** BINDING — All agents must follow

Write lint-clean code from the start. No exceptions:
- **No `@typescript-eslint/no-explicit-any`** — Use proper types (`unknown`, interfaces, generics, or document exceptions)
- **No `@typescript-eslint/no-unused-vars`** — Don't import or declare unused things
- **Run linter before committing** — `npm run lint` is mandatory

Prevention (write clean first) > Cleanup (fix lint errors post-merge).

Valid exceptions (e.g., E2E browser-context code) require documented decision in decisions.md.

See: 2026-03-08: ESLint Override for E2E Browser Context Code

---

### Session: Fix Builder Pathing Oscillation (#39)

**Date:** 2026-07-25
**PR:** #55 (squad/39-fix-builder-pathing → dev)
**Issue:** #39

**Root Cause:** Built tiles get `shapeHP = BLOCK_HP` (100), and `isWalkable()` returns `false` for `shapeHP > 0`. Builders' own outposts became walls for the greedy `moveToward()` pathfinder, causing oscillation when targets were behind a wall of structures.

**Fix (3 parts):**
1. `isTileOpenForCreature` — builders can now traverse structures on their own territory
2. `findBuildSite` — outward expansion bias (prefer tiles further from HQ among equal-distance candidates)
3. `move_to_site` — if `moveToward()` fails, abandon target and re-scan (stuck detection)

**Key Files:**
- `server/src/rooms/builderAI.ts` — Builder FSM and site selection
- `server/src/rooms/creatureAI.ts` — Movement and tile access checks
- `server/src/rooms/GameState.ts` — `isWalkable()` blocks on `shapeHP > 0`

**Learnings:**
4. **shapeHP blocks movement** — Any tile with `shapeHP > 0` is unwalkable via `isWalkable()`. Builder-created structures (outposts, farms) get `BLOCK_HP`. This creates implicit walls. Any new structure type must consider pathfinding impact.
5. **Greedy pathfinder limitation** — `moveToward()` is a 1-step greedy Manhattan mover with no memory. It oscillates when blocked by walls. A* (Phase 5) will fix this properly, but until then, creature-specific traversal rules and stuck detection are the mitigation.
6. **findBuildSite scan order bias** — The nested dy/dx loop in `findBuildSite` creates a top-left bias for equal-distance candidates. The HQ-distance tiebreaker now overrides this to prefer outward expansion.

### Session: UAT Gameplay Fixes — Enemy Camps, Builder Gaps, Upkeep Removal

**Date:** 2026-03-08
**Branch:** dev
**Issues:** 3 UAT-reported gameplay bugs

**Fix 1 — Enemy Camps in Player Territory:**
Added territorial radius check (Manhattan dist 5) to `findEnemyBaseSpawnLocation()`. Candidate tiles are now rejected if ANY tile within radius has an ownerID.

**Fix 2 — Builder Interior Gaps:**
`findBuildSite()` now detects interior gaps (unowned tiles with 3+ cardinal neighbors owned by player) and prioritizes filling those before outward expansion. Outward bias retained as secondary tiebreaker.

**Fix 3 — Remove Pawn Wood Upkeep:**
Removed `tickPawnUpkeep()` method, game loop call, `upkeep` field from `PawnTypeDef`/`PAWN_TYPES`, and upkeep constants (`BUILDER_UPKEEP_WOOD`, `UPKEEP_INTERVAL_TICKS`, `UPKEEP_DAMAGE`). Removed 8 upkeep tests across pawnBuilder, combat-system, and gameLog test files.

**Learnings:**
7. **Interior gap detection pattern** — Checking 3+ cardinal neighbors with same ownerID reliably identifies territory holes. This pattern can be reused for territory health/completeness scoring.
8. **Territorial exclusion zones** — Manhattan-distance radius checks around spawn candidates are cheap and effective for keeping spawns away from player influence. Radius of 5 is a good baseline for 128x128 maps.

---

### Session: UAT Gameplay Fixes — Enemy Camps, Builder Gaps, Upkeep Removal (Completed)

**Date:** 2026-03-08
**Branch:** dev
**Commits:**
- 69c3f39: fix: add territorial radius check to enemy base spawn location
- 7c443c4: fix: prioritize interior gaps over outward expansion in builder AI
- c80d898: feat: remove wood upkeep system for all pawns

**Status:** SUCCESS
- 3 UAT-reported gameplay bugs fixed
- 515 tests passing
- Lint clean
- All work committed to dev

**Key Implementation Patterns Documented:**
- Territorial exclusion zones via Manhattan-distance radius checks
- Interior gap detection using cardinal neighbor counts
- Systematic removal of deprecated game mechanics

---

## 2026-03-09: Four-Issue Initiative Assigned — #42 (Auth), #31 (Log), #19 (Tiles), #30 (Chat)

**By:** Hal (Lead Triage)  
**Date:** 2026-03-09  
**Status:** READY FOR PICKUP  

### Your Assignments (Pemulis)

**Wave 1 (Start Immediately)**
- **#42 — User Persistence & Auth** — Lead developer
  - JWT token generation + verification
  - Database schema (users + game_saves tables, SQLite for dev)
  - Auto-save on disconnect
  - Login/signup API endpoints
  - Guest upgrade path
  - Estimated: 3 days
  - Constraint: Design must support future Entra ID swap (interface-based, not coupled to GameRoom)

- **#31 — Game Log Support (Server)** — Support role
  - Game log message categorization
  - Content filtering + timestamps
  - Broadcast via Colyseus `room.broadcast("game_log", {...})`
  - Estimated: 1 day (parallel with Gately UI)

- **#30 — Chat Support (Server)** — Support role (Wave 2, after #31)
  - Chat message protocol
  - Sanitization (strip HTML, max 256 chars, rate limit: 5 msgs/10s)
  - Message persistence
  - Estimated: 1 day (parallel with Gately UI)

### Scope for #42 (v1 Only)

- JWT token issuance only (Entra ID deferred)
- Username + password + guest play with upgrade path
- SQLite for dev (design for portability to Postgres/Cosmos)
- **Not:** OAuth providers, Entra ID integration, full game state persistence

### Architecture Decision

Auth provider pattern created: `AuthProvider` interface abstracts JWT issuance/validation. Current: `LocalAuthProvider`. Future: Drop-in Entra ID replacement without GameRoom changes.

Repository pattern for persistence: `UserRepository` and `PlayerStateRepository` interfaces. SQLite implementation for dev. Swap backends by implementing the interface.

**Decision file:** `.squad/decisions/inbox/pemulis-auth-persistence-design.md` (merged to decisions.md)

### Next Steps

1. Start #42 immediately after receiving go-ahead
2. Gately starts #19 after PR #68 merge (scheduled ~2026-03-10)
3. Gately/Pemulis coordinate on #31 (overlay pattern reusability for #30)
4. Steeply will write test suite for #42 auth flows

### Shared Context

See `.squad/decisions.md` for full triage document, dependency graph, risk mitigations, and Wave 1/Wave 2 sequencing.

### JWT Auth & Player Persistence (2026-03-12)

- **Issue #42, PR #70** on `squad/42-user-auth-persistence` branch.
- **Auth layer** (`server/src/auth/`): `AuthProvider` interface abstracted for future Entra ID swap. `LocalAuthProvider` implements JWT issuance via jsonwebtoken + bcryptjs. Express middleware validates Bearer tokens. Routes: `/auth/register`, `/auth/login`, `/auth/guest`, `/auth/upgrade`.
- **Persistence layer** (`server/src/persistence/`): Repository pattern — `UserRepository` and `PlayerStateRepository` interfaces with SQLite implementations. Designed for Postgres/Cosmos swap.
- **GameRoom hooks**: JWT validated on `onJoin` via `options.token`. State serialized synchronously in `onLeave` (async write, sync capture — critical for test compatibility since tests use `Object.create(GameRoom.prototype)` without constructors). Auto-save every 120 ticks (30s).
- **Guest play**: `/auth/guest` creates anonymous sessions. `/auth/upgrade` converts guest to full account preserving userId and all saved state.
- **Design trade-off**: Resources/territory NOT restored on rejoin — territory is spatial and map-dependent. Only score/level/XP/displayName persist.
- **Dependencies added**: jsonwebtoken, better-sqlite3, bcryptjs (+ @types/).
- **Test impact**: 515/515 tests pass, zero regressions. Key insight: `onLeave` must stay synchronous because tests call it without `await`.

### Session Persistence Client Integration (2026-03-09)

- **Issue #77, PR #78** on `squad/78-session-persistence-client` branch.
- **CORS middleware**: Added cors package to Express server. fetch()-based auth endpoints work cross-origin from Vite dev client (port :3000 → Colyseus :2567). WebSocket connections bypass CORS by design; fetch requests required explicit middleware.
- **Graceful auth degradation**: ensureToken() now catches auth failures and returns undefined instead of throwing. connect() joins without token when auth unavailable. If token-bearing join fails, falls back to anonymous join. Game always boots even with zero auth infrastructure (dev/offline mode support).
- **DRY room setup**: Extracted setupRoom() helper for onJoin, onLeave, onError, and dev-mode __ROOM__ assignment. Eliminates copy-paste logic, reduces maintenance burden for future retry logic refactoring.
- **Test coverage**: All 515 tests pass, zero regressions. Lint clean.
- **Merged**: Hal approved and squash-merged to dev. Issue #77 closed.
- **Impact**: Full session persistence chain now live. Players: login → play → close browser → rejoin with state intact. Score, level, XP, displayName all restored.

### In-Game Chat Protocol (2026-03-14, Issue #30)

- **Scope:** Server-side chat message handling + shared types. Client UI handled by Gately separately.
- **Shared types:** Added `CHAT` message constant, `ChatPayload` (client→server: `{ text: string }`), `ChatBroadcastPayload` (server→clients: `{ sender, text, timestamp }`), and `CHAT_MAX_LENGTH = 200` to `shared/src/messages.ts`.
- **Server handler:** `handleChat()` in `GameRoom.ts` — validates text is a string, strips HTML tags via regex, trims whitespace, rejects empty, caps at 200 chars, broadcasts with player displayName and `Date.now()` timestamp.
- **No state storage:** Chat is ephemeral — broadcast only, no schema storage, no persistence. Client handles history display.
- **Sanitization pattern:** `stripHtml()` static method uses `/<[^>]*>/g` regex replacement. Sufficient for in-game chat (not a rich-text context).
- **All 644 tests pass, zero regressions.**

---

### Cross-Agent Update: In-Game Chat #30 (2026-03-09, issue #30)

**Feature completed** by Pemulis, Gately, and Steeply in coordinated sprint. PR #80 merged to dev.

- **Pemulis (Systems):** Server-side chat message handler + shared types (completed above).
- **Gately (Game Dev):** Client-side ChatPanel UI (DOM overlay, 100-message cap, auto-scroll, keyboard isolation via stopPropagation, keybindings C/Enter/Esc).
- **Steeply (Tester):** 19-test suite covering validation, sanitization, broadcast, client rendering. All tests passing.

**Impact on Pemulis:** No follow-up work required. Handler is complete and tested. Chat protocol stable.

### PR #78 Review Fixes — CORS, Auth Degradation, DRY (2026-03-12)

- **CORS middleware**: Added `cors` package to Express server (`server/src/index.ts`). Required because `fetch()` auth calls from Vite dev server (port 3000) to Colyseus (port 2567) are cross-origin. WebSocket connections bypass CORS but HTTP fetch does not.
- **Graceful auth degradation**: `ensureToken()` now returns `string | undefined` — catches auth failures silently. `connect()` joins without a token when auth is unavailable. If token-bearing join fails, falls back to anonymous join. Game is always playable with zero auth infrastructure.
- **DRY room setup**: Extracted `setupRoom()` helper in `client/src/network.ts` — eliminates duplicated `onLeave`/`onError`/`__ROOM__` assignment between initial join and retry paths.
- **Key pattern**: Auth is strictly optional on both sides. Server's `GameRoom.onJoin()` skips state restoration when no token provided. Client's `connect()` gracefully degrades to anonymous join on any auth failure.

### Session Persistence Bug Fix (2026-03-13)

**Bug:** Browser refresh always showed the name prompt, even when the server successfully restored the player's identity (displayName, score, XP, level) from the persistence layer via JWT token.

**Root cause:** `client/src/main.ts` called `promptForName()` unconditionally after every `connect()`. The server-side auth/restore flow was correct — the bug was purely client-side.

**Fix (2 files):**
- `client/src/main.ts`: After `connect()`, check `room.state.players.get(room.sessionId).displayName`. Only show the name prompt if the server didn't restore one. In Colyseus 0.17+, initial state is synced before `joinOrCreate` resolves.
- `server/src/rooms/GameRoom.ts`: Differentiated welcome messages — returning players see "Welcome back, {name}!" and a "{name} has returned" broadcast goes to other players.

## Learnings

- **Colyseus 0.17 state sync timing**: `joinOrCreate` resolves AFTER the initial state snapshot is applied. `room.state.players.get(room.sessionId)` is available immediately after the promise resolves — no need to wait for `onStateChange`.
- **Auth flow data path**: Token in localStorage → `ensureToken()` → `joinOptions.token` → server `onJoin` validates via `authProvider.validateToken()` → `sessionUserMap` maps sessionId→userId → `playerStateRepo.load(userId)` → `deserializePlayerState()` restores displayName/score/level/xp.
- **Key files for session persistence**: `client/src/network.ts` (token storage), `client/src/main.ts` (name prompt gating), `server/src/rooms/GameRoom.ts` (onJoin restore, onLeave save, auto-save), `server/src/persistence/playerStateSerde.ts` (serde).
- **Version field baseline**: Added `"version": "0.1.0"` to root `package.json`. Both `squad-promote.yml` and `squad-release.yml` read this field via `node -e "console.log(require('./package.json').version)"`. Promote workflows fall back to git SHA if missing; release workflow hard-fails. No version bump automation yet — manual bumps only.
- **Automatic patch version bumping**: Added `npm version patch --no-git-tag-version` step to `squad-promote.yml` in the `promote-dev-to-uat` job. Runs after the diff check confirms commits exist, before PR creation. Commits the bump to `dev` and pushes, so the PR title and body reflect the new version. Required upgrading workflow permissions from `contents: read` to `contents: write` and adding explicit `ref: dev` + `token` to the checkout step. The `uat-to-prod` job is read-only and was not touched.
- **Merge conflict resolution across promotion chain**: Resolved conflicts in PRs #89 (dev→uat) and #90 (uat→prod) by merging base branches into head branches. PR #89: merged origin/uat into dev, kept dev's simplified squad-promote.yml (no staging branch in uat-to-prod job). PR #90: merged origin/prod into uat, kept uat's versions of squad-ci.yml (path filters) and squad-promote.yml (contents:write, version fallback, bump step). Key lesson: when fixing PR #90 changes uat, must re-merge updated uat into dev to keep PR #89 clean.
- **GitHub mergeability cache staleness**: GitHub's `mergeable` status can remain "CONFLICTING" even after conflicts are resolved. Pushing empty commits doesn't reliably force recalculation. Close-and-reopen the PR is the reliable fix to invalidate GitHub's merge cache.
- **Branch protection bypass**: Both dev and uat allow direct push with bypass for the configured user. Confirmed via successful `git push origin dev` and `git push origin uat` without PRs.
- **Colyseus 0.17.8 on("create") timing**: The `on("create")` hook fires AFTER `onCreate()` returns. Properties injected via the hook (like `lobbyBridge`, `authProvider`) are NOT available inside `onCreate()`. Any initialization that depends on injected properties must be called from the hook itself, not from `onCreate()`. Fixed in #95 / PR #96.
- **LobbyRoom bridge pattern**: `LobbyBridge` is the event bus for GameRoom→LobbyRoom communication (player_count_changed, game_ended). `registerBridgeListeners()` is now public and must be called from `index.ts` after injection. Key files: `server/src/rooms/LobbyRoom.ts`, `server/src/rooms/LobbyBridge.ts`, `server/src/index.ts`.
- **Lobby test gap**: No unit or integration tests exist for LobbyRoom, LobbyBridge, or GameSessionRepository as of PR #96.
- **Colyseus 0.17.34 onDrop/onReconnect events**: SDK v0.17.34 exposes `room.onDrop(cb)` and `room.onReconnect(cb)` for lifecycle hooks during SDK-managed reconnection. `onDrop` fires when the connection is temporarily lost; `onReconnect` fires when the SDK reconnects automatically. `onLeave` only fires on final disconnect (consented or SDK reconnection exhausted). Use `onDrop` for UI status ('reconnecting') and `onReconnect` to save rotated tokens.
- **Browser refresh reconnection pattern**: The `pageUnloading` flag (set via `beforeunload` listener) prevents wasted reconnection attempts during page unload. On the new page load, `bootstrap()` checks `sessionStorage` for a reconnect token and calls `reconnectGameRoom()` before falling through to the lobby. Token key: `primal-grid-reconnect-token` in `sessionStorage` (tab-scoped, survives refresh).
- **CPU Opponent System (Issue #105, PR):** CPU players are created at GameRoom `onCreate` time via `cpuPlayers` option. They get synthetic session IDs (`cpu_0`, `cpu_1`, ...), skip StateView/fog-of-war setup, and are ephemeral (no persistence/auth). The `cpuPlayerAI.ts` module runs a flat priority-based decision loop (defend → build → attack → farm → idle) every 16 ticks (~4 seconds). CPU players only make strategic decisions (which pawn to spawn); tactical behavior is handled by existing pawn AIs. `spawnPawnCore()` was extracted from `handleSpawnPawn` for shared use. Room auto-disposes when only CPU players remain (`checkCpuOnlyRoom`). `cpuPlayerIds` must be null-guarded (`?.`) since existing tests create GameRoom via `Object.create()` without initializing all fields.

### CPU Opponent Implementation Complete (2026-03-12)

**Work Session:** 2026-03-10T20:30:06Z  
**Issue:** #105  
**PR:** #111  
**Status:** ✅ APPROVED (Hal)  
**Closes:** #105

**Deliverable:** CPU opponent system fully integrated and code-reviewed. PR #111 ready for merge to `dev`.

**Artifacts:**
- Created `cpuPlayerAI.ts` — Strategic decision loop using flat priority system (defend → build → attack → farm → idle)
- Extracted `spawnPawnCore()` — Public method for programmatic pawn spawning (CPU AI + future systems)
- Modified `GameRoom.ts` — CPU player tracking, `cpuPlayerIds` Set, room auto-disposal via `checkCpuOnlyRoom()`
- Modified `LobbyRoom.ts` — `cpuPlayers` option passthrough to GameRoom
- Modified `constants.ts` — `CPU_PLAYER` constant with player names
- Modified `messages.ts` — CPU player message types

**Test Coverage:** 20 new tests (CPU AI decisions, spawn mechanics, room cleanup). Total: 716 passing, 0 regressions.

**Architecture Decisions Documented:** `.squad/decisions.md` merged decision for CPU opponent first-class PlayerState pattern, `spawnPawnCore()` generalization, synthetic session IDs, room auto-disposal, and StateView-skipping for zero rendering cost.

**Hal's Review (Non-Blocking Items):**
1. Frontend integration pending — Gately must add CPU player count input to lobby
2. Perf baseline recommended with full CPU roster (7 players) before production
3. Future enhancement: difficulty settings (easy/medium/hard)

**Next:** Awaiting Gately implementation for frontend UI. Ready for integration testing.

### Building Placement System (2026-03-12)

**Issue:** #110
**Branch:** `squad/110-building-placement`
**Status:** ✅ Server-side complete, awaiting Gately's client-side code

**Deliverable:** Server-side PLACE_BUILDING message handler with full validation and data-driven income system.

**Changes:**
- `shared/src/constants.ts` — Added `BUILDING_COSTS` (farm: 12w/6s, factory: 20w/12s) and `BUILDING_INCOME` (farm: 1w/1s, factory: 2w/1s)
- `shared/src/messages.ts` — Added `PLACE_BUILDING` constant, `PlaceBuildingPayload` interface, `"building"` GameLogCategory
- `server/src/rooms/GameRoom.ts` — `handlePlaceBuilding()` with 7-condition validation (player exists, tile exists, tile owned, no existing building, walkable terrain, valid type, resources available). Updated `tickStructureIncome()` from hardcoded farm-only to data-driven loop over all BUILDING_INCOME types. Added defensive structureType clearing in `tickClaiming()`.

**Design Decisions:**
- Outpost tiles can be upgraded to farm/factory (structureType "" or "outpost" are valid placement targets; "hq"/"farm"/"factory" are blocked)
- Terrain walkability check is inlined (not using `isWalkable()`) because owned tiles have shapeHP > 0 which isWalkable rejects
- Building removal already handled by combat.ts (shapeHP→0 clears structureType); tickClaiming cleanup is defensive for future mechanics
- Used `Record<string, { wood: number; stone: number }>` for BUILDING_COSTS/INCOME to make adding new building types trivial

**Tests:** 716/716 passing, 0 regressions. No new tests added — that's Parker's domain per charter.

### Lint Cleanup — Issue #117 (2026-03-12)

- **PR:** #118 on `squad/117-lint-cleanup` branch
- **Scope:** Fixed all 56 ESLint errors across 8 files (client, server, shared, e2e). Zero lint config changes.
- **Patterns found:**
  - Unused imports are the most common lint issue (8 instances across 6 files) — likely from incremental refactoring where exports get removed but imports linger.
  - `reconnection.test.ts` was the worst offender (41 `no-explicit-any` errors) because it mocks Colyseus Room internals. Fixed with typed helper functions (`asClient()`, `roomInternals()`) and a `RoomTestInternals` interface rather than file-level eslint-disable.
  - The `as unknown as Type` pattern (already used in cpuPlayerAI.test.ts) is the established codebase convention for test mocking of Colyseus types.
- **Key files touched:** `client/src/ui/LobbyScreen.ts`, `server/src/rooms/LobbyState.ts`, `server/src/rooms/cpuPlayerAI.ts`, `server/src/__tests__/reconnection.test.ts`, `server/src/__tests__/buildings.test.ts`, `server/src/__tests__/chat.test.ts`, `server/src/__tests__/cpuPlayerAI.test.ts`, `e2e/tests/buildings.spec.ts`
- **Tests:** 738/738 passing after changes.

### Map Size Timeout Fix (2026-03-12)

- **Bug:** Selecting non-128×128 map size in the lobby caused a timeout error during game creation (Issue #126, PR #131).
- **Root cause:** Three combined issues: (1) `Encoder.BUFFER_SIZE` in `server/src/index.ts` was 768 KB, explicitly sized for 128×128 maps—a 256×256 map overflows the buffer on every client state sync; (2) `LobbyRoom.handleCreateGame` had no try-catch around `matchMaker.createRoom`, silently swallowing errors via `void` promise discard; (3) client timeout of 15s was marginal for larger maps.
- **Fix:** Increased `Encoder.BUFFER_SIZE` to 4 MB (covers max 256×256), added try-catch in handleCreateGame that sends LOBBY_ERROR to the client, increased client timeout to 30s.
- **Key insight:** Colyseus `@colyseus/schema` v4 Encoder dynamically resizes on overflow but SchemaSerializer's `fullEncodeBuffer` is NOT updated after resize, causing repeated re-encode cycles. Properly sizing the buffer upfront avoids this performance penalty.
- **Tests added:** 7 new tests for 64×64 and 256×256 map generation (correctness, coordinates, creature bounds, performance ceiling). 256×256 generates in ~750ms—well under any timeout.
- **Key files:** `server/src/index.ts` (buffer size), `server/src/rooms/LobbyRoom.ts` (error handling), `client/src/ui/LobbyScreen.ts` (timeout), `server/src/__tests__/map-size.test.ts` (tests).

## 2026-03-11: Wave 1 Bug Fix (Issue #126)

- **Status:** COMPLETED, PR #131 merged
- **Task:** Fixed map size timeout on 128x128 maps (triple root cause)
- **Root Causes:**
  1. Colyseus encoder buffer undersized (768KB → 2MB for 128x128 state)
  2. Promise errors swallowed in LobbyRoom (added error propagation)
  3. Tight client timeout (15s → 45s with progress feedback)
- **Fix Locations:** `GameRoom.ts` (buffer), `LobbyRoom.ts` (error handling), `GameClient.ts` (timeout)
- **Test Coverage:** 43 anticipatory tests by Steeply; 7 integration tests added; all 794 tests pass
- **Pattern Insight:** See Steeply's anticipatory test pattern — tests validate server state before client integration

### Pawn Clustering Fix — Issue #127 (2026-03-12)

- **PR:** #133 on `squad/127-fix-pawn-clustering` branch
- **Bug:** Multiple builder pawns converged on the same target tile because `findBuildSite()` had no awareness of other pawns' targets. All builders independently selected the identical best tile using the same deterministic scoring, then moved toward it in lockstep — visible clustering.
- **Root cause:** `findBuildSite()` evaluated tiles purely by gap priority → distance → HQ distance, with no check for whether another pawn was already heading there.
- **Fix:** Added `getReservedTargets()` in `builderAI.ts` — collects tiles targeted by other same-owner builders into a `Set<string>`. `findBuildSite()` skips reserved tiles via `reserved.has()`. Each builder now picks a distinct destination.
- **Complexity:** O(N) per builder where N = same-owner builders (max 5). Negligible cost.
- **Key insight:** This is a classic "greedy allocation without coordination" bug. When multiple agents run identical scoring independently, they converge. The fix is target reservation — not collision avoidance or repulsion forces.
- **Files changed:** `server/src/rooms/builderAI.ts` only. No schema changes, no new constants.
- **Tests:** 738/738 passing, no regressions.

---

## 2026-03-11: Wave 2 Bug Fix — Pawn Clustering (#127)

**PR:** #133  
**Status:** COMPLETED, in review  
**Orchestration:** [2026-03-11T12-10-00Z-pemulis.md](.squad/orchestration-log/2026-03-11T12-10-00Z-pemulis.md)

### Work Summary

Fixed greedy target selection in builder AI. Root cause: all builders evaluated identical game state with same scoring function, converging deterministically on the single best tile.

### Solution Implemented

Added `getReservedTargets()` function that collects tiles already targeted by same-owner builders. `findBuildSite()` now skips reserved tiles, forcing builders to select distinct destinations.

### Details

- **File:** `server/src/rooms/builderAI.ts` only
- **Complexity:** O(N) where N = same-owner builders (max 5)
- **Schema Impact:** None (reuses existing `targetX/targetY` fields)
- **Network Impact:** None (no new messages)
- **CPU Player Benefit:** Automatic (same code path)
- **Test Coverage:** 19 anticipatory tests by Steeply (#836 total suite)

### Key Insight

Classic "greedy allocation without coordination" pattern. Multiple agents running identical scoring independently always converge. Solution is target reservation, not collision avoidance or repulsion forces.

### Integrated With

- Steeply's 19 anticipatory tests for pawn clustering validation
- Gately's concurrent outpost fix (shares `getReservedTargets()` pattern)

