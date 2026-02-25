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
