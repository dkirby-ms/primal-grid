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
