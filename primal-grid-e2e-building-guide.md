# Primal Grid: E2E Test Setup & Building Placement System

## 1. E2E TEST DIRECTORY STRUCTURE

### Directory Layout
```
e2e/
├── playwright.config.ts          # Main Playwright configuration
├── fixtures/
│   ├── game.fixture.ts           # Test fixtures for multi-player setup
│   └── game.fixture.d.ts
├── tests/
│   ├── join-flow.spec.ts        # Player join flow tests
│   ├── multiplayer.spec.ts       # Multi-player gameplay tests
│   ├── day-night.spec.ts         # Day/night cycle tests
│   ├── state-init.spec.ts        # State initialization tests
│   ├── state-assertions.spec.ts  # State assertion tests
│   ├── dev-mode.spec.ts          # Dev mode specific tests
│   └── reconnect-refresh.spec.ts # Reconnection/refresh tests
└── helpers/
    ├── game.fixture.ts           # Game fixture definition
    ├── player.helper.ts          # Player state access helpers
    ├── state.helper.ts           # Game state access helpers
    ├── tile.helper.ts            # Tile querying helpers
    ├── websocket.helper.ts       # WebSocket message recording
    └── creature.helper.ts        # Creature-related helpers
```

### Test Framework
- **Framework**: Playwright (v1.x)
- **Test Runner**: Uses `@playwright/test` base
- **Language**: TypeScript (ESM modules)
- **Server**: Starts both server (port 2567) and client (port 3000) automatically
- **Workers**: Single worker (fullyParallel: false)
- **Retries**: 2 in CI, 0 locally
- **Timeout**: 60 seconds per test, 10 seconds for assertions
- **Video/Screenshots**: On first retry (CI) or failure

---

## 2. EXISTING E2E TEST FILES & PATTERNS

### Complete Example: `join-flow.spec.ts`

```typescript
import { test, expect } from '../fixtures/game.fixture.js';
import { waitForPlayerCount, waitForPlayerOnScoreboard, getGameState } from '../helpers/player.helper.js';
import { getPlayerState } from '../helpers/state.helper.js';

test.describe('Join Flow', () => {
  test('single player can join and see the game canvas', async ({ playerOne }) => {
    const { page, playerName } = playerOne;

    // Canvas should be rendered
    const canvas = page.locator('#app canvas');
    await expect(canvas).toBeVisible();

    // Name prompt should be gone
    const overlay = page.locator('#name-prompt-overlay');
    await expect(overlay).not.toHaveClass(/visible/);

    // Player should exist in room state
    const state = await getPlayerState(page, playerName);
    expect(state).not.toBeNull();
    expect(state!.displayName).toBe(playerName);

    // HQ should have been placed (coordinates > 0)
    expect(state!.hqX).toBeGreaterThanOrEqual(0);
    expect(state!.hqY).toBeGreaterThanOrEqual(0);
  });

  test('HUD panel displays after joining', async ({ playerOne }) => {
    const { page } = playerOne;

    // HUD panel should be visible
    await expect(page.locator('#hud-panel')).toBeVisible();

    // Territory count should be rendered
    await expect(page.locator('#territory-count-val')).toBeVisible();

    // Inventory should show
    await expect(page.locator('#inv-wood')).toBeVisible();
    await expect(page.locator('#inv-stone')).toBeVisible();
  });

  test('two players can join and see each other', async ({ playerOne, playerTwo }) => {
    // Both players should see 2 players in the room state
    await waitForPlayerCount(playerOne.page, 2);
    await waitForPlayerCount(playerTwo.page, 2);

    // Read full game state from player one's perspective
    const stateFromOne = await getGameState(playerOne.page);
    expect(stateFromOne).not.toBeNull();

    // Verify both names are present
    const names = stateFromOne!.players.map((p) => p.displayName);
    expect(names).toContain(playerOne.playerName);
    expect(names).toContain(playerTwo.playerName);

    // Each named player should have a unique HQ position
    const hqs = stateFromOne!.players
      .filter((p) => [playerOne.playerName, playerTwo.playerName].includes(p.displayName))
      .map((p) => `${p.hqX},${p.hqY}`);
    expect(hqs).toHaveLength(2);
    expect(hqs[0]).not.toBe(hqs[1]);
  });
});
```

