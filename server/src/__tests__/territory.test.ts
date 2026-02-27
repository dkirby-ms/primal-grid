import { describe, it, expect } from "vitest";
import { GameState, PlayerState, StructureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { isAdjacentToTerritory, getTerritoryCounts } from "../rooms/territory.js";
import {
  TERRITORY, TileType, ItemType, DEFAULT_MAP_SIZE,
} from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): any {
  const room = Object.create(GameRoom.prototype) as any;
  room.state = new GameState();
  room.nextStructureId = 0;
  room.generateMap(seed);
  return room;
}

function fakeClient(sessionId: string): any {
  return { sessionId };
}

function joinPlayer(room: any, sessionId: string) {
  const client = fakeClient(sessionId);
  room.onJoin(client);
  const player = room.state.players.get(sessionId)!;
  return { client, player };
}

/** Find an unclaimed walkable tile adjacent (cardinal) to the player's territory. */
function findClaimableAdjacentTile(room: any, playerId: string): { x: number; y: number } | null {
  const w = room.state.mapWidth;
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
function findNonAdjacentUnownedTile(room: any, playerId: string): { x: number; y: number } | null {
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
function findUnwalkableTile(room: any): { x: number; y: number } | null {
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
    it("player joins → HQ structure placed, 3×3 territory claimed, score reflects tiles", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");

      // HQ position set
      expect(player.hqX).toBeGreaterThanOrEqual(0);
      expect(player.hqY).toBeGreaterThanOrEqual(0);

      // HQ structure exists
      let hqFound = false;
      room.state.structures.forEach((s: any) => {
        if (s.structureType === ItemType.HQ && s.placedBy === "p1") {
          hqFound = true;
          expect(s.x).toBe(player.hqX);
          expect(s.y).toBe(player.hqY);
        }
      });
      expect(hqFound).toBe(true);

      // Territory claimed — count owned tiles
      const counts = getTerritoryCounts(room.state);
      const ownedCount = counts.get("p1") ?? 0;
      expect(ownedCount).toBeGreaterThan(0);
      // Can be up to 9 (3×3), but may be less if water/rock tiles in area
      expect(ownedCount).toBeLessThanOrEqual(TERRITORY.STARTING_SIZE * TERRITORY.STARTING_SIZE);

      // Score matches owned tile count
      expect(player.score).toBe(ownedCount);

      // Starting resources set
      expect(player.wood).toBe(TERRITORY.STARTING_WOOD);
      expect(player.stone).toBe(TERRITORY.STARTING_STONE);
      expect(player.berries).toBe(TERRITORY.STARTING_BERRIES);
    });
  });

  describe("territory adjacency", () => {
    it("cardinal neighbors count as adjacent, isolated tiles do not", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");
      const hx = player.hqX;
      const hy = player.hqY;

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

  describe("score tracking", () => {
    it("score matches actual tile count from HQ spawn", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");

      const counts = getTerritoryCounts(room.state);
      const actualOwned = counts.get("p1") ?? 0;
      expect(player.score).toBe(actualOwned);
    });
  });
});
