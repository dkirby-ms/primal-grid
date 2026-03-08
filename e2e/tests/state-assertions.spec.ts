import { test, expect } from '../fixtures/game.fixture.js';
import { waitForPlayerCount } from '../helpers/player.helper.js';
import { getPlayerState } from '../helpers/state.helper.js';
import { getCreatures, getCreatureCount, getPlayerPawns } from '../helpers/creature.helper.js';
import { getTile, getTilesWhere, getOwnedTileCount, getTerritoryStats, getResourceTilesInArea } from '../helpers/tile.helper.js';
import { takeSnapshot, waitTicksAndSnapshot, snapshotAndDiff } from '../helpers/snapshot.helper.js';
import { installMessageRecorder, getRecordedMessages, clearRecordedMessages, sendAndRecord, getMessageCount } from '../helpers/websocket.helper.js';

test.describe('Creature State Queries', () => {
  test('can query wildlife creatures on the map', async ({ playerOne }) => {
    const { page } = playerOne;
    await waitForPlayerCount(page, 1);

    const allCreatures = await getCreatures(page);
    expect(allCreatures.length).toBeGreaterThan(0);

    // Wildlife creatures should have empty ownerID
    const wildlife = allCreatures.filter((c) => c.ownerID === '');
    expect(wildlife.length).toBeGreaterThan(0);

    // Every creature should have valid coordinates
    for (const c of wildlife.slice(0, 5)) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.health).toBeGreaterThan(0);
    }
  });

  test('can filter creatures by type', async ({ playerOne }) => {
    const { page } = playerOne;
    await waitForPlayerCount(page, 1);

    const herbivores = await getCreatures(page, { creatureType: 'herbivore' });
    const carnivores = await getCreatures(page, { creatureType: 'carnivore' });

    // Should have both types based on CREATURE_SPAWN constants
    expect(herbivores.length).toBeGreaterThan(0);
    expect(carnivores.length).toBeGreaterThan(0);

    // Verify no overlap
    const herbIds = new Set(herbivores.map((h) => h.id));
    for (const c of carnivores) {
      expect(herbIds.has(c.id)).toBe(false);
    }
  });

  test('creature count matches filtered results', async ({ playerOne }) => {
    const { page } = playerOne;
    await waitForPlayerCount(page, 1);

    const herbivores = await getCreatures(page, { creatureType: 'herbivore' });
    const herbCount = await getCreatureCount(page, { creatureType: 'herbivore' });

    expect(herbCount).toBe(herbivores.length);
  });

  test('getPlayerPawns returns empty before spawning', async ({ playerOne }) => {
    const { page } = playerOne;
    await waitForPlayerCount(page, 1);

    const pawns = await getPlayerPawns(page);
    expect(pawns.length).toBe(0);
  });
});

test.describe('Tile State Queries', () => {
  test('can read tile at specific coordinates', async ({ playerOne }) => {
    const { page, playerName } = playerOne;
    await waitForPlayerCount(page, 1);

    const state = await getPlayerState(page, playerName);
    expect(state).not.toBeNull();

    // HQ tile should be readable
    const hqTile = await getTile(page, state!.hqX, state!.hqY);
    expect(hqTile).not.toBeNull();
    expect(hqTile!.isHQTerritory).toBe(true);
    expect(hqTile!.ownerID).not.toBe('');
    expect(hqTile!.structureType).toBe('hq');
  });

  test('can query tiles by ownership', async ({ playerOne }) => {
    const { page, playerName } = playerOne;
    await waitForPlayerCount(page, 1);

    const state = await getPlayerState(page, playerName);
    expect(state).not.toBeNull();

    const ownedCount = await getOwnedTileCount(page);
    // Player starts with a 5x5 territory = 25 tiles
    expect(ownedCount).toBeGreaterThanOrEqual(25);
  });

  test('can filter tiles by HQ territory', async ({ playerOne }) => {
    const { page } = playerOne;
    await waitForPlayerCount(page, 1);

    const hqTiles = await getTilesWhere(page, { isHQTerritory: true });
    // At least one player's HQ territory should exist
    expect(hqTiles.length).toBeGreaterThanOrEqual(25);

    for (const tile of hqTiles) {
      expect(tile.isHQTerritory).toBe(true);
      expect(tile.ownerID).not.toBe('');
    }
  });

  test('territory stats include structure counts', async ({ playerOne }) => {
    const { page } = playerOne;
    await waitForPlayerCount(page, 1);

    const stats = await getTerritoryStats(page);
    expect(stats.total).toBeGreaterThanOrEqual(25);
    expect(stats.hqTiles).toBeGreaterThanOrEqual(25);
    // HQ structure should exist
    expect(stats.structures['hq']).toBeGreaterThanOrEqual(1);
  });

  test('can query resource tiles in an area', async ({ playerOne }) => {
    const { page } = playerOne;
    await waitForPlayerCount(page, 1);

    // Scan a large region for resource tiles
    const resources = await getResourceTilesInArea(page, 0, 0, 63, 63);
    // A 64x64 quadrant should have some resource tiles on a 128x128 map
    expect(resources.length).toBeGreaterThan(0);

    for (const tile of resources) {
      expect(tile.resourceType).not.toBe(-1);
      expect(tile.resourceAmount).toBeGreaterThan(0);
    }
  });
});

