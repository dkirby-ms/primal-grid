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

**Your Role (Gately):** Game Dev — lead Phases 0–4 (core gameplay loop). See `.squad/decisions.md` for full architecture.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### Phase 0 Scaffolding (2026-02-25)
- Created root monorepo with npm workspaces (`client`, `server`, `shared`). Root package is `@primal-grid/root`, private, ESM-only.
- Root tsconfig uses `ES2022` target, strict mode, bundler moduleResolution, project references to all three packages.
- Root devDependencies: `concurrently`, `eslint` + `@typescript-eslint`, `prettier`, `typescript`, `vitest`.
- Client package (`@primal-grid/client`): PixiJS v8 (`^8.0.0`), `colyseus.js` (`^0.15.0`), Vite 6 for bundling.
- Client `main.ts` uses PixiJS v8 async init pattern: `new Application()` then `await app.init({...})`.
- Vite dev server on port 3000, build target ES2022.
- CI pipeline: GitHub Actions on push/PR to `main` — checkout, Node 20, `npm ci`, lint, typecheck, build, test.
- ESLint config is CJS (`.eslintrc.cjs`) since root package is `type: module`.
- Prettier: single quotes, trailing commas, 2-space indent, 100 char width.
- `.gitignore` covers: `node_modules/`, `dist/`, `.env`, `*.tsbuildinfo`, `coverage/`.
- Files created: `package.json`, `tsconfig.json`, `.eslintrc.cjs`, `.prettierrc`, `.editorconfig`, `.gitignore`, `.github/workflows/ci.yml`, `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts`, `client/index.html`, `client/src/main.ts`.

### Phase 1 Client Walking Skeleton (2026-02-25)
- **PixiJS v8 patterns:** `new Application()` + `await app.init({...})`. Graphics: `.rect()` then `.fill(color)` (not beginFill/drawRect/endFill). Text: `new Text({ text, style: {...} })`.
- **Colyseus.js 0.15 patterns:** `new Client(url)`, `client.joinOrCreate('room')` returns `Room`. Events: `room.onStateChange(cb)`, `room.onLeave(cb)`, `room.onError(cb)`. Send: `room.send(type, payload)`. Session ID: `room.sessionId`.
- **GridRenderer:** 32×32 grid of `Graphics` objects, 32px tiles. Grass/Water/Rock/Sand color map. `bindToRoom()` listens to `onStateChange` and iterates `state.tiles` via generic `forEach` — adapts to ArraySchema or MapSchema.
- **Camera:** WASD pans, middle/right-mouse drag pans, scroll wheel zooms (0.5×–3×). Clamps viewport to map bounds. `update()` called each frame via `app.ticker.add()`.
- **PlayerRenderer:** Colored circles (radius 12px) placed at tile center. Local player gets gold ring highlight. Updates snap to position from server state.
- **InputHandler:** Arrow keys send `{ dx, dy }` move messages with 150ms debounce. Click converts screen→world coords and sends absolute `{ x, y }`.
- **ConnectionStatusUI:** PixiJS `Text` in top-right corner showing connection state. "Connected" auto-hides after 2s.
- **network.ts:** Wraps Colyseus connection with status callback system. Exports `connect()`, `getRoom()`, `onConnectionStatus()`. Gracefully handles server-unavailable (falls back to offline mode with grass grid visible).
- **Wiring in main.ts:** Bootstrap creates app → grid → camera → status UI → async connects to server. On connect: binds grid, creates player renderer, attaches input handler. On failure: logs warning, client stays up with default grid.
- **Architecture note:** State binding uses generic `Record<string, unknown>` typing to avoid coupling to Pemulis's exact schema shape. Works with any collection that has `.forEach()`.
- **Files created:** `client/src/network.ts`, `client/src/renderer/GridRenderer.ts`, `client/src/renderer/Camera.ts`, `client/src/renderer/PlayerRenderer.ts`, `client/src/input/InputHandler.ts`, `client/src/ui/ConnectionStatus.ts`. Modified: `client/src/main.ts`.

### Phase 2.1 Biome Tile Rendering (2026-02-25)
- Expanded TILE_COLORS map in GridRenderer to support 8 biome types: Grassland (0x4a7c4f), Forest (0x2d5a27), Swamp (0x556b2f), Desert (0xd2b48c), Highland (0x8b7d6b), Water (0x3498db), Rock (0x7f8c8d), Sand (0xf0d9a0).
- Renamed all `TileType.Grass` references to `TileType.Grassland` across client, server, and shared packages.
- Updated shared TileType enum to include new biomes (Forest, Swamp, Desert, Highland). Enum values shifted: Water=5, Rock=6, Sand=7. No issues since all code uses symbolic names.
- Added `disconnect()` export to `network.ts` for clean room teardown.
- Added Vite HMR dispose handler in `main.ts` — calls `disconnect()` on hot reload to prevent duplicate Colyseus connections.
- Added `"types": ["vite/client"]` to client tsconfig for `import.meta.hot` type support.
- `isWalkable` uses deny-list (Water/Rock), so new biomes are automatically walkable — no server-side changes needed.

