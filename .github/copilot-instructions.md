# Copilot Coding Agent — Primal Grid

## Project Overview

**Primal Grid: Survival of the Frontier** is a multiplayer grid-based survival colony builder with dinosaurs, dynamic ecosystems, and base automation — all running in the browser.

- **Genre:** Real-time strategy / colony builder
- **Players:** Multiplayer (server-authoritative, no client prediction)
- **Stack:** TypeScript (strict), Colyseus 0.17 (server), PixiJS 8 (client renderer), Vite (client bundler), HTML5 Canvas, Vitest (testing)
- **Architecture:** Monorepo with npm workspaces — three packages: `client/`, `server/`, `shared/`

## Repository Structure

```
primal-grid/
├── client/          # @primal-grid/client — PixiJS 8 + Vite browser app
│   └── src/
│       ├── main.ts              # Bootstrap: PixiJS app init, connect to Colyseus
│       ├── network.ts           # Colyseus SDK connection
│       ├── renderer/            # GridRenderer, CreatureRenderer, Camera
│       ├── input/               # InputHandler (keyboard/mouse)
│       └── ui/                  # HudDOM, ConnectionStatus, GameLog, HelpScreen
├── server/          # @primal-grid/server — Colyseus 0.17 game server
│   └── src/
│       ├── index.ts             # Server entry point (Express + WebSocket transport)
│       ├── rooms/
│       │   ├── GameRoom.ts      # Main game room: lifecycle, tick loop, message handlers
│       │   ├── GameState.ts     # Colyseus Schema classes: GameState, TileState, PlayerState, CreatureState
│       │   ├── creatureAI.ts    # Creature FSM tick (herbivore, carnivore, pawn routing)
│       │   ├── builderAI.ts     # Pawn builder FSM (idle → move_to_site → building)
│       │   ├── mapGenerator.ts  # Procedural map generation (simplex noise + cellular automata)
│       │   └── territory.ts     # Territory claiming, HQ spawning, adjacency checks
│       └── __tests__/           # Server integration tests (Vitest)
├── shared/          # @primal-grid/shared — Pure types, constants, data definitions
│   └── src/
│       ├── types.ts             # Enums (TileType, ResourceType), interfaces (ITileState, ICreatureState, IPlayerState)
│       ├── constants.ts         # All game tuning constants (TICK_RATE, CREATURE_AI, PAWN, TERRITORY, etc.)
│       ├── messages.ts          # Message type constants and payload interfaces (SPAWN_PAWN)
│       ├── index.ts             # Barrel re-exports
│       └── data/
│           ├── creatures.ts     # CREATURE_TYPES record (herbivore=Parasaurolophus, carnivore=Raptor)
│           ├── shapes.ts        # Polyomino shape catalog (11 shapes, 4 rotations each)
│           ├── progression.ts   # Level/XP helpers (getLevelForXP, getAvailableShapes)
│           └── recipes.ts       # Crafting recipes
├── package.json                 # Root workspace config, top-level scripts
├── tsconfig.json                # Root TypeScript config with project references
├── vitest.config.ts             # Test config (shared + server tests)
├── .eslintrc.cjs                # ESLint config
└── docs/                        # Design documents
```

## Build System

### Building

```bash
# Full build (order matters: shared must build first)
npm run build

# This runs: npm run build -w shared && npm run build -w server && npm run build -w client
```

**⚠️ CRITICAL: shared/ incremental build gotcha**
After editing files in `shared/src/`, the TypeScript incremental build may skip emitting updated `.js` files to `shared/dist/` because `tsconfig.tsbuildinfo` thinks nothing changed. The server imports from `shared/dist/`, not from source.

**Fix:** Delete `shared/tsconfig.tsbuildinfo` before rebuilding shared:
```bash
rm -f shared/tsconfig.tsbuildinfo && npm run build -w shared
```

### Running Tests

```bash
npx vitest run
```

Tests live in:
- `shared/src/__tests__/` — Type and constant validation tests
- `server/src/__tests__/` — Server integration tests (creature AI, territory, building, etc.)

### Linting

```bash
npm run lint
# Runs: eslint . --ext .ts,.tsx
```

### Dev Mode

```bash
npm run dev
# Runs client (Vite) and server (tsx watch) concurrently
```

## TypeScript Configuration

- **Target:** ES2022
- **Module:** ES2022 with bundler resolution
- **Strict mode:** Enabled (`"strict": true`)
- **Composite:** Enabled (for project references between packages)
- **Experimental decorators:** Required for Colyseus `@type()` schema decorators
- All packages use ESM (`"type": "module"` in package.json)

## ESLint Rules

