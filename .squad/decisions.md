# Decisions

> Team decisions that all agents must respect. Append-only. Managed by Scribe.

<!-- New decisions are appended below by Scribe from .squad/decisions/inbox/ -->

## 2026-02-25: User Directives & Phased Implementation Plan

**Date:** 2026-02-25  
**Authors:** dkirby-ms (user), Hal (Lead)  
**Status:** Active

### User Directives (Architecture)

- **Client-server** architecture; users play over a browser
- **Rendering:** 2D canvas using PixiJS (v8) or similar
- **Backend:** Colyseus (multiplayer game server framework)
- **Auth:** OAuth/OIDC support (Entra ID, Google) — deferred to Phase 5

### Phased Implementation Plan

| Phase | Focus | Lead |
|-------|-------|------|
| **0** | Scaffolding — monorepo, Colyseus room, PixiJS grid, CI | Gately, Pemulis |
| **1** | Core simulation — tile state, biomes, creature AI, survival | Gately |
| **2** | Base building — inventory, crafting, buildings, farming | Gately, Pemulis |
| **3** | Creature systems — taming, breeding, pack AI, personality | Gately |
| **4** | World events — weather, disasters, migration, ruins | Gately |
| **5** | Late game + auth — tech tree, automation, OAuth/OIDC, NPCs, persistence | Pemulis |

### Technical Decisions

- **Server-authoritative** game state; client renders + sends input
- **Shared types:** TypeScript `shared` package (monorepo) — single source of truth for enums, schemas, messages
- **Monorepo:** `client`, `server`, `shared` packages (npm workspaces or Turborepo)
- **State sync:** Colyseus schema deltas; viewport-based chunking for large maps
- **Tick-based** simulation loop on server

### Scope Fence

**Explicitly deferred beyond Phase 5:** modding, aquatic/arctic biomes, mythical creatures, PvP, audio, isometric view, full faction diplomacy, tactical combat system.

### Key Principle

Each phase must be **playable** before advancing. Ship the core loop first; no speculative features.
