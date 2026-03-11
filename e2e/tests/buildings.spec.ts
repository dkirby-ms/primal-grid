import { test, expect } from '../fixtures/game.fixture.js';
import { waitForPlayerCount } from '../helpers/player.helper.js';
import { getPlayerState } from '../helpers/state.helper.js';
import { getTile, getTilesWhere } from '../helpers/tile.helper.js';
import { takeSnapshot, waitTicksAndSnapshot, diffSnapshots } from '../helpers/snapshot.helper.js';
import {
  installMessageRecorder,
  getRecordedMessages,
  clearRecordedMessages,
  sendAndRecord,
  waitForMessage,
} from '../helpers/websocket.helper.js';

// ── Helpers ────────────────────────────────────────────────────────────

/** Get the Colyseus sessionId for this client. */
async function getSessionId(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    const room = (window as unknown as { __ROOM__?: any }).__ROOM__;
    return room?.sessionId ?? '';
  });
}

/**
 * Find an owned tile suitable for building placement:
 *   - owned by the current player
 *   - no existing structure (structureType === '')
 *   - not the HQ tile itself
 *
 * Returns { x, y } or null if nothing found.
 */
async function findPlaceableTile(
  page: import('@playwright/test').Page,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate(() => {
    const room = (window as unknown as { __ROOM__?: any }).__ROOM__;
    if (!room?.state?.tiles || !room.sessionId) return null;

    const sid = room.sessionId;
    const player = room.state.players?.get(sid);
    const hqX = player?.hqX ?? -1;
    const hqY = player?.hqY ?? -1;
    const len = room.state.tiles.length;
    for (let i = 0; i < len; i++) {
      const t = room.state.tiles[i];
      if (!t) continue;
      if (t.ownerID !== sid) continue;
      if (t.structureType !== '' && t.structureType !== 'hq') continue;
      // Exclude the actual HQ building tile
      if (t.x === hqX && t.y === hqY) continue;
      // Exclude water (types 3,4) and rock (type 2)
      if (t.type === 2 || t.type === 3 || t.type === 4) continue;
      return { x: t.x, y: t.y };
    }
    return null;
  });
}

/**
 * Wait until the player has at least the specified resources.
 */
async function waitForResources(
  page: import('@playwright/test').Page,
  minWood: number,
  minStone: number,
  timeout = 60_000,
): Promise<void> {
  await page.waitForFunction(
    ({ w, s }: { w: number; s: number }) => {
      const room = (window as unknown as { __ROOM__?: any }).__ROOM__;
      const p = room?.state?.players?.get(room.sessionId);
      return p && p.wood >= w && p.stone >= s;
    },
    { w: minWood, s: minStone },
    { timeout },
  );
}

/**
 * Place a building by sending the place_building message.
 */
async function placeBuilding(
  page: import('@playwright/test').Page,
  x: number,
  y: number,
  buildingType: 'farm' | 'factory',
): Promise<void> {
  await page.evaluate(
    ({ bx, by, bt }: { bx: number; by: number; bt: string }) => {
      const room = (window as unknown as { __ROOM__?: any }).__ROOM__;
      room?.send('place_building', { x: bx, y: by, buildingType: bt });
    },
    { bx: x, by: y, bt: buildingType },
  );
}

// ── Group 1: Successful Placement ──────────────────────────────────────

