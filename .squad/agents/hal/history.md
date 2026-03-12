# Project Context

- **Owner:** dkirby-ms
- **Project:** Primal Grid: Survival of the Frontier — grid-based survival colony builder with dinosaurs, dynamic ecosystems, and base automation in the browser
- **Stack:** TypeScript, HTML5 Canvas, browser-based web game
- **Design Document:** docs/design-sketch.md
- **Created:** 2026-02-25T00:45:00Z

## Core Context

**Pre-2026-03 Work Summary:**
- **Phases 0–4.5 Complete:** Full 6-week build plan executed through Phase 4.5 (HUD redesign). Phase 0 scaffolding (monorepo, Colyseus, PixiJS, Vite, Jest). Phase 1–2 core simulation (biomes, resources, creatures, player survival). Phase 3 base building (shapes, crafting, structures, farms). Phase 4 creature systems (schema, taming, pack commands, breeding). Phase 4.5 HUD redesign (canvas resize 800→600, HTML DOM side panel). All phases independently demonstrable. 239/240 tests passing.
- **Architecture Decisions:** 8-phase plan (Phases 0–7), each with clear boundaries and work breakdown. Auth deferred to Phase 7. Aggressive scope fencing (no modding, no audio, no tactical combat until Phase 6+). User preference: smallest playable thing per phase, defer aggressively. Data-driven constants, server-authoritative state, no client prediction.
- **User Directives:** Core loop hollow (fixed by Phases 3–4 mechanics). Resource display redesign (4 options analyzed, Quantity Bar recommended for 1-day impl). Phase A UAT checklist created (80+ test cases, ready for manual validation). Territory control & conquest game identity (user pivot 2026-03-04, supersedes prior A/B/C proposals).
- **Key Learnings:** Colyseus @type() schema decorator pattern essential. Flat inventory fields necessary (MapSchema limitation). FSM-based creature AI scales well. Data-driven configs (CREATURES, RESOURCES, RECIPES) provide flexibility for balance tuning. Phased approach enables rapid iteration without scope creep.
- **Key Files:** Decisions at `.squad/decisions.md` (merged from inbox regularly). Architecture plan at `docs/design-sketch.md`. Phase breakdowns in decisions history. Code patterns documented in this history.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
- **Food Economy Design Approved (2026-03-14):** Completed audit → design → review cycle for Issue #21 (food economy as third resource). Design spec documented all constants (starting 50 food, HQ 2/tick, farm 2/tick, upkeep per unit, starvation mechanic at food ≤ 0). PR #153 reviewed, identified 3 issues (starvation check, tooltips, legacy constants), Steeply fixed all three (Gately unavailable). PR approved and merged to dev (squash). Key learning: Clear farm/factory role split (farms → food, factories → economy) creates natural strategic tension. Starvation damage delegated to existing death logic (single source of truth). Food can accrue as debt, players must repay before spawning resumes.