- Extends `eslint:recommended` + `@typescript-eslint/recommended`
- **Unused variables rule:** `@typescript-eslint/no-unused-vars` is set to `error` with `argsIgnorePattern: '^_'` and `varsIgnorePattern: '^_'`
  - **Convention:** Prefix unused parameters with underscore (e.g., `_deltaTime`, `_state`)
- Ignores: `dist/`, `node_modules/`, `*.js` files (except `.eslintrc.cjs`)

## State Management — Colyseus Schema

All game state is managed through Colyseus `@type()` decorated Schema classes in `server/src/rooms/GameState.ts`. State is server-authoritative and automatically synced to clients.

### Schema Classes

- **`GameState`** — Root state: tick counter, roundTimer, roundPhase, tiles (ArraySchema), players (MapSchema), creatures (MapSchema), map dimensions, seed
- **`TileState`** — Single tile: type (biome enum), x/y, fertility, moisture, resourceType/Amount, shapeHP, ownerID, isHQTerritory, structureType, claimProgress/claimingPlayerID
- **`PlayerState`** — Player: id, color, wood, stone, hqX/hqY, score, level, xp
- **`CreatureState`** — Creature: id, creatureType, x/y, health, hunger, currentState, ownerID, pawnType, targetX/Y, buildProgress, buildMode, nextMoveTick, stamina

### Schema Decorator Pattern

Every synced field needs its own `@type()` decorator:
```typescript
@type("number")
health: number = 100;

@type("string")
currentState: string = "idle";

@type([TileState])
tiles = new ArraySchema<TileState>();

@type({ map: PlayerState })
players = new MapSchema<PlayerState>();
```

### Tile Indexing

Tiles are stored in a flat ArraySchema. Access by coordinate: `state.getTile(x, y)` which internally does `tiles.at(y * mapWidth + x)`.

## Game Systems

### Simulation Tick

- **Tick rate:** 4 ticks/second (`TICK_RATE = 4`)
- **Map size:** 64×64 tiles (`DEFAULT_MAP_SIZE = 64`)
- The game loop in `GameRoom.onCreate()` calls these systems each tick:
  1. `tickClaiming()` — advances tile claim progress
  2. `tickResourceRegen()` — regenerates tile resources (every 80 ticks)
  3. `tickCreatureAI()` — runs creature FSM (per-creature timers, every 2 ticks per creature)
  4. `tickCreatureRespawn()` — repopulates if below min population (every 100 ticks)
  5. `tickStructureIncome()` — grants resource income from structures (every 40 ticks)
  6. `tickPawnUpkeep()` — deducts builder upkeep costs (every 60 ticks)

### Creature AI — FSM

Creature AI is tick-based with per-creature movement timers (`nextMoveTick` field). Each creature moves independently — there is no global tick gate.

**Wildlife FSM states:** `idle`, `wander`, `eat`, `flee`, `hunt`, `exhausted`

**Herbivore priorities:**
1. **Flee** from carnivores within detection radius
2. **Eat** if hungry and on a resource tile (grazes tile resources)
3. **Move toward food** if hungry and food is nearby
4. **Idle/Wander** otherwise (alternates with random idle pauses)

**Carnivore priorities:**
1. **Hunt** prey (herbivores + pawn builders) when hungry; attack if adjacent
2. **Idle/Wander** otherwise

**Builder FSM states:** `idle`, `move_to_site`, `building`
- Finds nearest unclaimed walkable tile adjacent to owner's territory
- Moves to site, then builds for `BUILD_TIME_TICKS` (16 ticks = 4 seconds)
- Farm builds deduct resources from owner on completion

### Stamina System

All creatures have stamina. Movement costs stamina; idle/eating regenerates it.
- When stamina hits 0, creature enters `exhausted` state (skips normal FSM, only regens)
- Exits exhaustion when stamina reaches `exhaustedThreshold` (hysteresis prevents rapid toggling)
- **Movement functions return booleans** — `true` if the creature actually moved (used for stamina deduction)
- Stamina config is per-creature-type (defined in `CREATURE_TYPES` for wildlife, `PAWN` constants for builders)

### Territory & Ownership

- **HQ:** 5×5 starting zone, immutable (`isHQTerritory = true`), force-converts Water/Rock to Grassland
- **Expansion:** Pawn builders claim tiles adjacent to existing territory
- **shapeHP:** Set on claimed tiles (100 HP). Used for territory border rendering on client — do NOT remove
- **structureType:** `""` (none), `"hq"`, `"outpost"`, `"farm"`
- Wildlife cannot enter owned tiles (`ownerID !== ""`). Builders can enter tiles owned by their player.

### Resource System

- **Only two resources: Wood and Stone** (Fiber and Berries were removed)
- Forest and Grassland tiles yield Wood; Highland tiles yield Stone
- Resources regenerate on tiles every 80 ticks (20 seconds)
- **Structure-based income** (StarCraft-style): HQ gives +2W/+2S per income tick; each Farm gives +1W/+1S
- Builder upkeep: 1 Wood every 60 ticks per builder; failure = 10 damage