### Test Fixture Pattern: `game.fixture.ts`

```typescript
import { test as base, type BrowserContext, type Page } from '@playwright/test';

export interface PlayerPage {
  context: BrowserContext;
  page: Page;
  playerName: string;
}

type GameFixtures = {
  playerOne: PlayerPage;
  playerTwo: PlayerPage;
};

export const test = base.extend<GameFixtures>({
  playerOne: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await joinGame(page, 'Alice');
    await use({ context: ctx, page, playerName: 'Alice' });
    await ctx.close();
  },
  playerTwo: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await joinGame(page, 'Bob');
    await use({ context: ctx, page, playerName: 'Bob' });
    await ctx.close();
  },
});

/**
 * Navigate to the game in dev mode, enter a player name, and wait for the
 * canvas to render. The name-prompt overlay uses a `.visible` CSS class
 * toggled in client/src/main.ts promptForName().
 */
async function joinGame(page: Page, name: string): Promise<void> {
  await page.goto('/?dev=1');

  // Wait for name prompt overlay to become visible
  await page.waitForSelector('#name-prompt-overlay.visible', { timeout: 15_000 });

  // Fill in name and submit
  await page.fill('#name-prompt-input', name);
  await page.click('#name-prompt-submit');

  // Wait for overlay to disappear
  await page.waitForSelector('#name-prompt-overlay.visible', { state: 'hidden', timeout: 10_000 });

  // Wait for canvas to render inside #app
  await page.waitForSelector('#app canvas', { timeout: 10_000 });
}

export { expect } from '@playwright/test';
```

### Key Testing Patterns

1. **Multi-player Setup**: Use `playerOne` and `playerTwo` fixtures to run tests with multiple contexts
2. **State Access**: Use helpers to read `window.__ROOM__` state via `page.evaluate()`
3. **WebSocket Recording**: Install message recorder to track sent/received messages
4. **Wait Strategies**: Use `page.waitForFunction()` to wait for state changes
5. **DOM Selectors**: Target HUD elements by ID (e.g., `#hud-panel`, `#inv-wood`)

---

## 3. BUILDING PLACEMENT SYSTEM

### 3.1 Building Constants
**File**: `shared/src/constants.ts`

```typescript
/** Building placement costs (instant placement via PLACE_BUILDING). */
export const BUILDING_COSTS: Record<string, { wood: number; stone: number }> = {
  farm: { wood: 12, stone: 6 },
  factory: { wood: 20, stone: 12 },
} as const;

/** Per-building income awarded each structure income tick (40 ticks = 10 seconds). */
export const BUILDING_INCOME: Record<string, { wood: number; stone: number }> = {
  farm: { wood: 1, stone: 1 },
  factory: { wood: 2, stone: 1 },
} as const;

/** Structure-based income tick interval */
export const STRUCTURE_INCOME = {
  INTERVAL_TICKS: 40,   // 10 seconds at 4 ticks/sec
  HQ_WOOD: 2,
  HQ_STONE: 2,
} as const;
```

### 3.2 Building Messages
**File**: `shared/src/messages.ts`

```typescript
export const PLACE_BUILDING = "place_building" as const;

export interface PlaceBuildingPayload {
  x: number;
  y: number;
  buildingType: "farm" | "factory";
}
```

### 3.3 Client HTML - Building HUD Section
**File**: `client/index.html` (lines 657-662)

```html
<div class="hud-section" id="section-buildings">
  <h3>Buildings</h3>
  <button id="build-farm-btn" class="build-btn" disabled>
    🌾 Build Farm (12W, 6S)
  </button>
  <button id="build-factory-btn" class="build-btn" disabled>
    ⚙️ Build Factory (20W, 12S)
  </button>
  <div id="build-placement-hint">Click a tile to place · ESC to cancel</div>
</div>
```

### 3.4 Client UI - Building Placement Wiring
**File**: `client/src/ui/LobbyScreen.ts`

The `LobbyScreen` class handles:
- Displaying the lobby to join/create games
- Managing player name input
- Game list updates
- Game join flow

Building placement UI is wired in the main game view (not in LobbyScreen) via button listeners that:
1. Enable/disable based on available resources
2. Activate placement mode on click
3. Send `PLACE_BUILDING` message on tile selection

