# Project Context

- **Owner:** dkirby-ms
- **Project:** Primal Grid: Survival of the Frontier — grid-based survival colony builder with dinosaurs, dynamic ecosystems, and base automation in the browser
- **Stack:** TypeScript, HTML5 Canvas, browser-based web game
- **Design Document:** docs/design-sketch.md
- **Created:** 2026-02-25T00:45:00Z

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

- **Phase A UAT checklist authored:** Comprehensive manual testing guide (13 sections, 80+ test cases) grouped by feature area (initialization, territory, camera, structures, resources, crafting, creatures, HUD, help, polish, edge cases). Includes smoke test (5–10 min quick validation). File: `.squad/decisions/inbox/hal-phase-a-uat.md`. Ready for dkirby-ms to execute in browser before Phase B kickoff. All 239/240 tests passing (1 pre-existing flaky creature-ai test unrelated to Phase A pivot).

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
- **2026-02-25 — Phase 2 scoping complete:** Broke Phase 2 (Core Simulation) into 6 ordered work items: 2.1 Biome/MapGen, 2.2 Resources/Gathering, 2.3 Player Survival, 2.4 Creature Schema, 2.5 Creature AI (FSM), 2.6 Ecosystem Integration. Two parallel tracks after 2.1: resources→survival and creatures→AI, converging at 2.6.
- **Architecture (Phase 2):** Simplex noise for procedural biomes (2-layer: elevation + moisture). Creature AI is server-only FSM with greedy Manhattan movement (no pathfinding). AI ticks decoupled from game ticks (every 2nd tick). Data-driven creature/resource configs in `shared/src/data/`. Flat inventory (`MapSchema<number>`). No player death — health floors at 1. Creature respawn via population threshold.
- **Scope fence (Phase 2):** No taming/breeding/pack AI (Phase 4), no crafting/buildings/inventory UI (Phase 3), no weather/day-night (Phase 5), no combat system (player ignores creatures for now), no pathfinding (greedy movement only), no viewport chunking yet.
- **Key file:** Phase 2 breakdown at `.squad/decisions.md` (merged from inbox on 2026-02-25T15:23:41Z)
- **Colyseus 0.17:** Server upgraded to ESM-native with @colyseus/schema v4. All schema uses `@type()` decorator pattern. `Encoder.BUFFER_SIZE` set to 64KB for full map sync.
- **2026-02-25 Phase 2 Kickoff complete:** Hal scoped Phase 2 (6 items). Pemulis + Gately + Steeply completed Phase 2.1 (biome types, procedural map gen, client colors, HMR cleanup). 60 tests passing. Orchestration logs written. Decision inbox merged to decisions.md. Ready for Phase 2.2 (Resources).
- **2026-02-25 Phase 3 scoped:** Broke Phase 3 (Base Building) into 7 ordered work items: 3.1 Recipe/Item Data, 3.2 Inventory/Craft Handler, 3.3 Structure Schema/Placement, 3.4 Farm System, 3.5 Client Structure Rendering, 3.6 Inventory HUD/Build Mode, 3.7 Integration Testing. Linear server pipeline (3.1→3.4), client work parallelizes at 3.5 once 3.3 schema lands. 8 architecture decisions (B1–B8). Key constraint: flat inventory fields (no MapSchema) per Colyseus v4 limitation.
- **Scope fence (Phase 3):** No multi-tile structures, no storage containers, no doors, no advanced crafting stations, no tool durability/equip, no crop variety, no structure health/destruction. All deferred to Phase 5/6. MVP = wall + floor + workbench + axe + pickaxe + farm plot. 6 recipes total.
- **Pattern confirmed:** Data-driven constants in shared (RECIPES table matches CREATURE_TYPES pattern). Passive tool bonuses (no equip UI). FarmPlot reuses StructureState schema with optional growth fields rather than a parallel system.
- **2026-02-25 Phase 4 scoped:** Phase 3 complete (273 tests). Phase 4 (Creature Systems) breaks into 8 work items: 4.1 Schema (ownerID, trust, traits), 4.2 Taming (I key, trust progression), 4.3 Pack Follow (F key, selected set), 4.4 Breeding (offspring traits), 4.5 Tame UI (owned creature list), 4.6 Command Binding (visual feedback), 4.7 Trait Rendering, 4.8 Integration & A* prep. Pemulis owns server (4.1–4.4, ~5d). Gately owns client (4.5–4.7, ~3d). Steeply integration 4.8 (~2d). Key deferral: A* pathfinding (stub only, full Phase 5 work). Trust scalar 0–100, 70+ obedient. Pack limit 8/player. 9 architecture decisions (C1–C9). Greedy movement persists.
- **Schema pattern (Phase 4):** Add to CreatureState: ownerID (string), trust (0–100), speed/personality/traits (deltas). Ownership model = creatureID in player's selected pack set + server tracks selectedPacks per player. Wild creature respawn unaffected.
- **Breeding logic (Phase 4):** Two creatures same type, trust≥70, same owner, adjacent, 50% chance/tick → offspring with averaged parent traits + mutation (±1d2). Offspring inherits owner, starts trust=50. Costs 10 berries. Cooldown 100 ticks between breeding same pair.
- **2026-02-26 Phase 4.5 (HUD Redesign) scoped:** User (dkirby-ms) requested HUD redesign before Phase 5 (World Events) to improve readability and reduce visual clutter. Current HUD (PixiJS overlay on canvas, top-left) blends into game world; lacks background/separation. Solution: Move HUD to dedicated HTML side panel (right side, 200px × 600px), resize canvas from 800×600 to 600×600. Four sub-phases: 4.5.1 (Canvas resize + panel shell, Gately ~1d), 4.5.2 (State binding to DOM, Pemulis+Gately ~1d), 4.5.3 (Polish/styling, Gately ~0.5d), 4.5.4 (Integration testing, Steeply ~0.5d). Linear path, ~3d critical. 5 architecture decisions (D1–D5). Key constraint: HTML DOM-based, not PixiJS-based; parallel implementation with `HudDOM.ts`, then remove `HudRenderer.ts`. No gameplay changes; pure UI refactor. Full proposal at `.squad/decisions/inbox/hal-hud-redesign-phase.md`.