test.describe('Building Placement — Success', () => {
  test('player can place a farm on owned territory', async ({ playerOne }) => {
    const { page, playerName } = playerOne;
    await waitForPlayerCount(page, 1);
    await waitForResources(page, 12, 6);

    const spot = await findPlaceableTile(page);
    expect(spot).not.toBeNull();

    await placeBuilding(page, spot!.x, spot!.y, 'farm');

    // Wait for the tile's structureType to update
    await page.waitForFunction(
      ({ tx, ty }: { tx: number; ty: number }) => {
        const room = (window as unknown as { __ROOM__?: any }).__ROOM__;
        const w = room?.state?.mapWidth ?? 128;
        const tile = room?.state?.tiles?.[ty * w + tx];
        return tile?.structureType === 'farm';
      },
      { tx: spot!.x, ty: spot!.y },
      { timeout: 15_000 },
    );

    const tile = await getTile(page, spot!.x, spot!.y);
    expect(tile).not.toBeNull();
    expect(tile!.structureType).toBe('farm');
  });

  test('player can place a factory on owned territory', async ({ playerOne }) => {
    const { page } = playerOne;
    await waitForPlayerCount(page, 1);
    await waitForResources(page, 20, 12);

    const spot = await findPlaceableTile(page);
    expect(spot).not.toBeNull();

    await placeBuilding(page, spot!.x, spot!.y, 'factory');

    await page.waitForFunction(
      ({ tx, ty }: { tx: number; ty: number }) => {
        const room = (window as unknown as { __ROOM__?: any }).__ROOM__;
        const w = room?.state?.mapWidth ?? 128;
        const tile = room?.state?.tiles?.[ty * w + tx];
        return tile?.structureType === 'factory';
      },
      { tx: spot!.x, ty: spot!.y },
      { timeout: 15_000 },
    );

    const tile = await getTile(page, spot!.x, spot!.y);
    expect(tile).not.toBeNull();
    expect(tile!.structureType).toBe('factory');
  });

  test('placing a building deducts resources', async ({ playerOne }) => {
    const { page, playerName } = playerOne;
    await waitForPlayerCount(page, 1);
    await waitForResources(page, 12, 6);

    const before = await getPlayerState(page, playerName);
    expect(before).not.toBeNull();

    const spot = await findPlaceableTile(page);
    expect(spot).not.toBeNull();

    const woodBefore = before!.wood;
    const stoneBefore = before!.stone;

    await placeBuilding(page, spot!.x, spot!.y, 'farm');

    // Wait for resource deduction to appear in state
    await page.waitForFunction(
      ({ name, wb }: { name: string; wb: number }) => {
        const room = (window as unknown as { __ROOM__?: any }).__ROOM__;
        let found: any = null;
        room?.state?.players?.forEach((p: any) => {
          if (p.displayName === name) found = p;
        });
        return found && found.wood < wb;
      },
      { name: playerName, wb: woodBefore },
      { timeout: 15_000 },
    );

    const after = await getPlayerState(page, playerName);
    expect(after).not.toBeNull();
    // Farm costs 12 wood, 6 stone.
    // Income ticks may have fired between reads, so use >=.
    expect(woodBefore - after!.wood).toBeGreaterThanOrEqual(12);
    expect(stoneBefore - after!.stone).toBeGreaterThanOrEqual(6);
  });

  test('place_building message is sent via WebSocket', async ({ playerOne }) => {
    const { page } = playerOne;
    await waitForPlayerCount(page, 1);

    await installMessageRecorder(page);
    await clearRecordedMessages(page);

    await waitForResources(page, 12, 6);
    const spot = await findPlaceableTile(page);
    expect(spot).not.toBeNull();

    await sendAndRecord(page, 'place_building', {
      x: spot!.x,
      y: spot!.y,
      buildingType: 'farm',
    });

    const sent = await getRecordedMessages(page, {
      direction: 'sent',
      type: 'place_building',
    });

    expect(sent.length).toBeGreaterThanOrEqual(1);
    expect(sent[0].type).toBe('place_building');
    const payload = sent[0].data as { x: number; y: number; buildingType: string };
    expect(payload.x).toBe(spot!.x);
    expect(payload.y).toBe(spot!.y);
    expect(payload.buildingType).toBe('farm');
  });

  test('game log broadcast on successful placement', async ({ playerOne }) => {
    const { page } = playerOne;
    await waitForPlayerCount(page, 1);

    await installMessageRecorder(page);
    await clearRecordedMessages(page);

    await waitForResources(page, 12, 6);
    const spot = await findPlaceableTile(page);
    expect(spot).not.toBeNull();

    await sendAndRecord(page, 'place_building', {
      x: spot!.x,
      y: spot!.y,
      buildingType: 'farm',
    });

    // Wait for the broadcast game_log with type "building"
    await waitForMessage(page, 'game_log', 'received', 15_000);

    const logs = await getRecordedMessages(page, {
      direction: 'received',
      type: 'game_log',
    });

    const buildingLog = logs.find(
      (m) => (m.data as any)?.type === 'building',
    );
    expect(buildingLog).toBeDefined();
    expect((buildingLog!.data as any).message).toContain('farm');
  });
});

// ── Group 2: Income Generation ─────────────────────────────────────────