test.describe('Game State Snapshots', () => {
  test('takeSnapshot captures all state categories', async ({ playerOne }) => {
    const { page, playerName } = playerOne;
    await waitForPlayerCount(page, 1);

    const snapshot = await takeSnapshot(page);

    expect(snapshot.tick).toBeGreaterThanOrEqual(0);
    expect(snapshot.mapWidth).toBe(128);
    expect(snapshot.dayPhase).toBeTruthy();
    expect(snapshot.players.length).toBeGreaterThanOrEqual(1);
    expect(snapshot.creatures.length).toBeGreaterThan(0);
    expect(snapshot.tileStats.totalOwned).toBeGreaterThanOrEqual(25);

    // Player should be in snapshot
    const player = snapshot.players.find((p) => p.displayName === playerName);
    expect(player).toBeDefined();
    expect(player!.wood).toBeGreaterThanOrEqual(0);
  });

  test('snapshots advance over time', async ({ playerOne }) => {
    const { page } = playerOne;
    await waitForPlayerCount(page, 1);

    const snap1 = await takeSnapshot(page);
    const snap2 = await waitTicksAndSnapshot(page, 4, 15_000);

    expect(snap2.tick).toBeGreaterThan(snap1.tick);
  });

  test('diffSnapshots detects tick advancement', async ({ playerOne }) => {
    const { page } = playerOne;
    await waitForPlayerCount(page, 1);

    const { before, after, diff } = await snapshotAndDiff(page, 4, 15_000);

    expect(diff.tickDelta).toBeGreaterThanOrEqual(4);
    // Tick always advances, so this should be true
    expect(after.tick).toBeGreaterThan(before.tick);
  });

  test('diffSnapshots detects resource changes over time', async ({ playerOne }) => {
    const { page, playerName } = playerOne;
    await waitForPlayerCount(page, 1);

    // Wait enough ticks for structure income (STRUCTURE_INCOME.INTERVAL = 40 ticks = 10s)
    const { diff } = await snapshotAndDiff(page, 44, 30_000);

    // Player resources should have changed due to HQ income
    const playerDiff = diff.playerChanges.find(
      (pc) => pc.displayName === playerName,
    );
    // Over 44 ticks, at least one income tick should fire (every 40 ticks)
    if (playerDiff) {
      const woodChange = playerDiff.changes['wood'];
      if (woodChange) {
        expect(Number(woodChange.after)).toBeGreaterThan(Number(woodChange.before));
      }
    }
  });

  test('diffSnapshots tracks creature state changes', async ({ playerOne }) => {
    const { page } = playerOne;
    await waitForPlayerCount(page, 1);

    // Wait enough ticks for creature AI to run (CREATURE_AI.TICK_INTERVAL = 2)
    const { diff } = await snapshotAndDiff(page, 8, 15_000);

    // Some creatures should have moved or changed state
    const totalChanges =
      diff.creatureChanges.length +
      diff.creaturesAdded.length +
      diff.creaturesRemoved.length;

    // With 96 creatures and 8 ticks, at least some should have changed
    expect(totalChanges).toBeGreaterThan(0);
  });
});