---

## Phase 4 Kickoff (2026-02-25T22:48:00Z)

**Status:** ACTIVE — Hal scoping complete, Pemulis & Steeply in-progress, Gately waiting on 4.1

**Hal work (complete):**
- ✅ Phase 4 scoping document (17.8 KB, 9 architecture decisions C1–C9)
- ✅ Work breakdown (8 items, 5–6d critical path, Pemulis 4.1→4.4, Gately 4.5→4.7, Steeply 4.8)
- ✅ Dependency graph (Pemulis blocks Gately & Steeply)
- ✅ Definition of done (7-point gameplay + 300+ tests)
- ✅ Orchestration log written (`.squad/orchestration-log/2026-02-25T22:48:00Z-hal.md`)
- ✅ Session log written (`.squad/log/2026-02-25T22:48:00Z-phase4-kickoff.md`)
- ✅ Decision inbox merged to decisions.md

**Next:** Pemulis begins 4.1 immediately. Scribe monitors PR merges, updates agent history on each landing.

---

## Phase 3 Complete (2026-02-25T21:50:00Z)

**Status:** COMPLETE — Phase 3 Coordination & Verification Finalized

Phase 3 is complete as of 2026-02-25T21:50:00Z. All 7 Phase 3 work items are done, verified by Steeply's integration test suite: 273 total tests passing, 0 bugs, ecosystem stable.

**Coordination summary:**
- Pemulis (Phase 3.0–3.2): Server implementation ✅
- Gately (Phase 3.5–3.6): Client UI ✅
- Steeply (Phase 3.7): Integration testing & verification ✅
- Message contracts finalized and locked (CRAFT, PLACE, FARM_HARVEST in messages.ts)
- Structure schema stable (StructureState in schema.ts)
- Creature–structure interaction validated (pathfinding respects walls/workbenches)
- No API breaking changes expected for Phase 4