test.describe('Building Placement — Income', () => {
  test('farm generates income over time', async ({ playerOne }) => {
    const { page, playerName } = playerOne;
    await waitForPlayerCount(page, 1);
    await waitForResources(page, 12, 6);

    const spot = await findPlaceableTile(page);
    expect(spot).not.toBeNull();

    await placeBuilding(page, spot!.x, spot!.y, 'farm');

    // Wait for placement to register
    await page.waitForFunction(
      ({ tx, ty }: { tx: number; ty: number }) => {
        const room = (window as unknown as { __ROOM__?: any }).__ROOM__;
        const w = room?.state?.mapWidth ?? 128;
        return room?.state?.tiles?.[ty * w + tx]?.structureType === 'farm';
      },
      { tx: spot!.x, ty: spot!.y },
      { timeout: 15_000 },
    );

    // Snapshot right after placement, then wait 44+ ticks for income
    const before = await takeSnapshot(page);
    const after = await waitTicksAndSnapshot(page, 44, 60_000);
    const diff = diffSnapshots(before, after);

    // Player should have received income (HQ base + farm bonus)
    const playerDiff = diff.playerChanges.find(
      (pc) => pc.displayName === playerName,
    );
    expect(playerDiff).toBeDefined();

    const woodChange = playerDiff!.changes['wood'];
    expect(woodChange).toBeDefined();
    // Over 44 ticks at least 1 income tick fires: HQ(+2) + farm(+1) = +3 wood minimum
    expect(Number(woodChange!.after)).toBeGreaterThan(Number(woodChange!.before));
  });

  test('multiple buildings stack income', async ({ playerOne }) => {
    const { page, playerName } = playerOne;
    await waitForPlayerCount(page, 1);

    // Need enough resources for 2 farms (24 wood + 12 stone)
    await waitForResources(page, 24, 12);

    // Find two distinct placeable tiles
    const tiles = await page.evaluate(() => {
      const room = (window as unknown as { __ROOM__?: any }).__ROOM__;
      if (!room?.state?.tiles || !room.sessionId) return [];
      const sid = room.sessionId;
      const player = room.state.players?.get(sid);
      const hqX = player?.hqX ?? -1;
      const hqY = player?.hqY ?? -1;
      const results: { x: number; y: number }[] = [];
      const len = room.state.tiles.length;
      for (let i = 0; i < len && results.length < 2; i++) {
        const t = room.state.tiles[i];
        if (!t) continue;
        if (t.ownerID !== sid) continue;
        if (t.structureType !== '' && t.structureType !== 'hq') continue;
        if (t.x === hqX && t.y === hqY) continue;
        if (t.type === 2 || t.type === 3 || t.type === 4) continue;
        results.push({ x: t.x, y: t.y });
      }
      return results;
    });
    expect(tiles.length).toBe(2);

    // Place first farm
    await placeBuilding(page, tiles[0].x, tiles[0].y, 'farm');
    await page.waitForFunction(
      ({ tx, ty }: { tx: number; ty: number }) => {
        const room = (window as unknown as { __ROOM__?: any }).__ROOM__;
        const w = room?.state?.mapWidth ?? 128;
        return room?.state?.tiles?.[ty * w + tx]?.structureType === 'farm';
      },
      { tx: tiles[0].x, ty: tiles[0].y },
      { timeout: 15_000 },
    );

    // Wait for resources to replenish for second farm
    await waitForResources(page, 12, 6);

    // Place second farm
    await placeBuilding(page, tiles[1].x, tiles[1].y, 'farm');
    await page.waitForFunction(
      ({ tx, ty }: { tx: number; ty: number }) => {
        const room = (window as unknown as { __ROOM__?: any }).__ROOM__;
        const w = room?.state?.mapWidth ?? 128;
        return room?.state?.tiles?.[ty * w + tx]?.structureType === 'farm';
      },
      { tx: tiles[1].x, ty: tiles[1].y },
      { timeout: 15_000 },
    );

    // Snapshot and wait for 2 income ticks (80+ game ticks)
    const before = await takeSnapshot(page);
    const after = await waitTicksAndSnapshot(page, 84, 90_000);
    const diff = diffSnapshots(before, after);

    const playerDiff = diff.playerChanges.find(
      (pc) => pc.displayName === playerName,
    );
    expect(playerDiff).toBeDefined();

    const woodChange = playerDiff!.changes['wood'];
    expect(woodChange).toBeDefined();
    // 2 income ticks × (HQ 2 + farm 1 + farm 1) = 8 wood minimum
    const woodGained = Number(woodChange!.after) - Number(woodChange!.before);
    expect(woodGained).toBeGreaterThanOrEqual(8);
  });
});

// ── Group 3: Validation / Rejection ────────────────────────────────────

