# Primal Grid Client-Side Architecture Analysis
## Comprehensive Guide for Playwright Testing Framework

---

## 1. SERVER CONNECTION & NETWORKING

### Connection Mechanism
**File:** `/home/saitcho/primal-grid/client/src/network.ts`

**Key Details:**
- **Client Library:** Colyseus SDK (`@colyseus/sdk` v0.17.26)
- **Protocol:** WebSocket (auto-detected based on environment)
- **Room Management:** Single `GameRoom` using `joinOrCreate()` pattern

### Connection Code Flow
```typescript
// File: client/src/network.ts, lines 30-63

export async function connect(): Promise<Room> {
  const client = new Client(getServerUrl());
  statusCallback?.('connecting');
  
  const joinOptions: Record<string, unknown> = {};
  if (isDevMode()) {
    joinOptions.devMode = true;
    console.log('[network] Dev mode enabled — fog of war disabled');
  }
  
  room = await client.joinOrCreate('game', joinOptions);
  console.log('[network] Joined room:', room.roomId);
  statusCallback?.('connected');
  
  // State change listeners set up here
  room.onLeave(() => { /* handle disconnect */ });
  room.onError((code, message) => { /* handle error */ });
  
  return room;
}
```

### Server URL Resolution
```typescript
// Lines 14-23 in network.ts

function getServerUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL as string;  // Custom via env var
  }
  if (import.meta.env.PROD) {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${location.host}`;  // Use host in production
  }
  return `ws://localhost:${SERVER_PORT}`;  // Default: localhost:2567
}
```

**Key Points for Testing:**
- **Default Server:** `ws://localhost:2567` (dev mode)
- **Production:** Auto-detects from current host (`wss://` or `ws://`)
- **Custom URL:** Can be overridden via `VITE_WS_URL` environment variable
- **Room Name:** Always joins room called `"game"` with options

---

## 2. GAME URL & ENTRY POINT

### HTML Entry Point
**File:** `/home/saitcho/primal-grid/client/index.html`

**Key Elements:**
- **Canvas Container:** `<div id="app"></div>` (600×600px)
- **HUD Panel:** `<div id="hud-panel">` (200×600px) — right sidebar
- **Game Log:** `<div id="game-log">` (800×120px) — below game canvas
- **Name Prompt Modal:** Overlay that prompts player to enter name before joining
- **Scoreboard Modal:** Tab-key overlay for viewing player rankings
- **Help Screen:** ? key overlay for controls

**Script Initialization:**
```html
<!-- Line 366 -->
<script type="module" src="/src/main.ts"></script>
```

### Vite Configuration
**File:** `/home/saitcho/primal-grid/client/vite.config.ts`

```typescript
export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  server: {
    port: 3000,  // Dev server runs on :3000
  },
});
```

**Game URL in Development:**
- **Client Dev Server:** `http://localhost:3000`
- **Server WebSocket:** `ws://localhost:2567`
- **Both Must Run:** Use `npm run dev` at root (runs concurrently)

**Query Parameters:**
- `?dev=1` or `?devmode=1` — Enables dev mode (disables fog of war)

---

## 3. MULTI-PLAYER ROOM JOINING

### Player Session & Identification
**File:** `/home/saitcho/primal-grid/client/src/main.ts` (lines 87-153)

```typescript
async function connectToServer(app: Application, grid: GridRenderer, camera: Camera): Promise<void> {
  const room = await connect();
  
  // 1. Prompt player for display name
  const displayName = await promptForName();
  room.send(SET_NAME, { name: displayName });  // Send to server
  
  // 2. Set local player ID (session ID is unique per connection)
  grid.setLocalPlayerId(room.sessionId);
  grid.bindToRoom(room);  // Bind state listeners
  
  // 3. Other renderers bind to same room
  creatures.bindToRoom(room);
  
  // 4. HUD binds to room
  const hud = new HudDOM(room.sessionId);
  hud.bindToRoom(room);
  
  // 5. Scoreboard binds to room
  const scoreboard = new Scoreboard(room.sessionId);
  scoreboard.bindToRoom(room);
  
  // 6. Wait for state sync, then center camera on player's HQ
  room.onStateChange.once(() => {
    const localPlayer = room.state.players?.get(room.sessionId);
    if (localPlayer) {
      camera.centerOnHQ(localPlayer.hqX, localPlayer.hqY);
    }
  });
}
```