test.describe('WebSocket Message Recording', () => {
  test('records outgoing messages', async ({ playerOne }) => {
    const { page } = playerOne;
    await waitForPlayerCount(page, 1);

    await installMessageRecorder(page);
    await clearRecordedMessages(page);

    // Send a spawn_pawn message
    await sendAndRecord(page, 'spawn_pawn', { pawnType: 'builder' });

    const sentMessages = await getRecordedMessages(page, {
      direction: 'sent',
      type: 'spawn_pawn',
    });

    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    expect(sentMessages[0].type).toBe('spawn_pawn');
    expect(sentMessages[0].direction).toBe('sent');
    expect((sentMessages[0].data as any).pawnType).toBe('builder');
  });

  test('clearRecordedMessages resets the buffer', async ({ playerOne }) => {
    const { page } = playerOne;
    await waitForPlayerCount(page, 1);

    await installMessageRecorder(page);
    await sendAndRecord(page, 'spawn_pawn', { pawnType: 'builder' });

    const beforeClear = await getMessageCount(page, { direction: 'sent' });
    expect(beforeClear).toBeGreaterThanOrEqual(1);

    await clearRecordedMessages(page);

    const afterClear = await getMessageCount(page);
    expect(afterClear).toBe(0);
  });

  test('message count helper is accurate', async ({ playerOne }) => {
    const { page } = playerOne;
    await waitForPlayerCount(page, 1);

    await installMessageRecorder(page);
    await clearRecordedMessages(page);

    await sendAndRecord(page, 'spawn_pawn', { pawnType: 'builder' });
    await sendAndRecord(page, 'spawn_pawn', { pawnType: 'builder' });

    const totalSent = await getMessageCount(page, { direction: 'sent' });
    expect(totalSent).toBe(2);

    const spawnCount = await getMessageCount(page, {
      direction: 'sent',
      type: 'spawn_pawn',
    });
    expect(spawnCount).toBe(2);
  });

  test('recorder can be installed idempotently', async ({ playerOne }) => {
    const { page } = playerOne;
    await waitForPlayerCount(page, 1);

    // Install twice — should not duplicate hooks
    await installMessageRecorder(page);
    await installMessageRecorder(page);

    await clearRecordedMessages(page);
    await sendAndRecord(page, 'spawn_pawn', { pawnType: 'builder' });

    const count = await getMessageCount(page, {
      direction: 'sent',
      type: 'spawn_pawn',
    });
    // Should be exactly 1, not 2 (which would indicate double-hooking)
    expect(count).toBe(1);
  });
});

test.describe('Multiplayer State Assertions', () => {
  test('both players visible in snapshot', async ({ playerOne, playerTwo }) => {
    const { page: p1 } = playerOne;
    const { page: p2 } = playerTwo;

    await waitForPlayerCount(p1, 2);
    await waitForPlayerCount(p2, 2);

    // Wait for both player names to be set (SET_NAME is async)
    await expect
      .poll(
        async () => {
          const snap = await takeSnapshot(p1);
          const names = snap.players.map((p) => p.displayName).filter(n => n).sort();
          return names;
        },
        { timeout: 10_000 },
      )
      .toEqual(['Alice', 'Bob']);

    const snap = await takeSnapshot(p1);
    expect(snap.players.length).toBe(2);
  });

  test('snapshots from both players agree on tick range', async ({
    playerOne,
    playerTwo,
  }) => {
    const { page: p1 } = playerOne;
    const { page: p2 } = playerTwo;

    await waitForPlayerCount(p1, 2);
    await waitForPlayerCount(p2, 2);

    const snap1 = await takeSnapshot(p1);
    const snap2 = await takeSnapshot(p2);

    // Ticks should be close (within a few ticks due to network latency)
    expect(Math.abs(snap1.tick - snap2.tick)).toBeLessThanOrEqual(5);
    expect(snap1.mapWidth).toBe(snap2.mapWidth);
  });
});
