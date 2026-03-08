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
    await joinGame(page, 'Alice');
    await use({ context: ctx, page, playerName: 'Alice' });
    await ctx.close();
  },
  playerTwo: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await joinGame(page, 'Bob');
    await use({ context: ctx, page, playerName: 'Bob' });
    await ctx.close();
  },
});

/**
 * Navigate to the game in dev mode, enter a player name, and wait for the
 * canvas to render. The name-prompt overlay uses a `.visible` CSS class
 * toggled in client/src/main.ts promptForName().
 */
async function joinGame(page: Page, name: string): Promise<void> {
  await page.goto('/?dev=1');

  // Wait for name prompt overlay to become visible
  await page.waitForSelector('#name-prompt-overlay.visible', { timeout: 15_000 });

  // Fill in name and submit
  await page.fill('#name-prompt-input', name);
  await page.click('#name-prompt-submit');

  // Wait for overlay to disappear (game has loaded)
  await page.waitForSelector('#name-prompt-overlay:not(.visible)', { timeout: 10_000 });

  // Wait for canvas to render inside #app
  await page.waitForSelector('#app canvas', { timeout: 10_000 });
}

export { expect } from '@playwright/test';