### Room State Structure
**From Colyseus SDK bindings:**
```typescript
// room.state has structure:
room.state.players        // MapSchema of all players, keyed by sessionId
room.state.pawns          // MapSchema of creatures on the map
room.state.structures     // MapSchema of buildings/structures
room.state.dayPhase       // Global "day" or "night" phase

// Player object (room.state.players?.get(sessionId)):
{
  id: string              // Same as sessionId
  displayName: string     // Name set by player
  color: string           // Hex color assigned by server
  hqX: number            // HQ tile X coordinate
  hqY: number            // HQ tile Y coordinate
  level: number          // Current level
  xp: number             // Experience points
  wood: number           // Resource count
  stone: number          // Resource count
  // ... other player stats
}

// Pawns (creatures) structure:
room.state.pawns          // MapSchema<Pawn>
{
  type: string           // HERBIVORE, CARNIVORE, BUILDER, DEFENDER, ATTACKER, etc.
  state: string          // IDLE, EAT, HUNT, EXHAUSTED, BUILDING
  x: number              // Tile X
  y: number              // Tile Y
  owner: string?         // sessionId if player-owned
  health: number         // Current health
  // ... combat/state fields
}
```

### Event Listeners for Multiplayer
```typescript
// How to monitor room changes in client:
room.onStateChange((state) => {
  // State changed - access room.state.players, room.state.pawns, etc.
});

room.onMessage('game_log', (data) => {
  // Receive broadcast game log messages
});

room.onLeave(() => {
  // Player left the room (disconnect)
});

room.onError((code, message) => {
  // Error occurred
});
```

**Testing Multiplayer:**
- Open multiple browser tabs to the same URL
- Each tab gets unique `room.sessionId`
- Both can see each other's HQs, creatures, and territory
- Use `room.send(MESSAGE_TYPE, data)` to send commands to server

---

## 4. CURRENT TEST SETUP

### Vitest Configuration
**File:** `/home/saitcho/primal-grid/vitest.config.ts`

```typescript
export default defineConfig({
  test: {
    include: [
      "shared/src/__tests__/**/*.test.ts",
      "server/src/__tests__/**/*.test.ts",
      "client/src/__tests__/**/*.test.ts",
    ],
  },
});
```

### Existing Client Tests
**Location:** `/home/saitcho/primal-grid/client/src/__tests__/camera-zoom.test.ts` (205 lines)

**What it Tests:** Camera zoom anchoring behavior
- Uses vitest with heavy mocking (PixiJS, shared constants)
- Mocks window event listeners
- Tests that zoom stays anchored to mouse cursor position
- Shows a pattern for unit testing client logic with mocked dependencies

**Notable Patterns:**
```typescript
// Mocking PixiJS:
vi.mock('pixi.js', () => ({
  Container: class { /* stub */ }
}));

// Mocking shared package:
vi.mock('@primal-grid/shared', () => ({
  TileType: {},
  DEFAULT_MAP_SIZE: 50,
}));

// Stubbing globals:
vi.stubGlobal('window', { addEventListener: /* stub */ });
```

### Testing Dependencies Available
**Client package.json:**
- `pixi.js` ^8.0.0 — Canvas rendering library
- `@colyseus/sdk` ^0.17.26 — Networking client
- **No test runners in client package.json** — relies on root vitest

**Root package.json (devDependencies):**
- `vitest` ^4.0.18 — Unit test runner (no Playwright yet)
- `typescript` ^5.6.0
- Standard linting tools (ESLint, Prettier)

---

## 5. DEV MODE (?dev=1)

### Implementation
**File:** `/home/saitcho/primal-grid/client/src/network.ts`, lines 25-39

```typescript
function isDevMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('dev') === '1' || params.get('devmode') === '1';
}

export async function connect(): Promise<Room> {
  const joinOptions: Record<string, unknown> = {};
  if (isDevMode()) {
    joinOptions.devMode = true;
    console.log('[network] Dev mode enabled — fog of war disabled');
  }
  
  room = await client.joinOrCreate('game', joinOptions);
  // ...
}
```

### What Dev Mode Does
1. **Disables Fog of War** — player sees entire map, not just explored territory
2. **Passes `devMode: true` to server** — server may apply additional debug behavior
3. **Logged to Console** — "[network] Dev mode enabled — fog of war disabled"

### Activation
**URL Examples:**
- `http://localhost:3000?dev=1`
- `http://localhost:3000?devmode=1`

**Use Case for Testing:** Helpful for Playwright tests that need full map visibility

---

## 6. GAME RENDERING

### Rendering Library: PixiJS
**Library:** `pixi.js` ^8.0.0 (WebGL-accelerated 2D canvas renderer)
**Not:** Three.js, Babylon.js, or custom Canvas API

### Game Initialization
**File:** `/home/saitcho/primal-grid/client/src/main.ts`, lines 18-58

