import { describe, it, expect, vi, beforeEach } from "vitest";
import { GameState, PlayerState, TileState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import {
  BUILDING_COSTS,
  BUILDING_INCOME,
  STRUCTURE_INCOME,
  TERRITORY,
  TileType,
  isWaterTile,
} from "@primal-grid/shared";
import type { PlaceBuildingPayload } from "@primal-grid/shared";

// ── Test types ──────────────────────────────────────────────────────

interface MockClient {
  sessionId: string;
  send: ReturnType<typeof vi.fn>;
}

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): GameRoom {
  const room = Object.create(GameRoom.prototype) as GameRoom;
  room.state = new GameState();
  room.generateMap(seed);
  room.broadcast = vi.fn();
  return room;
}

function fakeClient(sessionId: string): MockClient {
  return { sessionId, send: vi.fn() };
}

function joinPlayer(room: GameRoom, sessionId: string) {
  const client = fakeClient(sessionId);
  room.onJoin(client);
  const player = room.state.players.get(sessionId)!;
  return { client, player };
}

/**
 * Prepare a buildable tile: find a walkable, unowned tile and manually
 * assign it to the player with empty structureType.
 * (HQ territory tiles all have structureType="hq" so buildings can't
 * be placed there — players must expand territory first.)
 */
function prepareBuildableTile(
  room: GameRoom,
  playerId: string,
): { x: number; y: number } {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (
      tile.ownerID === "" &&
      !isWaterTile(tile.type) &&
      tile.type !== TileType.Rock
    ) {
      tile.ownerID = playerId;
      tile.structureType = "";
      return { x: tile.x, y: tile.y };
    }
  }
  throw new Error("No buildable tile found on map");
}

/**
 * Prepare multiple buildable tiles for the given player.
 */
function prepareBuildableTiles(
  room: GameRoom,
  playerId: string,
  count: number,
): { x: number; y: number }[] {
  const results: { x: number; y: number }[] = [];
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (
      tile.ownerID === "" &&
      !isWaterTile(tile.type) &&
      tile.type !== TileType.Rock
    ) {
      tile.ownerID = playerId;
      tile.structureType = "";
      results.push({ x: tile.x, y: tile.y });
      if (results.length >= count) break;
    }
  }
  return results;
}

/** Find a water or rock tile on the map. */
function findUnwalkableTile(room: GameRoom): { x: number; y: number } | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (isWaterTile(tile.type) || tile.type === TileType.Rock) {
      return { x: tile.x, y: tile.y };
    }
  }
  return null;
}

