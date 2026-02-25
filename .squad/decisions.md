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