test.describe('Building Placement — Rejection', () => {
  test('cannot place on unowned tile', async ({ playerOne }) => {
    const { page } = playerOne;
    await waitForPlayerCount(page, 1);

    await installMessageRecorder(page);
    await clearRecordedMessages(page);

    await waitForResources(page, 12, 6);

    // Pick a coordinate guaranteed to be outside any player's territory.
    // The map is 128×128; (0, 0) is highly unlikely to be HQ territory.
    // First verify (0,0) is not owned by us:
    const unownedCoord = await page.evaluate(() => {
      const room = (window as unknown as { __ROOM__?: any }).__ROOM__;
      const sid = room?.sessionId ?? '';
      const w = room?.state?.mapWidth ?? 128;
      // Try corners — at least one should be unowned
      for (const [cx, cy] of [[0, 0], [127, 0], [0, 127], [127, 127]]) {
        const t = room?.state?.tiles?.[cy * w + cx];
        if (!t || t.ownerID !== sid) return { x: cx, y: cy };
      }
      return { x: 0, y: 0 };
    });

    await sendAndRecord(page, 'place_building', {
      x: unownedCoord.x,
      y: unownedCoord.y,
      buildingType: 'farm',
    });

    // Wait for error game_log
    await waitForMessage(page, 'game_log', 'received', 15_000);

    const logs = await getRecordedMessages(page, {
      direction: 'received',
      type: 'game_log',
    });

    const errorLog = logs.find((m) => (m.data as any)?.type === 'error');
    expect(errorLog).toBeDefined();

    // Tile should NOT have a farm
    const tile = await getTile(page, unownedCoord.x, unownedCoord.y);
    // Tile may be null (fog of war) or not have farm
    if (tile) {
      expect(tile.structureType).not.toBe('farm');
    }
  });

  test('cannot place on tile with existing building', async ({ playerOne }) => {
    const { page } = playerOne;
    await waitForPlayerCount(page, 1);
    await waitForResources(page, 12, 6);

    const spot = await findPlaceableTile(page);
    expect(spot).not.toBeNull();

    // Place a farm first
    await placeBuilding(page, spot!.x, spot!.y, 'farm');
    await page.waitForFunction(
      ({ tx, ty }: { tx: number; ty: number }) => {
        const room = (window as unknown as { __ROOM__?: any }).__ROOM__;
        const w = room?.state?.mapWidth ?? 128;
        return room?.state?.tiles?.[ty * w + tx]?.structureType === 'farm';
      },
      { tx: spot!.x, ty: spot!.y },
      { timeout: 15_000 },
    );

    // Now install recorder and try to place a factory on the same tile
    await installMessageRecorder(page);
    await clearRecordedMessages(page);

    await waitForResources(page, 20, 12);
    await sendAndRecord(page, 'place_building', {
      x: spot!.x,
      y: spot!.y,
      buildingType: 'factory',
    });

    // Wait for error game_log
    await waitForMessage(page, 'game_log', 'received', 15_000);

    const logs = await getRecordedMessages(page, {
      direction: 'received',
      type: 'game_log',
    });
    const errorLog = logs.find((m) => (m.data as any)?.type === 'error');
    expect(errorLog).toBeDefined();
    expect((errorLog!.data as any).message).toContain('structure');

    // Tile should still be a farm, not factory
    const tile = await getTile(page, spot!.x, spot!.y);
    expect(tile).not.toBeNull();
    expect(tile!.structureType).toBe('farm');
  });

  test('cannot place when insufficient resources', async ({ playerOne }) => {
    const { page, playerName } = playerOne;
    await waitForPlayerCount(page, 1);
    await waitForResources(page, 12, 6);

    // Drain resources by spawning pawns (each costs resources)
    // Repeatedly spawn builders to spend wood/stone
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => {
        const room = (window as unknown as { __ROOM__?: any }).__ROOM__;
        room?.send('spawn_pawn', { pawnType: 'builder' });
      });
    }

    // Wait until resources drop below farm cost
    await page.waitForFunction(
      () => {
        const room = (window as unknown as { __ROOM__?: any }).__ROOM__;
        const p = room?.state?.players?.get(room.sessionId);
        return p && (p.wood < 12 || p.stone < 6);
      },
      undefined,
      { timeout: 30_000 },
    );

    await installMessageRecorder(page);
    await clearRecordedMessages(page);

    const spot = await findPlaceableTile(page);
    if (!spot) {
      // All tiles occupied — can't test placement, skip gracefully
      return;
    }

    await sendAndRecord(page, 'place_building', {
      x: spot.x,
      y: spot.y,
      buildingType: 'farm',
    });

    // Wait for error game_log
    await waitForMessage(page, 'game_log', 'received', 15_000);

    const logs = await getRecordedMessages(page, {
      direction: 'received',
      type: 'game_log',
    });
    const errorLog = logs.find((m) => (m.data as any)?.type === 'error');
    expect(errorLog).toBeDefined();
    expect((errorLog!.data as any).message).toContain('resources');

    // Tile should remain unchanged (still "hq" territory, no building placed)
    const tile = await getTile(page, spot.x, spot.y);
    expect(tile).not.toBeNull();
    expect(tile!.structureType).toBe('hq');
  });
});