### 3.5 Client Renderer - Placement Mode & Validation
**File**: `client/src/renderer/GridRenderer.ts` (lines 69-76, 645-693)

```typescript
// Placement highlight overlays
private placementContainer: Container;
private placementOverlays: Map<number, Graphics> = new Map();

// Cached tile metadata for placement validation
private tileOwners: Map<number, string> = new Map();
private tileStructures: Map<number, string> = new Map();
private tileTypes: Map<number, TileType> = new Map();

/**
 * Show placement highlight overlays on valid tiles.
 * Valid = owned by local player, no existing structure, not water/rock.
 */
public showPlacementHighlights(): void {
  this.clearPlacementHighlights();

  for (const tileIdx of this.visibleTiles) {
    const tx = tileIdx % this.mapSize;
    const ty = Math.floor(tileIdx / this.mapSize);
    if (this.isValidPlacementTile(tx, ty)) {
      const g = new Graphics();
      g.rect(0, 0, TILE_SIZE, TILE_SIZE);
      g.fill({ color: 0x00ff88, alpha: 0.2 });
      g.rect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
      g.stroke({ width: 1, color: 0x00ff88, alpha: 0.5 });
      g.position.set(tx * TILE_SIZE, ty * TILE_SIZE);
      this.placementContainer.addChild(g);
      this.placementOverlays.set(tileIdx, g);
    }
  }
}

/** Remove all placement highlight overlays. */
public clearPlacementHighlights(): void {
  for (const g of this.placementOverlays.values()) {
    this.placementContainer.removeChild(g);
    g.destroy();
  }
  this.placementOverlays.clear();
}

/** Check if a tile is valid for building placement. */
public isValidPlacementTile(x: number, y: number): boolean {
  if (x < 0 || x >= this.mapSize || y < 0 || y >= this.mapSize) return false;
  const idx = y * this.mapSize + x;

  // Must be owned by local player
  const owner = this.tileOwners.get(idx) ?? '';
  if (owner !== this.localPlayerId || this.localPlayerId === '') return false;

  // Must have no existing structure (outposts can be replaced)
  const structure = this.tileStructures.get(idx) ?? '';
  if (structure !== '' && structure !== 'outpost') return false;

  // Must not be water or rock
  const tileType = this.tileTypes.get(idx);
  if (tileType === TileType.ShallowWater || tileType === TileType.DeepWater || tileType === TileType.Rock) {
    return false;
  }

  return true;
}
```

**Structure Icons**:
```typescript
const STRUCTURE_ICONS: Record<string, string> = {
  hq: '🏰',
  outpost: '��',
  farm: '🌾',
  factory: '⚙️',
};
```

### 3.6 Server - Building Placement Handler
**File**: `server/src/rooms/GameRoom.ts` (lines 118-120, 382-444)

```typescript
// In onCreate:
this.onMessage(PLACE_BUILDING, (client, message: PlaceBuildingPayload) => {
  this.handlePlaceBuilding(client, message);
});

// Handler implementation:
private handlePlaceBuilding(client: Client, message: PlaceBuildingPayload) {
  const player = this.state.players.get(client.sessionId);
  if (!player) {
    client.send("game_log", { message: "Player not found.", type: "error" });
    return;
  }

  const { x, y, buildingType } = message;

  // Validate building type
  const cost = BUILDING_COSTS[buildingType];
  if (!cost) {
    client.send("game_log", { message: "Invalid building type.", type: "error" });
    return;
  }

  // Validate tile exists
  const tile = this.state.getTile(x, y);
  if (!tile) {
    client.send("game_log", { message: "Invalid tile.", type: "error" });
    return;
  }

  // Validate tile owned by player
  if (tile.ownerID !== client.sessionId) {
    client.send("game_log", { message: "You don't own this tile.", type: "error" });
    return;
  }

  // Validate no existing building (outpost/"" can be replaced; hq/farm/factory cannot)
  if (tile.structureType !== "" && tile.structureType !== "outpost") {
    client.send("game_log", { message: "Tile already has a structure.", type: "error" });
    return;
  }

  // Validate terrain is walkable (not water/rock)
  if (isWaterTile(tile.type) || tile.type === TileType.Rock) {
    client.send("game_log", { message: "Cannot build on this terrain.", type: "error" });
    return;
  }

  // Validate player has resources
  if (player.wood < cost.wood || player.stone < cost.stone) {
    client.send("game_log", {
      message: `Not enough resources. Need ${cost.wood} wood + ${cost.stone} stone.`,
      type: "error",
    });
    return;
  }

  // Deduct resources
  player.wood -= cost.wood;
  player.stone -= cost.stone;

  // Place building
  tile.structureType = buildingType;

  const displayName = player.displayName || client.sessionId;
  this.broadcast("game_log", {
    message: `${displayName} built a ${buildingType} at (${x}, ${y}).`,
    type: "building",
  });
}
```

