import { describe, it, expect } from "vitest";
import { GameState, PlayerState, TileState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { isAdjacentToTerritory, getTerritoryCounts, spawnHQ } from "../rooms/territory.js";
import {
  TERRITORY, TileType,
} from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): GameRoom {
  const room = Object.create(GameRoom.prototype) as GameRoom;
  room.state = new GameState();
  room.generateMap(seed);
  room.broadcast = () => {};
  return room;
}

function fakeClient(sessionId: string): { sessionId: string; send: () => void } {
  return { sessionId, send: () => {} };
}

function joinPlayer(room: GameRoom, sessionId: string) {
  const client = fakeClient(sessionId);
  room.onJoin(client);
  const player = room.state.players.get(sessionId)!;
  return { client, player };
}

/** Find an unclaimed walkable tile adjacent (cardinal) to the player's territory. */
function findClaimableAdjacentTile(room: GameRoom, playerId: string): { x: number; y: number } | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (
      tile.ownerID === "" &&
      tile.type !== TileType.Water &&
      tile.type !== TileType.Rock &&
      isAdjacentToTerritory(room.state, playerId, tile.x, tile.y)
    ) {
      return { x: tile.x, y: tile.y };
    }
  }
  return null;
}

/** Find an unclaimed walkable tile NOT adjacent to the player's territory. */
function findNonAdjacentUnownedTile(room: GameRoom, playerId: string): { x: number; y: number } | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (
      tile.ownerID === "" &&
      tile.type !== TileType.Water &&
      tile.type !== TileType.Rock &&
      !isAdjacentToTerritory(room.state, playerId, tile.x, tile.y)
    ) {
      return { x: tile.x, y: tile.y };
    }
  }
  return null;
}

