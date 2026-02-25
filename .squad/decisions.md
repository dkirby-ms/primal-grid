# Decisions

> Team decisions that all agents must respect. Append-only. Managed by Scribe.

<!-- New decisions are appended below by Scribe from .squad/decisions/inbox/ -->

## 2026-02-25: Phase 2.3 — HUD Rendering Architecture

**Date:** 2026-02-25  
**Author:** Gately (Game Dev)  
**Status:** Active

### Decisions

1. **HUD is screen-fixed on `app.stage`** — not on `grid.container`. Bars stay in viewport top-left regardless of camera pan/zoom.
2. **HudRenderer follows existing binding pattern** — `bindToRoom(room)` with duck-typed `Record<string, unknown>` state access. Same pattern as PlayerRenderer, CreatureRenderer, GridRenderer.
3. **Defaults to 100/100** — if server hasn't sent `health` or `hunger` fields yet, bars render full. No visual glitch, no crash.
4. **Color thresholds for bar fill** — health and hunger bars shift color based on value (green/orange→orange→red). Provides at-a-glance status without reading numbers.
5. **`connectToServer` now receives `app`** — needed so HUD can be added to `app.stage` (fixed screen space) rather than world container.

### Implications

- Any new HUD elements (inventory, status effects) should follow the same pattern: create in `connectToServer`, add to `app.stage`.
- Pemulis's `hunger` and `health` fields on PlayerState will be picked up automatically when they land — no client rebuild needed.

## 2026-02-25: Phase 2.3+2.5 — Player Survival & Creature AI Implementation

**Date:** 2026-02-25  
**Author:** Pemulis (Systems Dev)  
**Status:** Active

### Decisions

1. **EAT message has no payload** — consume 1 berry, restore 20 hunger. Simplest possible eat action; food types can be extended later.
2. **Player health floors at 1** — per A7, no player death. Starvation makes the player hurt but never kills.
3. **Creature AI is a standalone function** — `tickCreatureAI(state: GameState)` in `creatureAI.ts`. No Room dependency, testable in isolation.
4. **FSM is implicit via priority chains** — not a formal state machine class. Each creature type has a priority-ordered behavior chain evaluated each tick. States are string labels for client display.
5. **Carnivore kills remove prey immediately** — no corpse, no loot. Creature respawning (Phase 2.6) will replenish populations.
6. **Herbivore grazing depletes tile resources** — same depletion logic as player gathering. Resource regen handles regrowth.
7. **All AI/survival constants in shared** — `PLAYER_SURVIVAL` and `CREATURE_AI` objects in `shared/src/constants.ts`. Tunable without touching logic.

### Implications

- Client needs to handle `hunger` and `health` fields on PlayerState (Gately: HUD bars).
- Client should reflect `currentState` string on creatures for visual feedback.
- Phase 2.6 ecosystem integration can tune all constants without code changes.
- Creature population will decline without respawning (2.6 adds threshold respawn).

## 2026-02-25: User Directives & Phased Implementation Plan (Consolidated)

**Date:** 2026-02-25  
**Authors:** dkirby-ms (user), Hal (Lead)  
**Status:** Active  
**Last Updated:** 2026-02-25T01:42Z (Scribe consolidated from inbox)

### User Directives (Foundational)

**Client-server architecture, browser-based multiplayer:**
- **Rendering:** 2D canvas using PixiJS v8 (not Phaser)
- **Backend:** Colyseus (multiplayer game server framework)
- **Auth:** OAuth/OIDC support (Entra ID, Google) — Phase 7
- **Perspective:** Top-down only; isometric deferred indefinitely

### Phased Implementation Plan (8 Phases)

| Phase | Name | Focus | Deliverable |
|-------|------|-------|-------------|
| **0** | Scaffolding | Monorepo setup, CI/build | npm workspaces, CI passes |
| **1** | Walking Skeleton | Client-server grid, two-player sync | Grid rendering, player movement |
| **2** | Core Simulation | Creatures, biomes, survival | Living world with AI |
| **3** | Base Building | Crafting, buildings, farming | Inventory, recipes, structures |
| **4** | Creature Systems | Taming, breeding, pack AI | Personality, behavioral hierarchy |
| **5** | World Events | Weather, disasters, migration, ruins | Dynamic environmental changes |
| **6** | Late Game | Tech tree, automation, terraforming | Long-term progression |
| **7** | Auth & NPCs | OAuth/OIDC, persistence, settlements | Multi-player persistence, NPCs |

### Architecture Decisions (Consolidated from Hal)

