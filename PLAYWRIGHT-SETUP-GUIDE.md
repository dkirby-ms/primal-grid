# Playwright Testing Framework Setup Guide

**Status:** This is a planning document for implementing Playwright-based testing in primal-grid.

## Document Overview

This directory now contains comprehensive documentation of the client-side architecture:

1. **TESTING-ARCHITECTURE.md** — Detailed 8-point analysis
   - Server connection & networking (Colyseus WebSocket)
   - Game URL & entry point (localhost:3000 + Vite config)
   - Multi-player room joining (session IDs, state binding)
   - Current test setup (Vitest configuration, existing camera tests)
   - Dev mode operation (?dev=1 disables fog of war)
   - Game rendering (PixiJS canvas, renderer hierarchy)
   - Client dependencies (pixi.js, @colyseus/sdk)
   - UI & DOM interactions (HUD, scoreboard, input)

2. **TESTING-QUICK-REF.md** — At-a-glance reference
   - Essential URLs & ports
   - Technologies (Colyseus, PixiJS, Vitest)
   - Key files for testing
   - State structures
   - Canvas controls
   - Command reference

3. **ARCHITECTURE-DIAGRAMS.md** — Visual flows & diagrams
   - Connection flow diagram
   - Client architecture layers
   - Rendering pipeline
   - State synchronization flow
   - Multiplayer interaction
   - Name prompt join flow
   - Camera control
   - Dev mode detection
   - Test scenarios

---

## Key Findings Summary

### Critical for Playwright Testing

#### 1. **WebSocket Connection**
- **URL:** `ws://localhost:2567` (default dev)
- **Library:** Colyseus SDK (@colyseus/sdk 0.17.26)
- **Room:** Single "game" room with `joinOrCreate()` pattern
- **Player ID:** `room.sessionId` (unique per connection)

#### 2. **Game Entry Points**
- **Client:** http://localhost:3000 (Vite dev server)
- **HTML:** `client/index.html`
- **Canvas:** `<div id="app"></div>` (600×600px, PixiJS)
- **Main Script:** `/src/main.ts` (bootstrap function)

#### 3. **Game Rendering**
- **Library:** PixiJS 8.0.0 (WebGL 2D canvas, NOT Three.js)
- **Canvas Size:** 600×600 pixels, mounted in DOM
- **Layers:**
  - GridRenderer (tiles, territory overlays, HQ markers, fog of war)
  - CreatureRenderer (creatures, health bars, states)
  - CombatEffects (visual effects)
  - Camera (pan/zoom applied to GridRenderer.container)

#### 4. **State Management**
- **Via:** Colyseus `room.state` (reactive MapSchema)
- **Key Collections:**
  - `room.state.players` → MapSchema keyed by sessionId
  - `room.state.pawns` → All creatures on map
  - `room.state.structures` → Buildings/structures
  - `room.state.map` → Tile data
  - `room.state.dayPhase` → Global day/night
- **Updates:** `room.onStateChange()` listeners (all renderers use this)

#### 5. **Multiplayer Architecture**
- **Join:** Multiple clients open same URL independently
- **Session Isolation:** Each tab/window gets unique `room.sessionId`
- **State Sync:** Server broadcasts all state changes to all clients
- **Cross-player visibility:**
  - See each other's HQs, creatures, territory
  - Commands to own creatures only
  - Share game log messages

#### 6. **Dev Mode for Testing**
- **Activation:** `?dev=1` or `?devmode=1` in URL query string
- **Effect:** Disables fog of war (shows entire map)
- **Implementation:** Detected in `network.ts` via URLSearchParams
- **Testing Benefit:** Simplifies assertions (no need to pan/scroll to see map)

#### 7. **UI Interactions**
- **Canvas Controls:**
  - Pan: Arrow keys, WASD, Middle/Right click drag
  - Zoom: Mouse wheel (0.5–3.0 scale, anchored to cursor)
  - Center: Spacebar
- **Modals:**
  - Name prompt (required before joining)
  - Scoreboard (Tab key)
  - Help screen (? key)
