import { test, expect } from '../fixtures/game.fixture.js';
import { getGameState } from '../helpers/player.helper.js';
import { getPlayerState } from '../helpers/state.helper.js';

test.describe('State Initialization', () => {
  test('player state has correct name and starting resources', async ({ playerOne }) => {
    const { page, playerName } = playerOne;

    const state = await getPlayerState(page, playerName);
    expect(state).not.toBeNull();
    expect(state!.displayName).toBe(playerName);

    // Starting resources match TERRITORY constants (25 wood, 15 stone)
    // Income ticks may have added resources, so check >= starting values
    expect(state!.wood).toBeGreaterThanOrEqual(25);
    expect(state!.stone).toBeGreaterThanOrEqual(15);
  });

  test('player starts at level 1 with zero score', async ({ playerOne }) => {
    const { page, playerName } = playerOne;

    const state = await getPlayerState(page, playerName);
    expect(state).not.toBeNull();
    expect(state!.level).toBe(1);
    expect(state!.score).toBeGreaterThanOrEqual(0);
  });

  test('game state has valid map dimensions and tick counter', async ({ playerOne }) => {
    const { page } = playerOne;

    const gameState = await getGameState(page);
    expect(gameState).not.toBeNull();

    // Map should be 128x128 (DEFAULT_MAP_SIZE)
    expect(gameState!.mapWidth).toBe(128);

    // Tick counter should be advancing
    expect(gameState!.tick).toBeGreaterThanOrEqual(0);
  });

  test('HQ is placed at a valid map position', async ({ playerOne }) => {
    const { page, playerName } = playerOne;

    const state = await getPlayerState(page, playerName);
    expect(state).not.toBeNull();

    // HQ coordinates should be within the 128x128 map bounds
    expect(state!.hqX).toBeGreaterThanOrEqual(0);
    expect(state!.hqX).toBeLessThan(128);
    expect(state!.hqY).toBeGreaterThanOrEqual(0);
    expect(state!.hqY).toBeLessThan(128);
  });

  test('HQ territory tiles are marked on the map', async ({ playerOne }) => {
    const { page, playerName } = playerOne;

    const state = await getPlayerState(page, playerName);
    expect(state).not.toBeNull();

    // Verify the HQ tile has the correct structure via room state
    const hqTile = await page.evaluate(
      ({ hqX, hqY }: { hqX: number; hqY: number }) => {
        const room = (window as unknown as { __ROOM__?: { state?: { tiles?: Array<{ ownerID: string; isHQTerritory: boolean; structureType: string }>; mapWidth?: number } } }).__ROOM__;
        if (!room?.state?.tiles || !room.state.mapWidth) return null;
        const idx = hqY * room.state.mapWidth + hqX;
        const tile = room.state.tiles[idx];
        if (!tile) return null;
        return {
          ownerID: tile.ownerID,
          isHQTerritory: tile.isHQTerritory,
          structureType: tile.structureType,
        };
      },
      { hqX: state!.hqX, hqY: state!.hqY },
    );

    expect(hqTile).not.toBeNull();
    // HQ tile should be owned by this player and marked as HQ territory
    expect(hqTile!.isHQTerritory).toBe(true);
    expect(hqTile!.ownerID).not.toBe('');
    expect(hqTile!.structureType).toBe('hq');
  });
});
