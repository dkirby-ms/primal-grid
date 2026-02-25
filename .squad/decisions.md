# Decisions

> Team decisions that all agents must respect. Append-only. Managed by Scribe.

<!-- New decisions are appended below by Scribe from .squad/decisions/inbox/ -->

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
