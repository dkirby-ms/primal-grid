# Primal Grid Client Architecture — Quick Reference

## Essential URLs & Ports
- **Client Dev Server:** http://localhost:3000
- **Server WebSocket:** ws://localhost:2567
- **Enable Dev Mode:** http://localhost:3000?dev=1

## Technologies
- **Networking:** Colyseus SDK (@colyseus/sdk ^0.17.26) + WebSocket
- **Rendering:** PixiJS (@pixi.js ^8.0.0) — WebGL 2D canvas
- **Test Framework:** Vitest (^4.0.18) — **NO Playwright yet**

## Game Canvas
- **Size:** 600×600 pixels
- **DOM ID:** `#app`
- **Mount:** `client/index.html`
- **Type:** PixiJS Application with Stage hierarchy

## Room & Multiplayer
- **Room Name:** "game" (fixed)
- **Join Pattern:** `client.joinOrCreate('game', options)`
- **Player Identification:** `room.sessionId` (unique per connection)
- **State Access:** `room.state.players`, `room.state.pawns`, `room.state.structures`

## Key Files for Testing
| File | Purpose |
|------|---------|
| `/client/src/network.ts` | WebSocket connection logic |
| `/client/src/main.ts` | Bootstrap, name prompt, state binding |
| `/client/index.html` | Canvas + UI HTML structure |
| `/client/vite.config.ts` | Dev server config |
| `/client/src/renderer/GridRenderer.ts` | Map rendering |
| `/client/src/renderer/CreatureRenderer.ts` | Creature rendering |
| `/client/src/ui/HudDOM.ts` | Sidebar inventory/buttons |
| `/client/src/input/InputHandler.ts` | Keyboard/mouse controls |
| `/vitest.config.ts` | Root test config (shared by all packages) |

## Dev Mode (?dev=1)
**Effect:** Disables fog of war (shows entire map)
**Implementation:** Detected in `network.ts` via URL query param
**Usage:** Pass `?dev=1` to client URL for full visibility in tests

## Rendering Pipeline
```
PixiJS Application
 → GridRenderer (tiles, territory, HQ markers, fog of war)
   → CreatureRenderer (creatures, health/progress bars)
     → CombatEffects (combat visual effects)
 → Camera (pan/zoom, applied to world container)
```

## State Binding Pattern
All renderers use duck-typing `bindToRoom(room: Room)` method:
```typescript
room.onStateChange((state) => {
  // Update when server state changes
});
```

## Player/Creature State
```typescript
// Player (room.state.players.get(sessionId))
Player: { id, displayName, color, hqX, hqY, level, xp, wood, stone, ... }

// Creature (room.state.pawns.get(id))
Pawn: { type, state, x, y, owner, health, ... }
```

## Canvas Controls
- **Pan:** Arrow keys / WASD / Middle/Right click drag
- **Zoom:** Mouse wheel (0.5–3.0 scale range)
- **Center on HQ:** Spacebar
- **Scoreboard:** Tab key
- **Help:** ? or / key

## Existing Tests
- **Unit Test:** `client/src/__tests__/camera-zoom.test.ts` (vitest)
- **Pattern:** Mocks PixiJS, shared constants, window event listeners
- **Run:** `npm test` at root

## Test Infrastructure Ready
✅ Vitest configured (can add Playwright integration)
✅ PixiJS canvas fully rendered (queryable in tests)
✅ Colyseus room state exposed (can assert via SDK)
✅ Dev mode for full visibility (?dev=1)

## Next Steps for Playwright
1. Install Playwright and add to root package.json
2. Create `e2e/` directory for Playwright tests
3. Use Playwright's `waitForFunction()` to query room.state
4. Use multiple page contexts for multiplayer testing
5. Navigate to `http://localhost:3000` with dev mode enabled

---

## Command Reference
```bash
# Start both servers
npm run dev

# Run vitest (unit tests)
npm test

# Build all packages
npm run build

# Lint/typecheck
npm run lint
npm run typecheck

# Start client only
npm run dev -w client

# Start server only
npm run dev -w server
```