```typescript
async function bootstrap(): Promise<void> {
  const app = new Application();
  
  await app.init({
    width: WIDTH,        // 600px
    height: HEIGHT,      // 600px
    backgroundColor: 0x1a1a2e,
    antialias: true,
  });
  
  const el = document.getElementById('app');
  el.appendChild(app.canvas);  // Mount canvas to DOM
  
  // Create renderers and bind them
  const grid = new GridRenderer();
  app.stage.addChild(grid.container);  // Add grid layer
  
  const creatures = new CreatureRenderer();
  grid.container.addChild(creatures.container);  // Creatures on top of grid
  
  const combatEffects = new CombatEffects();
  grid.container.addChild(combatEffects.container);  // Effects above creatures
  
  // Main animation loop
  app.ticker.add(() => {
    camera.update();
    grid.tick();
    creatures.tick(ticker.deltaTime);  // Smooth creature movement
  });
}
```

### Renderer Components

#### 1. GridRenderer
**File:** `/home/saitcho/primal-grid/client/src/renderer/GridRenderer.ts`

**Renders:**
- Tile map (grass, water, swamp, desert, etc.)
- Territory overlays (each player gets a color)
- Resources on tiles (wood, stone icons)
- HQ markers for each player (castle emoji + player name)
- Fog of war (unexplored areas) — unless `?dev=1`
- Explored tile caches for performance

**Key Constants:**
```typescript
export const TILE_SIZE = 32;  // Each tile is 32×32 pixels
const TILE_COLORS: Record<number, number> = {
  [TileType.Grassland]: 0x4a7c4f,
  [TileType.Forest]: 0x2d5a27,
  [TileType.Swamp]: 0x556b2f,
  [TileType.Desert]: 0xd2b48c,
  [TileType.Highland]: 0x8b7d6b,
  [TileType.ShallowWater]: 0x5da5d5,
  [TileType.DeepWater]: 0x2e6b9e,
  [TileType.Rock]: 0x7f8c8d,
  [TileType.Sand]: 0xf0d9a0,
};
```

**Binding to Room:**
```typescript
bindToRoom(room: Room): void {
  room.onStateChange((state) => {
    // Listen to room.state.map updates
    // Listen to room.state.players for HQ positions
    // Update tile colors, overlays, and fog
  });
}
```

#### 2. CreatureRenderer
**File:** `/home/saitcho/primal-grid/client/src/renderer/CreatureRenderer.ts`

**Renders:**
- Player creatures (pawns) — circles with emoji and type
- Enemy creatures — AI-controlled creatures
- Health bars for player units
- Progress bars for builder units
- State indicators (Idle, Eating, Hunting, etc.)

**Creature Types:**
```typescript
// Colors per type:
HERBIVORE_COLOR = 0x4caf50   // Green
CARNIVORE_COLOR = 0xf44336   // Red
BUILDER_COLOR = 0x42a5f5     // Blue
DEFENDER_COLOR = 0x2196f3    // Lighter blue
ATTACKER_COLOR = 0xff9800    // Orange
EXHAUSTED_COLOR = 0x9e9e9e   // Gray

// States:
// IDLE, EAT, HUNT, EXHAUSTED, BUILDING
```

**Smooth Movement:**
- Uses `app.ticker.deltaTime` for frame-independent animation
- Interpolates creature position each frame for smooth movement

#### 3. Camera
**File:** `/home/saitcho/primal-grid/client/src/renderer/Camera.ts`

**Controls:**
- **Pan:** Arrow keys or WASD
- **Zoom:** Mouse wheel (locked to 0.5–3.0 scale)
- **Drag:** Middle or right mouse button
- **Center on HQ:** Spacebar

**Features:**
- Smart bounds expansion as player explores
- Smooth zoom anchored to mouse cursor (tested in camera-zoom.test.ts)
- Prevents panning outside map bounds

#### 4. CombatEffects
**File:** `/home/saitcho/primal-grid/client/src/renderer/CombatEffects.ts`
- Visual effects overlay for combat interactions
- Layered above creatures for correct rendering order

### Rendering Pipeline
```
PixiJS Application (600×600 canvas)
  ↓
  Stage
    ├─ GridRenderer.container
    │   ├─ Tiles (Graphics objects)
    │   ├─ Territory overlays (Colors)
    │   ├─ HQ markers (Text)
    │   ├─ CreatureRenderer.container
    │   │   ├─ Creature circles (Graphics)
    │   │   ├─ Emoji text
    │   │   ├─ State indicators
    │   │   └─ Health/progress bars
    │   └─ CombatEffects.container
    │       └─ Combat visual effects
    │
    └─ ConnectionStatusUI.container
        └─ Connection indicator

Camera
  ├─ Position (panning)
  ├─ Scale (zoom)
  └─ Explored bounds (follow expansion)
  (Applied to GridRenderer.container via transform)
```

---

## 7. CLIENT DEPENDENCIES & PACKAGE.JSON

