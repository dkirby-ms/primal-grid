import { test, expect } from '../fixtures/game.fixture.js';
import { waitForPlayerCount, getGameState } from '../helpers/player.helper.js';
import { getPlayerState, waitForStateChange } from '../helpers/state.helper.js';

test.describe('Multiplayer — Player Visibility', () => {
  test('both players have independent room state references', async ({
    playerOne,
    playerTwo,
  }) => {
    await waitForPlayerCount(playerOne.page, 2);
    await waitForPlayerCount(playerTwo.page, 2);

    const stateFromOne = await getGameState(playerOne.page);
    const stateFromTwo = await getGameState(playerTwo.page);

    expect(stateFromOne).not.toBeNull();
    expect(stateFromTwo).not.toBeNull();

    // Both views should report the same player count
    expect(stateFromOne!.players).toHaveLength(stateFromTwo!.players.length);
  });

  test('each player sees the other player state with correct name', async ({
    playerOne,
    playerTwo,
  }) => {
    await waitForPlayerCount(playerOne.page, 2);

    // Player one can read player two's state
    const bobFromAlice = await getPlayerState(playerOne.page, playerTwo.playerName);
    expect(bobFromAlice).not.toBeNull();
    expect(bobFromAlice!.displayName).toBe(playerTwo.playerName);

    // Player two can read player one's state
    const aliceFromBob = await getPlayerState(playerTwo.page, playerOne.playerName);
    expect(aliceFromBob).not.toBeNull();
    expect(aliceFromBob!.displayName).toBe(playerOne.playerName);
  });

  test('both players see each other with HQ coordinates', async ({
    playerOne,
    playerTwo,
  }) => {
    await waitForPlayerCount(playerOne.page, 2);

    const bobFromAlice = await getPlayerState(playerOne.page, playerTwo.playerName);
    const aliceFromBob = await getPlayerState(playerTwo.page, playerOne.playerName);

    expect(bobFromAlice).not.toBeNull();
    expect(aliceFromBob).not.toBeNull();

    // Both should have valid HQ positions
    expect(bobFromAlice!.hqX).toBeGreaterThanOrEqual(0);
    expect(bobFromAlice!.hqY).toBeGreaterThanOrEqual(0);
    expect(aliceFromBob!.hqX).toBeGreaterThanOrEqual(0);
    expect(aliceFromBob!.hqY).toBeGreaterThanOrEqual(0);
  });

  test('both players share the same tick counter', async ({
    playerOne,
    playerTwo,
  }) => {
    await waitForPlayerCount(playerOne.page, 2);

    const stateOne = await getGameState(playerOne.page);
    const stateTwo = await getGameState(playerTwo.page);

    expect(stateOne).not.toBeNull();
    expect(stateTwo).not.toBeNull();

    // Ticks may differ by a few due to network latency, but should be close
    const tickDiff = Math.abs(stateOne!.tick! - stateTwo!.tick!);
    expect(tickDiff).toBeLessThan(10);
  });

  test('both players share the same day phase', async ({
    playerOne,
    playerTwo,
  }) => {
    await waitForPlayerCount(playerOne.page, 2);

    const stateOne = await getGameState(playerOne.page);
    const stateTwo = await getGameState(playerTwo.page);

    expect(stateOne).not.toBeNull();
    expect(stateTwo).not.toBeNull();
    expect(stateOne!.dayPhase).toBe(stateTwo!.dayPhase);
  });

  test('resources are independent between players', async ({
    playerOne,
    playerTwo,
  }) => {
    await waitForPlayerCount(playerOne.page, 2);

    const aliceState = await getPlayerState(playerOne.page, playerOne.playerName);
    const bobState = await getPlayerState(playerTwo.page, playerTwo.playerName);

    expect(aliceState).not.toBeNull();
    expect(bobState).not.toBeNull();

    // Both should start with at least the starting resources
    expect(aliceState!.wood).toBeGreaterThanOrEqual(25);
    expect(aliceState!.stone).toBeGreaterThanOrEqual(15);
    expect(bobState!.wood).toBeGreaterThanOrEqual(25);
    expect(bobState!.stone).toBeGreaterThanOrEqual(15);
  });
});

