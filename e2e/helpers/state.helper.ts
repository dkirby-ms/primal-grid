import type { Page } from '@playwright/test';

/**
 * Wait until a JavaScript predicate evaluates to true inside the page.
 * The predicate string is evaluated with access to `window.__ROOM__`.
 *
 * @example
 * await waitForStateChange(page, `
 *   (() => {
 *     const room = window.__ROOM__;
 *     return room?.state?.tick > 10;
 *   })()
 * `);
 */
export async function waitForStateChange(
  page: Page,
  predicate: string,
  timeout = 10_000,
): Promise<void> {
  await page.waitForFunction(predicate, undefined, { timeout });
}

/**
 * Look up a specific player's state by display name.
 * Returns null if the player is not found or the room is not connected.
 */
export async function getPlayerState(page: Page, playerName: string) {
  return page.evaluate((name: string) => {
    const room = (window as any).__ROOM__;
    if (!room?.state?.players) return null;

    let found: any = null;
    room.state.players.forEach((p: any) => {
      if (p.displayName === name) {
        found = {
          displayName: p.displayName,
          wood: p.wood,
          stone: p.stone,
          hqX: p.hqX,
          hqY: p.hqY,
          score: p.score,
          level: p.level,
        };
      }
    });
    return found;
  }, playerName);
}
