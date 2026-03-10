/**
 * E2E test: Browser refresh should return to the same game (#101).
 *
 * Flow:
 *   1. Join a game via the lobby (dev mode).
 *   2. Capture room state (roomId, sessionId, reconnection token).
 *   3. Refresh the page.
 *   4. Assert: player is back in the SAME game — not shown the lobby.
 */
import { test, expect } from '@playwright/test';

test.describe('Browser Refresh Reconnection (#101)', () => {
  test('returns to the same game after browser refresh', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Capture all console output for diagnostics
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // --- Step 1: Join a game via the lobby ---
    await page.goto('/?dev=1');

    // Wait for lobby to appear
    await page.waitForSelector('#lobby-overlay.visible', { timeout: 15_000 });

    // Enter player name
    await page.fill('#lobby-name-input', 'RefreshTester');

    // Click "+ Create New Game" toggle to show the create form
    await page.click('#lobby-create-toggle');
    await page.waitForSelector('#lobby-create-form.visible', { timeout: 5_000 });

    // Submit the create form
    await page.click('#lobby-create-submit');

    // Wait for lobby to disappear and canvas to render
    await page.waitForSelector('#lobby-overlay.visible', {
      state: 'hidden',
      timeout: 15_000,
    });
    await page.waitForSelector('#app canvas', { timeout: 10_000 });

    // Wait for room state to sync (player appears in state)
    await page.waitForFunction(
      () => {
        const room = (window as unknown as { __ROOM__?: { state?: { players?: { size: number } } } }).__ROOM__;
        return room?.state?.players && room.state.players.size > 0;
      },
      undefined,
      { timeout: 15_000 },
    );

    // --- Step 2: Capture pre-refresh state ---
    const preRefresh = await page.evaluate(() => {
      const room = (window as unknown as {
        __ROOM__?: {
          roomId: string;
          sessionId: string;
          reconnectionToken?: string;
        };
      }).__ROOM__;
      return {
        roomId: room?.roomId ?? null,
        sessionId: room?.sessionId ?? null,
        hasReconnectionToken: !!room?.reconnectionToken,
        tokenInStorage: !!sessionStorage.getItem('primal-grid-reconnect-token'),
      };
    });

    console.log('Pre-refresh:', JSON.stringify(preRefresh));
    expect(preRefresh.roomId).toBeTruthy();
    expect(preRefresh.tokenInStorage).toBe(true);

    // --- Step 3: Refresh ---
    consoleLogs.length = 0;
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Wait for bootstrap to run and UI to settle
    await page.waitForTimeout(5_000);

    // --- Step 4: Diagnose post-refresh state ---

    // Check if reconnection token survived the refresh
    const tokenSurvived = await page.evaluate(() =>
      !!sessionStorage.getItem('primal-grid-reconnect-token'),
    );
    console.log('Token survived refresh:', tokenSurvived);

    // Check which UI is visible
    const uiState = await page.evaluate(() => {
      const gameWrapper = document.getElementById('game-wrapper');
      const canvas = document.querySelector('#app canvas');
      const lobbyOverlay = document.querySelector('#lobby-overlay.visible');
      return {
        gameWrapperVisible: gameWrapper ? gameWrapper.style.display !== 'none' : false,
        canvasExists: !!canvas,
        lobbyVisible: !!lobbyOverlay,
      };
    });
    console.log('Post-refresh UI:', JSON.stringify(uiState));

    // Check if __ROOM__ was re-established
    const postRefresh = await page.evaluate(() => {
      const room = (window as unknown as {
        __ROOM__?: {
          roomId: string;
          sessionId: string;
        };
      }).__ROOM__;
      return {
        roomId: room?.roomId ?? null,
        sessionId: room?.sessionId ?? null,
        hasRoom: !!room,
      };
    });
    console.log('Post-refresh room:', JSON.stringify(postRefresh));

    // Print all console logs from the page after refresh
    console.log('--- Browser console after refresh ---');
    for (const log of consoleLogs) {
      console.log('  ', log);
    }
    console.log('--- End browser console ---');

    // --- Assertions ---
    expect(tokenSurvived).toBe(true);
    expect(uiState.gameWrapperVisible).toBe(true);
    expect(uiState.lobbyVisible).toBe(false);
    expect(postRefresh.hasRoom).toBe(true);
    expect(postRefresh.roomId).toBe(preRefresh.roomId);

    await ctx.close();
  });
});