1. **Monorepo:** npm workspaces (three packages: `client`, `server`, `shared`)
2. **Rendering:** PixiJS v8, top-down 2D canvas
3. **Server:** Colyseus with WebSocket schema-delta state sync
4. **Bundler:** Vite (HMR, ESM, PixiJS-friendly)
5. **Testing:** Vitest (server + shared); manual smoke tests for client
6. **Game Simulation:** Tick-based (4 ticks/sec, configurable per deployment)
7. **State Sync:** Viewport-based chunking; client receives only entities/tiles within radius
8. **Creature AI:** Finite state machine; simple, debuggable, extensible per phase
9. **Game Content:** Data-driven (JSON configs in `shared` package); no hardcoded gameplay data
10. **Auth Service:** Separate Express/Fastify app; issues JWTs; game server validates only (Phase 7)
11. **Persistence:** SQLite initially (zero-config); migration path to Postgres for multi-server scaling
12. **NPCs:** Basic factions only (settlements, trading, disposition); full diplomacy deferred

### Scope Fence

**Explicitly out of scope for this plan:** modding, aquatic/arctic biomes, mythical creatures, PvP, audio, isometric view, full faction diplomacy, tactical combat, DLC, mobile, i18n.

### Key Principle

**Each phase must be playable/demonstrable before advancing.** Ship the core loop first; defer all speculative features.

## 2026-02-25: Phase 0 Client & Root Scaffolding

**Date:** 2026-02-25  
**Author:** Gately (Game Dev)  
**Status:** Active

1. **PixiJS v8 async init pattern** — `new Application()` + `await app.init({...})` is the v8 API.
2. **Vite 6** chosen for client bundling — native ESM, fast HMR, good PixiJS compatibility.
3. **Vite dev server port 3000** — leaves 2567 (Colyseus default) free for game server.
4. **Root tsconfig uses `moduleResolution: "bundler"`** — best fit for Vite + TypeScript monorepo.
5. **ESLint 8 + @typescript-eslint** — `.eslintrc.cjs` (CJS required, root is ESM).
6. **Canvas size 800×600** — initial dev viewport. Responsive in Phase 1.
7. **`concurrently`** for parallel dev scripts — runs client and server from root.

### Implications
- All agents use `moduleResolution: "bundler"` in tsconfigs.
- Client renders into `<div id="app">`.

## 2026-02-25: Phase 0 Server & Shared Package Setup

**Date:** 2026-02-25  
**Author:** Pemulis (Systems Dev)  
**Status:** Active

1. **Colyseus 0.15+ with WebSocketTransport** — `new Server({ transport: new WebSocketTransport() })`.
2. **GameState Schema** — minimal Colyseus Schema with tick counter. Extend in Phase 1.
3. **Shared package is dependency-free** — types, enums, constants, messages only.
4. **Message protocol convention** — string constants + typed payloads in `shared/src/messages.ts`.
5. **ESM + project references** — both packages use `"type": "module"`. TypeScript project references for type checking.

### Implications
- Phase 1 extends GameState with player maps and tile arrays.
- New messages follow the pattern in `messages.ts`.
- All game constants live in `shared/src/constants.ts`.

## 2026-02-25: Phase 0 Test Setup

**Date:** 2026-02-25  
**Author:** Steeply (Tester)  
**Status:** Active

1. **Vitest config:** Root-level `vitest.config.ts` with explicit include patterns. No per-workspace vitest configs.
2. **Test file convention:** `<package>/src/__tests__/<module>.test.ts`.
3. **No client tests yet:** Manual smoke tests. Automated client tests deferred.
4. **Server tests import source directly** — Vitest handles TypeScript natively.

### Test Coverage (Phase 0)
- shared types: 2 tests
- shared constants: 3 tests
- shared messages: 4 tests
- server GameState: 2 tests
- server GameRoom: 1 test
- **Total: 12 tests passing**

## 2026-02-25: Phase 1 Tile & Player Schema

**Date:** 2026-02-25  
**Author:** Pemulis (Systems Dev)  
**Status:** Active

1. **Tile Grid: Flat ArraySchema** — row-major indexing (index = `y * mapWidth + x`), not nested. Constant-time lookup.
2. **Movement: Directional** — `{ dx, dy }` (each -1, 0, or 1), not absolute coordinates. Prevents teleportation.
3. **Walkability Model** — Water and Rock impassable; Grass and Sand walkable. Extend via `isWalkable()`, never bypass.
4. **Player Spawn Strategy** — random walkable tile with 100-attempt cap + linear fallback.

### Validation
- Grid generates 32×32 with mixed biomes.
- Players spawn on walkable tiles.
- Movement validation blocks non-adjacent moves.

## 2026-02-25: Phase 1 Client Rendering Architecture

**Date:** 2026-02-25  
**Author:** Gately (Game Dev)  
**Status:** Active

1. **Grid renders immediately with default grass** — client doesn't wait for server. Server tile data overwrites.
2. **Generic state binding via `Record<string, unknown>`** — duck-typed access avoids schema coupling.
3. **WASD = camera, Arrows = player** — clean separation. Camera continuous, player discrete (150ms debounce).
4. **Click-to-move sends absolute coordinates** — arrows send direction `{ dx, dy }`.
5. **Player rendering is snap-to-position** — no interpolation. Smooth movement deferred.
6. **Connection failure = offline mode** — no crash, no modal.