- **GitHub Auto-Close Issue Process Gap Fixed (2026-03-12):** Four issues (#19, #31, #42, #74) had PRs merged to dev but stayed OPEN. Root cause: "Closes #N" syntax was placed in commit messages or PR titles, not PR bodies. GitHub only auto-closes on squash+merge when the close keyword appears in the PR body. Investigation found agents were ambiguous on placement. Fix: (1) Updated `.squad/copilot-instructions.md` to emphasize PR BODY as the only reliable location for auto-close keywords, (2) Added Rule 8 to `.squad/routing.md` explicitly requiring "Closes #N" in PR body, (3) Created decision file `.squad/decisions/inbox/hal-issue-auto-close.md` documenting the gap and enforcement points. Key learning: Single authoritative location (PR body) prevents process gaps — GitHub only reads PR body for squash merges, regardless of commit message content.

- **Footer Feature UI Scoped (2026-03-13):** Issue #150 requests footer with version (from root package.json v0.1.6), published date, and link to submit issues. Research found: (1) Client HTML is flex-centered with game wrapper + HUD panel; footer naturally sits below in document flow. (2) No existing footer infrastructure. (3) Build-time injection via Vite is the minimal approach (version from package.json, date from git commit, link hardcoded to GitHub issues). Decision: This is client-side UI work — assigned to Gately. Key learning: Client structure is flex-based with centered game wrapper, making footer placement straightforward (no grid/absolute positioning needed). Build-time injection avoids runtime lookups and keeps the frontend lean.



- **Pawn Builder Architecture proposed (2026-03-04):** dkirby-ms rejected all conquest mechanics (Influence Flooding, Resource Pressure, Creature Siege, Shape Overlap Invasion) in favor of autonomous pawn-based expansion. Architected full builder system: pawns reuse CreatureState schema (creatureType="builder", ownerID=player.id — same pattern as removed Phase B worker), 3-state FSM (IDLE→SEEK_SITE→BUILDING), 1×1 structures claim single tiles, builders spawned at HQ for 5W+5S cost. Direct shape placement removed — player role shifts from "Tetris player" to "commander" (spawn pawns, manage economy). PawnTypeDef registry enables future pawn types (gatherer, scout, soldier). MVP: ~255 lines added, ~200 removed, 2–3 days. Key trade-off: no rally points in MVP (builders pick their own targets). Deferred: multi-tile structures, pawn upgrades, rally points, population caps. Filed to `.squad/decisions/inbox/hal-pawn-builder-architecture.md`.

- **Competitive Territory Spec authored (2026-03-02):** User confirmed B+C hybrid direction. Wrote full build spec at `docs/competitive-territory-spec.md`. Key decisions: territory contesting (place on opponent tiles, 4s vs 2s claim), wood upkeep (1 per 10 tiles/60s, decay from edges), neutral creatures (herbivore bonus income, carnivore border damage), 10-min timed rounds, HQ immunity (3×3 sacred). Implementation: 4 phases, ~553 lines, phases 1/2/4 parallelizable. Scope cuts: no taming, no fog of war, no biome scoring, no matchmaking. The critical code change is removing the `tile.ownerID !== player.id` rejection in `handlePlaceShape` (line 105 of GameRoom.ts) and adding contest timing. Decision filed to inbox.

- **Resource display design researched & recommended (2026-03-02):** User expressed dissatisfaction with current 5×5 dot resource indicators (top-right corner, color-coded by type, binary visibility). Analysis found four viable alternatives: (A) Quantity bar (recommended), (B) Icon+count label, (C) Border accent, (D) Hover tooltip. Recommendation: **Option A (Quantity Bar)** — shows resourceAmount 0–10 via bar fill height, integrates naturally with tile, zero friction for arcade pace, 1-day implementation. Reasoning: current system lacks quantity feedback (binary on/off), has low visual salience, and doesn't support strategic map scanning needed for commander-based gathering (new pawn system). Bar fills the gap without complexity. File: `.squad/decisions/inbox/hal-resource-display-design.md`.

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

- **2026-03-06 Feature branch deployment plan (Issue #22):** Evaluated 3 approaches for test environment deployments: (A) separate Container App per branch in shared Environment, (B) revision labels on single Container App, (C) separate resource group per branch. Recommended **Option A** — separate Container Apps. Key reasons: full isolation, WebSocket/Colyseus compatibility (revision label routing is fragile for WS), simple lifecycle (create on PR open, delete on PR close), scale-to-zero for near-zero cost. New artifacts: `infra/test-app.bicep` (parameterized test app referencing existing ACR + Environment), `.github/workflows/deploy-test.yml` (PR-triggered deploy + cleanup). No changes to existing prod infra (`main.bicep`, `deploy.yml`). Branch name sanitization needed (Azure 32-char limit, lowercase, no special chars). Estimated cost: <$5/month for 3–5 active branches. Plan filed to `.squad/decisions/inbox/hal-feature-branch-deploy-plan.md`.
- **Infra key files:** `infra/main.bicep` (prod ACR + Environment + Container App), `infra/main.bicepparam` (eastus/primal-grid/primalgridacr), `.github/workflows/deploy.yml` (master push → ACR → Container App update), `.github/workflows/ci.yml` (main push/PR → lint/typecheck/build/test). Azure auth via OIDC (3 secrets: client-id, tenant-id, subscription-id). ACR uses admin credentials (Basic SKU). Container App runs 0.25 vCPU / 0.5Gi, port 2567.

- **Documentation Accuracy Policy (2026-03-15):** Reviewed PR #158 (Docs Update). Found critical discrepancies between player-facing docs (`HOW-TO-PLAY.md`, `HelpScreen.ts`) and code (`constants.ts`) regarding pawn costs and unit naming ("Raider" vs "Attacker"). Documentation must reflect the codebase exactly to prevent player confusion. Enforced strict review on docs-only PRs: verify every number against constants.

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
- **2026-02-27 Progression system designed:** 7-level XP-based progression. Players start with 2 shapes (O, I), unlock remaining 5 tetrominoes at levels 2–5, pets at level 6, pet breeding at level 7. XP is per-round (resets with round), initially from tile claims (1 XP/tile), extensible to wave kills/breeding/taming via `grantXP()` helper. Schema adds `level` and `xp` to PlayerState. Server validates shape access in handlePlaceShape. Client filters carousel by level. Level-up check at XP grant site (not tick loop). Data-driven PROGRESSION constant in shared/constants.ts. ~95 lines across 8 files. Decision at `.squad/decisions/inbox/hal-progression-design.md`.
- **Architecture pattern (progression):** XP sources are decoupled from level logic. Any handler that awards XP calls a 5-line `grantXP(player, amount)` helper that increments XP and checks for level-up. Level thresholds and shape unlocks are data-driven in a `PROGRESSION` constant. Abilities use string flags (`hasAbility(level, "pets")`) for extensibility without schema changes.
- **User preference (progression):** dkirby-ms wants shape unlocks and pets as progression rewards. "Eventually through other means" = XP from non-tile sources. Design must be future-proof for new XP sources without rework.
- **2026-03-01 Select-to-Place design proposed:** Build mode (`B` key toggle, `buildMode` boolean) is purely client-side state — server has zero concept of it. `handlePlaceShape()` in `GameRoom.ts` validates independently. Proposed replacing explicit build mode with "select-to-place": carousel always visible (moved below creatures in HUD), `selectedShapeIndex: number | null` replaces `buildMode + shapeIndex`, Escape to deselect, stay armed after placement for rapid building. ~80 lines across 4 client files, zero server changes. Decision at `.squad/decisions/inbox/hal-remove-build-mode.md`.
- **Architecture insight:** Build mode is 100% client-side. Server message contract (`PLACE_SHAPE { shapeId, x, y, rotation }`) is mode-agnostic. Any client interaction redesign that produces the same message is backward-compatible.
- **User preference:** dkirby-ms wants shapes carousel always visible, no explicit build mode, shapes under creatures list in status panel.
- **2026-03-02 Select-to-Place design finalized:** Hal authored full design proposal for build mode removal. Gately authored complementary UI layout & interaction design. Both converge on select-to-place model: carousel always visible below creatures, click shape to arm (armed state = `selectedShapeIndex !== null`), Escape/right-click to disarm, stay armed after placement for rapid builder flow. Zero server changes. ~80 lines across 4 client files. Decision merged to `.squad/decisions.md`. Orchestration logs: `.squad/orchestration-log/2026-03-02T15-15-48Z-hal.md`. Session log: `.squad/log/2026-03-02T15-15-48Z-shapes-carousel-design.md`. Awaiting dkirby-ms approval to begin implementation.

### 2026-03-02 Resource Display UX Research Coordinated

Hal coordinated parallel research with Gately (Game Dev) and Pemulis (Systems Dev) on resource display UX alternatives. Spawned 3 agents (background mode) to analyze approaches independently:

- **Hal's analysis:** Designed Option A (Quantity Bar) as primary recommendation — fill-height bar (0–10 units) in tile corner, minimal footprint, 1-day implementation, intuitive quantity at glance. Analyzed 4 alternatives (Bar, Icon+Count, Border Accent, Hover Tooltip). Full decision at `.squad/decisions.md` with design spec, pseudocode, and rationale. Alternative Option C (Border Accent) identified as backup if dkirby-ms wants more integrated look.
- **Gately's analysis:** Proposed pie chart wedge renderer (12–14px circle, 0–360° fill) as elegant alternative. PixiJS implementation ~1–1.5 hours, zoom-invariant. Decision merged to `.squad/decisions.md`.
- **Pemulis's analysis:** Confirmed current data model (resourceType + resourceAmount) supports all display approaches. Single-resource design is intentional; multi-resource possible but deferred (2+ weeks). Added richness via fertility field or lightweight resourceQuality addition. No backend blockers. Decision merged to `.squad/decisions.md`.

**Status:** Three decisions merged to `.squad/decisions.md`. Awaiting dkirby-ms approval to select Hal's bars or Gately's pie chart for implementation.

**Session log:** `.squad/log/2026-03-02T20-00-16Z-resource-display-research.md`

**Pattern:** Parallel research sprint reduces sequential blocking. Three semi-independent analyses converge on viable trade-offs (bars vs. pie) without blocking on any single decision. Pemulis confirms no data work, so Hal's and Gately's work is pure design iteration.

- **2026-03-02 Core gameplay loop redesign proposed:** User rejected resource display proposals and identified the real problem: the core loop is hollow ("Just gathering resources and placing more tiles is not enough"). Hal audited all systems and confirmed the diagnosis: the only player verb is shape placement, but placement carries no meaningful decisions (all shapes are functionally identical, all directions equally valuable, no threats, no tension). Proposed three redesigns: (A) **Habitat Puzzle** — biome-matching scoring + cluster multipliers + optional shape queue (Dorfromantik/Islanders pattern, ~150 lines, SMALL scope); (B) **Hungry Territory** — territory upkeep/maintenance cost + resource depletion + tile decay (Factorio scarcity pressure, ~120 lines, SMALL-MEDIUM scope); (C) **The Living Grid** — creatures settle on territory, generate income, ecosystem management as the game (RimWorld emergent stories, ~150 lines, MEDIUM scope). Recommended Proposal A as starting point: smallest scope, fixes root cause (shape placement isn't interesting), composable with B and C later. All three proposals require zero new schemas and zero new messages. Decision at `.squad/decisions/inbox/hal-gameplay-loop-redesign.md`. Awaiting dkirby-ms selection.
- **Key insight (game design):** The problem wasn't missing systems (turrets, waves, pawn commands) — it was that the existing core verb (shape placement) lacked meaning. Adding systems on top of a hollow core doesn't fix the hollow core. Make the ONE thing the player does interesting before adding more things.
- **User preference (2026-03-02):** dkirby-ms explicitly rejected UI polish (resource display improvements) in favor of deeper game design rethinking. Prefers fundamental loop fixes over surface improvements.
- **2026-03-02 Multiplayer loop analysis complete:** Evaluated all three gameplay loop proposals (A: Habitat Puzzle, B: Hungry Territory, C: Living Grid) through a multiplayer lens. **Changed recommendation from A to B+C hybrid ("Hungry Living Grid").** Reasoning: (1) Proposal A risks parallel solitaire on 64×64 map — players can expand in opposite directions without interacting; (2) Proposal C's shared creature pool creates inherent multiplayer interaction from tick 1 (tragedy of the commons dynamic is uniquely multiplayer); (3) Proposal B's upkeep pressure forces expansion and collision, preventing turtling. B+C compose cleanly (~200 lines, 2–3 days). A can layer on top later as scoring refinement. Decision at `.squad/decisions/inbox/hal-multiplayer-loop-analysis.md`.
- **Key insight (multiplayer design):** The game's entire stack is built for multiplayer (Colyseus, shared state, territory ownership, creature sync). When evaluating gameplay loops, the question isn't "can this work with multiplayer?" but "does this loop make multiplayer *matter*?" Shared resources (creature pool) and forced expansion (upkeep) create player interaction without explicit PvP combat. Parallel solitaire with a leaderboard is not multiplayer — you need mechanics where one player's actions directly affect another's options.
- **Architecture confirmed:** Colyseus state sync means zero additional networking is needed for any proposal. All tile ownership, creature positions, and resource amounts already sync to all clients. The multiplayer infrastructure is done; what's missing is multiplayer *tension* in the game design.

---

## 2026-03-02 — Multiplayer Gameplay Loop Analysis

**Status:** PROPOSED — awaiting user selection

**Hal spawned:** Evaluate three gameplay proposals through multiplayer lens.

**Context:** User directive (2026-03-02T20:30:00Z) locked game as multiplayer competitive territory control. Existing proposals (A: Habitat Puzzle, B: Hungry Territory, C: Living Grid) were analyzed single-player. Hal re-evaluated all three through multiplayer lens.

**Analysis:**
- **Proposal A (Habitat Puzzle):** B+ grade — good spatial competition but risks parallel solitaire on large maps; players can expand in opposite directions for 5+ minutes without interaction.
- **Proposal B (Hungry Territory):** A- grade — strongest direct PvP pressure; upkeep costs force expansion and collision; snowball risk requires rubber-banding mechanic.
- **Proposal C (Living Grid):** A grade — shared creature pool is inherently multiplayer; tragedy of the commons; emergent stories; slower/recoverable snowball.

**Decision:** **Changed recommendation from A to B+C hybrid ("Hungry Living Grid").**

**Reasoning:** Multiplayer isn't an add-on — it's the architecture. The infrastructure (Colyseus room, shared creatures, real-time sync) is already built. The question is which loop makes 2 players on the same map *care* about each other from tick 1.

- **B provides expansion pressure:** Without upkeep, players turtle with perfect small habitat. Upkeep forces expansion → collision → conflict.
- **C provides ecosystem depth:** Without creatures, B is just land-grab math. Creature settling makes tile quality matter strategically.
- **Combined story:** *"I need to expand (B) into right biomes (C) competing for shared creature pool (C) while opponent's territory decays (B)."*

**Scope:** ~200 lines, 2–3 days implementation.

**Implementation order:**
1. C's creature settling (~80 lines, 1 day) — immediately testable, adds placement meaning
2. B's upkeep + decay (~50 lines, 0.5 day) — adds expansion pressure
3. B's resource depletion (~30 lines, 0.5 day) — forces expansion
4. Creature attraction to habitats (~40 lines, 0.5 day) — ties settling to biome quality
5. Score refinement

**File:** `.squad/decisions.md` (merged from inbox 2026-03-02T20:26:24Z)

**Next steps:** Pending user approval to scope B+C hybrid into work items.

- **Territory Control Architecture (2026-03-02):** User pivoted from biome-puzzle proposals (A/B/C from 2026-03-02 decisions.md) to **territory control and conquest** game identity: "Players start with immutable 9×9 territory (sacred HQ zone). All expansion is conquerable through game mechanics." Analyzed current territory system (TileState.ownerID, claimProgress, 8-tick claiming, shape placement validation at GameRoom.ts:105). Proposed architecture with three conquest mechanic options: (A) Influence Flooding (place shapes on enemy tiles, influence accumulation flips ownership, ~80 lines), (B) Resource Pressure + Territory Decay (Wood upkeep per 10 tiles, unpaid tiles decay from edges, ~60 lines), (C) Creature Conquest (tamed creatures raid border tiles, deferred Phase 5+). Recommended Option A first (smallest scope, direct spatial conflict, composable with B). Key changes: add `TileState.isHQTerritory` flag (protects starting 3×3), add `TileState.influenceValue` (0–100 per tile), remove `tile.ownerID !== player.id` rejection in handlePlaceShape (line 105), modify tickClaiming for influence logic. Existing systems preserved (shape placement, progression, resources, creatures, HUD, map gen). Estimated 6–8h for Option A MVP, 2–3 days full implementation. Proposal written to `.squad/decisions/inbox/hal-territory-control-redesign.md`. Open questions: HQ size (3×3 vs 9×9), influence visibility (tooltips vs always-on), win condition (timed rounds vs first-to-X), neutral tile income, A+B hybrid.

- **Architecture pattern — Sacred vs. Contested Territory:** Boolean flag (`isHQTerritory`) + schema-level distinction cleanly separates immutable starting zones from conquerable expansion. All conquest logic checks flag before executing. Prevents "HQ flip" bugs without complex validation chains. Cost: 1 schema field + 1 conditional per conquest mechanic. Benefit: clear boundary enforcement, easy to reason about, composable with future mechanics (e.g., "can build X structure only in HQ zone"). Pattern applies to any game with "safe zones" (spawn points, home bases, sanctuaries). Files: `server/src/rooms/GameState.ts` (TileState schema), `server/src/rooms/territory.ts` (spawnHQ marking), `server/src/rooms/GameRoom.ts` (conquest validation).

- **Key files — Territory System:**
  - `server/src/rooms/territory.ts` — Territory claiming logic (spawnHQ, isAdjacentToTerritory, claimTile, getTerritoryCounts)
  - `server/src/rooms/GameRoom.ts` — Shape placement handler (line 78–131), claiming tick (line 203–226), territory income (line 160–185)
  - `server/src/rooms/GameState.ts` — TileState schema (ownerID, claimProgress, claimingPlayerID, shapeHP)
  - `shared/src/types.ts` — ITileState interface (defines tile data contract)
  - `shared/src/constants.ts` — TERRITORY constants (STARTING_SIZE=3, CLAIM_TICKS=8, starting resources)


### 2026-03-04 Territory Control Architecture (Cross-Team Proposal)

Hal authored comprehensive architecture proposal for territory control pivot. **Pemulis and Gately independently analyzed the same proposal and delivered complementary detailed system design + rendering design.** All three agents working in parallel on same user directive achieved alignment on data model, code locations, and implementation roadmap.

**Hal's Proposal:**
- Three conquest mechanic options: (A) Influence Flooding (RECOMMENDED, ~80 lines, 6–8h), (B) Resource Pressure + Territory Decay (~60 lines, 2–3d with A), (C) Creature Conquest (deferred Phase 5+, ~120 lines)
- Key code change identified: Remove `tile.ownerID !== player.id` rejection in `handlePlaceShape` (line 105 GameRoom.ts)
- Schema additions: `TileState.isHQTerritory` flag, `TileState.influenceValue` (0–100), `PlayerState.influence`
- Existing systems preserved: shape placement, progression, resources, creatures, HUD, map gen
- Open questions for dkirby-ms: HQ size (3×3 vs 9×9), influence visibility, win condition, neutral tile income, A+B hybrid timing
- Deliverable: `.squad/decisions/inbox/hal-territory-control-redesign.md` (240 lines)

**Team Alignment:**
- **Pemulis confirmed feasibility:** 5 new TileState fields, 7 numbered mechanics, 5-phase roadmap (7–10 days full, 3–5 days Phase 1+2 core loop). All code locations identified.
- **Gately confirmed rendering ready:** 4 visualization layers fit into existing overlay pattern, ~50 lines MVP, zero perf regression.
- **Architecture pattern validated:** Schema-level `isHQTerritory` flag cleanly separates immutable from conquerable territories, prevents bugs, composable with future mechanics.

**Status:** Decision merged to `.squad/decisions.md` (2026-03-04 Territory Control section). Orchestration logs written for all three agents. Session log: `.squad/log/2026-03-04T2126-territory-redesign.md`. **READY FOR USER DECISION** on mechanic choice + design confirmation.

**Next steps:** Await dkirby-ms approval to scope into work items.


### 2026-03-04 Pawn Builder Architecture (Concurrent Proposal)

Hal architected pawn-based territory expansion system per user directive (dkirby-ms pivot away from conquest mechanics toward autonomous pawns). **Pemulis independently designed complementary data model and implementation roadmap.**

**Hal's Architecture Proposal:**
- Builder pawns (reuse CreatureState, creatureType="builder", ownerID=player.id)
- Spawning: At HQ, 5W+5S cost, 50 HP, huntable
- 3-state FSM: IDLE → SEEK_SITE → BUILDING → IDLE
- 1×1 structures claim single tiles; no radius claiming
- Remove direct shape placement; player role = commander (spawn pawns, manage economy, watch territory grow)
- PawnTypeDef registry for extensibility (future: gatherer, scout, soldier)
- Interaction matrix: creatures hunt builders, resources fund spawning, progression via XP, territory income unchanged
- MVP scope: 9 work items, ~255 lines added/~200 removed, 2–3 days
- Open questions: shape placement removal (or keep as override?), builder structure size (1×1 or larger?), rally points (MVP or defer?)
- Deliverable: `.squad/decisions/inbox/hal-pawn-builder-architecture.md` (135 lines)

**Pemulis's Design Complement:**
- Extended CreatureState schema: ownerID, pawnType, targetX/targetY, buildProgress, buildingType (4 new fields)
- New StructureState schema: id, structureType, x, y, ownerID, health, maxHealth, isComplete
- Three structure types: outpost, wall, extractor
- TileState additions: isHQTerritory flag, structureID reference
- Constants registry: PAWN (MAX_PER_PLAYER, BUILD_TIME_TICKS), STRUCTURE (per-type health/buildTime)
- 4-phase implementation: (1) Builder AI Core, (2) Structure System, (3) Economy Integration, (4) Client Rendering
- Estimate: 3–4 days, ~600 lines
- Codebase audit: No old pawn/worker traces remain; building fresh on CreatureState FSM pattern
- Deliverable: `.squad/decisions/inbox/pemulis-pawn-builder-design.md` (786 lines)

**Cross-Agent Alignment:**
- **Hal → Pemulis:** Architecture inputs data model design; Pemulis expanded with StructureState schema, buildProgress tracking, isHQTerritory flag
- **Pemulis → Hal:** Confirms CreatureState reuse pattern scales to pawns; adds 4-phase roadmap clarifying integration points
- **Both → User:** Fully architected, ready for approval

**Status:** Decisions merged to `.squad/decisions.md` (2026-03-04 Pawn-Based Territory Expansion section). Orchestration logs: `.squad/orchestration-log/2026-03-04T2227-hal.md`, `.squad/orchestration-log/2026-03-04T2227-pemulis.md`. Session log: `.squad/log/2026-03-04T2227-pawn-builder-design.md`. **READY FOR USER APPROVAL** to begin implementation.

**Next steps:** Await dkirby-ms sign-off on open questions (shape placement removal, structure size, rally points) before work items assigned.


### 2026-03-06 Feature Branch Deployment — UAT Single Site

**User directive:** Rewrite feature branch deployment plan to simpler approach: NO per-PR containers, ONE persistent UAT Container App, manual deployment trigger (workflow_dispatch), feature branch testing in local dev only.

**Context:** Previous plan (`.squad/decisions/inbox/hal-feature-branch-deploy-plan.md`, 16KB) proposed ephemeral per-PR container apps with GitHub Actions orchestration for create/destroy lifecycle. User rejected approach as overcomplicated and costly.

**New Architecture:**
- **One persistent UAT Container App** (`primal-grid-uat`) that always exists, like prod
- **Manual deployment** via `workflow_dispatch` with branch input selector
- **Shared infrastructure** with prod: same ACR (`primalgridacr.azurecr.io`), same Container Apps Environment (`primal-grid-env`), same Log Analytics
- **Scale-to-zero** for UAT (minReplicas: 0) to minimize cost (~$1/month vs ~$10/month always-on)
- **Docker image tagging:** `{branch}-{sha}` for traceability (UAT) vs `{sha}` only (prod)

**Key Changes:**
1. **Bicep parameterization:** Add `environment` param to `infra/main.bicep` (default: 'prod', accepts: 'uat')
   - Container App name: `environment == 'uat' ? '${appName}-uat' : appName`
   - Scale config: UAT gets minReplicas=0, maxReplicas=3; prod keeps minReplicas=1, maxReplicas=1
2. **New param file:** `infra/main-uat.bicepparam` with `environment = 'uat'`
3. **New workflow:** `.github/workflows/deploy-uat.yml` with workflow_dispatch trigger, branch input, same test→build→deploy pipeline as prod
4. **One-time setup:** `az deployment group create` to create UAT Container App in existing environment

**Cost Impact:** +$1/month (UAT scale-to-zero) vs +$10/month (always-on). Cold start trade-off: 10-20 seconds on first request after idle. Acceptable for pre-release testing.

**Scope (v1):**
- Parameterize main.bicep (environment param, conditional name/scale)
- Create main-uat.bicepparam
- Create deploy-uat.yml workflow
- One-time UAT deployment
- Documentation (README usage instructions)
- Testing (manual deploy, scale-to-zero verification, cold start recovery)

**Deferred:**
- Slack/Discord notifications for UAT deploys
- Branch pattern restrictions (allow any branch initially)
- UAT auto-cleanup/reset jobs
- Blue-green UAT (multiple UAT slots)
- Custom domains (UAT uses default ACA FQDN)

**Architecture Pattern — Shared Environment Multi-Tenant:**
- One Container Apps Environment hosts multiple Container Apps (prod + UAT)
- Shared ACR (tags namespace isolate images: `{sha}` for prod, `{branch}-{sha}` for UAT)
- Shared Log Analytics (query partitioned by container app name)
- Cost benefit: Environment overhead (~$5/month) amortized across apps
- Zero isolation cost: Same VNET, same ingress controller, no cross-tenant security needed
- Pattern scales to N environments (staging, demo, etc.) without N×environment cost

**User Preference — Manual > Automatic:**
- Explicit over implicit: workflow_dispatch requires conscious decision to deploy
- Cost control: No accidental deploys on every push
- Feature branch testing: Local dev (`npm run dev`) for rapid iteration; UAT for team validation
- No PR comment noise: UAT URL is stable, documented once

**Key Files:**
- `infra/main.bicep` — Current Bicep template (ACR + Container Apps Environment + single prod Container App)
- `infra/main.bicepparam` — Prod params (location=eastus, appName=primal-grid, acrName=primalgridacr)
- `.github/workflows/deploy.yml` — Current prod deploy (master push → test → build → ACR push → update container app)
- `.github/workflows/ci.yml` — PR validation (no deployment)
- `Dockerfile` — Multi-stage Node 22 build, server on port 2567
- Azure auth: OIDC (secrets: AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID, ACR_NAME, RESOURCE_GROUP, CONTAINER_APP_NAME)

**Deliverable:** `.squad/decisions/inbox/hal-feature-branch-deploy-plan.md` (fully rewritten, 12.8KB)

**Next Steps:** Await user approval to begin implementation (Bicep changes → workflow creation → one-time UAT deployment → testing → documentation).


---

### Issue #154 — Outpost Upgrade System Design (2025-01-24)

**Scope:** Design spec for outpost upgrade feature — scoping, constants, logic, UI/UX.

**Design Decisions:**
1. **Single-tier upgrade (v1):** Regular outpost → upgraded outpost. No multi-tier complexity.
2. **Cost:** 40 wood + 30 stone (significant late-game investment, ~4× farm cost).
3. **Attack range:** 5 tiles (Manhattan) — matches defender detection radius, prevents OP coverage.
4. **Damage:** 12 per attack (kills swarm in 2 hits, raider in 4 hits — effective but not OP).
5. **Attack interval:** 8 ticks (2 sec) — same as TILE_ATTACK_COOLDOWN_TICKS, slower than pawns.
6. **Targeting:** Closest enemy (Manhattan distance) — simplest algorithm, predictable behavior.
7. **UI trigger:** Right-click outpost → upgrade modal — keeps HUD clean, follows "interact with structure" pattern.
8. **Visual:** Icon change 🗼 → 🏹 — clear ranged attack signal, minimal rendering change.

**Constants Pattern:**
```typescript
export const OUTPOST_UPGRADE = {
  COST_WOOD: 40,
  COST_STONE: 30,
  ATTACK_RANGE: 5,
  DAMAGE: 12,
  ATTACK_COOLDOWN_TICKS: 8,
} as const;
```
Follows existing pattern: `BUILDING_COSTS`, `STRUCTURE_INCOME`, `WATCHTOWER`, `FOG_OF_WAR`.

**Schema Change:**
- Add `upgraded: boolean = false` to `TileState` (Colyseus schema syncs to client automatically).

**Server Logic:**
1. **Upgrade handler:** `handleUpgradeOutpost(client, message)` validates ownership, structure type, resources → deduct cost, set `tile.upgraded = true`.
2. **Attack tick loop:** `tickOutpostAttacks()` runs every 8 ticks, scans upgraded outposts, finds closest enemy in range, deals damage.
3. **Helper:** `findClosestEnemyInRange(x, y, range)` iterates creatures, filters enemy mobiles, returns closest by Manhattan.

**Client Rendering:**
- Update `STRUCTURE_ICONS['outpost_upgraded'] = '🏹'`
- `updateBuildingIcon()` checks `tile.upgraded` flag and picks icon key accordingly.

**Client UI:**
- Right-click handler in `InputHandler.ts` detects owned regular outpost → shows upgrade modal.
- Modal shows cost, validates resources, sends `UPGRADE_OUTPOST` message on confirm.

**Message Protocol:**
```typescript
export const UPGRADE_OUTPOST = "UPGRADE_OUTPOST";
export interface UpgradeOutpostPayload { x: number; y: number; }
```

**Deferred (v2+):**
- Multi-tier upgrades
- Target priority options (lowest HP, attackers first)
- Attack visual effects (projectiles, muzzle flash)
- Sound effects
- Outpost durability (enemies damaging structures)
- Upgrade other buildings

**Key Files:**
- `shared/src/constants.ts` — Upgrade costs, range, damage, tick intervals follow existing patterns (BUILDING_COSTS, WATCHTOWER, COMBAT).
- `server/src/rooms/GameRoom.ts` — Building placement handler pattern (`handlePlaceBuilding`) used for upgrade handler; structure income tick pattern used for attack tick loop.
- `server/src/rooms/GameState.ts` — TileState schema with @type decorators for Colyseus sync.
- `server/src/rooms/combat.ts` — Combat tick pattern: cooldown tracking, adjacency checks, damage application. Outpost attacks follow same tick interval pattern.
- `client/src/renderer/GridRenderer.ts` — Building icon rendering: `STRUCTURE_ICONS` map, `updateBuildingIcon()` checks structure type and sets Text emoji.
- `client/src/ui/HudDOM.ts` — Building placement pattern: button triggers placement mode, sends `PLACE_BUILDING` message. Upgrade uses right-click modal instead (no HUD button).

**Codebase Patterns Observed:**
- **Constants:** Grouped in const objects with `as const`, SCREAMING_SNAKE_CASE keys, descriptive comments with tick→time conversions.
- **Tick loops:** `if (state.tick % INTERVAL_TICKS !== 0) return;` guard at top, then iterate state and apply logic.
- **Validation:** Handler checks player exists → resource ownership → structure type → resource sufficiency → deduct and apply.
- **Emoji rendering:** Text objects with fontSize 14-16, anchor (0.5, 0.5), positioned at tile center, added to dedicated container.
- **Right-click for structure interaction:** Natural extension of existing input patterns (left-click for pawn orders, right-click for structure actions).

**Architecture Notes:**
- **Colyseus state sync:** @type decorators on schema fields auto-sync to clients. No manual serialization needed.
- **Tick-based simulation:** 4 ticks/sec. All timing constants expressed in ticks with human-readable comments (e.g., "40 ticks = 10 seconds at 4 ticks/sec").
- **Combat cooldowns:** Server-side Map tracks cooldowns by creature ID, not synced to client. Same pattern applies to outpost attacks.
- **Building rendering layers:** HQ has dedicated renderer, other buildings (farm, factory, outpost) use shared `buildingContainer` with emoji Text objects.

**Deliverable:** `.squad/decisions/inbox/hal-outpost-upgrade-design.md` (comprehensive spec, 13KB, implementation-ready).

**Next Steps:** Implementer (Gately or Pemulis) can proceed directly from spec. All open questions resolved. Issue #154 ready for `go:yes` (label updated).


---

### Sprint Kickoff (2026-03-12) — Design Complete, Review In Progress

**Completed:**
- **#154 Outpost Upgrade Architecture Design** (2026-03-16 revalidation + spec)
  - Single-tier outpost upgrade system with ranged defense
  - 40W + 30S cost, 5-tile attack range, 12 damage, 8-tick cooldown
  - Detailed implementation plan across 3 phases (1.5 days each)
  - Design document merged into .squad/decisions.md
  - Ready for Pemulis (Phase 1 server work)

**In Progress:**
- **PR Review:** #162 (Marathe CI fix) and #163 (Pemulis creature types)
- Expected to complete within sprint

**Context Propagation:**
- Pemulis briefed on Phase 1 server tasks (constants, schema, upgrade handler, combat tick)
- Gately briefed on Phase 2 client tasks (icon rendering, right-click modal, CSS)
- All team aware of creature types PR (#163) and resource tuning recommendations

**Design Validation:**
- Revalidated against current codebase (TileState, combat system, resource economy)
- No architectural conflicts with creature types (#157) or ongoing work
- Design integrates cleanly with existing patterns (right-click interaction, Colyseus schema)
- Trade-offs documented (single-tier vs. multi-tier, closest-enemy targeting, instant upgrade)

**Sign-off:** Design complete and validated. Ready to begin Phase 1 upon Hal's PR review completion.