**Phase 3 Definition of Done:** ✅ All work items complete, all gameplay loops verified end-to-end, ecosystem stable at 300+ ticks, full multiplayer tested, test infrastructure solid, all APIs finalized.

**Ready for Phase 4:** Creature Systems work can begin with high confidence. Phase 3 platform is stable and production-ready.

---

## Phase 4.5 Complete (2026-02-26T13:57:00Z)

**Status:** COMPLETE — HUD Redesign & Client UI Refactor Finalized

Phase 4.5 (HUD Redesign) is complete as of 2026-02-26T13:57:00Z. Three-day sprint fully executed: canvas resized 800×600 → 600×600, all HUD display logic migrated from PixiJS (HudRenderer) to DOM-based HudDOM.ts, side panel (200px right) now displays player stats/inventory/creatures/taming with visual polish.

**Coordination summary:**
- Hal (Phase proposal): Scoped 4.5 into 4 sub-phases, documented 5 architecture decisions (D1–D5), defined success criteria, identified risks ✅
- Gately (Phase 4.5.1–4.5.3): Implemented canvas resize, HTML panel, HudDOM state binding, visual polish. All HUD data synced (health, hunger, inventory, crafted items, creatures, taming). Zero-allocation DOM updates. ✅
- Steeply (Phase 4.5.4): Created anticipatory test plan, wrote 13 HUD state contract tests, defined comprehensive manual verification checklist. All 304 tests passing (291 baseline + 13 new). ✅
- Architecture decisions D1–D5 fully validated; HTML side panel proven superior to PixiJS approach
- InputHandler API unchanged; no breaking changes to client code
- Server-side state contract verified; no server changes needed
- Multiplayer HUD isolation confirmed

**Key metrics:**
- Canvas: 600×600 (was 800×600)
- Side panel: 200px × 600px, right edge, flexbox layout
- Tests: 304 passing (291 baseline + 13 new HUD tests)
- Files changed: 4 (`client/index.html`, `client/src/ui/HudDOM.ts` new, `client/src/main.ts`, `client/src/input/InputHandler.ts`)
- Performance: No FPS regression; DOM updates < 1ms per frame

**Phase 4.5 Definition of Done:** ✅ Canvas resized, side panel visible and styled, all HUD data updates in real-time, no visual glitches, no performance regression, farm/craft/build/tame/breed all work, multiplayer tested, 304 tests passing, code clean (HudRenderer deprecated but retained pending Steeply deletion review).

**Ready for Phase 5:** Clean layout foundation prepared. HUD state contract validated. World Events (temperature, shelter, status effects, weather) can be added to side panel without layout work. All APIs stable.