### Impact
- Client works standalone for visual testing.
- Rendering adapts dynamically to schema changes.
- No rebuild needed when Pemulis changes shape.

## 2026-02-25: Phase 2 — Core Simulation Scoping & Breakdown

**Date:** 2026-02-25  
**Author:** Hal (Lead)  
**Status:** Active  
**Last Updated:** 2026-02-25T15:23:41Z (Scribe merged from inbox)

### Vision

Minimum viable "living world" — creatures roam, ecosystems function, player survives.

### Scope Fence (Phase 2)

**In scope:** Biomes, procedural maps, creatures with FSM AI, basic resources, gathering, player hunger/health, creature food chain.

**Explicitly deferred:**
- Taming, breeding, pack AI, personality → Phase 4
- Crafting, buildings, farming, inventory UI → Phase 3
- Weather, disasters, migration → Phase 5
- Tech tree, automation → Phase 6
- Combat system (player vs creature), creature death loot → defer; creatures flee or ignore player
- Day/night cycle → Phase 5
- Viewport-based chunking → defer until map size exceeds 64×64

### Work Items (Ordered)

1. **2.1 — Biome Types & Procedural Map Generation**
   - Expand TileType enum: 6 biome types + Water, Rock, Sand
   - Noise-based map generation (simplex noise, dual layers: elevation + moisture)
   - Tile properties: fertility (0–1), moisture (0–1)
   - Seed-based generation for reproducibility
   - Owner: Pemulis (server), Gately (client colors) | No deps

2. **2.2 — Resource System & Gathering**
   - Resource types: Wood, Stone, Fiber, Berries
   - TileState gains resourceType and resourceAmount
   - GATHER handler: player adjacent or on tile, resource decrements
   - PlayerState gains inventory: MapSchema<number> per resource type
   - Resources regenerate slowly per biome fertility
   - Owner: Pemulis | Depends 2.1

3. **2.3 — Player Survival (Hunger & Health)**
   - PlayerState: hunger (0–100), health (0–100)
   - Hunger decreases per N ticks; health drops at zero hunger
   - EAT message: consume Berries, restore hunger
   - Health floors at 1 when starving (no death yet)
   - Owner: Pemulis (server), Gately (HUD bars) | Depends 2.2

4. **2.4 — Creature Schema & Spawning**
   - CreatureState schema: id, creatureType, x, y, health, hunger, currentState
   - GameState gains creatures: MapSchema<CreatureState>
   - Creature types (data-driven JSON): Herbivore, Carnivore (2 types minimum)
   - Spawn N creatures per biome suitability (~20 total on 32×32)
   - Owner: Pemulis (schema + spawning), Gately (rendering) | Depends 2.1

5. **2.5 — Creature AI (Finite State Machine)**
   - FSM states: Idle, Wander, Eat, Flee, Hunt
   - Herbivore: Wander → Eat (when hungry) → Flee (if carnivore nearby)
   - Carnivore: Wander → Hunt → Eat (from kill)
   - Hunger depletes per tick; death when health ≤ 0
   - AI runs server-side, one step per tick; max 1 tile/move
   - No pathfinding (greedy Manhattan), no interpolation
   - Detection radius configurable per type
   - Owner: Pemulis | Depends 2.4

6. **2.6 — Ecosystem Integration & Demo Polish**
   - Herbivore grazing depletes tile resources; resources regenerate
   - Carnivore kills reduce herbivore population
   - Creature respawning: when population below threshold, spawn new creature
   - Client polish: creature state label/color tint (optional)
   - Verify loop stable 5+ minutes
   - Owner: Pemulis (systems), Gately (visual), Steeply (testing) | Depends 2.1–2.5

### Architecture Decisions (Phase 2)

| # | Decision | Rationale |
|---|----------|-----------|
| A1 | **Noise-based procedural generation** (simplex noise, 2-layer: elevation + moisture) | Simple, proven, seed-reproducible. No external tilemap editor. |
| A2 | **Creature AI is server-only FSM** (switch on state string) | Matches existing server-authoritative model. Simple to debug and extend. |
| A3 | **AI tick rate decoupled from game tick** (creatures update every 2 ticks) | Prevents creature AI from dominating tick budget. Scales with population. |
| A4 | **Data-driven creature/resource definitions** (JSON in `shared/src/data/`) | Aligns with principle #9 (no hardcoded gameplay data). Easy to extend. |
| A5 | **No pathfinding yet** (greedy Manhattan movement) | A* is premature for 2 types on 32×32 map. Defer to Phase 4. |
| A6 | **Flat inventory** (`MapSchema<number>` on PlayerState) | Simplest representation. No slots, no weight, no UI complexity. Phase 3 adds proper inventory. |
| A7 | **No player death** (health floors at 1, player immobile) | Death/respawn needs UI, spawn selection, penalty design. Deferred. |
| A8 | **Creature respawn via population threshold** (not breeding) | Breeding is Phase 4. Threshold respawn keeps demo alive without complexity. |

