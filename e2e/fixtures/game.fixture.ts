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
    await createAndJoinGame(page, 'Alice');
    await use({ context: ctx, page, playerName: 'Alice' });
    await ctx.close();
  },
  playerTwo: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await joinExistingGame(page, 'Bob');
    await use({ context: ctx, page, playerName: 'Bob' });
    await ctx.close();
  },
});

/**
 * Navigate to the lobby, set player name, create a new game, and wait for
 * the game canvas to render. Used by playerOne who creates the game.
 */
async function createAndJoinGame(page: Page, name: string): Promise<void> {
  await page.goto('http://localhost:3000/?dev=1');

  // Wait for lobby overlay to appear
  await page.waitForSelector('#lobby-overlay.visible', { timeout: 15_000 });

  // Enter player name
  await page.fill('#lobby-name-input', name);

  // Open the create-game form and submit
  await page.click('#lobby-create-toggle');
  await page.waitForSelector('#lobby-create-form.visible', { timeout: 5_000 });
  await page.click('#lobby-create-submit');

  // Wait for lobby to hide and canvas to appear
  await page.waitForSelector('#lobby-overlay.visible', { state: 'hidden', timeout: 15_000 });
  await page.waitForSelector('#app canvas', { timeout: 10_000 });

  // Wait for room state to sync
  await page.waitForFunction(
    () => {
      const room = (window as unknown as { __ROOM__?: { state?: { players?: { size: number } } } }).__ROOM__;
      return room?.state?.players && room.state.players.size > 0;
    },
    undefined,
    { timeout: 15_000 },
  );
}

/**
 * Navigate to the lobby, set player name, join an existing game (first
 * available with open slots), and wait for the game canvas to render.
 * Used by playerTwo who joins an already-created game.
 */
async function joinExistingGame(page: Page, name: string): Promise<void> {
  await page.goto('http://localhost:3000/?dev=1');

  // Wait for lobby overlay to appear
  await page.waitForSelector('#lobby-overlay.visible', { timeout: 15_000 });

  // Enter player name
  await page.fill('#lobby-name-input', name);

  // Wait for a "Join" button to appear in the game list
  await page.waitForSelector('.lobby-join-btn', { timeout: 15_000 });

  // Click the first available Join button
  await page.click('.lobby-join-btn');

  // Wait for lobby to hide and canvas to appear
  await page.waitForSelector('#lobby-overlay.visible', { state: 'hidden', timeout: 15_000 });
  await page.waitForSelector('#app canvas', { timeout: 10_000 });

  // Wait for room state to sync
  await page.waitForFunction(
    () => {
      const room = (window as unknown as { __ROOM__?: { state?: { players?: { size: number } } } }).__ROOM__;
      return room?.state?.players && room.state.players.size > 0;
    },
    undefined,
    { timeout: 15_000 },
  );
}

export { expect } from '@playwright/test';