### Phase 2.1 Completion & Handoff (2026-02-25)

- **Phase 2.1 complete:** Biome colors, HMR cleanup, 60 tests passing. Pemulis completed server-side map generation. Steeply expanded test coverage.
- **Decision record merged:** `.squad/decisions.md` now contains full Phase 2 scoping + Phase 2.1 architecture from Pemulis and Gately. Inbox files deleted. Orchestration logs written.
- **Team status:** 60 tests passing. Biome world rendering live. HMR dev loop clean. Ready for Phase 2.2 (Resources) and 2.4 (Creatures) parallel tracks.

### Phase 2.2/2.4 Client Rendering (2026-02-25)
- **CreatureRenderer** (`client/src/renderer/CreatureRenderer.ts`): Renders herbivores as green circles (#4CAF50, radius 6px) and carnivores as red triangles (#F44336, radius 6px). Follows same duck-typed `onStateChange` binding pattern as PlayerRenderer — iterates `state.creatures.forEach()`, creates/removes sprites reactively.
- **Resource indicators in GridRenderer**: Each tile now has a pre-allocated resource dot (5×5px square, top-right corner of tile). Hidden by default; shown when `resourceAmount > 0`. Color-coded by type: Wood=brown (#8B4513), Stone=gray (#999999), Fiber=light green (#90EE90), Berries=orchid (#DA70D6).
- **Shared types expanded**: Added `ResourceType` enum (Wood=0, Stone=1, Fiber=2, Berries=3), `CreatureType` type alias, `ICreatureState` interface, and optional `resourceType`/`resourceAmount` fields on `ITileState`.
- **Wiring**: `main.ts` creates and binds CreatureRenderer after PlayerRenderer, adds creature container to grid container (same z-order pattern).
- **Architecture note**: Both renderers use generic `Record<string, unknown>` duck-typing for state access. No coupling to Pemulis's exact Colyseus schema classes — adapts at runtime to whatever collection shape `.creatures` or tile fields have.
- **89 tests passing** after changes, no regressions.

### Phase 2.3 Client HUD — Hunger & Health Bars (2026-02-25)
- **HudRenderer** (`client/src/ui/HudRenderer.ts`): PixiJS-based HUD overlay showing health and hunger bars for the local player. Fixed position (top-left, 12px padding), added to `app.stage` so it stays screen-fixed regardless of camera/world scroll.
- **Health bar**: Dark red background (#441111), fill color shifts green→orange→red as value drops. Label + numeric readout ("Health 85/100").
- **Hunger bar**: Dark orange background (#442211), fill color shifts yellow-orange→dark orange→red as value drops. Label + numeric readout ("Hunger 42/100").
- **Graceful defaults**: If server hasn't sent `health`/`hunger` fields yet, defaults to 100/100 (full bars). No crash, no missing UI.
- **Wiring**: `main.ts` passes `app` into `connectToServer()` so the HUD container can be added to `app.stage` (not `grid.container`). HUD binds to room state via same duck-typed `onStateChange` pattern as other renderers.
- **Same binding pattern**: Uses `Record<string, unknown>` duck-typing for state access, finds local player by matching `room.sessionId`, reads `player['health']` and `player['hunger']` with nullish defaults.
- **126 tests passing** after changes, no regressions.

### Phase 2.6 Creature State Visual Feedback (2026-02-25)
- **CreatureRenderer state-aware rendering**: Each creature now tracked as a `CreatureEntry` (Container + Graphics + Text indicator) instead of a plain Graphics sprite. Graphics rebuilt only when `currentState` changes — no per-frame redraws.
- **State color variations**: Eat state uses brighter/lighter colors (herbivore: #81C784, carnivore: #EF9A9A). Hunt state uses darker carnivore red (#C62828). Idle/Wander use default base colors.
- **State indicators**: Flee state shows "!" above creature, Hunt state shows "⚔" above creature. Text indicators hidden when idle/wander/eat for clean visuals.
- **Health opacity**: Creatures below 50% health render at 0.6 alpha — subtle visual degradation without cluttering the grid.
- **HUD creature counts**: Added `🦕 {herbivores}  🦖 {carnivores}` text below hunger bar in HudRenderer. Counts updated every state change from `state.creatures` collection.
- **HUD bindToRoom refactored**: Player stats and creature counts now both read from the same `onStateChange` callback. Guard changed from early-return to conditional blocks so both sections execute.
- **Performance**: Graphic rebuilds are gated by `lastType`/`lastState` diffing. Alpha updates gated by `lastHealthLow` boolean. Indicator Text objects pre-allocated and toggled via `visible` — no allocation churn.
- **168 tests passing** after changes, no regressions.

### Phase 3.5+3.6 Structure Rendering, Inventory HUD & Build Mode (2026-02-25)
- **StructureRenderer** (`client/src/renderer/StructureRenderer.ts`): Reactive rendering of structures using same CreatureRenderer pattern — `bindToRoom()`, `onStateChange`, seen-set cleanup for add/remove. Pre-allocated Graphics per structure, positioned at tile coordinates.
- **Structure visuals**: Wall = brown square outline (3px stroke, 4px padding). Floor = translucent tan overlay (alpha 0.4). Workbench = brown filled square with white "T" text marker. FarmPlot = brown soil base with growth indicator graphics.
- **Farm growth stages**: Growth progress drives visual: 0-33 = empty soil (brown base only), 34-66 = small light green sprout dot, 67-99 = medium green rectangle, cropReady=true = bright green background with orchid berry dots. Growth indicator is a separate pre-allocated Graphics object updated only when growthProgress or cropReady changes.
- **HudRenderer extended**: Added inventory display (🪵 Wood, 🪨 Stone, 🌿 Fiber, 🫐 Berries) and crafted item counts (Wall, Floor, Axe, Pickaxe, WB, Farm) below creature counts. Added build mode indicator text. Added `onInventoryUpdate` callback for feeding resource data to CraftMenu. Tracks local player position (`localPlayerX`, `localPlayerY`) for farm harvest.
- **CraftMenu** (`client/src/ui/CraftMenu.ts`): PixiJS overlay toggled by C key. Displays all 6 recipes from `shared/src/data/recipes.ts` with emoji cost labels. Number keys (1-6) craft by index. Uses `canCraft()` from shared to gray out unaffordable recipes. Semi-transparent black background (alpha 0.8).
- **InputHandler extended**: Added C (craft menu toggle), B (build mode toggle), H (farm harvest), and number key (1-9) bindings. Build mode intercepts click to send PLACE message instead of MOVE. Number keys context-sensitive: craft if menu open, cycle build item if in build mode.
- **Build mode**: 4 placeable items (Wall, Floor, Workbench, FarmPlot). Number keys select item, click sends PLACE with tile coordinates. HUD shows "🔨 BUILD MODE [ItemName]" indicator. B key toggles on/off.
- **Wiring in main.ts**: StructureRenderer added to grid.container after CreatureRenderer. CraftMenu added to app.stage (screen-fixed). InputHandler receives CraftMenu and HudRenderer references via setter methods. HUD.onInventoryUpdate feeds CraftMenu.updateResources for live affordability.
- **Architecture**: All new code follows existing duck-typed `Record<string, unknown>` state access pattern. No coupling to Pemulis's exact Colyseus schema classes. Recipes imported from shared package (already defined by Pemulis).
- **244 tests passing**, build clean, no regressions.

---

## Phase 3 Complete (2026-02-25T21:50:00Z)

**Status:** COMPLETE — Phase 3 Client UI Verified

Phase 3 is complete as of 2026-02-25T21:50:00Z. Gately's Phase 3.5–3.6 deliverables (StructureRenderer, CraftMenu, inventory HUD, build mode, farm visualization) have been verified by Steeply's integration test suite: 273 total tests passing, no bugs found in client implementation.

All Phase 3 client-side features working as specified:
- StructureRenderer renders walls, floors, workbenches, and farm plots with correct visuals
- Farm growth stages visualized (empty soil → sprout → medium growth → harvest-ready)
- CraftMenu accessible via C key, shows all recipes with affordability checks
- Build mode (B key) with item selection (1-4) and placement UI working
- Inventory HUD shows all resource types with emoji labels
- Harvest action (H key) sends correct coordinates to server
- Full gameplay loop: gather → craft → build → harvest working end-to-end

**Phase 3 Definition of Done:** ✅ Code-complete, test-complete, no regressions, ready for Phase 4.

Client infrastructure is stable. Ready for Phase 4 creature UI extensions.

---

## Phase 4 Kickoff (2026-02-25T22:48:00Z)

**Status:** ACTIVE — Waiting on Pemulis 4.1 schema

**Scope:** Gately owns client work: 4.5 Tame UI (1d), 4.6 Command Binding (1d), 4.7 Trait Rendering (1d). Total 3d after 4.1 lands. Depends on: Pemulis 4.1 schema (ownerID, trust, personality, traits fields).

**Gately tasks (begin when 4.1 schema lands):**
- **4.5 Tame UI** (1d): New HUD panel "My Creatures" listing owned creatures grouped by type. Show trust bar (0–100) below each creature name. Click creature → highlight in world.
- **4.6 Command Binding** (1d after 4.5): F key toggles select/deselect creatures (Shift for multi-select). Visual indicator: owned creatures have gold ring when in selected pack. Display "N/8 creatures selected" in HUD.
- **4.7 Trait Rendering** (1d after 4.5): Hover creature → tooltip showing Personality, Speed (±X), Health (+X), Hunger Drain (±X). On breeding, offspring tooltip shows "Bred 2 ticks ago" + parent info.

**Blocking:** Pemulis 4.1 schema (ownerID, trust, personality, traits fields). Once 4.1 lands, unblock and start 4.5 immediately.

**Orchestration complete:**
- ✅ Hal scoping document merged to decisions.md
- ✅ Session log written
- ✅ Orchestration log written
- ✅ Agent history updated