**Notes:**
- Pre-existing flaky test: breeding cycle integration (creature spawn collision—unrelated to HUD redesign)
- HudRenderer.ts not instantiated but retained in repo pending Steeply verification before deletion
- Craft menu and help screen remain PixiJS overlays (work fine at 600×600)
- Connection status (top-right), help hint (bottom-right) unchanged
- Orchestration logs: `.squad/orchestration-log/2026-02-26T13:57:00Z-{hal,gately,steeply}.md`
- Session log: `.squad/log/2026-02-26T13:57:00Z-phase45-hud-redesign.md`
- Decisions merged: 3 inbox files → `decisions.md` (deduped, no conflicts)
- **2026-02-26 Phase 4.6 (Azure Deployment) scoped:** Proposed deployment phase before Phase 5 (World Events). Architecture: single container (Express + Colyseus + Vite static assets), Azure Container Apps (Consumption plan), ACR (Basic tier), Bicep IaC, GitHub Actions CI/CD with OIDC. Four sub-phases: 4.6.1 Containerize (~1d), 4.6.2 Azure Infra (~0.5d), 4.6.3 CI/CD Pipeline (~1d), 4.6.4 Verify & Docs (~0.5d). ~3 day critical path. 7 architecture decisions (E1–E7). Key choices: single container over two (avoids CORS/networking), Container Apps over AKS/App Service (cheapest, WebSocket-native), Bicep over Terraform (Azure-native, zero deps). Server entry point needs Express wrapper to serve static client alongside WebSocket. Scope fence: no custom domain, no CDN, no auth, no persistence, no staging env, no monitoring. Proposal at `.squad/decisions/inbox/hal-azure-deployment-phase.md`.
- **2026-02-26 Scalability roadmap authored:** 4-phase scalability analysis (S1–S4). Current architecture supports ~15–25 players. S1 (single-room optimization: CPU bump, creature cap, spatial indexing, interest management) gets to 30–50 players in 2–3 days. S2 (Redis presence, multi-room, sticky sessions, Container Apps scaling) gets to 50–200 in 1–2 weeks — plan but defer. S3 (world sharding) and S4 (MMO mesh) explicitly rejected as wrong patterns for a colony survival game. Key insight: room-per-instance is the natural scaling model; colonies are local. Bottleneck order: state sync bandwidth > CPU tick cost > creature count growth. Roadmap at `.squad/decisions/inbox/hal-scalability-roadmap.md`.
- **2026-02-27 Major pivot: "Rimworld but multiplayer arcade."** Rewrote GDD at `docs/gdd.md`. Core changes: (1) No player avatar — commander mode with free-panning camera; (2) Territory system — tile ownership via claim markers; (3) Indirect pawn control — tamed dinos assigned gather/guard/patrol zones; (4) Tower defense waves — wild creatures spawn at map edges; (5) Round-based multiplayer — 2–4 players, 15–30 min rounds, territory race. Four implementation phases: A (foundation pivot), B (build & defend), C (pawn commands), D (multiplayer polish). Key systems kept: tile grid, biomes, creature AI FSM, taming/trust, breeding, structures, crafting, Colyseus architecture. Key systems cut: player avatar (x/y/movement), manual gathering, player survival (hunger/health), pack follow. New systems: territory, HQ, camera, pawn commands, auto-gather, turrets, wave spawner, round timer, commander UI. Map scales from 32×32 to 64×64. MVP = 2 players, territory claiming, basic building, one dino type, waves, turrets, 15-min rounds.
- **Architecture decision:** PlayerState loses x/y/hunger/health; gains hqX/hqY/score. TileState gains ownerID. CreatureState gains command/zoneX/zoneY. StructureState gains health. New messages: CLAIM_TILE, ASSIGN_PAWN, DESIGNATE_ZONE. Removed messages: MOVE, GATHER, EAT.
- **Key file:** New GDD at `docs/gdd.md` (replaces `docs/design-sketch.md` as active design doc)
- **User preference:** Arcade-scale rounds (15–30 min), approachable mechanics, solo developer scope. No AAA ambitions.
- **2026-02-27 Architecture plan authored:** Full implementation spec at `docs/architecture-plan.md`. 10 Phase A work items (A1–A10), split into two parallel tracks: Pemulis (shared+server, A1→A5) and Odie (client, A6→A9), Mario (tests, A10). Critical path ~5–7 days. Key architectural decisions: (1) single clean break over incremental migration — avatar removal touches too many systems for incremental; (2) territory validation is simple cardinal-adjacency check, no graph connectivity until PvP in Phase D; (3) territory overlay via semi-transparent colored rects in GridRenderer, not a separate layer; (4) trust decay changes from avatar-proximity to territory-based; (5) keep craft→place flow (not direct-place) to preserve recipe system; (6) Encoder buffer → 256 KB for 64×64 map. Five risks identified, R3 (test suite rebuild) is highest severity.
- **Key file:** Architecture plan at `docs/architecture-plan.md`
- **Pattern:** Extract domain logic to dedicated modules for testability (e.g., `territory.ts` for claim validation, separate from GameRoom handler code).
- **2026-02-27 Resource economy analysis:** Wood economy is broken — tiles regen resources but nothing transfers tile resources to the player's stockpile. The pivot removed manual GATHER but no replacement exists before Phase C (pawn gathering). Proposed fix: passive territory income (owned tiles auto-deposit resources to owner's stockpile every 10s). Creates territory-as-engine loop matching Factorio/RimWorld feel. 2-file change, ~35 lines. Also recommend guaranteeing ≥2 Forest tiles in starting 3×3. Proposal at `.squad/decisions/inbox/hal-resource-economy.md`.
- **2026-02-27 Shape-Territory system designed:** Three interconnected directives from dkirby-ms: (1) polyomino shapes replace walls/floors/CLAIM_TILE as territory expansion; (2) free worker pawn for resource income from tick 1; (3) auto-territory from shape placement. Full architecture at `.squad/decisions/inbox/hal-shape-territory-design.md`. Supersedes resource economy proposal. 10 work items (B1–B10), ~700 lines total. Critical path: shape data → server handler → client UI. Key decisions: shapes block movement (wall function), shapeHP stored on TileState not StructureState (efficiency), worker reuses CreatureState schema, dual income model (passive territory + active worker), 11 shapes (mono through tetrominoes), 2 wood/cell cost.
- **Architecture pattern (shapes):** Store per-tile state (shapeHP) on TileState rather than creating StructureState entities per cell. For features that affect many tiles (territory overlays, shape blocks), TileState fields are O(1) lookup and minimal sync overhead vs. MapSchema entity proliferation.
- **Architecture pattern (worker pawn):** Reuse existing schemas with special `creatureType` values instead of creating new schema classes. Worker pawn is just a CreatureState with `creatureType="worker"`, `trust=100`, `command="gather"`. Avoids schema versioning issues and reuses all creature infrastructure (AI ticks, rendering, pack size).
- **Design trade-off (blocking shapes):** Shapes that block movement unify territory expansion + defense into one satisfying action but risk players accidentally walling themselves in. Mitigated by small shapes (monomino) for gap-filling and ghost preview showing blocked tiles. Future demolish action is the escape valve.
- **2026-02-27 Phase C (Pawn Commands) scoped:** 9 work items (C1–C9), 4–6 day estimate. Two parallel tracks: Pemulis (server: C1 handler, C2 gather FSM, C3 guard FSM, C4 idle bounds) and Gately (client: C5 click-to-tame, C6 selection UI, C7 HUD panel, C8 command visuals). Steeply tests (C9, 14 test cases). No schema changes needed — all Phase A stubs (command, zoneX, zoneY) finally activated. No new messages — ASSIGN_PAWN already defined. 6 architecture decisions (F1–F6). Key insight: existing worker gather logic in `tickWorkerGather` is the foundation for C2. Zone is a single tile point, not an area (simplest possible). Gather/guard pawns skip hunger drain (fed by colony). Guard reuses HUNT_DAMAGE. Pawn selection is client-only state. Full scope at `docs/architecture-plan.md` (Phase C section). Decision at `.squad/decisions/inbox/hal-phase-c-scope.md`.
- **2026-02-27 Unified build+claim mechanic designed:** Merges PLACE (structures) and PLACE_SHAPE (territory) into a single player-facing system. Key decisions: (1) building on unclaimed adjacent tiles auto-claims instantly (no tick delay); (2) shape system survives for standalone territory expansion (keeps tick animation); (3) single "Build Mode" (`B` key) replaces separate build/shape modes — carousel shows both structures and shapes; (4) `V` key and `shapeMode` removed; (5) default mono-click removed — all placement requires build mode; (6) shapeHP unchanged, HQ 3×3 unchanged, score +1/tile unchanged. Server change is ~5 lines in `handlePlace` (relax ownerID check + auto-claim via `isAdjacentToTerritory`). Client change is larger: unified `buildItems` array, merged carousel, ghost preview for structures. 12 work items (U1–U12), ~2.5 day critical path. Decision at `.squad/decisions/inbox/hal-unified-build-claim.md`.
- **Key files (build+claim):** `server/src/rooms/GameRoom.ts` (handlePlace ~line 233, handlePlaceShape ~line 96), `server/src/rooms/territory.ts` (isAdjacentToTerritory), `client/src/input/InputHandler.ts` (shapeMode/buildMode ~line 24-26, click handler ~line 220-240), `client/src/ui/HudDOM.ts` (shape carousel, build indicator), `shared/src/data/shapes.ts` (SHAPE_CATALOG), `shared/src/constants.ts` (SHAPE, TERRITORY constants).
