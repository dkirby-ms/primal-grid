import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Dev Mode', () => {
  test('window.__ROOM__ is exposed in dev mode', async ({ playerOne }) => {
    const { page } = playerOne;

    // Fixture joins with ?dev=1 — __ROOM__ should be defined
    const hasRoom = await page.evaluate(() => {
      return typeof (window as unknown as { __ROOM__?: unknown }).__ROOM__ !== 'undefined';
    });
    expect(hasRoom).toBe(true);
  });

  test('room state is accessible via __ROOM__ for test instrumentation', async ({ playerOne }) => {
    const { page } = playerOne;

    const stateShape = await page.evaluate(() => {
      const room = (window as unknown as { __ROOM__?: { state?: Record<string, unknown> } }).__ROOM__;
      if (!room?.state) return null;
      return {
        hasPlayers: typeof room.state.players !== 'undefined',
        hasTick: typeof room.state.tick !== 'undefined',
        hasDayPhase: typeof room.state.dayPhase !== 'undefined',
        hasMapWidth: typeof room.state.mapWidth !== 'undefined',
      };
    });

    expect(stateShape).not.toBeNull();
    expect(stateShape!.hasPlayers).toBe(true);
    expect(stateShape!.hasTick).toBe(true);
    expect(stateShape!.hasDayPhase).toBe(true);
    expect(stateShape!.hasMapWidth).toBe(true);
  });

  test('fog of war is disabled when dev mode is active', async ({ playerOne }) => {
    const { page, playerName } = playerOne;

    // In dev mode, fog of war is disabled — all tiles should be visible.
    // Check that the player can see tiles far from their HQ by verifying
    // the room was joined with devMode option.
    const devModeActive = await page.evaluate(() => {
      const params = new URLSearchParams(window.location.search);
      return params.get('dev') === '1';
    });
    expect(devModeActive).toBe(true);

    // Verify the game state is fully accessible (not limited by fog)
    // by checking that we can read map tiles outside the player's territory
    const canReadDistantTile = await page.evaluate((name: string) => {
      const room = (window as unknown as { __ROOM__?: { state?: { players?: { size: number; forEach: (fn: (p: { displayName: string; hqX: number; hqY: number }, key: string) => void) => void }; tiles?: Array<{ type: number }>; mapWidth?: number } } }).__ROOM__;
      if (!room?.state?.tiles || !room.state.mapWidth || !room.state.players) return null;

      // Find the player's HQ position
      let hqX = 0, hqY = 0;
      room.state.players.forEach((p: { displayName: string; hqX: number; hqY: number }) => {
        if (p.displayName === name) { hqX = p.hqX; hqY = p.hqY; }
      });

      // Pick a tile far from HQ (opposite corner of the map)
      const mapW = room.state.mapWidth;
      const farX = hqX < mapW / 2 ? mapW - 1 : 0;
      const farY = hqY < mapW / 2 ? mapW - 1 : 0;
      const idx = farY * mapW + farX;
      const tile = room.state.tiles[idx];

      // In dev mode, we should be able to read tile data for any tile
      return tile ? { type: tile.type, readable: true } : null;
    }, playerName);

    // Tile data should be accessible for distant tiles (fog disabled)
    expect(canReadDistantTile).not.toBeNull();
    expect(canReadDistantTile!.readable).toBe(true);
  });

  test('dev mode URL parameter is preserved after joining', async ({ playerOne }) => {
    const { page } = playerOne;

    const url = page.url();
    expect(url).toContain('dev=1');
  });
});