/** Find a water or rock tile. */
function _findUnwalkableTile(room: GameRoom): { x: number; y: number } | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (tile.type === TileType.Water || tile.type === TileType.Rock) {
      return { x: tile.x, y: tile.y };
    }
  }
  return null;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Territory System", () => {

  describe("HQ spawn", () => {
    it("player joins → HQ position set, all 25 tiles claimed, score reflects tiles", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");

      // HQ position set
      expect(player.hqX).toBeGreaterThanOrEqual(0);
      expect(player.hqY).toBeGreaterThanOrEqual(0);

      // HQ tile is walkable
      expect(room.state.isWalkable(player.hqX, player.hqY)).toBe(true);

      // All 25 tiles claimed (Water/Rock force-converted to Grassland)
      const expectedCount = TERRITORY.STARTING_SIZE * TERRITORY.STARTING_SIZE;
      const counts = getTerritoryCounts(room.state);
      const ownedCount = counts.get("p1") ?? 0;
      expect(ownedCount).toBe(expectedCount);

      // Score matches owned tile count
      expect(player.score).toBe(expectedCount);

      // Starting resources set
      expect(player.wood).toBe(TERRITORY.STARTING_WOOD);
      expect(player.stone).toBe(TERRITORY.STARTING_STONE);
    });
  });

  describe("territory adjacency", () => {
    it("cardinal neighbors count as adjacent, isolated tiles do not", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");
      const _hx = player.hqX;
      const _hy = player.hqY;

      // Find an owned tile, then check the 4 cardinal neighbors of an edge tile
      const adj = findClaimableAdjacentTile(room, "p1");
      expect(adj).not.toBeNull();
      expect(isAdjacentToTerritory(room.state, "p1", adj!.x, adj!.y)).toBe(true);

      // A tile far away should not be adjacent
      const far = findNonAdjacentUnownedTile(room, "p1");
      expect(far).not.toBeNull();
      expect(isAdjacentToTerritory(room.state, "p1", far!.x, far!.y)).toBe(false);
    });
  });

  describe("HQ never spawns within edge margin", () => {
    const half = Math.floor(TERRITORY.STARTING_SIZE / 2);
    const seeds = [1, 42, 100, 777, 9999];

    for (const seed of seeds) {
      it(`seed ${seed}: hqX and hqY stay within safe margin`, () => {
        const room = createRoomWithMap(seed);
        const { player } = joinPlayer(room, "p1");
        const w = room.state.mapWidth;
        const h = room.state.mapHeight;

        expect(player.hqX).toBeGreaterThanOrEqual(half);
        expect(player.hqX).toBeLessThan(w - half);
        expect(player.hqY).toBeGreaterThanOrEqual(half);
        expect(player.hqY).toBeLessThan(h - half);
      });
    }

    it("multi-player spawns all respect edge margin", () => {
      const room = createRoomWithMap(42);
      const w = room.state.mapWidth;
      const h = room.state.mapHeight;

      for (let i = 0; i < 4; i++) {
        const { player } = joinPlayer(room, `mp${i}`);
        expect(player.hqX).toBeGreaterThanOrEqual(half);
        expect(player.hqX).toBeLessThan(w - half);
        expect(player.hqY).toBeGreaterThanOrEqual(half);
        expect(player.hqY).toBeLessThan(h - half);
      }
    });
  });

  describe("player always gets full starting territory", () => {
    it("all 25 tiles in the NxN zone around HQ are owned and walkable", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");
      const half = Math.floor(TERRITORY.STARTING_SIZE / 2);
      const expectedCount = TERRITORY.STARTING_SIZE * TERRITORY.STARTING_SIZE;

      let ownedInZone = 0;

      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          const tx = player.hqX + dx;
          const ty = player.hqY + dy;
          const tile = room.state.getTile(tx, ty);

          // Every tile in the zone must exist (not clipped by map edge)
          expect(tile).toBeDefined();

          // No Water/Rock should remain — force-converted to Grassland
          if (tile) {
            expect(tile.type).not.toBe(TileType.Water);
            expect(tile.type).not.toBe(TileType.Rock);
            expect(tile.ownerID).toBe("p1");
            ownedInZone++;
          }
        }
      }

      expect(ownedInZone).toBe(expectedCount);
    });

    it("owned tile count always equals STARTING_SIZE² (25)", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");
      const expectedOwned = TERRITORY.STARTING_SIZE * TERRITORY.STARTING_SIZE;

      const counts = getTerritoryCounts(room.state);
      expect(counts.get("p1") ?? 0).toBe(expectedOwned);
      expect(player.score).toBe(expectedOwned);
    });

    it("works across multiple seeds without edge clipping", () => {
      for (const seed of [1, 42, 256, 9999]) {
        const room = createRoomWithMap(seed);
        const { player } = joinPlayer(room, "t1");
        const half = Math.floor(TERRITORY.STARTING_SIZE / 2);

        for (let dy = -half; dy <= half; dy++) {
          for (let dx = -half; dx <= half; dx++) {
            const tile = room.state.getTile(player.hqX + dx, player.hqY + dy);
            // No tile in the zone should be undefined (that means edge clipping)
            expect(tile).toBeDefined();
          }
        }
      }
    });
  });

  describe("score tracking", () => {
    it("score matches actual tile count from HQ spawn", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");

      const counts = getTerritoryCounts(room.state);
      const actualOwned = counts.get("p1") ?? 0;
      expect(player.score).toBe(actualOwned);
    });
  });

  // ── HQ zone must NEVER contain Water or Rock ──────────────────────
  // Pemulis is implementing force-conversion of Water/Rock → Grassland
  // in spawnHQ. These tests verify the guarantee: all 25 tiles claimed,
  // no non-walkable tiles remain in the HQ zone.

  describe("HQ zone — no water or rock (all 25 tiles claimed)", () => {
    const SIZE = TERRITORY.STARTING_SIZE;           // 5
    const HALF = Math.floor(SIZE / 2);              // 2
    const TOTAL = SIZE * SIZE;                       // 25

    /**
     * Build a minimal GameState with a 10×10 grid where we control
     * every tile type. HQ will be placed at center (5,5) so the
     * 5×5 zone spans (3..7, 3..7) — fully inside the grid.
     */
    function buildState(tileTypeFn: (x: number, y: number) => TileType): GameState {
      const state = new GameState();
      state.mapWidth = 10;
      state.mapHeight = 10;
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          const t = new TileState();
          t.x = x;
          t.y = y;
          t.type = tileTypeFn(x, y);
          state.tiles.push(t);
        }
      }
      return state;
    }

    function makePlayer(id: string, state: GameState): PlayerState {
      const p = new PlayerState();
      p.id = id;
      state.players.set(id, p);
      return p;
    }

    const HQ_X = 5;
    const HQ_Y = 5;

    it("all 25 tiles claimed — no gaps", () => {
      const state = buildState(() => TileType.Grassland);
      const player = makePlayer("p1", state);
      spawnHQ(state, player, HQ_X, HQ_Y);

      for (let dy = -HALF; dy <= HALF; dy++) {
        for (let dx = -HALF; dx <= HALF; dx++) {
          const tile = state.getTile(HQ_X + dx, HQ_Y + dy)!;
          expect(tile.ownerID).toBe("p1");
        }
      }
      expect(player.score).toBe(TOTAL);
    });

    it("water tiles in HQ zone are converted to Grassland and owned", () => {
      // Fill the entire HQ zone with Water
      const state = buildState((x, y) => {
        if (
          x >= HQ_X - HALF && x <= HQ_X + HALF &&
          y >= HQ_Y - HALF && y <= HQ_Y + HALF
        ) return TileType.Water;
        return TileType.Grassland;
      });
      const player = makePlayer("p1", state);
      spawnHQ(state, player, HQ_X, HQ_Y);

      for (let dy = -HALF; dy <= HALF; dy++) {
        for (let dx = -HALF; dx <= HALF; dx++) {
          const tile = state.getTile(HQ_X + dx, HQ_Y + dy)!;
          expect(tile.type).toBe(TileType.Grassland);
          expect(tile.ownerID).toBe("p1");
        }
      }
      expect(player.score).toBe(TOTAL);
    });

    it("rock tiles in HQ zone are converted to Grassland and owned", () => {
      // Fill the entire HQ zone with Rock
      const state = buildState((x, y) => {
        if (
          x >= HQ_X - HALF && x <= HQ_X + HALF &&
          y >= HQ_Y - HALF && y <= HQ_Y + HALF
        ) return TileType.Rock;
        return TileType.Grassland;
      });
      const player = makePlayer("p1", state);
      spawnHQ(state, player, HQ_X, HQ_Y);

      for (let dy = -HALF; dy <= HALF; dy++) {
        for (let dx = -HALF; dx <= HALF; dx++) {
          const tile = state.getTile(HQ_X + dx, HQ_Y + dy)!;
          expect(tile.type).toBe(TileType.Grassland);
          expect(tile.ownerID).toBe("p1");
        }
      }
      expect(player.score).toBe(TOTAL);
    });

    it("mixed terrain — Water/Rock converted, Forest/Grassland preserved, all 25 owned", () => {
      // Arrange specific tile types in the 5×5 zone
      const zoneTypes: TileType[][] = [
        [TileType.Water,     TileType.Forest,    TileType.Grassland, TileType.Rock,      TileType.Water],
        [TileType.Rock,      TileType.Grassland, TileType.Forest,    TileType.Water,     TileType.Grassland],
        [TileType.Grassland, TileType.Water,     TileType.Grassland, TileType.Rock,      TileType.Forest],
        [TileType.Forest,    TileType.Rock,      TileType.Water,     TileType.Grassland,  TileType.Highland],
        [TileType.Sand,      TileType.Desert,    TileType.Swamp,     TileType.Forest,    TileType.Rock],
      ];
      const state = buildState((x, y) => {
        const zx = x - (HQ_X - HALF);
        const zy = y - (HQ_Y - HALF);
        if (zx >= 0 && zx < SIZE && zy >= 0 && zy < SIZE) {
          return zoneTypes[zy][zx];
        }
        return TileType.Grassland;
      });
      const player = makePlayer("p1", state);
      spawnHQ(state, player, HQ_X, HQ_Y);

      let owned = 0;
      for (let dy = -HALF; dy <= HALF; dy++) {
        for (let dx = -HALF; dx <= HALF; dx++) {
          const tile = state.getTile(HQ_X + dx, HQ_Y + dy)!;
          // Water and Rock must be converted to Grassland
          expect(tile.type).not.toBe(TileType.Water);
          expect(tile.type).not.toBe(TileType.Rock);

          // All tiles must be owned
          expect(tile.ownerID).toBe("p1");
          owned++;
        }
      }
      expect(owned).toBe(TOTAL);

      // Walkable types should be preserved (not converted)
      // Row 0, col 1 was Forest → stays Forest
      expect(state.getTile(HQ_X - HALF + 1, HQ_Y - HALF)!.type).toBe(TileType.Forest);
      // Row 0, col 2 was Grassland → stays Grassland
      expect(state.getTile(HQ_X - HALF + 2, HQ_Y - HALF)!.type).toBe(TileType.Grassland);
      // Row 4, col 0 was Sand → stays Sand
      expect(state.getTile(HQ_X - HALF, HQ_Y + HALF)!.type).toBe(TileType.Sand);
      // Row 3, col 4 was Highland → stays Highland
      expect(state.getTile(HQ_X + HALF, HQ_Y - HALF + 3)!.type).toBe(TileType.Highland);
    });

    it("player score is exactly 25 (STARTING_SIZE²)", () => {
      // Mix some Water/Rock so we know they're being converted, not skipped
      const state = buildState((x, y) => {
        if (x === HQ_X && y === HQ_Y) return TileType.Water;
        if (x === HQ_X + 1 && y === HQ_Y) return TileType.Rock;
        if (x === HQ_X - 1 && y === HQ_Y + 1) return TileType.Water;
        return TileType.Forest;
      });
      const player = makePlayer("p1", state);
      spawnHQ(state, player, HQ_X, HQ_Y);

      expect(player.score).toBe(TOTAL);
    });

    it("all 25 tiles have isHQTerritory and structureType 'hq'", () => {
      const state = buildState((x, y) => {
        // Scatter Water/Rock through the zone
        if ((x + y) % 3 === 0) return TileType.Water;
        if ((x + y) % 5 === 0) return TileType.Rock;
        return TileType.Grassland;
      });
      const player = makePlayer("p1", state);
      spawnHQ(state, player, HQ_X, HQ_Y);

      for (let dy = -HALF; dy <= HALF; dy++) {
        for (let dx = -HALF; dx <= HALF; dx++) {
          const tile = state.getTile(HQ_X + dx, HQ_Y + dy)!;
          expect(tile.isHQTerritory).toBe(true);
          expect(tile.structureType).toBe("hq");
          expect(tile.ownerID).toBe("p1");
        }
      }
    });

    it("integration: joinPlayer yields full 25-tile territory across seeds", () => {
      for (const seed of [1, 42, 256, 777, 9999]) {
        const room = createRoomWithMap(seed);
        const { player } = joinPlayer(room, `s${seed}`);

        let ownedInZone = 0;
        for (let dy = -HALF; dy <= HALF; dy++) {
          for (let dx = -HALF; dx <= HALF; dx++) {
            const tile = room.state.getTile(player.hqX + dx, player.hqY + dy)!;
            expect(tile).toBeDefined();
            // No Water or Rock should remain in the HQ zone
            expect(tile.type).not.toBe(TileType.Water);
            expect(tile.type).not.toBe(TileType.Rock);
            expect(tile.ownerID).toBe(`s${seed}`);
            expect(tile.isHQTerritory).toBe(true);
            ownedInZone++;
          }
        }
        expect(ownedInZone).toBe(TOTAL);
        expect(player.score).toBe(TOTAL);
      }
    });
  });
});
