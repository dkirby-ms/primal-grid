import { describe, it, expect, vi, beforeEach } from "vitest";
import { GameState, PlayerState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import {
  BUILDING_CAP_BONUS,
  PAWN_TYPES,
  TileType,
  isWaterTile,
} from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

interface MockClient {
  sessionId: string;
  send: ReturnType<typeof vi.fn>;
}

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

function giveResources(player: PlayerState, wood: number, stone: number) {
  player.wood = wood;
  player.stone = stone;
}

/** Place a building on a pre-prepared tile. */
function placeBuilding(
  room: GameRoom,
  client: MockClient,
  spot: { x: number; y: number },
  buildingType: string,
) {
  room.handlePlaceBuilding(client, { x: spot.x, y: spot.y, buildingType });
}

/** Spawn pawns until the cap is hit, return the count spawned. */
function fillPawnCap(
  room: GameRoom,
  playerId: string,
  player: PlayerState,
  pawnType: string,
): number {
  let spawned = 0;
  // Give unlimited resources
  giveResources(player, 99999, 99999);
  for (let i = 0; i < 100; i++) {
    const result = room.spawnPawnCore(playerId, player, pawnType);
    if (!result) break;
    spawned++;
    giveResources(player, 99999, 99999);
  }
  return spawned;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Building Spawn Caps", () => {
  let room: GameRoom;

  beforeEach(() => {
    room = createRoomWithMap(42);
  });

  // ── getBuildingCapBonus ──────────────────────────────────────────

  describe("getBuildingCapBonus", () => {
    it("returns 0 when player has no buildings", () => {
      const { player: _player } = joinPlayer(room, "p1");
      expect(room.getBuildingCapBonus("p1")).toBe(0);
    });

    it("returns 1 per farm", () => {
      const { client, player } = joinPlayer(room, "p1");
      const spots = prepareBuildableTiles(room, "p1", 2);
      giveResources(player, 99999, 99999);

      placeBuilding(room, client, spots[0], "farm");
      expect(room.getBuildingCapBonus("p1")).toBe(BUILDING_CAP_BONUS["farm"]);

      placeBuilding(room, client, spots[1], "farm");
      expect(room.getBuildingCapBonus("p1")).toBe(BUILDING_CAP_BONUS["farm"] * 2);
    });

    it("returns 2 per factory", () => {
      const { client, player } = joinPlayer(room, "p1");
      const spot = prepareBuildableTile(room, "p1");
      giveResources(player, 99999, 99999);

      placeBuilding(room, client, spot, "factory");
      expect(room.getBuildingCapBonus("p1")).toBe(BUILDING_CAP_BONUS["factory"]);
    });

    it("sums farm and factory bonuses", () => {
      const { client, player } = joinPlayer(room, "p1");
      const spots = prepareBuildableTiles(room, "p1", 2);
      giveResources(player, 99999, 99999);

      placeBuilding(room, client, spots[0], "farm");
      placeBuilding(room, client, spots[1], "factory");
      expect(room.getBuildingCapBonus("p1")).toBe(
        BUILDING_CAP_BONUS["farm"] + BUILDING_CAP_BONUS["factory"],
      );
    });

    it("only counts buildings owned by the requesting player", () => {
      const { client: c1, player: p1 } = joinPlayer(room, "p1");
      const { client: c2, player: p2 } = joinPlayer(room, "p2");
      const spot1 = prepareBuildableTile(room, "p1");
      const spot2 = prepareBuildableTile(room, "p2");
      giveResources(p1, 99999, 99999);
      giveResources(p2, 99999, 99999);

      placeBuilding(room, c1, spot1, "farm");
      placeBuilding(room, c2, spot2, "factory");

      expect(room.getBuildingCapBonus("p1")).toBe(BUILDING_CAP_BONUS["farm"]);
      expect(room.getBuildingCapBonus("p2")).toBe(BUILDING_CAP_BONUS["factory"]);
    });
  });

  // ── Spawn cap enforcement ───────────────────────────────────────

  describe("spawn cap enforcement", () => {
    it("rejects spawn when at base cap (no buildings)", () => {
      const { player } = joinPlayer(room, "p1");
      const baseCap = PAWN_TYPES["builder"]!.maxCount;

      const spawned = fillPawnCap(room, "p1", player, "builder");
      expect(spawned).toBe(baseCap);

      // One more should fail
      giveResources(player, 99999, 99999);
      const extra = room.spawnPawnCore("p1", player, "builder");
      expect(extra).toBeNull();
    });

    it("building a farm increases cap, allowing one more spawn", () => {
      const { client, player } = joinPlayer(room, "p1");
      const baseCap = PAWN_TYPES["builder"]!.maxCount;

      // Fill to base cap
      const spawned = fillPawnCap(room, "p1", player, "builder");
      expect(spawned).toBe(baseCap);

      // At cap — can't spawn
      giveResources(player, 99999, 99999);
      expect(room.spawnPawnCore("p1", player, "builder")).toBeNull();

      // Build a farm → +1 cap
      const spot = prepareBuildableTile(room, "p1");
      giveResources(player, 99999, 99999);
      placeBuilding(room, client, spot, "farm");

      // Now can spawn 1 more
      giveResources(player, 99999, 99999);
      const extra = room.spawnPawnCore("p1", player, "builder");
      expect(extra).not.toBeNull();

      // But not 2 more
      giveResources(player, 99999, 99999);
      expect(room.spawnPawnCore("p1", player, "builder")).toBeNull();
    });

    it("building a factory increases cap by 2", () => {
      const { client, player } = joinPlayer(room, "p1");
      const baseCap = PAWN_TYPES["defender"]!.maxCount;

      const spawned = fillPawnCap(room, "p1", player, "defender");
      expect(spawned).toBe(baseCap);

      // Build a factory → +2 cap
      const spot = prepareBuildableTile(room, "p1");
      giveResources(player, 99999, 99999);
      placeBuilding(room, client, spot, "factory");

      // Can now spawn 2 more defenders
      giveResources(player, 99999, 99999);
      expect(room.spawnPawnCore("p1", player, "defender")).not.toBeNull();
      giveResources(player, 99999, 99999);
      expect(room.spawnPawnCore("p1", player, "defender")).not.toBeNull();

      // But not a 3rd
      giveResources(player, 99999, 99999);
      expect(room.spawnPawnCore("p1", player, "defender")).toBeNull();
    });

    it("cap bonus applies globally to all pawn types", () => {
      const { client, player } = joinPlayer(room, "p1");
      const spot = prepareBuildableTile(room, "p1");
      giveResources(player, 99999, 99999);
      placeBuilding(room, client, spot, "farm");

      // Each pawn type should get +1
      for (const pawnType of ["builder", "defender", "attacker", "explorer"]) {
        const baseCap = PAWN_TYPES[pawnType]!.maxCount;
        // Count pre-existing pawns of this type (starting explorer)
        let existing = 0;
        room.state.creatures.forEach((c) => {
          if (c.ownerID === "p1" && c.pawnType === pawnType) existing++;
        });
        const spawned = fillPawnCap(room, "p1", player, pawnType);
        expect(spawned + existing).toBe(baseCap + BUILDING_CAP_BONUS["farm"]);
      }
    });
  });

  // ── Building destruction → cap decrease ─────────────────────────

  describe("building destruction reduces cap", () => {
    it("destroying a farm decreases cap; over-cap units survive but no new spawns", () => {
      const { client, player } = joinPlayer(room, "p1");

      // Build a farm
      const farmSpot = prepareBuildableTile(room, "p1");
      giveResources(player, 99999, 99999);
      placeBuilding(room, client, farmSpot, "farm");

      // Fill to boosted cap
      const boostedCap = PAWN_TYPES["builder"]!.maxCount + BUILDING_CAP_BONUS["farm"];
      const spawned = fillPawnCap(room, "p1", player, "builder");
      expect(spawned).toBe(boostedCap);

      // Destroy the farm by clearing structureType
      const farmTile = room.state.getTile(farmSpot.x, farmSpot.y)!;
      farmTile.structureType = "";

      // Cap is now back to base — can't spawn more
      giveResources(player, 99999, 99999);
      expect(room.spawnPawnCore("p1", player, "builder")).toBeNull();

      // But existing pawns still alive (count > base cap)
      let pawnCount = 0;
      room.state.creatures.forEach((c) => {
        if (c.ownerID === "p1" && c.pawnType === "builder") pawnCount++;
      });
      expect(pawnCount).toBe(boostedCap); // over-cap units survive
    });

    it("destroying a factory decreases cap by 2", () => {
      const { client, player } = joinPlayer(room, "p1");

      // Build a factory
      const factorySpot = prepareBuildableTile(room, "p1");
      giveResources(player, 99999, 99999);
      placeBuilding(room, client, factorySpot, "factory");

      // Spawn to boosted cap for attackers
      const baseCap = PAWN_TYPES["attacker"]!.maxCount;
      const spawned = fillPawnCap(room, "p1", player, "attacker");
      expect(spawned).toBe(baseCap + BUILDING_CAP_BONUS["factory"]);

      // Destroy the factory
      const factoryTile = room.state.getTile(factorySpot.x, factorySpot.y)!;
      factoryTile.structureType = "";

      // Back to base cap — no new spawns
      giveResources(player, 99999, 99999);
      expect(room.spawnPawnCore("p1", player, "attacker")).toBeNull();

      // Over-cap units survive
      let pawnCount = 0;
      room.state.creatures.forEach((c) => {
        if (c.ownerID === "p1" && c.pawnType === "attacker") pawnCount++;
      });
      expect(pawnCount).toBe(baseCap + BUILDING_CAP_BONUS["factory"]);
    });
  });

  // ── Constants validation ────────────────────────────────────────

  describe("constants", () => {
    it("BUILDING_CAP_BONUS has expected values", () => {
      expect(BUILDING_CAP_BONUS["farm"]).toBe(1);
      expect(BUILDING_CAP_BONUS["factory"]).toBe(2);
    });
  });
});