test.describe('Multiplayer — HQ Proximity', () => {
  test('two players HQs are at least 10 Manhattan distance apart', async ({
    playerOne,
    playerTwo,
  }) => {
    await waitForPlayerCount(playerOne.page, 2);

    const alice = await getPlayerState(playerOne.page, playerOne.playerName);
    const bob = await getPlayerState(playerOne.page, playerTwo.playerName);

    expect(alice).not.toBeNull();
    expect(bob).not.toBeNull();

    const manhattanDist =
      Math.abs(alice!.hqX - bob!.hqX) + Math.abs(alice!.hqY - bob!.hqY);
    expect(manhattanDist).toBeGreaterThanOrEqual(10);
  });

  test('each player HQ occupies a 5x5 territory zone', async ({
    playerOne,
    playerTwo,
  }) => {
    await waitForPlayerCount(playerOne.page, 2);

    // Count HQ territory tiles owned by each player
    const territoryCounts = await playerOne.page.evaluate(() => {
      const room = (window as unknown as {
        __ROOM__?: {
          state?: {
            players?: {
              forEach: (fn: (p: { hqX: number; hqY: number }, key: string) => void) => void;
            };
            tiles?: Array<{ ownerID: string; isHQTerritory: boolean }>;
            mapWidth?: number;
          };
        };
      }).__ROOM__;
      if (!room?.state?.tiles || !room.state.players) return null;

      const counts: Record<string, number> = {};
      room.state.players.forEach((_p, key) => {
        counts[key] = 0;
      });

      const len = room.state.tiles.length;
      for (let i = 0; i < len; i++) {
        const tile = room.state.tiles[i];
        if (tile && tile.isHQTerritory && tile.ownerID !== '') {
          counts[tile.ownerID] = (counts[tile.ownerID] || 0) + 1;
        }
      }
      return counts;
    });

    expect(territoryCounts).not.toBeNull();

    // Each player should have a 5x5 = 25 tile HQ zone
    const values = Object.values(territoryCounts!);
    for (const count of values) {
      expect(count).toBe(25);
    }
  });

  test('player HQ tiles do not overlap', async ({ playerOne, playerTwo }) => {
    await waitForPlayerCount(playerOne.page, 2);

    const overlap = await playerOne.page.evaluate(() => {
      const room = (window as unknown as {
        __ROOM__?: {
          state?: {
            tiles?: Array<{ ownerID: string; isHQTerritory: boolean }>;
          };
        };
      }).__ROOM__;
      if (!room?.state?.tiles) return null;

      // Check if any HQ tile is owned by more than one player
      // (a tile can only have one ownerID, so we check for conflicting HQ zones)
      const hqTilesByOwner = new Map<string, number>();
      const len = room.state.tiles.length;
      for (let i = 0; i < len; i++) {
        const tile = room.state.tiles[i];
        if (tile && tile.isHQTerritory && tile.ownerID !== '') {
          hqTilesByOwner.set(
            tile.ownerID,
            (hqTilesByOwner.get(tile.ownerID) || 0) + 1,
          );
        }
      }

      // Should have exactly 2 distinct owners
      return {
        distinctOwners: hqTilesByOwner.size,
        totalHQTiles: Array.from(hqTilesByOwner.values()).reduce((a, b) => a + b, 0),
      };
    });

    expect(overlap).not.toBeNull();
    expect(overlap!.distinctOwners).toBe(2);
    // 2 players × 25 tiles each = 50 total HQ tiles
    expect(overlap!.totalHQTiles).toBe(50);
  });
});

