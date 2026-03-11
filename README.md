# 🦖 Primal Grid

**Survival of the Frontier** — a multiplayer grid-based colony builder with dinosaurs, dynamic ecosystems, and base automation, all running in the browser.

## Overview

[Primal Grid](https://gridwar.kirbytoso.xyz) is a real-time strategy game where players build colonies on a procedurally generated world, manage resources, train pawn builders, and survive alongside (and against) AI-driven dinosaurs. Creatures have their own behavioral AI — herbivores graze and flee, carnivores hunt — and the world evolves every tick. Your units consume food each turn, forcing you to balance expansion with production.

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
- **Territory Ownership & Building System** — Claim tiles adjacent to your territory using pawn builders. Build Farms (boost food income) and Factories (boost wood/stone income). Each building type increases your unit spawn caps: +1 per Farm, +2 per Factory, allowing you to field larger armies.
- **Territory Ownership** — Claim tiles adjacent to your territory using pawn builders. Your 5×5 HQ zone is your foothold; expand outward.
- **Pawn Builder System** — Spawn pawns (cost: Wood + Stone + Food) that autonomously find unclaimed land, move to it, and build structures. Each pawn type consumes food per income tick — manage your food supply carefully or face starvation.
- **Food Economy** — Three resources: **Wood**, **Stone**, and **Food**. Farms produce food; factories produce wood and stone. Your HQ generates all three. When food runs out, random pawns take damage each income tick until you recover.
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
| Production | `prod` | `primal-grid` | (prod URL) | Push to `prod` |
| UAT | `uat` | `primal-grid-uat` | (UAT URL) | Push to `uat` |

### Infrastructure

- Both environments share ACR (`primalgridacr`), Log Analytics, and Container Apps Environment
- Only the Container App itself differs: `primal-grid` (prod) vs `primal-grid-uat` (UAT)
- UAT scales to zero when idle (~$1/month); prod always has at least 1 replica
- Infrastructure is defined in `infra/main.bicep` with an `environment` parameter
- UAT parameters: `infra/main-uat.bicepparam`

### Branch Strategy

```
feature/* ──PR──▶ dev ──PR──▶ uat ──PR──▶ prod
                   │           │            │
                   ▼           ▼            ▼
               Development  UAT deploy  Prod deploy
```

1. **Feature → Dev:** Open a PR from your feature branch to `dev`. Hal reviews for code quality.
2. **Dev → UAT:** Open a PR from `dev` → `uat`. @copilot reviews for test coverage.
3. **UAT → Prod:** Open a PR from `uat` → `prod`. @dkirby-ms reviews and merges manually.
4. **After prod promotion:** UAT is automatically reset to prod via `reset-uat.yml`.

### Branch Protection

The `uat` and `prod` branches are protected:
- Requires pull request (no direct push)
- Requires CI status checks to pass
- No force push (except for post-promotion reset by admins)
- No branch deletion

### CI/CD Workflows

| Workflow | File | Trigger | What it does |
|----------|------|---------|--------------|
| Deploy Prod | `deploy.yml` | Push to `prod` | Build + test → push image to ACR (tag: `{sha}`) → deploy to `primal-grid` |
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

## 🎮 How to Play

New to Primal Grid? Check out the **[How to Play guide](HOW-TO-PLAY.md)** for a walkthrough of game mechanics, buildings, pawns, creatures, and strategies. You can also press `?` in-game for a quick reference.

## 🤝 Contributing

Contributions are welcome! Check the [GitHub Issues](../../issues) for open tasks and bug reports. If you'd like to work on something, feel free to open an issue first to discuss the approach.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
