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
