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
    expect(stateFromOne!.players).toHaveLength(2);

    // Verify both names are present
    const names = stateFromOne!.players.map((p) => p.displayName);
    expect(names).toContain(playerOne.playerName);
    expect(names).toContain(playerTwo.playerName);

    // Each player should have a unique HQ position
    const hqs = stateFromOne!.players.map((p) => `${p.hqX},${p.hqY}`);
    expect(hqs[0]).not.toBe(hqs[1]);
  });

  test('two players can see each other on the scoreboard', async ({
    playerOne,
    playerTwo,
  }) => {
    // Wait for both players to be in room state first
    await waitForPlayerCount(playerOne.page, 2);

    // Player one opens scoreboard and sees both names
    await waitForPlayerOnScoreboard(playerOne.page, playerOne.playerName);
    // Re-open to check second player
    await waitForPlayerOnScoreboard(playerOne.page, playerTwo.playerName);
  });
});
