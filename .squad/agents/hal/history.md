# Project Context

- **Owner:** dkirby-ms
- **Project:** Primal Grid: Survival of the Frontier — grid-based survival colony builder with dinosaurs, dynamic ecosystems, and base automation in the browser
- **Stack:** TypeScript, HTML5 Canvas, browser-based web game
- **Design Document:** docs/design-sketch.md
- **Created:** 2026-02-25T00:45:00Z

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

- **Architecture:** Client-server via Colyseus (WebSocket). PixiJS v8 for 2D canvas rendering. Vite bundler. Monorepo with three packages: `client`, `server`, `shared`.
- **Server authority:** All game state is server-authoritative. Client is a renderer + input sender. No client-side simulation.
- **Auth:** OAuth/OIDC (Entra ID, Google) deferred to Phase 5. Will use a separate auth service issuing JWTs. Colyseus room join will require a valid token.
- **Perspective:** Top-down only. Isometric is deferred.
- **Phased plan:** 6 phases (0–5). Phase 0 = scaffolding. Phase 1 = core simulation. Phase 2 = base building. Phase 3 = creature systems. Phase 4 = world events. Phase 5 = late game + auth + persistence.
- **Scope fence:** No modding, no aquatic/arctic biomes, no mythical creatures, no PvP, no audio, no tactical combat system until after Phase 5.
- **User preference:** User wants clear phase boundaries. Ship smallest playable thing at each phase. Defer aggressively.
- **Key file:** Session plan at `/home/saitcho/.copilot/session-state/3694625c-de11-4cc1-ae47-11fe7a04c4e2/plan.md`
- **Key file:** Architecture decision at `.squad/decisions/inbox/hal-phased-plan.md`
- **2026-02-25 — Revised plan:** Expanded from 6 to 8 phases (0–7). Phase 0 is pure scaffolding (no running game). Phase 1 is walking skeleton (minimal client-server proof). Auth moved to Phase 7 (separate from late game). NPC factions also Phase 7 (basic only — settlements, trading, disposition). Full plan rewritten to session `plan.md` and architecture decisions to `.squad/decisions/inbox/hal-architecture-plan.md`.
- **User preference confirmed:** Phases must be independently demonstrable. Walking skeleton = the simplest thing proving the architecture. Defer aggressively.
- **Scope fence expanded:** Added explicit exclusions for mobile, i18n, multiplayer co-op beyond shared room, matchmaking/lobbies.