### Dependency Graph

```
2.1 Biomes & Map Gen
 ├──▶ 2.2 Resources & Gathering
 │     └──▶ 2.3 Player Survival (Hunger/Health)
 ├──▶ 2.4 Creature Schema & Spawning
 │     └──▶ 2.5 Creature AI (FSM)
 └──────────────────┘
        └──▶ 2.6 Ecosystem Integration
```

2.2 and 2.4 run in parallel after 2.1. 2.3 and 2.5 run in parallel after their parents. 2.6 is integration pass.

### Definition of Done

A player joins the game and sees:
- A procedurally generated map with distinct biome regions
- Herbivore creatures wandering and grazing in grasslands
- Carnivore creatures hunting herbivores in forests
- Resources on tiles that can be gathered
- A hunger bar that depletes, restored by eating berries
- A world that sustains itself for 5+ minutes without intervention

## 2026-02-25: Phase 2.1 — Procedural Map Generation Architecture

**Date:** 2026-02-25  
**Author:** Pemulis (Systems Dev)  
**Status:** Active  
**Last Updated:** 2026-02-25T15:23:41Z (Scribe merged from inbox)

### Decisions

1. **Inline simplex noise** — no external dependency. 2D simplex with seeded permutation tables in `server/rooms/MapGenerator.ts`.
2. **Dual noise layers** — elevation and moisture are independent noise fields (different seeds). Biome determined by thresholding both.
3. **All noise params centralized** in `shared/src/constants.ts` as `NOISE_PARAMS`. Tuning biome distribution only requires changing thresholds.
4. **Seed propagated via GameState schema** — `mapSeed` field synced to clients for potential client-side prediction/display.
5. **Generator is standalone function** — `generateProceduralMap(state, seed, width, height)`, not coupled to GameRoom. Can be used in tests, tools, or future map-editing flows.
6. **Fertility derived from biome + moisture** — not a separate noise layer. Keeps generation simple and biome-coherent.

### Implications

- New biomes or terrain features should add thresholds to `NOISE_PARAMS`, not hardcode in generator.
- Tests for map content must use dynamic tile scanning, not fixed coordinates.
- Client already handles unknown tile types gracefully (falls back to Grassland color).

## 2026-02-25: Phase 2.1 — Biome Tile Colors & HMR Cleanup

**Date:** 2026-02-25  
**Author:** Gately (Game Dev)  
**Status:** Active  
**Last Updated:** 2026-02-25T15:23:41Z (Scribe merged from inbox)

### Decisions

1. **Biome color palette** — Each biome type has a distinct hex color in `GridRenderer.TILE_COLORS`. Colors chosen for visual contrast at 32px tile size:
   - Grassland: #4a7c3f (medium green)
   - Forest: #2d5a2d (dark green)
   - Swamp: #5a5a3f (dark olive)
   - Desert: #c9a56f (tan/beige)
   - Highland: #8b7355 (gray-brown)
   - Water: #1a4d6d (dark blue)
   - Rock: #696969 (dim gray)
   - Sand: #e6d8a8 (light tan)

2. **HMR dispose disconnects Colyseus** — `main.ts` registers `import.meta.hot.dispose()` to call `network.disconnect()` on hot reload. Prevents ghost client connections during development.

3. **`network.disconnect()` export** — New public API on `network.ts` for clean room teardown. Calls `room.leave()` and nulls the reference.

4. **Vite client types** — Added `"types": ["vite/client"]` to client tsconfig for `import.meta.hot` support.

### Impact

- All agents referencing TileType must use `Grassland` (not `Grass`).
- New biomes (Forest, Swamp, Desert, Highland) are walkable by default (isWalkable deny-lists only Water/Rock).
- Enum numeric values shifted — use symbolic names, never hardcode numbers.

## 2026-02-25: Phase 2.2/2.4 Client Rendering Conventions

**Date:** 2026-02-25  
**Author:** Gately (Game Dev)  
**Status:** Active

### Decisions