### Map Generation

Procedural generation using dual-layer simplex noise + cellular automata smoothing:

1. **Elevation layer** (3 octaves, scale 0.045) → determines Water, Rock, Highland
2. **Moisture layer** (2 octaves, scale 0.035) → determines Forest, Swamp, Desert, Sand, Grassland
3. **Cellular automata smoothing** — 2 passes, Moore neighborhood (8 neighbors), majority threshold of 5. Water and Rock are protected (never smoothed).

**Biome types:** `Grassland`, `Forest`, `Swamp`, `Desert`, `Highland`, `Water`, `Rock`, `Sand`

Lower noise scale = larger biome features (counterintuitive but correct — scale is used as initial frequency).

## Key Constants

All tuning constants live in `shared/src/constants.ts`. Key groups:
- `CREATURE_AI` — tick interval (2), hunger drain, eat restore, hunt damage, idle duration
- `PAWN` — builder costs (10W/5S), build time (16 ticks), upkeep (1W/60 ticks), max 5 per player, stamina
- `TERRITORY` — starting size (5), starting resources (25W/15S), claim ticks (8)
- `STRUCTURE_INCOME` — interval (40 ticks), HQ income (2W/2S), farm income (1W/1S)
- `CREATURE_SPAWN` — herbivore count (32), carnivore count (16)
- `NOISE_PARAMS` — elevation/moisture scales, biome thresholds
- `CREATURE_TYPES` — data-driven creature definitions (in `shared/src/data/creatures.ts`)

## Important Patterns

### Movement Returns Boolean
All movement functions (`moveToward`, `moveAwayFrom`, `wanderRandom`) return `true` if the creature actually moved. This boolean drives stamina deduction in the caller.

### Per-Creature Timers
Each creature has a `nextMoveTick` field. On spawn, creatures are staggered: `nextMoveTick = state.tick + 1 + (index % TICK_INTERVAL)`. The `+1` is critical to prevent both stagger offsets from expiring on the first tick.

### Data-Driven Constants
Game tuning is centralized in `shared/src/constants.ts` and `shared/src/data/`. Import from `@primal-grid/shared`. Never hardcode game values in server or client code.

### Server-Authoritative
All game logic runs on the server. The client renders state and sends messages. No client-side prediction.

### Message Protocol
Messages use string constants defined in `shared/src/messages.ts`. Currently: `SPAWN_PAWN = "spawn_pawn"` with `SpawnPawnPayload` interface.

## Testing Patterns

### Creating Test Rooms
Tests create `GameRoom` instances without the full Colyseus lifecycle:
```typescript
function createRoomWithMap(seed?: number): GameRoom {
  const room = Object.create(GameRoom.prototype) as GameRoom;
  room.state = new GameState();
  room.generateMap(seed);
  room.broadcast = vi.fn(); // or () => {}
  return room;
}
```

The `Object.create(GameRoom.prototype)` pattern avoids calling the constructor. `broadcast` must be stubbed because creature AI calls `room.broadcast?.()` for game log events.

### Adding Test Creatures
```typescript
const creature = new CreatureState();
creature.id = "test-herb";
creature.creatureType = "herbivore";
creature.x = pos.x;
creature.y = pos.y;
creature.health = CREATURE_TYPES["herbivore"].health;
creature.stamina = CREATURE_TYPES["herbivore"].maxStamina;
room.state.creatures.set("test-herb", creature);
```

### Advancing Ticks in Tests
Increment `room.state.tick` manually, then call the relevant tick function:
```typescript
room.state.tick += CREATURE_AI.TICK_INTERVAL;
room.tickCreatureAI();
```

For per-creature timing tests, advance by 1 tick at a time.

### Test File Locations
- `shared/src/__tests__/*.test.ts` — shared package tests
- `server/src/__tests__/*.test.ts` — server integration tests

## What NOT To Do

- **Do NOT add Fiber or Berries resources** — they were intentionally removed. Only Wood and Stone exist.
- **Do NOT remove `shapeHP` from server schema** — it's used by the client for territory border rendering.
- **Do NOT use `any` type** — strict TypeScript is enforced. Use proper types or `unknown` with type guards.
- **Do NOT hardcode game tuning values** — use constants from `@primal-grid/shared`.
- **Do NOT add client-side game logic** — all game logic is server-authoritative.
- **Do NOT skip the `shared/tsconfig.tsbuildinfo` deletion** when rebuilding shared after changes.
- **Do NOT use a global tick gate for creature AI** — each creature has its own `nextMoveTick` timer.
- **Do NOT remove the `+1` from creature spawn stagger formula** — it prevents all creatures from moving on the first tick.