test.describe('Multiplayer — Pawn Spawning', () => {
  test('player can spawn a builder pawn', async ({ playerOne }) => {
    const { page, playerName } = playerOne;

    // Record initial resources
    const before = await getPlayerState(page, playerName);
    expect(before).not.toBeNull();

    // Send spawn_pawn message via room
    await page.evaluate(() => {
      const room = (window as unknown as {
        __ROOM__?: { send: (type: string, data: unknown) => void };
      }).__ROOM__;
      room?.send('spawn_pawn', { pawnType: 'builder' });
    });

    // Wait for a creature with this owner and pawnType to appear
    await page.waitForFunction(
      (name: string) => {
        const room = (window as unknown as {
          __ROOM__?: {
            state?: {
              players?: {
                forEach: (fn: (p: { displayName: string }, key: string) => void) => void;
              };
              creatures?: {
                forEach: (fn: (c: { ownerID: string; pawnType: string }) => void) => void;
              };
            };
            sessionId?: string;
          };
        }).__ROOM__;
        if (!room?.state?.creatures) return false;
        const sid = room.sessionId;
        let found = false;
        room.state.creatures.forEach((c) => {
          if (c.ownerID === sid && c.pawnType === 'builder') found = true;
        });
        return found;
      },
      playerName,
      { timeout: 15_000 },
    );

    // Verify resources were deducted (builder costs 10 wood, 5 stone).
    // Use inequality checks — HQ income ticks can shift resources between
    // the "before" snapshot and the post-spawn read.
    const after = await getPlayerState(page, playerName);
    expect(after).not.toBeNull();
    expect(after!.wood).toBeLessThan(before!.wood);
    expect(after!.stone).toBeLessThan(before!.stone);
  });

  test('spawn is rejected when resources are insufficient', async ({ playerOne }) => {
    const { page, playerName } = playerOne;

    // Drain resources by spawning builders until we can't
    // First, spawn 2 builders (costs 10W + 5S each, starting at 25W/15S)
    // After 2 builders: 5W, 5S — not enough for a third (needs 10W)
    await page.evaluate(() => {
      const room = (window as unknown as {
        __ROOM__?: { send: (type: string, data: unknown) => void };
      }).__ROOM__;
      room?.send('spawn_pawn', { pawnType: 'builder' });
    });

    // Wait for first builder
    await page.waitForFunction(() => {
      const room = (window as unknown as {
        __ROOM__?: {
          state?: {
            creatures?: {
              forEach: (fn: (c: { ownerID: string; pawnType: string }) => void) => void;
            };
          };
          sessionId?: string;
        };
      }).__ROOM__;
      if (!room?.state?.creatures) return false;
      let count = 0;
      room.state.creatures.forEach((c) => {
        if (c.ownerID === room.sessionId && c.pawnType === 'builder') count++;
      });
      return count >= 1;
    }, undefined, { timeout: 15_000 });

    await page.evaluate(() => {
      const room = (window as unknown as {
        __ROOM__?: { send: (type: string, data: unknown) => void };
      }).__ROOM__;
      room?.send('spawn_pawn', { pawnType: 'builder' });
    });

    // Wait for second builder
    await page.waitForFunction(() => {
      const room = (window as unknown as {
        __ROOM__?: {
          state?: {
            creatures?: {
              forEach: (fn: (c: { ownerID: string; pawnType: string }) => void) => void;
            };
          };
          sessionId?: string;
        };
      }).__ROOM__;
      if (!room?.state?.creatures) return false;
      let count = 0;
      room.state.creatures.forEach((c) => {
        if (c.ownerID === room.sessionId && c.pawnType === 'builder') count++;
      });
      return count >= 2;
    }, undefined, { timeout: 15_000 });

    // Confirm resources are actually insufficient before the third spawn
    const currentResources = await getPlayerState(page, playerName);
    expect(currentResources).not.toBeNull();
    expect(currentResources!.wood).toBeLessThan(10); // builder costs 10 wood

    // Now try to spawn a third — should fail (not enough wood)
    await page.evaluate(() => {
      const room = (window as unknown as {
        __ROOM__?: { send: (type: string, data: unknown) => void };
      }).__ROOM__;
      room?.send('spawn_pawn', { pawnType: 'builder' });
    });

    // Poll several times to confirm no third builder appeared
    await expect.poll(async () => {
      return await page.evaluate(() => {
        const room = (window as unknown as {
          __ROOM__?: {
            state?: {
              creatures?: {
                forEach: (fn: (c: { ownerID: string; pawnType: string }) => void) => void;
              };
            };
            sessionId?: string;
          };
        }).__ROOM__;
        if (!room?.state?.creatures) return 0;
        let count = 0;
        room.state.creatures.forEach((c) => {
          if (c.ownerID === room.sessionId && c.pawnType === 'builder') count++;
        });
        return count;
      });
    }, { timeout: 3000, intervals: [500, 500, 500, 500, 500] }).toBe(2);
  });

  test('both players can independently spawn builders', async ({
    playerOne,
    playerTwo,
  }) => {
    await waitForPlayerCount(playerOne.page, 2);

    // Both players spawn a builder
    await playerOne.page.evaluate(() => {
      const room = (window as unknown as {
        __ROOM__?: { send: (type: string, data: unknown) => void };
      }).__ROOM__;
      room?.send('spawn_pawn', { pawnType: 'builder' });
    });

    await playerTwo.page.evaluate(() => {
      const room = (window as unknown as {
        __ROOM__?: { send: (type: string, data: unknown) => void };
      }).__ROOM__;
      room?.send('spawn_pawn', { pawnType: 'builder' });
    });

    // Wait for both builders to appear (visible from player one's perspective)
    await playerOne.page.waitForFunction(() => {
      const room = (window as unknown as {
        __ROOM__?: {
          state?: {
            creatures?: {
              forEach: (fn: (c: { pawnType: string }) => void) => void;
            };
          };
        };
      }).__ROOM__;
      if (!room?.state?.creatures) return false;
      let count = 0;
      room.state.creatures.forEach((c) => {
        if (c.pawnType === 'builder') count++;
      });
      return count >= 2;
    }, undefined, { timeout: 15_000 });

    // Verify each player's builder is owned correctly
    const buildersByOwner = await playerOne.page.evaluate(() => {
      const room = (window as unknown as {
        __ROOM__?: {
          state?: {
            creatures?: {
              forEach: (fn: (c: { ownerID: string; pawnType: string }) => void) => void;
            };
          };
        };
      }).__ROOM__;
      if (!room?.state?.creatures) return {};
      const owners: Record<string, number> = {};
      room.state.creatures.forEach((c) => {
        if (c.pawnType === 'builder') {
          owners[c.ownerID] = (owners[c.ownerID] || 0) + 1;
        }
      });
      return owners;
    });

    // At least 2 distinct owners with builders
    expect(Object.keys(buildersByOwner)).toHaveLength(2);
  });
});

