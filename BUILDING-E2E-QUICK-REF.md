# Building Placement E2E Testing - Quick Reference

## Building System Overview

### Constants & Costs
```
FARM:    12 wood, 6 stone  → generates +1W/+1S per tick
FACTORY: 20 wood, 12 stone → generates +2W/+1S per tick

Income tick every: 40 game ticks (10 seconds at 4 ticks/sec)
```

### HTML Elements
```
#build-farm-btn         → Button to enter farm placement mode
#build-factory-btn      → Button to enter factory placement mode
#build-placement-hint   → Instructions: "Click a tile to place · ESC to cancel"
#section-buildings      → Container for all building UI
```

### Message Flow

#### Client → Server
```typescript
// Message type: "place_building" (PLACE_BUILDING constant)
// Payload:
{
  x: number,           // Tile X coordinate
  y: number,           // Tile Y coordinate
  buildingType: "farm" | "factory"
}
```

#### Server → Client
```typescript
// On success: broadcast "game_log"
{
  message: "PlayerName built a farm at (x, y).",
  type: "building"
}

// On error: client.send "game_log"
{
  message: "You don't own this tile.",  // or other error
  type: "error"
}
```

## Validation Checklist (Server-Side)

The `handlePlaceBuilding` function validates in this order:

✅ Player exists (session ID found in players map)
✅ Building type valid (farm or factory)
✅ Tile exists (within map bounds)
✅ Tile owned by player (ownerID matches sessionId)
✅ No structure conflict:
   - Outpost tiles can be replaced
   - HQ/farm/factory tiles cannot
✅ Terrain is walkable (not water/rock)
✅ Resources sufficient (has enough wood AND stone)

If ALL pass → Deduct resources → Place building → Broadcast success

## Client Placement Mode

### Grid Renderer (`GridRenderer.ts`)

**Method: `showPlacementHighlights()`**
- Iterates visible tiles
- Calls `isValidPlacementTile(x, y)` for each
- Valid tiles get green overlay (0x00ff88)
  - Fill: alpha 0.2
  - Stroke: alpha 0.5, width 1

**Method: `isValidPlacementTile(x, y)`**
Returns true if:
- Owner is local player
- No structure (or outpost only)
- Not water/rock

**Method: `clearPlacementHighlights()`**
- Removes all overlays from placementContainer
- Clears the overlays map

### Client Main Game Loop
1. User clicks build button → enters placement mode
2. `GridRenderer.showPlacementHighlights()` is called
3. User hovers/clicks tile
4. On click: Extract tile coordinates
5. Send `PLACE_BUILDING` message with x, y, buildingType
6. Server validates and places or returns error
7. If success: Tile's `structureType` updates → building appears
8. ESC key: `GridRenderer.clearPlacementHighlights()` called

## Testing Patterns

### Wait for State Changes
```typescript
// Wait for player count
await waitForPlayerCount(page, 2);

// Get specific tile
const tile = await getTile(page, x, y);
expect(tile.structureType).toBe("farm");

// Get all tiles owned by player
const tiles = await getTilesWhere(page, { ownerID: playerId });

// Get territory summary
const stats = await getTerritoryStats(page);
expect(stats.structures.farm).toBe(1);
```

### Record WebSocket Messages
```typescript
// Install recorder (must be AFTER room connected)
await installMessageRecorder(page);

// Send a message
await sendAndRecord(page, "place_building", { x: 10, y: 10, buildingType: "farm" });

// Get messages
const sent = await getRecordedMessages(page, { direction: 'sent', type: 'place_building' });
expect(sent).toHaveLength(1);
expect(sent[0].data.buildingType).toBe("farm");

// Get log messages
const logs = await getRecordedMessages(page, { direction: 'received', type: 'game_log' });
const buildLog = logs.find(m => m.data.type === 'building');
expect(buildLog).toBeDefined();
```

### Two-Player Building Test Template
```typescript
test('two players can place buildings independently', async ({ playerOne, playerTwo }) => {
  // Setup
  await waitForPlayerCount(playerOne.page, 2);
  await waitForPlayerCount(playerTwo.page, 2);
  
  const aliceState = await getPlayerState(playerOne.page, playerOne.playerName);
  const bobState = await getPlayerState(playerTwo.page, playerTwo.playerName);
  
  // Alice places a farm
  await installMessageRecorder(playerOne.page);
  await playerOne.page.click('#build-farm-btn');
  await playerOne.page.click('canvas'); // Click tile (simplified)
  await waitForMessage(playerOne.page, 'game_log', 'received');
  
  const aliceTile = await getTile(playerOne.page, 10, 10);
  expect(aliceTile.structureType).toBe("farm");
  expect(aliceTile.ownerID).toBe(aliceState.sessionId);
  
  // Bob should see Alice's building
  const aliceTileFromBob = await getTile(playerTwo.page, 10, 10);
  expect(aliceTileFromBob.structureType).toBe("farm");
  
  // Bob places a factory on his own territory
  await playerTwo.page.click('#build-factory-btn');
  // ... click tile
  
  const bobTile = await getTile(playerTwo.page, 20, 20);
  expect(bobTile.structureType).toBe("factory");
});
```

