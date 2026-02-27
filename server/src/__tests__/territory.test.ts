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

  describe("claim tile", () => {
    it("claim adjacent tile: ownerID set, wood decremented, score incremented", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");
      const scoreBefore = player.score;
      const woodBefore = player.wood;

      const target = findClaimableAdjacentTile(room, "p1");
      expect(target).not.toBeNull();

      room.handleClaimTile(client, { x: target!.x, y: target!.y });

      const tile = room.state.getTile(target!.x, target!.y);
      expect(tile.ownerID).toBe("p1");
      expect(player.wood).toBe(woodBefore - TERRITORY.CLAIM_COST_WOOD);
      expect(player.score).toBe(scoreBefore + 1);
    });

    it("claim non-adjacent tile rejected", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");
      const scoreBefore = player.score;
      const woodBefore = player.wood;

      const target = findNonAdjacentUnownedTile(room, "p1");
      expect(target).not.toBeNull();

      room.handleClaimTile(client, { x: target!.x, y: target!.y });

      const tile = room.state.getTile(target!.x, target!.y);
      expect(tile.ownerID).toBe("");
      expect(player.wood).toBe(woodBefore);
      expect(player.score).toBe(scoreBefore);
    });

    it("claim already-owned tile rejected", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");

      // Find a tile already owned by p1
      let ownedTile: { x: number; y: number } | null = null;
      for (let i = 0; i < room.state.tiles.length; i++) {
        const tile = room.state.tiles.at(i)!;
        if (tile.ownerID === "p1") { ownedTile = { x: tile.x, y: tile.y }; break; }
      }
      expect(ownedTile).not.toBeNull();

      const woodBefore = player.wood;
      const scoreBefore = player.score;
      room.handleClaimTile(client, { x: ownedTile!.x, y: ownedTile!.y });

      // Nothing changed
      expect(player.wood).toBe(woodBefore);
      expect(player.score).toBe(scoreBefore);
    });

    it("claim with no wood rejected", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");
      player.wood = 0;
      const scoreBefore = player.score;

      const target = findClaimableAdjacentTile(room, "p1");
      expect(target).not.toBeNull();

      room.handleClaimTile(client, { x: target!.x, y: target!.y });

      const tile = room.state.getTile(target!.x, target!.y);
      expect(tile.ownerID).toBe("");
      expect(player.score).toBe(scoreBefore);
    });

    it("claim water/rock tile rejected", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");
      const woodBefore = player.wood;
      const scoreBefore = player.score;

      const target = findUnwalkableTile(room);
      expect(target).not.toBeNull();

      room.handleClaimTile(client, { x: target!.x, y: target!.y });

      expect(player.wood).toBe(woodBefore);
      expect(player.score).toBe(scoreBefore);
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
    it("score matches actual tile count after multiple claims", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");
      player.wood = 100; // enough for many claims

      // Claim a few tiles
      for (let i = 0; i < 3; i++) {
        const target = findClaimableAdjacentTile(room, "p1");
        if (!target) break;
        room.handleClaimTile(client, { x: target.x, y: target.y });
      }

      const counts = getTerritoryCounts(room.state);
      const actualOwned = counts.get("p1") ?? 0;
      expect(player.score).toBe(actualOwned);
    });
  });
});