test.describe('Multiplayer — Territory Claiming', () => {
  test('builder pawn claims territory over time', async ({ playerOne }) => {
    const { page, playerName } = playerOne;

    // Count initial territory
    const initialTerritory = await page.evaluate(() => {
      const room = (window as unknown as {
        __ROOM__?: {
          state?: {
            tiles?: Array<{ ownerID: string }>;
          };
          sessionId?: string;
        };
      }).__ROOM__;
      if (!room?.state?.tiles) return 0;
      let count = 0;
      const len = room.state.tiles.length;
      for (let i = 0; i < len; i++) {
        if (room.state.tiles[i]?.ownerID === room.sessionId) count++;
      }
      return count;
    });

    // Spawn a builder to start claiming territory
    await page.evaluate(() => {
      const room = (window as unknown as {
        __ROOM__?: { send: (type: string, data: unknown) => void };
      }).__ROOM__;
      room?.send('spawn_pawn', { pawnType: 'builder' });
    });

    // Wait for territory to increase (builder claims every 8 ticks = 2 seconds)
    // Give it enough time for the builder to move and claim at least one tile
    await waitForStateChange(
      page,
      `(() => {
        const room = window.__ROOM__;
        if (!room?.state?.tiles) return false;
        let count = 0;
        const len = room.state.tiles.length;
        for (let i = 0; i < len; i++) {
          if (room.state.tiles[i]?.ownerID === room.sessionId) count++;
        }
        return count > ${initialTerritory};
      })()`,
      30_000,
    );

    const newTerritory = await page.evaluate(() => {
      const room = (window as unknown as {
        __ROOM__?: {
          state?: {
            tiles?: Array<{ ownerID: string }>;
          };
          sessionId?: string;
        };
      }).__ROOM__;
      if (!room?.state?.tiles) return 0;
      let count = 0;
      const len = room.state.tiles.length;
      for (let i = 0; i < len; i++) {
        if (room.state.tiles[i]?.ownerID === room.sessionId) count++;
      }
      return count;
    });

    expect(newTerritory).toBeGreaterThan(initialTerritory);
  });

  test('newly claimed territory is adjacent to existing territory', async ({
    playerOne,
  }) => {
    const { page } = playerOne;

    // Spawn a builder
    await page.evaluate(() => {
      const room = (window as unknown as {
        __ROOM__?: { send: (type: string, data: unknown) => void };
      }).__ROOM__;
      room?.send('spawn_pawn', { pawnType: 'builder' });
    });

    // Wait for territory to grow beyond the initial 25 HQ tiles
    await waitForStateChange(
      page,
      `(() => {
        const room = window.__ROOM__;
        if (!room?.state?.tiles) return false;
        let count = 0;
        const len = room.state.tiles.length;
        for (let i = 0; i < len; i++) {
          if (room.state.tiles[i]?.ownerID === room.sessionId) count++;
        }
        return count > 25;
      })()`,
      30_000,
    );

    // Verify every owned tile has at least one adjacent owned tile
    const adjacencyValid = await page.evaluate(() => {
      const room = (window as unknown as {
        __ROOM__?: {
          state?: {
            tiles?: Array<{ ownerID: string }>;
            mapWidth?: number;
          };
          sessionId?: string;
        };
      }).__ROOM__;
      if (!room?.state?.tiles || !room.state.mapWidth) return null;

      const sid = room.sessionId!;
      const w = room.state.mapWidth;
      const tiles = room.state.tiles;
      const len = tiles.length;

      for (let i = 0; i < len; i++) {
        if (tiles[i]?.ownerID !== sid) continue;
        const x = i % w;
        const y = Math.floor(i / w);

        // Check cardinal neighbors for at least one owned tile
        let hasAdjacentOwned = false;
        const neighbors = [
          { nx: x - 1, ny: y },
          { nx: x + 1, ny: y },
          { nx: x, ny: y - 1 },
          { nx: x, ny: y + 1 },
        ];
        for (const { nx, ny } of neighbors) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= w) continue;
          if (tiles[ny * w + nx]?.ownerID === sid) {
            hasAdjacentOwned = true;
            break;
          }
        }
        if (!hasAdjacentOwned) return { valid: false, x, y };
      }
      return { valid: true };
    });

    expect(adjacencyValid).not.toBeNull();
    expect(adjacencyValid!.valid).toBe(true);
  });
});

