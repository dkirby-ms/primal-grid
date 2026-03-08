# 🦖 Primal Grid

**Survival of the Frontier** — a multiplayer grid-based colony builder with dinosaurs, dynamic ecosystems, and base automation, all running in the browser.

## Overview

[Primal Grid](https://gridwar.kirbytoso.xyz) is a real-time strategy game where players build colonies on a procedurally generated world, manage resources, train pawn builders, and survive alongside (and against) AI-driven dinosaurs. Creatures have their own behavioral AI — herbivores graze and flee, carnivores hunt — and the world evolves every tick.

The game is fully server-authoritative with multiplayer powered by [Colyseus](https://colyseus.io/). No client-side prediction; the server is the single source of truth.

## 🔧 Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript (strict mode) |
| Server | Colyseus 0.17 (WebSocket game server) |
| Client | PixiJS 8 + Vite (HTML5 Canvas) |
| Shared | Pure types, constants, data definitions |
| Testing | Vitest |
| Linting | ESLint + Prettier |

## ✨ Features

- **Procedural World Generation** — Dual-layer simplex noise (elevation + moisture) with cellular automata smoothing produces natural-looking biomes: Grassland, Forest, Swamp, Desert, Highland, Water, Rock, and Sand.
- **Creature AI** — Tick-based finite state machines with per-creature timers. Herbivores (Parasaurolophus) graze, wander, and flee from predators. Carnivores (Raptors) hunt prey and player pawns.
- **Stamina & Exhaustion** — Creatures spend stamina to move and must rest to recover. Exhaustion triggers a hysteresis cooldown, preventing rapid state toggling.
- **Territory Ownership** — Claim tiles adjacent to your territory using pawn builders. Your 5×5 HQ zone is your foothold; expand outward.
- **Pawn Builder System** — Spawn pawns (cost: Wood + Stone) that autonomously find unclaimed land, move to it, and build structures. Pawns have upkeep costs — neglect them and they take damage.
- **Resource Economy** — Two resources: **Wood** and **Stone**. Harvest from tiles, earn passive income from structures (HQ and Farms), and spend to expand your colony.
- **Progression System** — Earn XP, level up, and unlock new polyomino building shapes as you advance.
- **Multiplayer** — Real-time multiplayer via Colyseus rooms with schema-based state synchronization.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- npm (comes with Node.js)

### Install

```bash
npm install
```

### Run in Development

```bash
npm run dev
```

This starts both the Vite client dev server and the Colyseus game server concurrently.

### Build for Production

```bash
npm run build
```

Builds all three packages in order: `shared` → `server` → `client`.

## 📁 Project Structure

This is an npm workspaces monorepo with three packages:

```
primal-grid/
├── client/     # @primal-grid/client — PixiJS 8 browser app (renderer, input, UI)
├── server/     # @primal-grid/server — Colyseus game server (rooms, AI, map gen)
├── shared/     # @primal-grid/shared — Pure types, constants, game data definitions
├── docs/       # Design documents
└── package.json
```

- **`client/`** — The browser frontend. Connects to the Colyseus server, renders the grid world with PixiJS, handles keyboard/mouse input, and displays HUD elements (resource counts, game log, help screen).
- **`server/`** — The authoritative game server. Manages game rooms, runs the simulation tick loop (4 ticks/sec), executes creature AI, handles territory claiming, resource regeneration, and structure income.
- **`shared/`** — Code shared between client and server. Contains TypeScript types/enums, all game tuning constants, message protocol definitions, creature data, polyomino shapes, and progression tables. Imported as `@primal-grid/shared`.

## 🛠 Development

### Running Tests

```bash
npx vitest run
```

Tests are located in `shared/src/__tests__/` and `server/src/__tests__/`.

### Linting

```bash
npm run lint
```

### Type Checking

```bash
npm run typecheck
```

### ⚠️ Shared Package Rebuild Gotcha

After editing files in `shared/src/`, TypeScript's incremental build may skip emitting updated `.js` files because `tsconfig.tsbuildinfo` thinks nothing changed. The server imports from `shared/dist/`, not source.

**Fix:** Delete the build info before rebuilding shared:

```bash
rm -f shared/tsconfig.tsbuildinfo && npm run build -w shared
```

## 🚀 Deployment & Environments

### Environments

| Environment | Branch | Container App | URL | Deploys On |
|-------------|--------|---------------|-----|------------|
| Production | `master` | `primal-grid` | (prod URL) | Push to `master` |
| UAT | `uat` | `primal-grid-uat` | (UAT URL) | Push to `uat` |

### Infrastructure

- Both environments share ACR (`primalgridacr`), Log Analytics, and Container Apps Environment
- Only the Container App itself differs: `primal-grid` (prod) vs `primal-grid-uat` (UAT)
- UAT scales to zero when idle (~$1/month); prod always has at least 1 replica
- Infrastructure is defined in `infra/main.bicep` with an `environment` parameter
- UAT parameters: `infra/main-uat.bicepparam`

### Branch Strategy

```
feature/* ──PR──▶ uat ──PR──▶ master
                  │              │
                  ▼              ▼
              UAT deploy    Prod deploy
```

1. **Feature → UAT:** Open a PR from your feature branch to `uat`. On merge, `deploy-uat.yml` auto-deploys.
2. **UAT → Master:** Once validated on UAT, open a PR from `uat` → `master`. On merge, `deploy.yml` auto-deploys to prod.
3. **After promotion:** Reset uat to master to prevent divergence:
   ```bash
   git checkout uat && git reset --hard origin/master && git push --force-with-lease
   ```

### Branch Protection

The `uat` branch is protected:
- Requires pull request (no direct push)
- Requires CI status checks to pass
- No force push (except for post-promotion reset by admins)
- No branch deletion

### CI/CD Workflows

| Workflow | File | Trigger | What it does |
|----------|------|---------|--------------|
| Deploy Prod | `deploy.yml` | Push to `master` | Build + test → push image to ACR (tag: `{sha}`) → deploy to `primal-grid` |
| Deploy UAT | `deploy-uat.yml` | Push to `uat` / workflow_dispatch | Build + test → push image to ACR (tag: `uat-{branch}-{sha}`) → deploy to `primal-grid-uat` |

### Emergency UAT Override

For testing a specific branch without merging to `uat`, use the workflow_dispatch trigger:

```bash
gh workflow run deploy-uat.yml -f branch=feature/my-fix
```

### Initial UAT Provisioning

To provision the UAT Container App for the first time:

```bash
az deployment group create -g primal-grid-rg \
  --template-file infra/main.bicep \
  --parameters infra/main-uat.bicepparam
```

The param file uses a quickstart placeholder image. The first deploy via `deploy-uat.yml` will replace it with the real app image.

## 🏗 Architecture

### Client-Server Split

All game logic is server-authoritative. The client is a thin rendering layer that:
1. Connects to a Colyseus `GameRoom` via WebSocket
2. Listens for state changes via Colyseus schema callbacks
3. Renders the world each frame using PixiJS
4. Sends player actions as messages (e.g., `spawn_pawn`)

The server runs the full simulation — creature AI, territory claiming, resource management — and automatically syncs state to all connected clients via Colyseus schema replication.

### Colyseus Rooms & State Sync

The game uses a single room type (`GameRoom`) with schema-based state synchronization:

- **`GameState`** — Root state containing the tick counter, tile array, player map, and creature map
- **`TileState`** — Per-tile data: biome type, resources, ownership, structures, claim progress
- **`PlayerState`** — Per-player data: resources (Wood/Stone), HQ position, score, level, XP
- **`CreatureState`** — Per-creature data: position, health, hunger, AI state, stamina, movement timers

State changes on the server are automatically delta-compressed and broadcast to clients — no manual sync code needed.

### Simulation Tick

The server runs at 4 ticks/second and processes these systems each tick:
1. Day/night cycle
2. Territory claiming
3. Resource regeneration
4. Creature AI (per-creature timers)
5. Creature respawning
6. Structure income
7. Pawn upkeep
8. Fog of war

## 🤝 Contributing

Contributions are welcome! Check the [GitHub Issues](../../issues) for open tasks and bug reports. If you'd like to work on something, feel free to open an issue first to discuss the approach.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