### Client Package
**File:** `/home/saitcho/primal-grid/client/package.json`

```json
{
  "name": "@primal-grid/client",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",              // Start dev server on :3000
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "pixi.js": "^8.0.0",
    "@colyseus/sdk": "^0.17.26"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "typescript": "^5.6.0"
  }
}
```

**Note:** No test runner in client package! Testing is configured at root level.

### Root Package
**File:** `/home/saitcho/primal-grid/package.json`

**Key Scripts:**
```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev -w client\" \"npm run dev -w server\"",
    "build": "npm run build -w shared && npm run build -w server && npm run build -w client",
    "test": "vitest run",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "tsc --build"
  },
  "devDependencies": {
    "vitest": "^4.0.18",
    "typescript": "^5.6.0",
    "concurrently": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^8.57.0",
    "eslint-plugin-security": "^3.0.1",
    "prettier": "^3.4.0"
  },
  "dependencies": {
    "zod": "^4.3.6"
  }
}
```

**No Playwright yet** — This is what you're setting up!

---

## 8. UI & DOM INTERACTION

### HudDOM (Sidebar Panel)
**File:** `/home/saitcho/primal-grid/client/src/ui/HudDOM.ts`

**Manages:**
- Territory count
- Inventory (wood, stone)
- Level & XP bar
- Creature counts
- Builder spawn button
- Combat creature spawn buttons (defender, attacker)
- Day/night phase display

**Bindable to Room:**
```typescript
hud.bindToRoom(room);
```

### Scoreboard
**File:** `/home/saitcho/primal-grid/client/src/ui/Scoreboard.ts`
- Toggle with **Tab key**
- Shows all players' scores and territory

### GameLog
**File:** `/home/saitcho/primal-grid/client/src/ui/GameLog.ts`
- Log panel below the game
- Receives messages via `room.onMessage('game_log', data)`

### Input Handler
**File:** `/home/saitcho/primal-grid/client/src/input/InputHandler.ts`

**Key Bindings:**
- **?** or **/** — Toggle help screen
- **Tab** — Toggle scoreboard
- **Spacebar** — Center camera on HQ
- **Arrow Keys / WASD** — Pan camera
- **Mouse Wheel** — Zoom
- **Middle/Right Click + Drag** — Pan camera

---

## SUMMARY FOR PLAYWRIGHT TESTING

### Key Testing Targets
1. **Client starts:** Connects to WebSocket at `ws://localhost:2567`
2. **Game loads:** PixiJS canvas renders (600×600) with grid
3. **Player joins:** Name prompt appears, then bound to server state
4. **Multiplayer:** Two clients can see each other's territories and creatures
5. **Rendering:** Grid, creatures, HQs render correctly
6. **UI Interaction:** Buttons, camera controls, modals work
7. **Dev Mode:** `?dev=1` disables fog of war

### Playwright Test Scenarios
```typescript
// Start both servers
npm run dev  // Runs client on :3000 and server on :2567

// Playwright tests can:
// 1. Navigate to http://localhost:3000
// 2. Fill name prompt
// 3. Wait for canvas to render
// 4. Verify game state via room.state
// 5. Simulate multiple players (multiple page contexts)
// 6. Verify UI updates, creature movement, etc.
```

### Testing Resources Available
- **Vitest** already configured (can add Playwright)
- **PixiJS Canvas** fully rendered (not Shadow DOM)
- **Colyseus Room** exposes `room.state` (queryable in tests)
- **Dev Mode** (`?dev=1`) shows full map for easy assertions

---

## FILE STRUCTURE SUMMARY

```
client/
├── src/
│   ├── main.ts                    // Bootstrap & room connection
│   ├── network.ts                 // WebSocket/Colyseus connection
│   ├── renderer/
│   │   ├── GridRenderer.ts        // Tile map rendering
│   │   ├── CreatureRenderer.ts    // Pawn/creature rendering
│   │   ├── Camera.ts              // Pan/zoom camera
│   │   ├── CombatEffects.ts       // Combat visual effects
│   │   └── ExploredTileCache.ts   // Performance optimization
│   ├── ui/
│   │   ├── HudDOM.ts              // Sidebar panel (inventory, buttons)
│   │   ├── Scoreboard.ts          // Tab-key leaderboard
│   │   ├── GameLog.ts             // Message log panel
│   │   ├── ConnectionStatus.ts    // Connection indicator
│   │   └── HelpScreen.ts          // Help overlay
│   ├── input/
│   │   └── InputHandler.ts        // Keyboard & mouse input
│   └── __tests__/
│       └── camera-zoom.test.ts    // Example unit test
├── index.html                     // Entry point (canvas + HUD HTML)
├── vite.config.ts                 // Dev server on :3000
└── package.json
```