## Building Removal on Contestation

When Player A has a farm on a tile and Player B starts claiming it:

1. Tile gets `claimingPlayerID = "p2"`, `claimProgress` increments
2. After `TERRITORY.CLAIM_TICKS` (8 ticks) complete:
   - `tile.ownerID` becomes "p2"
   - `tile.structureType` becomes "" (CLEARED)
3. HQ structures (`structureType === "hq"`) are **preserved**

Test this by:
```typescript
// Manually set contestation
const tile = await getTile(page, x, y);
// (Note: Real contestation happens via territory claiming logic)

// Wait for claim to complete
await waitForStateChange(page, `
  (() => {
    const t = window.__ROOM__.state.getTile(${x}, ${y});
    return t.ownerID === "p2" && t.structureType === "";
  })()
`);
```

## Building Income Tick

Income fires when `room.state.tick % STRUCTURE_INCOME.INTERVAL_TICKS === 0`

```typescript
test('buildings generate income', async ({ playerOne }) => {
  // Setup: player has a farm
  const playerData = await getPlayerState(playerOne.page, playerOne.playerName);
  const wood_before = playerData.wood;
  
  // Wait for income tick (40 ticks = ~10 seconds)
  // Could be immediate or up to 10 seconds depending on when test runs
  await page.waitForFunction(() => {
    const room = window.__ROOM__;
    return room.state.tick % 40 === 0;
  }, { timeout: 15_000 });
  
  // Give server time to calculate and sync
  await page.waitForTimeout(500);
  
  const playerDataAfter = await getPlayerState(playerOne.page, playerOne.playerName);
  // HQ income (2W) + farm income (1W) = 3W per tick
  expect(playerDataAfter.wood).toBeGreaterThan(wood_before);
});
```

## Common Assertions

```typescript
// Building placed
expect(tile.structureType).toBe("farm");

// Resources deducted
expect(player.wood).toBeLessThan(wood_before);

// Game log shows building message
expect(log.type).toBe("building");
expect(log.message).toContain("built a farm");

// Tile ownership unchanged
expect(tile.ownerID).toBe(playerId);

// Building visible to other player
const tileFromOther = await getTile(otherPage, x, y);
expect(tileFromOther.structureType).toBe("farm");

// Income accumulated
const { structures } = await getTerritoryStats(page);
expect(structures.farm).toBe(1);
```

## Error Cases to Test

```typescript
// Insufficient resources
player.wood = 5;  // farm costs 12
→ "Not enough resources. Need 12 wood + 6 stone."

// Not owned
tile.ownerID = "other_player";
→ "You don't own this tile."

// Already has structure
tile.structureType = "outpost";
tile.structureType = "farm";  // Place farm
→ Works (replaces outpost)

tile.structureType = "farm";
→ "Tile already has a structure."

// Non-walkable terrain
tile.type = TileType.DeepWater;
tile.ownerID = playerId;  // Force ownership
→ "Cannot build on this terrain."

// Out of bounds
→ "Invalid tile."

// Invalid building type
buildingType = "cannon";
→ "Invalid building type."
```

## Debugging Tips

1. **View raw game state**:
   ```typescript
   const state = await page.evaluate(() => window.__ROOM__.state);
   console.log(state);
   ```

2. **Check tile details**:
   ```typescript
   const tile = await getTile(page, x, y);
   console.log(`Tile (${x},${y}):`, tile);
   ```

3. **Record all messages**:
   ```typescript
   await installMessageRecorder(page);
   const msgs = await getRecordedMessages(page);
   console.log('All messages:', msgs);
   ```

4. **Wait for specific state**:
   ```typescript
   await waitForStateChange(page, `
     window.__ROOM__.state.players.get('sessionId').wood > 100
   `);
   ```

5. **Check visible tiles** (placement highlights):
   ```typescript
   const visibleCount = await page.evaluate(() => {
     return document.querySelectorAll('.placement-overlay').length;
   });
   ```

---

## File Reference Map

| Component | File | Key Functions/Classes |
|-----------|------|----------------------|
| **Constants** | `shared/src/constants.ts` | BUILDING_COSTS, BUILDING_INCOME, STRUCTURE_INCOME |
| **Messages** | `shared/src/messages.ts` | PLACE_BUILDING, PlaceBuildingPayload |
| **HTML** | `client/index.html` | #build-farm-btn, #section-buildings |
| **Server Logic** | `server/src/rooms/GameRoom.ts` | handlePlaceBuilding(client, message) |
| **Client Renderer** | `client/src/renderer/GridRenderer.ts` | showPlacementHighlights(), isValidPlacementTile() |
| **Server Tests** | `server/src/__tests__/buildings.test.ts` | 18 unit tests covering all scenarios |
| **E2E Config** | `e2e/playwright.config.ts` | Playwright configuration |
| **E2E Fixtures** | `e2e/fixtures/game.fixture.ts` | playerOne, playerTwo test fixtures |
| **E2E Helpers** | `e2e/helpers/*.ts` | getTile(), waitForPlayerCount(), etc. |