- **Buttons:**
  - Spawn Builder (#spawn-builder-btn)
  - Spawn Defender/Attacker (#spawn-defender-btn, #spawn-attacker-btn)

#### 8. **Existing Testing Foundation**
- **Test Runner:** Vitest (configured at root `vitest.config.ts`)
- **Existing Test:** `client/src/__tests__/camera-zoom.test.ts` (205 lines)
  - Tests camera zoom anchoring behavior
  - Shows mocking pattern (PixiJS, shared constants, window globals)
- **Infrastructure:** No Playwright yet (this is what you're setting up)

---

## Recommended Playwright Implementation Strategy

### Phase 1: Setup
```bash
# Install Playwright
npm install --save-dev @playwright/test

# Create test directory structure
mkdir -p e2e/tests
mkdir -p e2e/fixtures
mkdir -p e2e/utils

# Add Playwright config
# → Create playwright.config.ts at root
```

### Phase 2: Test Infrastructure
```typescript
// e2e/fixtures/game.fixture.ts
// - Custom fixture for starting game client
// - Helper to wait for room connection
// - Helper to access room.state

// e2e/utils/gameHelpers.ts
// - fillNamePrompt(page, name)
// - waitForCanvasRender(page)
// - waitForRoomState(page)
// - openMultipleGames()
// - etc.
```

### Phase 3: Core Tests
```typescript
// e2e/tests/game-connection.spec.ts
test('client connects to server and joins room', async ({ page }) => {
  await page.goto('http://localhost:3000?dev=1');
  // Wait for connection
  // Assert game loaded
});

// e2e/tests/multiplayer.spec.ts
test('multiple players see each other', async ({ context }) => {
  // Open two player contexts
  // Assert both see each other's HQs
});

// e2e/tests/rendering.spec.ts
test('canvas renders grid and creatures', async ({ page }) => {
  // Assert canvas has content
  // Assert specific pixels for tiles
});

// e2e/tests/ui-interaction.spec.ts
test('name prompt works', async ({ page }) => {
  // Fill and submit name
});

test('camera controls work', async ({ page }) => {
  // Pan with keys
  // Zoom with wheel
});
```

### Phase 4: State Verification
```typescript
// e2e/utils/stateHelpers.ts
export async function getRoomState(page: Page) {
  return page.evaluate(() => {
    // Access window.room from client context
    return {
      sessionId: window.room?.sessionId,
      players: [...window.room?.state.players.values() || []],
      pawns: [...window.room?.state.pawns.values() || []],
      dayPhase: window.room?.state.dayPhase,
    };
  });
}

// Usage in tests:
const state = await getRoomState(page);
expect(state.players).toHaveLength(1);
expect(state.players[0].displayName).toBe('Alice');
```

### Phase 5: Advanced Tests
- Creature movement simulation
- Builder spawning and building
- Combat interaction
- Territory expansion
- Level progression
- Multi-player conflicts

---

## Running Tests with Playwright

```bash
# Start game servers first (in terminal 1)
npm run dev

# Run Playwright tests (terminal 2)
npx playwright test

# Run specific test file
npx playwright test e2e/tests/game-connection.spec.ts

# Run in UI mode (visual debugging)
npx playwright test --ui

# Run in headed mode (see browser)
npx playwright test --headed
```

---

## Integration with Existing CI/CD

The project has GitHub Actions workflow (`.github/workflows/deploy-uat.yml`). Playwright tests can be added to test matrix:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run build
      - run: npm test              # Existing vitest
      - run: npx playwright test  # NEW: Playwright e2e tests
```

---

## Architecture Reference Points

### For Query Selectors
- Canvas: `#app canvas`
- HUD Panel: `#hud-panel`
- Inventory: `#inv-wood`, `#inv-stone`
- Territory count: `#territory-count-val`
- Buttons: `#spawn-builder-btn`, `#spawn-defender-btn`, `#spawn-attacker-btn`
- Game log: `#game-log`
- Modals: `#name-prompt-overlay`, `#scoreboard-overlay`, HelpScreen container
- Scoreboard table: `#scoreboard-table`

### For Network/State Assertions
- Room state: `window.room?.state`
- Player data: `room.state.players.get(room.sessionId)`
- Creatures: `room.state.pawns`
- Map: `room.state.map`
- Phase: `room.state.dayPhase`

### For Visual Testing
- Canvas renders at: `#app canvas`
- Dev mode (full visibility): `?dev=1` query param
- Grid size: 600×600 pixels
- Tile size: 32×32 pixels (can calculate positions)

---

## Documentation Files Generated

- ✅ TESTING-ARCHITECTURE.md (comprehensive 8-point analysis)
- ✅ TESTING-QUICK-REF.md (quick reference tables)
- ✅ ARCHITECTURE-DIAGRAMS.md (visual flows and diagrams)
- ✅ PLAYWRIGHT-SETUP-GUIDE.md (this file)

All files located in `/home/saitcho/primal-grid/` directory.