test.describe('Multiplayer — Synchronized State', () => {
  test('player leaving is reflected in other player state', async ({
    playerOne,
    playerTwo,
  }) => {
    await waitForPlayerCount(playerOne.page, 2);
    await waitForPlayerCount(playerTwo.page, 2);

    // Verify both see 2 players
    const beforeState = await getGameState(playerOne.page);
    const playersBefore = beforeState!.players.filter((p) =>
      [playerOne.playerName, playerTwo.playerName].includes(p.displayName),
    );
    expect(playersBefore).toHaveLength(2);

    // Player two leaves by closing their context
    await playerTwo.context.close();

    // Player one should see the player count decrease
    await playerOne.page.waitForFunction(
      (name: string) => {
        const room = (window as unknown as {
          __ROOM__?: {
            state?: {
              players?: {
                forEach: (fn: (p: { displayName: string }) => void) => void;
                size: number;
              };
            };
          };
        }).__ROOM__;
        if (!room?.state?.players) return false;
        let found = false;
        room.state.players.forEach((p) => {
          if (p.displayName === name) found = true;
        });
        return !found;
      },
      playerTwo.playerName,
      { timeout: 15_000 },
    );

    const afterState = await getGameState(playerOne.page);
    const playersAfter = afterState!.players.filter(
      (p) => p.displayName === playerTwo.playerName,
    );
    expect(playersAfter).toHaveLength(0);
  });

  test('map dimensions are consistent across players', async ({
    playerOne,
    playerTwo,
  }) => {
    await waitForPlayerCount(playerOne.page, 2);

    const stateOne = await getGameState(playerOne.page);
    const stateTwo = await getGameState(playerTwo.page);

    expect(stateOne).not.toBeNull();
    expect(stateTwo).not.toBeNull();
    expect(stateOne!.mapWidth).toBe(stateTwo!.mapWidth);
    expect(stateOne!.mapWidth).toBe(128);
  });
});
