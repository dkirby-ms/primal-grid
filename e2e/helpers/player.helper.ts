import type { Page } from '@playwright/test';

interface E2EPlayerData {
  displayName: string;
  wood: number;
  stone: number;
  hqX: number;
  hqY: number;
  score: number;
  level: number;
}

interface E2ERoom {
  state?: {
    players?: {
      size: number;
      forEach: (fn: (p: E2EPlayerData, key: string) => void) => void;
    };
    tick?: number;
    dayPhase?: string;
    mapWidth?: number;
  };
}

/**
 * Wait until at least `count` players are present in the Colyseus room state.
 * Reads the deserialized room.state.players map exposed via window.__ROOM__.
 */
export async function waitForPlayerCount(
  page: Page,
  count: number,
  timeout = 15_000,
): Promise<void> {
  await page.waitForFunction(
    (expected: number) => {
      const room = (window as unknown as { __ROOM__?: E2ERoom }).__ROOM__;
      if (!room?.state?.players) return false;
      return room.state.players.size >= expected;
    },
    count,
    { timeout },
  );
}

/**
 * Open the scoreboard (Tab key), wait for a player name to appear, then
 * close it again. The scoreboard overlay uses `#scoreboard-body tr` rows
 * populated from room.state.players in client/src/ui/Scoreboard.ts.
 */
export async function waitForPlayerOnScoreboard(
  page: Page,
  name: string,
  timeout = 10_000,
): Promise<void> {
  // Open scoreboard
  await page.keyboard.press('Tab');
  await page.waitForSelector('#scoreboard-overlay.visible', { timeout: 5_000 });

  // Wait for the player row to appear
  await page.waitForFunction(
    (playerName: string) => {
      const rows = document.querySelectorAll('#scoreboard-body tr');
      return Array.from(rows).some((r) => r.textContent?.includes(playerName));
    },
    name,
    { timeout },
  );

  // Close scoreboard and wait for it to hide
  await page.keyboard.press('Tab');
  await page.waitForSelector('#scoreboard-overlay:not(.visible)', { timeout: 5_000 });
}

/**
 * Read the full game state snapshot from the Colyseus room exposed on
 * window.__ROOM__.  Returns null if the room is not yet connected.
 */
export async function getGameState(page: Page) {
  return page.evaluate(() => {
    const room = (window as unknown as { __ROOM__?: E2ERoom }).__ROOM__;
    if (!room?.state) return null;

    const players: Array<{
      id: string;
      displayName: string;
      wood: number;
      stone: number;
      hqX: number;
      hqY: number;
      score: number;
      level: number;
    }> = [];

    room.state.players?.forEach((p: E2EPlayerData, key: string) => {
      players.push({
        id: key,
        displayName: p.displayName,
        wood: p.wood,
        stone: p.stone,
        hqX: p.hqX,
        hqY: p.hqY,
        score: p.score,
        level: p.level,
      });
    });

    return {
      tick: room.state.tick,
      dayPhase: room.state.dayPhase,
      mapWidth: room.state.mapWidth,
      players,
    };
  });
}
