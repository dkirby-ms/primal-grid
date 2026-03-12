/**
 * Outpost Spacing — Bug #139
 *
 * Builders should not place an outpost on every claimed tile.
 * Outposts must be separated by at least MIN_OUTPOST_SPACING Manhattan
 * distance for the same player. The tile is still claimed, just without
 * the outpost structure when too close to an existing one.
 */
import { describe, it, expect, vi } from "vitest";
import { GameState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { stepBuilder, hasNearbyOutpost } from "../rooms/builderAI.js";
import {
  TERRITORY, PAWN, CREATURE_AI, MIN_OUTPOST_SPACING, SHAPE,
  TileType,
} from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): GameRoom {
  const room = Object.create(GameRoom.prototype) as GameRoom;
  room.state = new GameState();
  room.generateMap(seed);
  room.broadcast = vi.fn();
  room.playerViews = new Map();
  return room;
}

function fakeClient(sessionId: string) {
  return { sessionId, send: vi.fn() };
}

function joinPlayer(room: GameRoom, sessionId: string) {
  const client = fakeClient(sessionId);
  room.onJoin(client);
  return room.state.players.get(sessionId)!;
}

function addBuilder(
  room: GameRoom,
  id: string,
  ownerID: string,
  x: number,
  y: number,
  overrides: Partial<{
    currentState: string;
    buildProgress: number;
    targetX: number;
    targetY: number;
    buildMode: string;
  }> = {},
): CreatureState {
  const creature = new CreatureState();
  creature.id = id;
  creature.creatureType = "pawn_builder";
  creature.x = x;
  creature.y = y;
  creature.health = PAWN.BUILDER_HEALTH;
  creature.currentState = overrides.currentState ?? "idle";
  creature.ownerID = ownerID;
  creature.pawnType = "builder";
  creature.stamina = PAWN.BUILDER_MAX_STAMINA;
  creature.buildMode = overrides.buildMode ?? "outpost";
  creature.nextMoveTick = 0;
  if (overrides.buildProgress !== undefined) creature.buildProgress = overrides.buildProgress;
  if (overrides.targetX !== undefined) creature.targetX = overrides.targetX;
  if (overrides.targetY !== undefined) creature.targetY = overrides.targetY;
  room.state.creatures.set(id, creature);
  return creature;
}