1. **Creature visual language** — Herbivores are green circles, carnivores are red triangles. Consistent shape+color encoding for quick player identification. Radius 6px (half of player's 12px) so creatures are visually distinct from players.

2. **Resource indicator placement** — 5×5px colored square in the top-right corner of each tile. Pre-allocated at grid build time (hidden by default) to avoid per-frame allocation. Colors: Wood=brown, Stone=gray, Fiber=light green, Berries=orchid/purple.

3. **ResourceType enum values** — `Wood=0, Stone=1, Fiber=2, Berries=3` in `shared/src/types.ts`. Pemulis should use these enum values in server-side schemas and data files.

4. **ITileState extended with optional resource fields** — `resourceType?: ResourceType` and `resourceAmount?: number` added as optional fields so existing tile code continues to work without resources present.

5. **ICreatureState interface** — `id`, `creatureType` (string: "herbivore"|"carnivore"), `x`, `y`, `health`, `hunger`, `currentState` — matches the spec for Pemulis's CreatureState schema.

### Impact

- Pemulis: Server-side CreatureState and TileState schemas should expose fields matching these interfaces.
- All agents: Use `ResourceType` enum values (not raw numbers) when referencing resource types.
- Future creature types should get unique shape+color entries in `CreatureRenderer.createCreatureGraphic()`.

## 2026-02-25: Phase 2.2 + 2.4 — Resources, Gathering, Creatures

**Date:** 2026-02-25  
**Author:** Pemulis (Systems Dev)  
**Status:** Active

### Decisions

1. **Resource representation uses -1 sentinel** — `resourceType = -1` means no resource on tile. Avoids nullable schema fields which Colyseus handles inconsistently across v4 encode/decode.

2. **Player inventory as flat fields, not MapSchema** — Individual `wood`, `stone`, `fiber`, `berries` number fields on PlayerState. MapSchema<number> doesn't serialize correctly in @colyseus/schema v4. Any future resource types need a new field added to PlayerState.

3. **Seeded RNG for resource placement** — Map generator uses a deterministic PRNG (seed + 99991) for resource assignment, so same seed = same resources. Separate from noise RNG to avoid coupling resource layout to terrain noise.

4. **Resource regen runs every 80 ticks** — Not per-tile timers. Single pass over all tiles at interval. Simple and O(n) but sufficient for 1024-tile maps. May need spatial partitioning at larger scales.

5. **Creature data as typed constants** — `CREATURE_TYPES` in `shared/src/data/creatures.ts` uses typed objects (not JSON files) per task spec. Exported from shared index. Interface `CreatureTypeDef` for type safety.

6. **Creature spawning prefers biomes** — 100-attempt random search in preferred biomes first, then falls back to any walkable tile. Matches existing player spawn pattern.

### Implications

- Phase 2.3 (Player Survival) can now use `player.berries` for EAT handler and depends on these inventory fields.
- Phase 2.5 (Creature AI) can use `CreatureState.currentState` as FSM state and `CREATURE_TYPES` for behavior parameters.
- Client needs rendering updates for resources on tiles and creatures on map (Gately's domain).
- Adding new resource types requires: enum value in ResourceType, field on PlayerState schema, case in GATHER switch, biome mapping in both mapGenerator and GameRoom.getDefaultResourceType.

## 2026-02-25: Phase 2.6 — Ecosystem Integration: Creature Respawning

**Date:** 2026-02-25  
**Author:** Pemulis (Systems Dev)  
**Status:** Active

### Decisions

1. **Population threshold respawn** — Per architecture decision A8, creatures respawn via population threshold, NOT breeding. When creature count of a type drops below `minPopulation`, new creatures spawn in preferred biomes using existing spawn logic.

2. **minPopulation on CreatureTypeDef** — Respawn thresholds are data-driven per creature type (`minPopulation` field): herbivore=4, carnivore=2. Adding new creature types automatically gets respawn behavior by setting this field.

3. **CHECK_INTERVAL = 100 ticks (25s)** — Respawn check runs every 100 game ticks. Infrequent enough to avoid spawn spam, frequent enough to prevent prolonged extinction. Configurable in `CREATURE_RESPAWN` constants.

4. **Persistent creature ID counter** — `nextCreatureId` on GameRoom instance ensures unique IDs across initial spawn and respawns. Includes null guard for test compatibility (tests use `Object.create` to skip constructor).

### Implications

- New creature types must include `minPopulation` in their `CreatureTypeDef`.
- Respawn uses the same biome-preferred placement as initial spawn.
- Ecosystem is self-sustaining: grazing depletes resources → regen restores them → respawn restores populations.

## 2026-02-25: Phase 2.6 — Creature State Visual Feedback Conventions

**Date:** 2026-02-25  
**Author:** Gately (Game Dev)  
**Status:** Active

### Decisions

1. **Creature state color palette** — Each FSM state maps to a color variant per creature type. Eat = brighter/lighter, Hunt = darker/saturated, Idle/Wander = base color. Keeps the visual language consistent with Phase 2.2/2.4 creature shapes.

2. **State indicator symbols** — Flee = "!" (white, above creature), Hunt = "⚔" (white, above creature). Other states have no text indicator. Indicators are pre-allocated PixiJS Text objects toggled via `visible` for zero allocation overhead.

3. **Health opacity threshold at 50%** — Creatures below 50% health render at alpha 0.6. Binary threshold, not continuous gradient — keeps the visual simple and avoids per-frame alpha recalculation.

4. **HUD creature counts use emoji** — `🦕 {herbivores}  🦖 {carnivores}` displayed below hunger bar. Counts derived from `state.creatures` collection in the same `onStateChange` callback as player stats.

5. **Graphic rebuild gating** — CreatureRenderer only clears and redraws a creature's Graphics object when `currentState` or `creatureType` actually changes (tracked via `lastType`/`lastState`). Position updates are always applied.

### Impact

- Future creature types need color entries added to `getCreatureColor()` in CreatureRenderer.
- Future FSM states need indicator mappings in `updateIndicator()`.
- HUD creature count text style is monospace 12px, #cccccc — matches existing HUD text conventions.

## 2026-02-25: Phase 3 — Base Building: Scoping & Breakdown

**Date:** 2026-02-25  
**Author:** Hal (Lead)  
**Status:** Proposed  
**Prerequisite:** Phase 2 (Core Simulation) — COMPLETE (194 tests, merged)

### Vision

Minimum viable base-building system — players gather, craft items, place structures, and farm. First step from "surviving" to "building."

### Scope Fence (Phase 3)

**In scope:**
- Inventory display (HUD panel showing resource counts and crafted items)
- Recipe system (data-driven, 6 initial recipes)
- Crafting (CRAFT message handler, consume resources, produce items)
- Structure placement (PLACE message handler, 3 structures: Wall, Floor, Workbench)
- Building schema (StructureState on GameState, walkability blocking)
- Tool crafting (Axe, Pickaxe; passive yield bonus)
- Farm plot (structure on Grassland, growth over time, harvest for berries)
- Client rendering (structures, farm visuals, build mode indicator)
- Inventory HUD (resource + item counts, craft menu, build mode toggle)

**Explicitly deferred:**
- Chest / storage containers → Phase 6
- Multi-tile structures → Phase 6
- Structure health / destruction → Phase 5
- Doors / gates → Phase 6
- Advanced crafting stations → Phase 6
- Station-gated recipes → Phase 6
- Structure snapping / blueprints → Phase 6
- Conveyor / automation → Phase 6
- Temperature / shelter → Phase 5
- Metal / new resource types → Phase 6
- Crop variety → Phase 6
- Tool durability → Phase 6
- Tool equip/unequip UI → Phase 6

### Work Items (7 Total, Ordered)

| Item | Owner | Deps | Notes |
|------|-------|------|-------|
| 3.1 | Recipe & Item Data | Pemulis | None | ItemType enum, RecipeDef, RECIPES constant, validation |
| 3.2 | Inventory Extension & Craft | Pemulis | 3.1 | PlayerState fields, CRAFT handler, tool yield bonus |
| 3.3 | Structure Schema & Placement | Pemulis | 3.2 | StructureState, PLACE handler, walkability update |
| 3.4 | Farm System | Pemulis | 3.3 | FarmPlot, growth ticks, FARM_HARVEST handler |
| 3.5 | Client: Rendering | Gately | 3.3, 3.4 | StructureRenderer, farm visuals (can start once 3.3 schema defined) |
| 3.6 | Client: Inventory HUD & Build Mode | Gately | 3.2, 3.5 | Inventory panel, craft menu, build toggle, keybinds |
| 3.7 | Integration & Testing | Steeply + Pemulis + Gately | 3.1–3.6 | E2E loops, creature avoidance, ecosystem stability, all tests pass |

### Architecture Decisions (Phase 3)

| # | Decision | Rationale |
|---|----------|-----------|
| B1 | **Flat inventory fields for crafted items** (walls, axes, etc. as `@type("number")` on PlayerState) | Matches Phase 2 pattern. Colyseus v4 MapSchema<number> unreliable. Per-item field is verbose but safe. |
| B2 | **Structures are 1 tile, 1 entity** (no multi-tile buildings) | Simplest placement model. Multi-tile needs rotation, overlap, anchors — Phase 6. |
| B3 | **Recipes are data-driven constants in shared** (not JSON files) | Consistent with CREATURE_TYPES pattern. TypeScript constants = type safety + IDE support. |
| B4 | **Tool bonus is passive** (own it = get the bonus) | No equip/unequip UI needed. Just check `player.axes >= 1` in GATHER handler. Equip slots are Phase 6. |
| B5 | **Farm growth uses existing tile fertility** | No new noise layer. Farms on high-fertility tiles grow faster — emergent gameplay. |
| B6 | **Structures update walkability via isWalkable check** (query-time, not cached) | Existing `isWalkable()` already checks tile type. Add structure check in same function. |
| B7 | **PLACE validates adjacency** (player on or adjacent to target tile) | Same pattern as GATHER. Prevents remote placement exploits. Consistent interaction model. |
| B8 | **FarmPlot is a structure subtype, not separate system** | Reuses StructureState schema with growth fields. One fewer schema class, simpler data model. |

### Parallelism Opportunities

- **3.1 can start immediately** (Pemulis)
- **3.5 can start once 3.3 schema defined** (Gately parallel to 3.4, Pemulis)
- **Steeply writes unit tests alongside each work item**, integration in 3.7

### Definition of Done

A player joins the game and can:

1. **Gather** wood and stone (existing)
2. **Craft** an Axe from wood, get +1 wood yield
3. **Craft** Walls from wood/stone
4. **Place** Walls on map, blocking movement for players and creatures
5. **Craft and place** Farm Plot on grassland, watch grow, harvest berries
6. **See** full inventory in HUD (resources + crafted items)
7. **Toggle** build mode to place structures by clicking

The world remains stable: creatures path around structures, resources regenerate, populations sustain. All tests pass (194 existing + Phase 3 new).

### What "Playable Phase 3" Feels Like

The player has a reason to gather beyond eating. They can shape the world — put up walls, set up a small farm, craft tools that make them more effective. It's the first step from "surviving" to "building." It's minimal, but it's the loop: gather → craft → place → benefit.
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

---

# Phase 3.7 — Integration Testing Complete

**Date:** 2026-02-25  
**Author:** Steeply (Tester)  
**Status:** Active

## Summary

Phase 3 integration tests are complete. **273 total tests passing** (251 existing + 22 new). All Phase 3 gameplay loops are verified end-to-end.

## Coverage

- Full gather → craft → place loops (wall, floor, workbench, multi-item)
- Farm lifecycle with repeating harvest cycles
- Creature–structure interaction (wall avoidance, hunt pathing)
- Edge cases: occupied tiles, insufficient resources, missing inventory, biome restrictions, non-adjacent harvest, movement blocking
- Multiplayer simultaneous crafting/placing (isolation + race conditions)
- Ecosystem stability at 300 ticks with structures present

## Key Findings

1. **Harvest yield can be < BASE_HARVEST_YIELD** on low-fertility tiles. Formula: `Math.max(1, Math.round(3 * fertility))`. This is correct behavior, not a bug.
2. **No bugs found** in Phase 3 implementation. All handlers, validators, and tick systems work as specified.
3. **Phase 3 is code-complete and test-complete.** Ready to advance to Phase 4.

## Implications

- Phase 3 definition of done is met: all gameplay loops verified, ecosystem stable, no regressions.
- Phase 4 (Creature Systems) can begin.

---

## 2026-02-25: Phase 4 — Creature Systems (Taming, Breeding, Pack Commands)

**Date:** 2026-02-25  
**Author:** Hal (Lead)  
**Status:** Active  

### Vision

Enable players to tame wild creatures, breed them for traits, and command pack behavior — turning creatures from environmental hazards into strategic allies.

### Scope

**IN Scope:** Taming (I key, trust progression), ownership (`ownerID` field), pack follow (F key, max 8), basic breeding (B key, trait inheritance), trait system (Speed, Health, Hunger drain), personality (Docile/Neutral/Aggressive), pack size limit (8 max), A* pathfinding stub for Phase 5.

**DEFERRED to Phase 5+:** Advanced breeding (genetic lineage, mutation pools), pack tactics AI, creature training/jobs, creature equipment, death/respawn penalties, behavioral customization, multi-creature formation orders, creature-creature diplomacy.

### Architecture Decisions (C1–C9)

| ID | Title | Rationale |
|----|----|-----------|
| **C1** | **Ownership Model — `ownerID` Field** | Tamed creatures are player-specific. Use string field `ownerID` on CreatureState (null = wild, player ID = owner). Creatures live in same collection; behavior/rendering differ by ownership. |
| **C2** | **Trust as Linear Scalar (0–100)** | Simple, deterministic, visible. +5 per feed, +1 per 10 ticks proximity. -1 per 20 ticks alone, -10 if hit. At ≥70, creature obeys follow. |
| **C3** | **Personality as Enum (Docile/Neutral/Aggressive)** | Placeholder for behavioral variety. Docile tame faster (+10/feed) but lower damage. Aggressive tame slower (-5/feed) but hunt better. Immutable per spawn. |
| **C4** | **Traits as Deltas from Base (Speed, Health, Hunger Drain)** | Each tamed creature has optional `traits` object. Offspring inherits averaged parent traits + random mutation (±1 per trait). Range cap ±3. |
| **C5** | **Pack as Stateful Selection Set Per Player** | Each player has `selectedPack: Set<creatureId>` (max 8). F key toggles. Server tracks which creatures follow which player. Per-tick: move selected creatures toward player if distance > 1. |
| **C6** | **Breeding as Peer Interaction (No Pens)** | Two tamed creatures at trust≥70, adjacent, same owner, same type, interact (B key) → 50% chance offspring spawns on empty adjacent tile. Offspring inherits ownership, starts trust=50. |
| **C7** | **Greedy Movement Persists; A* Stub for Phase 5** | Phase 4 uses existing greedy Manhattan pathfinding. Leave `moveToward()`/`moveAwayFrom()` unchanged. Add comment + TODO stub `pathfindAStar()` (compiler pass). Phase 5 swaps without breaking Phase 4. |
| **C8** | **Taming Cost — Berries or Meat** | Taming costs 1 berry (herbivore) or 1 meat (carnivore). Meat drops from slain creatures (Phase 4 adds stub). Encourages hunting/farming to sustain pack. Prevents trivial taming of entire map. |
| **C9** | **Trust Decay in Absence (Loneliness Mechanic)** | Tamed creature loses 1 trust per 20 ticks if owner >3 tiles away. Max decay per interaction: -10 (damage). Encourages periodic feeding; neglected creatures can abandon. Adds gameplay depth. |

### Work Breakdown (8 Items, 5–6 Day Critical Path)

| # | Item | Owner | Timeline | Prereq | Notes |
|---|------|-------|----------|--------|-------|
| **4.1** | Schema: Tame Fields | Pemulis | 1d | — | Add ownerID, trust, speed, personality, traits to CreatureState |
| **4.2** | Taming Interaction Handler | Pemulis | 2d | 4.1 | TAME (I key), ABANDON, trust decay logic, lock to owner |
| **4.3** | Pack Follow & Commands | Pemulis | 2d | 4.2 | SELECT_CREATURE, follow tick, trust decay, command dispatcher |
| **4.4** | Breeding Logic | Pemulis | 2d | 4.1, 4.2 | BREED (B key), validation, offspring spawn, trait inheritance + mutation |
| **4.5** | Client Tame UI | Gately | 1d | 4.1 | Show owned creature list, trust bars, select/deselect, owned-creature marker |
| **4.6** | Creature Command Binding | Gately | 1d | 4.5 | F key toggles follow, visual feedback on selected pack |
| **4.7** | Trait Rendering & HUD | Gately | 1d | 4.5 | Show creature stat overlay (Speed, Health, Hunger), trait inheritance tooltips |
| **4.8** | Integration & A* Prep | Steeply | 2d | 4.1–4.7 | Full taming → breeding → pack command cycle; A* stub in schema |

### Definition of Done

Player can:

1. **Encounter and tame a creature** — Approach wild herbivore → I key → tame (cost 1 berry, trust starts 0)
2. **Build trust through feeding** — Feed → trust increases (visible bar). At ≥70, creature responds to commands.
3. **Command a pack to follow** — Select 1–8 creatures → F key → pack follows; unselect → stops.
4. **Breed two creatures** — Two at trust≥70, same type, same owner, adjacent → B key → 50% chance offspring spawns.
5. **See creature stats** — Owned creature shows tooltip: Speed, Health, Hunger drain (traits visible).
6. **Hybrid gameplay** — Tame herbivore pack + use as allies + breed for better offspring.
7. **Ecosystem stable** — 273 tests pass; wild creatures still spawn; tamed coexist.
8. **Playable & demonstrable** — 15-minute demo: gather berries → tame → trust → breed → follow → defend base.

### Implications

- **Server (Pemulis):** Add `ownerID`, `trust`, `speed`, `personality`, `traits` fields to CreatureState. Implement TAME, ABANDON, SELECT_CREATURE, BREED messages. Extend GameRoom to track `playerSelectedPacks`. Add TAMING and CREATURE_TRAITS constants to shared.
- **Client (Gately):** Add "My Creatures" HUD panel with trust bars and selection. Bind F key to SELECT_CREATURE, B key to BREED. Show owned creature markers and trait tooltips.
- **Testing (Steeply):** Full taming cycle, trust progression, breeding with trait inheritance, pack commands, trust decay, edge cases (over-capacity, wrong types, missing cost), ecosystem stability, multiplayer packs.
- **Phase 3 compatibility:** Existing creature AI FSM (Idle/Wander/Eat/Flee/Hunt) unchanged. New ownership layer sits on top. Backward compat: ownerID defaults to "" (wild).

### Rollout Plan

**Week 1:** Pemulis 4.1 schema lands (Mon). Gately unblocks on 4.5 (Tue). Pemulis 4.2 + 4.3 + 4.4 (Wed–Fri, parallel).  
**Week 2:** Gately 4.5 + 4.6 + 4.7 (Mon–Wed). Steeply integration (Wed).  
**Week 3:** Steeply 4.8 complete. All agents pair-test. Ship Phase 4 with 300+ tests, full demo.

### Success Criteria

- ✅ Schema lands without breaking Phase 3 (backward compat)
- ✅ Taming interaction works; players can own creatures
- ✅ Trust system drives behavior change (obedience at ≥70)
- ✅ Pack follow is intuitive (F key, visual feedback)
- ✅ Breeding works; offspring inherit traits
- ✅ 300+ tests passing (273 Phase 3 + 30+ Phase 4)
- ✅ No regressions in wild creature behavior or base building
- ✅ 15-minute demo: tame → breed → command (polished, no crashes)