/** Give a player enough resources to place any building. */
function giveResources(player: PlayerState, wood: number, stone: number) {
  player.wood = wood;
  player.stone = stone;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Building Placement System", () => {
  let room: GameRoom;

  beforeEach(() => {
    room = createRoomWithMap(42);
  });

  // ── 1. Successful placement ─────────────────────────────────────

  describe("successful placement", () => {
    it("places a farm on an owned empty tile → structureType set, resources deducted", () => {
      const { client, player } = joinPlayer(room, "p1");
      const spot = prepareBuildableTile(room, "p1");

      giveResources(player, 100, 100);
      const woodBefore = player.wood;
      const stoneBefore = player.stone;

      room.handlePlaceBuilding(client, { x: spot.x, y: spot.y, buildingType: "farm" });

      const tile = room.state.getTile(spot.x, spot.y)!;
      expect(tile.structureType).toBe("farm");
      expect(player.wood).toBe(woodBefore - BUILDING_COSTS.farm.wood);
      expect(player.stone).toBe(stoneBefore - BUILDING_COSTS.farm.stone);
    });

    it("places a factory on an owned empty tile → structureType set, resources deducted", () => {
      const { client, player } = joinPlayer(room, "p1");
      const spot = prepareBuildableTile(room, "p1");

      giveResources(player, 100, 100);
      const woodBefore = player.wood;
      const stoneBefore = player.stone;

      room.handlePlaceBuilding(client, { x: spot.x, y: spot.y, buildingType: "factory" });

      const tile = room.state.getTile(spot.x, spot.y)!;
      expect(tile.structureType).toBe("factory");
      expect(player.wood).toBe(woodBefore - BUILDING_COSTS.factory.wood);
      expect(player.stone).toBe(stoneBefore - BUILDING_COSTS.factory.stone);
    });

    it("broadcasts a game_log on successful placement", () => {
      const { client, player } = joinPlayer(room, "p1");
      const spot = prepareBuildableTile(room, "p1");
      giveResources(player, 100, 100);

      room.handlePlaceBuilding(client, { x: spot.x, y: spot.y, buildingType: "farm" });

      expect(room.broadcast).toHaveBeenCalledWith(
        "game_log",
        expect.objectContaining({ type: "building" }),
      );
    });

    it("can place a building on an outpost tile (replaces outpost)", () => {
      const { client, player } = joinPlayer(room, "p1");
      const spot = prepareBuildableTile(room, "p1");
      giveResources(player, 100, 100);

      // Set the tile to outpost
      const tile = room.state.getTile(spot.x, spot.y)!;
      tile.structureType = "outpost";

      room.handlePlaceBuilding(client, { x: spot.x, y: spot.y, buildingType: "farm" });

      expect(tile.structureType).toBe("farm");
    });
  });

  // ── 2. Validation failures (7 paths) ───────────────────────────

  describe("validation failures", () => {
    it("rejects placement from an invalid player (nonexistent session ID)", () => {
      const ghost = fakeClient("nonexistent");
      joinPlayer(room, "p1"); // real player exists but ghost does not

      room.handlePlaceBuilding(ghost, { x: 0, y: 0, buildingType: "farm" });

      expect(ghost.send).toHaveBeenCalledWith(
        "game_log",
        expect.objectContaining({ type: "error" }),
      );
    });

    it("rejects placement on invalid tile coordinates (out of bounds)", () => {
      const { client, player } = joinPlayer(room, "p1");
      giveResources(player, 100, 100);

      room.handlePlaceBuilding(client, { x: -1, y: -1, buildingType: "farm" });

      expect(client.send).toHaveBeenCalledWith(
        "game_log",
        expect.objectContaining({ type: "error" }),
      );
    });

    it("rejects placement on a tile not owned by the player", () => {
      const { client: client1, player: player1 } = joinPlayer(room, "p1");
      const { player: _player2 } = joinPlayer(room, "p2");
      giveResources(player1, 100, 100);

      // Find a tile owned by p2
      let p2Tile: { x: number; y: number } | null = null;
      for (let i = 0; i < room.state.tiles.length; i++) {
        const tile = room.state.tiles.at(i)!;
        if (tile.ownerID === "p2") {
          p2Tile = { x: tile.x, y: tile.y };
          break;
        }
      }
      expect(p2Tile).not.toBeNull();

      room.handlePlaceBuilding(client1, { x: p2Tile!.x, y: p2Tile!.y, buildingType: "farm" });

      expect(client1.send).toHaveBeenCalledWith(
        "game_log",
        expect.objectContaining({ type: "error" }),
      );
    });

    it("rejects placement on a tile that already has a structure (farm)", () => {
      const { client, player } = joinPlayer(room, "p1");
      const spot = prepareBuildableTile(room, "p1");
      giveResources(player, 200, 200);

      // Place a farm first
      room.handlePlaceBuilding(client, { x: spot.x, y: spot.y, buildingType: "farm" });
      expect(room.state.getTile(spot.x, spot.y)!.structureType).toBe("farm");

      // Try to place another building on same tile
      room.handlePlaceBuilding(client, { x: spot.x, y: spot.y, buildingType: "factory" });

      expect(client.send).toHaveBeenCalledWith(
        "game_log",
        expect.objectContaining({ type: "error" }),
      );
      // structureType unchanged
      expect(room.state.getTile(spot.x, spot.y)!.structureType).toBe("farm");
    });

    it("rejects placement on a tile that has an HQ structure", () => {
      const { client, player } = joinPlayer(room, "p1");
      giveResources(player, 200, 200);

      // The HQ tile has structureType "hq"
      const hqTile = room.state.getTile(player.hqX, player.hqY)!;
      expect(hqTile.structureType).toBe("hq");

      room.handlePlaceBuilding(client, { x: player.hqX, y: player.hqY, buildingType: "farm" });

      expect(client.send).toHaveBeenCalledWith(
        "game_log",
        expect.objectContaining({ type: "error" }),
      );
      expect(hqTile.structureType).toBe("hq");
    });

    it("rejects placement on a non-walkable tile (water/rock)", () => {
      const { client, player } = joinPlayer(room, "p1");
      giveResources(player, 100, 100);

      const unwalkable = findUnwalkableTile(room)!;
      expect(unwalkable).not.toBeNull();

      // Force the tile to be owned by p1 (water tiles aren't normally owned)
      const tile = room.state.getTile(unwalkable.x, unwalkable.y)!;
      tile.ownerID = "p1";

      room.handlePlaceBuilding(client, {
        x: unwalkable.x,
        y: unwalkable.y,
        buildingType: "farm",
      });

      expect(client.send).toHaveBeenCalledWith(
        "game_log",
        expect.objectContaining({ type: "error" }),
      );
    });

    it("rejects an invalid building type", () => {
      const { client, player } = joinPlayer(room, "p1");
      const spot = prepareBuildableTile(room, "p1");
      giveResources(player, 100, 100);

      room.handlePlaceBuilding(client, {
        x: spot.x,
        y: spot.y,
        buildingType: "cannon" as "farm",
      });

      expect(client.send).toHaveBeenCalledWith(
        "game_log",
        expect.objectContaining({ type: "error" }),
      );
    });

    it("rejects placement when player has insufficient resources", () => {
      const { client, player } = joinPlayer(room, "p1");
      const spot = prepareBuildableTile(room, "p1");

      // Set resources below farm cost (12 wood, 6 stone)
      giveResources(player, 5, 5);

      room.handlePlaceBuilding(client, { x: spot.x, y: spot.y, buildingType: "farm" });

      expect(client.send).toHaveBeenCalledWith(
        "game_log",
        expect.objectContaining({ type: "error" }),
      );
      // Resources unchanged
      expect(player.wood).toBe(5);
      expect(player.stone).toBe(5);
      // No structure placed
      expect(room.state.getTile(spot.x, spot.y)!.structureType).toBe("");
    });

    it("rejects when player has enough wood but not enough stone", () => {
      const { client, player } = joinPlayer(room, "p1");
      const spot = prepareBuildableTile(room, "p1");

      giveResources(player, 100, 0);

      room.handlePlaceBuilding(client, { x: spot.x, y: spot.y, buildingType: "farm" });

      expect(client.send).toHaveBeenCalledWith(
        "game_log",
        expect.objectContaining({ type: "error" }),
      );
      expect(player.wood).toBe(100); // unchanged
    });

    it("rejects when player has enough stone but not enough wood", () => {
      const { client, player } = joinPlayer(room, "p1");
      const spot = prepareBuildableTile(room, "p1");

      giveResources(player, 0, 100);

      room.handlePlaceBuilding(client, { x: spot.x, y: spot.y, buildingType: "farm" });

      expect(client.send).toHaveBeenCalledWith(
        "game_log",
        expect.objectContaining({ type: "error" }),
      );
      expect(player.stone).toBe(100); // unchanged
    });
  });

  // ── 3. Building income ──────────────────────────────────────────

  describe("building income", () => {
    it("farm adds +1W +1S per income tick", () => {
      const { client, player } = joinPlayer(room, "p1");
      const spot = prepareBuildableTile(room, "p1");
      giveResources(player, 100, 100);

      room.handlePlaceBuilding(client, { x: spot.x, y: spot.y, buildingType: "farm" });

      // Set tick to trigger income
      const woodBefore = player.wood;
      const stoneBefore = player.stone;
      room.state.tick = STRUCTURE_INCOME.INTERVAL_TICKS;
      room.tickStructureIncome();

      // HQ base income + farm income
      expect(player.wood).toBe(woodBefore + STRUCTURE_INCOME.HQ_WOOD + BUILDING_INCOME.farm.wood);
      expect(player.stone).toBe(
        stoneBefore + STRUCTURE_INCOME.HQ_STONE + BUILDING_INCOME.farm.stone,
      );
    });

    it("factory adds +2W +1S per income tick", () => {
      const { client, player } = joinPlayer(room, "p1");
      const spot = prepareBuildableTile(room, "p1");
      giveResources(player, 100, 100);

      room.handlePlaceBuilding(client, { x: spot.x, y: spot.y, buildingType: "factory" });

      const woodBefore = player.wood;
      const stoneBefore = player.stone;
      room.state.tick = STRUCTURE_INCOME.INTERVAL_TICKS;
      room.tickStructureIncome();

      expect(player.wood).toBe(
        woodBefore + STRUCTURE_INCOME.HQ_WOOD + BUILDING_INCOME.factory.wood,
      );
      expect(player.stone).toBe(
        stoneBefore + STRUCTURE_INCOME.HQ_STONE + BUILDING_INCOME.factory.stone,
      );
    });

    it("multiple buildings stack income correctly", () => {
      const { client, player } = joinPlayer(room, "p1");
      const spots = prepareBuildableTiles(room, "p1", 3);

      giveResources(player, 500, 500);

      // Place 2 farms and 1 factory
      room.handlePlaceBuilding(client, { x: spots[0].x, y: spots[0].y, buildingType: "farm" });
      room.handlePlaceBuilding(client, { x: spots[1].x, y: spots[1].y, buildingType: "farm" });
      room.handlePlaceBuilding(client, { x: spots[2].x, y: spots[2].y, buildingType: "factory" });

      const woodBefore = player.wood;
      const stoneBefore = player.stone;
      room.state.tick = STRUCTURE_INCOME.INTERVAL_TICKS;
      room.tickStructureIncome();

      const expectedWoodIncome =
        STRUCTURE_INCOME.HQ_WOOD +
        2 * BUILDING_INCOME.farm.wood +
        1 * BUILDING_INCOME.factory.wood;
      const expectedStoneIncome =
        STRUCTURE_INCOME.HQ_STONE +
        2 * BUILDING_INCOME.farm.stone +
        1 * BUILDING_INCOME.factory.stone;

      expect(player.wood).toBe(woodBefore + expectedWoodIncome);
      expect(player.stone).toBe(stoneBefore + expectedStoneIncome);
    });

    it("income does NOT fire on non-interval ticks", () => {
      const { client, player } = joinPlayer(room, "p1");
      const spot = prepareBuildableTile(room, "p1");
      giveResources(player, 100, 100);

      room.handlePlaceBuilding(client, { x: spot.x, y: spot.y, buildingType: "farm" });

      const woodBefore = player.wood;
      const stoneBefore = player.stone;
      room.state.tick = STRUCTURE_INCOME.INTERVAL_TICKS + 1; // off-interval
      room.tickStructureIncome();

      expect(player.wood).toBe(woodBefore);
      expect(player.stone).toBe(stoneBefore);
    });

    it("HQ-only income (no buildings) gives base rate", () => {
      const { player } = joinPlayer(room, "p1");
      giveResources(player, 0, 0);

      room.state.tick = STRUCTURE_INCOME.INTERVAL_TICKS;
      room.tickStructureIncome();

      expect(player.wood).toBe(STRUCTURE_INCOME.HQ_WOOD);
      expect(player.stone).toBe(STRUCTURE_INCOME.HQ_STONE);
    });
  });

  // ── 4. Building removal on contestation ─────────────────────────

  describe("building removal on ownership change", () => {
    it("building is cleared when tile ownership changes via contestation", () => {
      const { client, player: p1 } = joinPlayer(room, "p1");
      joinPlayer(room, "p2");

      const spot = prepareBuildableTile(room, "p1");
      giveResources(p1, 100, 100);
      room.handlePlaceBuilding(client, { x: spot.x, y: spot.y, buildingType: "farm" });

      const tile = room.state.getTile(spot.x, spot.y)!;
      expect(tile.structureType).toBe("farm");

      // Simulate contestation: p2 starts claiming p1's tile
      tile.claimingPlayerID = "p2";
      tile.claimProgress = 1;

      // Advance claim progress to completion
      for (let i = 1; i < TERRITORY.CLAIM_TICKS; i++) {
        room.tickClaiming();
      }

      // After claim completes, building should be removed and ownership transferred
      expect(tile.ownerID).toBe("p2");
      expect(tile.structureType).toBe("");
    });

    it("HQ structure is NOT cleared when tile ownership changes", () => {
      const { player: p1 } = joinPlayer(room, "p1");
      joinPlayer(room, "p2");

      const hqTile = room.state.getTile(p1.hqX, p1.hqY)!;
      expect(hqTile.structureType).toBe("hq");

      // Simulate contestation of HQ tile
      hqTile.claimingPlayerID = "p2";
      hqTile.claimProgress = 1;

      for (let i = 1; i < TERRITORY.CLAIM_TICKS; i++) {
        room.tickClaiming();
      }

      // HQ structure preserved even after ownership change
      expect(hqTile.ownerID).toBe("p2");
      expect(hqTile.structureType).toBe("hq");
    });

    it("factory is cleared on contestation, just like farm", () => {
      const { client, player: p1 } = joinPlayer(room, "p1");
      joinPlayer(room, "p2");

      const spot = prepareBuildableTile(room, "p1");
      giveResources(p1, 100, 100);
      room.handlePlaceBuilding(client, { x: spot.x, y: spot.y, buildingType: "factory" });

      const tile = room.state.getTile(spot.x, spot.y)!;
      expect(tile.structureType).toBe("factory");

      tile.claimingPlayerID = "p2";
      tile.claimProgress = 1;

      for (let i = 1; i < TERRITORY.CLAIM_TICKS; i++) {
        room.tickClaiming();
      }

      expect(tile.ownerID).toBe("p2");
      expect(tile.structureType).toBe("");
    });
  });
});