function tickAI(room: GameRoom, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    room.state.tick += 1;
    room.state.creatures.forEach((creature) => {
      if (creature.pawnType === "builder" && room.state.tick >= creature.nextMoveTick) {
        creature.nextMoveTick = room.state.tick + CREATURE_AI.TICK_INTERVAL;
        stepBuilder(creature, room.state);
      }
    });
  }
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Bug #139 — Outpost Spacing", () => {
  describe("hasNearbyOutpost helper", () => {
    it("returns false when no outposts exist nearby", () => {
      const room = createRoomWithMap(42);
      const player = joinPlayer(room, "p1");
      // HQ tiles are structureType "hq", not "outpost"
      expect(hasNearbyOutpost(room.state, "p1", player.hqX, player.hqY)).toBe(false);
    });

    it("returns true when an outpost is within MIN_OUTPOST_SPACING", () => {
      const room = createRoomWithMap(42);
      const player = joinPlayer(room, "p1");

      // Place an outpost 2 tiles east of HQ
      const outpostX = player.hqX + 2;
      const outpostY = player.hqY;
      const tile = room.state.getTile(outpostX, outpostY);
      if (tile) {
        tile.ownerID = "p1";
        tile.structureType = "outpost";
      }

      // Check a tile 1 tile east of that outpost — within spacing
      expect(hasNearbyOutpost(room.state, "p1", outpostX + 1, outpostY)).toBe(true);
    });

    it("returns false when outpost is beyond MIN_OUTPOST_SPACING", () => {
      const room = createRoomWithMap(42);
      const player = joinPlayer(room, "p1");

      const outpostX = player.hqX + 2;
      const outpostY = player.hqY;
      const tile = room.state.getTile(outpostX, outpostY);
      if (tile) {
        tile.ownerID = "p1";
        tile.structureType = "outpost";
      }

      // Check a tile far enough away
      const farX = outpostX + MIN_OUTPOST_SPACING + 1;
      expect(hasNearbyOutpost(room.state, "p1", farX, outpostY)).toBe(false);
    });

    it("ignores outposts owned by a different player", () => {
      const room = createRoomWithMap(42);
      joinPlayer(room, "p1");
      joinPlayer(room, "p2");

      const p2 = room.state.players.get("p2")!;
      const tile = room.state.getTile(p2.hqX + 2, p2.hqY);
      if (tile) {
        tile.ownerID = "p2";
        tile.structureType = "outpost";
      }

      // p1 check at same location should not see p2's outpost
      expect(hasNearbyOutpost(room.state, "p1", p2.hqX + 3, p2.hqY)).toBe(false);
    });

    it("ignores non-outpost structures (hq, farm)", () => {
      const room = createRoomWithMap(42);
      const player = joinPlayer(room, "p1");

      // HQ tiles are structureType "hq" — should be ignored
      expect(hasNearbyOutpost(room.state, "p1", player.hqX + 1, player.hqY)).toBe(false);

      // Place a farm nearby
      const farmTile = room.state.getTile(player.hqX + 3, player.hqY);
      if (farmTile) {
        farmTile.ownerID = "p1";
        farmTile.structureType = "farm";
      }
      expect(hasNearbyOutpost(room.state, "p1", player.hqX + 4, player.hqY)).toBe(false);
    });

    it("detects outpost at exact MIN_OUTPOST_SPACING distance (boundary)", () => {
      const room = createRoomWithMap(42);
      const player = joinPlayer(room, "p1");

      const ox = player.hqX + 3;
      const oy = player.hqY + 3;
      const tile = room.state.getTile(ox, oy);
      if (tile) {
        tile.ownerID = "p1";
        tile.structureType = "outpost";
      }

      // Exactly MIN_OUTPOST_SPACING away (Manhattan)
      const checkX = ox + MIN_OUTPOST_SPACING;
      const checkTile = room.state.getTile(checkX, oy);
      if (checkTile) {
        // At exactly MIN_OUTPOST_SPACING distance, the outpost IS within the radius
        expect(hasNearbyOutpost(room.state, "p1", checkX, oy)).toBe(true);
      }
    });
  });

  describe("Builder placement respects spacing", () => {
    it("builder claims tile without outpost when too close to existing outpost", () => {
      const room = createRoomWithMap(42);
      const player = joinPlayer(room, "p1");

      // Find the territory edge for a valid build target
      const half = Math.floor(TERRITORY.STARTING_SIZE / 2);
      const edgeX = player.hqX + half + 1;
      const edgeY = player.hqY;

      // Place an existing outpost at the territory edge
      const existingOutpost = room.state.getTile(player.hqX + half, edgeY);
      if (existingOutpost) {
        existingOutpost.structureType = "outpost";
      }

      // Create a builder about to finish building on a tile within spacing
      const targetTile = room.state.getTile(edgeX, edgeY);
      if (!targetTile) return;

      // Manually set up a builder at the building-complete stage
      targetTile.ownerID = ""; // Unclaimed
      const builder = addBuilder(room, "b1", "p1", edgeX - 1, edgeY, {
        currentState: "building",
        buildProgress: PAWN.BUILD_TIME_TICKS - 1,
        targetX: edgeX,
        targetY: edgeY,
        buildMode: "outpost",
      });

      stepBuilder(builder, room.state);

      // Tile should be claimed...
      expect(targetTile.ownerID).toBe("p1");
      // ...but no outpost structure because it's too close
      expect(targetTile.structureType).not.toBe("outpost");
    });

    it("builder places outpost when far enough from existing outposts", () => {
      const room = createRoomWithMap(42);
      const player = joinPlayer(room, "p1");

      // Create a clear corridor of owned tiles far from any outpost
      const startX = player.hqX + 10;
      const startY = player.hqY;

      // Claim a line of territory to make it adjacent
      for (let dx = 3; dx <= 10; dx++) {
        const t = room.state.getTile(player.hqX + dx, startY);
        if (t) {
          t.ownerID = "p1";
          t.shapeHP = SHAPE.BLOCK_HP;
        }
      }

      const targetX = startX + 1;
      const targetTile = room.state.getTile(targetX, startY);
      if (!targetTile) return;
      targetTile.ownerID = "";
      targetTile.type = TileType.Grassland;
      targetTile.shapeHP = 0;

      const builder = addBuilder(room, "b1", "p1", startX, startY, {
        currentState: "building",
        buildProgress: PAWN.BUILD_TIME_TICKS - 1,
        targetX: targetX,
        targetY: startY,
        buildMode: "outpost",
      });

      stepBuilder(builder, room.state);

      expect(targetTile.ownerID).toBe("p1");
      expect(targetTile.structureType).toBe("outpost");
    });

    it("farm placement is unaffected by outpost spacing", () => {
      const room = createRoomWithMap(42);
      const player = joinPlayer(room, "p1");
      player.wood = 200;
      player.stone = 200;

      const half = Math.floor(TERRITORY.STARTING_SIZE / 2);
      const edgeX = player.hqX + half + 1;
      const edgeY = player.hqY;

      // Place an existing outpost right next to the build target
      const existingOutpost = room.state.getTile(player.hqX + half, edgeY);
      if (existingOutpost) {
        existingOutpost.structureType = "outpost";
      }

      const targetTile = room.state.getTile(edgeX, edgeY);
      if (!targetTile) return;
      targetTile.ownerID = "";

      const builder = addBuilder(room, "b1", "p1", edgeX - 1, edgeY, {
        currentState: "building",
        buildProgress: PAWN.BUILD_TIME_TICKS - 1,
        targetX: edgeX,
        targetY: edgeY,
        buildMode: "farm",
      });

      stepBuilder(builder, room.state);

      expect(targetTile.ownerID).toBe("p1");
      expect(targetTile.structureType).toBe("farm");
    });
  });

  describe("Outpost density over many ticks", () => {
    it("outposts are spread apart when builders claim many tiles", () => {
      const room = createRoomWithMap(42);
      const player = joinPlayer(room, "p1");
      player.wood = 500;
      player.stone = 500;

      const _half = Math.floor(TERRITORY.STARTING_SIZE / 2);
      const hqTile = { x: player.hqX, y: player.hqY };

      // Spawn 3 builders inside the HQ zone
      for (let i = 0; i < 3; i++) {
        addBuilder(room, `b${i}`, "p1", hqTile.x + i, hqTile.y);
      }

      // Run long enough for multiple build cycles
      tickAI(room, 400);

      // Collect all outpost positions
      const outposts: { x: number; y: number }[] = [];
      for (let i = 0; i < room.state.tiles.length; i++) {
        const tile = room.state.tiles.at(i)!;
        if (tile.ownerID === "p1" && tile.structureType === "outpost") {
          outposts.push({ x: tile.x, y: tile.y });
        }
      }

      // Verify spacing between all pairs of outposts
      for (let i = 0; i < outposts.length; i++) {
        for (let j = i + 1; j < outposts.length; j++) {
          const dist =
            Math.abs(outposts[i].x - outposts[j].x) +
            Math.abs(outposts[i].y - outposts[j].y);
          expect(dist).toBeGreaterThan(MIN_OUTPOST_SPACING);
        }
      }
    });

    it("tiles are still claimed even without outpost placement", () => {
      const room = createRoomWithMap(42);
      const player = joinPlayer(room, "p1");
      const initialScore = player.score;

      const _half = Math.floor(TERRITORY.STARTING_SIZE / 2);
      addBuilder(room, "b1", "p1", player.hqX, player.hqY);

      tickAI(room, 200);

      // Score should have increased (tiles claimed)
      expect(player.score).toBeGreaterThan(initialScore);

      // Count outposts vs total claimed tiles
      let outpostCount = 0;
      let claimedCount = 0;
      for (let i = 0; i < room.state.tiles.length; i++) {
        const tile = room.state.tiles.at(i)!;
        if (tile.ownerID === "p1") {
          claimedCount++;
          if (tile.structureType === "outpost") outpostCount++;
        }
      }

      // There should be fewer outposts than claimed tiles
      // (spacing means not every tile gets an outpost)
      expect(claimedCount).toBeGreaterThan(outpostCount);
    });
  });

  describe("MIN_OUTPOST_SPACING constant", () => {
    it("is exported and has a reasonable value", () => {
      expect(MIN_OUTPOST_SPACING).toBeGreaterThanOrEqual(3);
      expect(MIN_OUTPOST_SPACING).toBeLessThanOrEqual(6);
    });
  });
});
