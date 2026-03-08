import { test, expect } from '../fixtures/game.fixture.js';
import { getGameState } from '../helpers/player.helper.js';
import { waitForStateChange } from '../helpers/state.helper.js';

const VALID_PHASES = ['dawn', 'day', 'dusk', 'night'];

test.describe('Day/Night Cycle', () => {
  test('game state reports a valid day phase', async ({ playerOne }) => {
    const { page } = playerOne;

    const gameState = await getGameState(page);
    expect(gameState).not.toBeNull();
    expect(VALID_PHASES).toContain(gameState!.dayPhase);
  });

  test('day phase transitions to the next phase over time', async ({ playerOne }) => {
    const { page } = playerOne;

    // Read the current phase
    const initialState = await getGameState(page);
    expect(initialState).not.toBeNull();
    const initialPhase = initialState!.dayPhase;

    // Wait for the phase to change.
    // Cycle is 480 ticks at 4 ticks/sec = 120s total.
    // Shortest phase is 15% = 72 ticks = 18s.
    // Longest phase is 35% (day or night) = 168 ticks = 42s.
    // Use 50s timeout to handle worst case with margin.
    await waitForStateChange(
      page,
      `(() => {
        const room = window.__ROOM__;
        if (!room?.state?.dayPhase) return false;
        return room.state.dayPhase !== "${initialPhase}";
      })()`,
      50_000,
    );

    const newState = await getGameState(page);
    expect(newState).not.toBeNull();
    expect(VALID_PHASES).toContain(newState!.dayPhase);
    expect(newState!.dayPhase).not.toBe(initialPhase);
  });

  test('tick counter advances steadily', async ({ playerOne }) => {
    const { page } = playerOne;

    const state1 = await getGameState(page);
    expect(state1).not.toBeNull();
    const tick1 = state1!.tick!;

    // Wait ~2 seconds (should advance ~8 ticks at 4 ticks/sec)
    await page.waitForTimeout(2000);

    const state2 = await getGameState(page);
    expect(state2).not.toBeNull();
    const tick2 = state2!.tick!;

    expect(tick2).toBeGreaterThan(tick1);
  });
});
