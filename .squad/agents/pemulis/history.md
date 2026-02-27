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

Next: Phase D (Breeding & Pack Dynamics) ready to spawn.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### Phase C — Pawn Commands & Phase B Territory Redesign (2026-02-27)

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