**Building Income** (ticks at `STRUCTURE_INCOME.INTERVAL_TICKS` = 40 ticks):
- Farm: +1 wood, +1 stone per tick
- Factory: +2 wood, +1 stone per tick
- HQ: +2 wood, +2 stone per tick (always)

**Building Removal on Contestation**:
When a tile is claimed by another player, the building is cleared (except HQ structures which persist).

---

## 4. EXISTING BUILDING-RELATED TESTS

### Unit Tests: `server/src/__tests__/buildings.test.ts`

Complete test file with 4 test suites:

1. **Successful Placement** (4 tests)
   - Place farm on owned empty tile → structureType set, resources deducted
   - Place factory on owned empty tile
   - Broadcasts game_log on successful placement
   - Can place building on outpost tile (replaces outpost)

2. **Validation Failures** (8 tests)
   - Invalid player (nonexistent session ID)
   - Invalid tile coordinates (out of bounds)
   - Tile not owned by player
   - Tile already has structure (farm)
   - Tile has HQ structure
   - Non-walkable tile (water/rock)
   - Invalid building type
   - Insufficient resources (wood, stone)

3. **Building Income** (5 tests)
   - Farm adds +1W +1S per income tick
   - Factory adds +2W +1S per income tick
   - Multiple buildings stack income correctly
   - Income does NOT fire on non-interval ticks
   - HQ-only income (no buildings) gives base rate

4. **Building Removal on Contestation** (3 tests)
   - Building cleared when tile ownership changes via contestation
   - HQ structure is NOT cleared when ownership changes
   - Factory cleared on contestation like farm

**Test Helpers**:
```typescript
function createRoomWithMap(seed?: number): GameRoom
function fakeClient(sessionId: string): MockClient
function joinPlayer(room: GameRoom, sessionId: string)
function prepareBuildableTile(room: GameRoom, playerId: string): { x: number; y: number }
function prepareBuildableTiles(room: GameRoom, playerId: string, count: number)
function findUnwalkableTile(room: GameRoom): { x: number; y: number } | null
function giveResources(player: PlayerState, wood: number, stone: number)
```

---

## 5. PLAYWRIGHT CONFIGURATION

**File**: `e2e/playwright.config.ts`

```typescript
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, devices } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html']] : 'html',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run build -w shared && npm run dev -w server',
      cwd: rootDir,
      url: 'http://localhost:2567/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w client',
      cwd: rootDir,
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
```

---

## 6. HELPER FUNCTIONS FOR E2E TESTS

### Player Helper: `e2e/helpers/player.helper.ts`

```typescript
async function waitForPlayerCount(page: Page, count: number, timeout = 15_000): Promise<void>
async function waitForPlayerOnScoreboard(page: Page, name: string, timeout = 10_000): Promise<void>
async function getGameState(page: Page)
```

### State Helper: `e2e/helpers/state.helper.ts`

```typescript
async function waitForStateChange(page: Page, predicate: string, timeout = 10_000): Promise<void>
async function getPlayerState(page: Page, playerName: string)
```

### Tile Helper: `e2e/helpers/tile.helper.ts`

```typescript
async function getTile(page: Page, x: number, y: number): Promise<E2ETileData | null>
async function getTilesWhere(page: Page, filter: {...}): Promise<E2ETileData[]>
async function getOwnedTileCount(page: Page, ownerID?: string): Promise<number>
async function getTerritoryStats(page: Page, ownerID?: string)
async function waitForTileCount(page: Page, minCount: number, ownerID?: string, timeout = 30_000)
async function getResourceTilesInArea(page: Page, x1, y1, x2, y2): Promise<E2ETileData[]>
```

**E2ETileData Interface**:
```typescript
interface E2ETileData {
  x: number;
  y: number;
  type: number;
  fertility: number;
  moisture: number;
  resourceType: number;
  resourceAmount: number;
  shapeHP: number;
  ownerID: string;
  isHQTerritory: boolean;
  structureType: string;
}
```

### WebSocket Helper: `e2e/helpers/websocket.helper.ts`

```typescript
async function installMessageRecorder(page: Page): Promise<void>
async function getRecordedMessages(page: Page, filter?: {...}): Promise<RecordedMessage[]>
async function clearRecordedMessages(page: Page): Promise<void>
async function waitForMessage(page: Page, type: string, direction = 'received', timeout = 15_000)
async function getMessageCount(page: Page, filter?: {...}): Promise<number>
async function sendAndRecord(page: Page, type: string, data?: unknown)
```

**RecordedMessage Interface**:
```typescript
interface RecordedMessage {
  direction: 'sent' | 'received';
  type: string;
  data: unknown;
  timestamp: number;
}
```

---

## SUMMARY: WHAT YOU NEED TO WRITE BUILDING E2E TESTS

### Key Test Scenarios

1. **Client-side Placement Mode**
   - Building buttons enable/disable based on resources
   - Clicking build button enters placement mode
   - Placement highlights show on valid tiles (green overlay)
   - ESC cancels placement mode
   - Clicking valid tile sends PLACE_BUILDING message

2. **Server-side Validation**
   - Rejects unowned tiles
   - Rejects tiles with structures (except outposts)
   - Rejects water/rock tiles
   - Rejects if insufficient resources
   - Deducts resources correctly

3. **Building Placement Synchronization**
   - Building appears on tile immediately after placement
   - All players see the building icon on the map
   - Building persists across reconnection

4. **Building Income**
   - Farm generates +1W +1S per income tick
   - Factory generates +2W +1S per income tick
   - Income stacks with HQ base income

5. **Building Loss**
   - Building removed when tile is contested/claimed by another player
   - HQ structures are never removed

### Test Structure Template

```typescript
import { test, expect } from '../fixtures/game.fixture.js';
import { waitForPlayerCount, getGameState } from '../helpers/player.helper.js';
import { getTile, getTilesWhere, getTerritoryStats } from '../helpers/tile.helper.js';
import { getPlayerState } from '../helpers/state.helper.js';
import { installMessageRecorder, getRecordedMessages, waitForMessage } from '../helpers/websocket.helper.js';

test.describe('Building Placement', () => {
  test('player can place a farm on owned tile', async ({ playerOne }) => {
    const { page, playerName } = playerOne;

    // Wait for initial setup
    await waitForPlayerCount(page, 1);
    const playerData = await getPlayerState(page, playerName);
    expect(playerData).not.toBeNull();

    // Find an owned tile near HQ
    const tiles = await getTilesWhere(page, { ownerID: playerData!.hqX });
    const buildTile = tiles.find(t => !t.structureType && t.type !== TileType.Rock);
    expect(buildTile).not.toBeNull();

    // Install message recorder and click build button
    await installMessageRecorder(page);
    await page.click('#build-farm-btn');

    // Should see placement highlights
    // Click the tile to place
    // Verify PLACE_BUILDING message sent
    // Verify building appears on tile
  });
});
```

---

## FILE PATHS REFERENCE

- **Config**: `/home/saitcho/primal-grid/e2e/playwright.config.ts`
- **Tests**: `/home/saitcho/primal-grid/e2e/tests/*.spec.ts`
- **Fixtures**: `/home/saitcho/primal-grid/e2e/fixtures/game.fixture.ts`
- **Helpers**: `/home/saitcho/primal-grid/e2e/helpers/*.ts`
- **Server**: `/home/saitcho/primal-grid/server/src/rooms/GameRoom.ts`
- **Client UI**: `/home/saitcho/primal-grid/client/src/ui/LobbyScreen.ts`
- **Client Renderer**: `/home/saitcho/primal-grid/client/src/renderer/GridRenderer.ts`
- **Constants**: `/home/saitcho/primal-grid/shared/src/constants.ts`
- **Messages**: `/home/saitcho/primal-grid/shared/src/messages.ts`
- **HTML**: `/home/saitcho/primal-grid/client/index.html`
- **Unit Tests**: `/home/saitcho/primal-grid/server/src/__tests__/buildings.test.ts`

