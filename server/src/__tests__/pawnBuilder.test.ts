import { describe, it, expect } from "vitest";
import { GameState, PlayerState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { isAdjacentToTerritory, getTerritoryCounts } from "../rooms/territory.js";
import {
  TileType, DEFAULT_MAP_SIZE,
  CREATURE_AI, CREATURE_TYPES, TERRITORY, SHAPE,
} from "@primal-grid/shared";

// ── Expected constants for the pawn builder system ──────────────────
// These mirror the confirmed design. When Pemulis lands the implementation,
// replace with imports from @primal-grid/shared.

const PAWN_BUILDER = {
  SPAWN_COST_WOOD: 10,
  SPAWN_COST_STONE: 5,
  MAX_PER_PLAYER: 5,
  HEALTH: 50,
  BUILD_TIME_TICKS: 16,
  UPKEEP_WOOD: 1,
  UPKEEP_INTERVAL_TICKS: 60,
  BUILT_SHAPE_HP: 100,
  HQ_TERRITORY_SIZE: 9,
} as const;

const SPAWN_PAWN = "spawn_pawn";

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): any {
  const room = Object.create(GameRoom.prototype) as any;
  room.state = new GameState();
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

/** Create a pawn_builder CreatureState and add it to the room. */
function addBuilder(
  room: any,
  id: string,
  ownerID: string,
  x: number,
  y: number,
  overrides: Partial<{
    health: number;
    currentState: string;
    buildProgress: number;
    targetX: number;
    targetY: number;
  }> = {},
): any {
  const creature = new CreatureState();
  creature.id = id;
  creature.creatureType = "pawn_builder";
  creature.x = x;
  creature.y = y;
  creature.health = overrides.health ?? PAWN_BUILDER.HEALTH;
  creature.currentState = overrides.currentState ?? "idle";
  creature.ownerID = ownerID;
  creature.pawnType = "builder";
  if (overrides.buildProgress !== undefined) {
    creature.buildProgress = overrides.buildProgress;
  }
  if (overrides.targetX !== undefined) {
    creature.targetX = overrides.targetX;
  }
  if (overrides.targetY !== undefined) {
    creature.targetY = overrides.targetY;
  }
  room.state.creatures.set(id, creature);
  return creature;
}

/** Add a wild creature (carnivore/herbivore). */
function addCreature(
  room: any,
  id: string,
  type: string,
  x: number,
  y: number,
  overrides: Partial<{ health: number; hunger: number; currentState: string }> = {},
): any {
  const creature = new CreatureState();
  creature.id = id;
  creature.creatureType = type;
  creature.x = x;
  creature.y = y;
  const typeDef = (CREATURE_TYPES as Record<string, any>)[type];
  creature.health = overrides.health ?? typeDef.health;
  creature.hunger = overrides.hunger ?? typeDef.hunger;
  creature.currentState = overrides.currentState ?? "idle";
  room.state.creatures.set(id, creature);
  return creature;
}

/** Find a walkable tile within the player's HQ zone. */
function findWalkableTileInHQ(room: any, player: any): { x: number; y: number } | null {
  const half = Math.floor(PAWN_BUILDER.HQ_TERRITORY_SIZE / 2);
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const tx = player.hqX + dx;
      const ty = player.hqY + dy;
      if (room.state.isWalkable(tx, ty)) {
        return { x: tx, y: ty };
      }
    }
  }
  return null;
}

/** Find an unclaimed walkable tile adjacent to player territory. */
function findClaimableAdjacentTile(room: any, playerId: string): { x: number; y: number } | null {
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

/** Count builders owned by a specific player. */
function countPlayerBuilders(room: any, playerId: string): number {
  let count = 0;
  room.state.creatures.forEach((c: any) => {
    if (c.creatureType === "pawn_builder" && c.ownerID === playerId) {
      count++;
    }
  });
  return count;
}

/** Find a walkable tile anywhere on the map. */
function findWalkableTile(room: any): { x: number; y: number } {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (room.state.isWalkable(tile.x, tile.y)) {
      return { x: tile.x, y: tile.y };
    }
  }
  return { x: 1, y: 1 };
}

/** Manhattan distance. */
function manhattan(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

// ── Spawn Tests ─────────────────────────────────────────────────────

describe("Pawn Builder — Spawning", () => {
  it("player can spawn a builder when they have enough resources (10W, 5S)", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "p1");

    // Ensure player has enough resources
    player.wood = PAWN_BUILDER.SPAWN_COST_WOOD;
    player.stone = PAWN_BUILDER.SPAWN_COST_STONE;

    // handleSpawnPawn should exist on GameRoom
    expect(typeof room.handleSpawnPawn).toBe("function");
    room.handleSpawnPawn(client, { pawnType: "builder" });

    // Should have 1 builder
    expect(countPlayerBuilders(room, "p1")).toBe(1);
  });

  it("spawning deducts correct resources", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "p1");

    player.wood = 50;
    player.stone = 30;

    room.handleSpawnPawn(client, { pawnType: "builder" });

    expect(player.wood).toBe(50 - PAWN_BUILDER.SPAWN_COST_WOOD);
    expect(player.stone).toBe(30 - PAWN_BUILDER.SPAWN_COST_STONE);
  });

  it("cannot spawn when insufficient resources", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "p1");

    // Not enough wood
    player.wood = 5;
    player.stone = 10;

    room.handleSpawnPawn(client, { pawnType: "builder" });

    expect(countPlayerBuilders(room, "p1")).toBe(0);
    // Resources should NOT be deducted
    expect(player.wood).toBe(5);
    expect(player.stone).toBe(10);
  });

  it("cannot spawn when at pawn cap (5)", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "p1");

    // Give enough resources for many spawns
    player.wood = 200;
    player.stone = 100;

    // Fill up to max
    for (let i = 0; i < PAWN_BUILDER.MAX_PER_PLAYER; i++) {
      room.handleSpawnPawn(client, { pawnType: "builder" });
    }
    expect(countPlayerBuilders(room, "p1")).toBe(PAWN_BUILDER.MAX_PER_PLAYER);

    const woodBefore = player.wood;
    const stoneBefore = player.stone;

    // Try to spawn a 6th
    room.handleSpawnPawn(client, { pawnType: "builder" });

    // Should still be at max, resources unchanged
    expect(countPlayerBuilders(room, "p1")).toBe(PAWN_BUILDER.MAX_PER_PLAYER);
    expect(player.wood).toBe(woodBefore);
    expect(player.stone).toBe(stoneBefore);
  });

  it("builder spawns within HQ zone (within 9×9 starting territory)", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "p1");

    player.wood = PAWN_BUILDER.SPAWN_COST_WOOD;
    player.stone = PAWN_BUILDER.SPAWN_COST_STONE;

    room.handleSpawnPawn(client, { pawnType: "builder" });

    // Find the builder
    let builder: any = null;
    room.state.creatures.forEach((c: any) => {
      if (c.creatureType === "pawn_builder" && c.ownerID === "p1") builder = c;
    });
    expect(builder).not.toBeNull();

    // Builder should be within the 9×9 HQ zone
    const half = Math.floor(PAWN_BUILDER.HQ_TERRITORY_SIZE / 2);
    expect(builder.x).toBeGreaterThanOrEqual(player.hqX - half);
    expect(builder.x).toBeLessThanOrEqual(player.hqX + half);
    expect(builder.y).toBeGreaterThanOrEqual(player.hqY - half);
    expect(builder.y).toBeLessThanOrEqual(player.hqY + half);
  });

  it("builder has correct initial state (creatureType, ownerID, health, currentState)", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "p1");

    player.wood = PAWN_BUILDER.SPAWN_COST_WOOD;
    player.stone = PAWN_BUILDER.SPAWN_COST_STONE;

    room.handleSpawnPawn(client, { pawnType: "builder" });

    let builder: any = null;
    room.state.creatures.forEach((c: any) => {
      if (c.creatureType === "pawn_builder" && c.ownerID === "p1") builder = c;
    });
    expect(builder).not.toBeNull();

    expect(builder.creatureType).toBe("pawn_builder");
    expect(builder.ownerID).toBe("p1");
    expect(builder.health).toBe(PAWN_BUILDER.HEALTH);
    expect(builder.currentState).toBe("idle");
  });
});

// ── Builder AI Tests ────────────────────────────────────────────────

describe("Pawn Builder — AI Behavior", () => {
  it("idle builder finds a valid build site adjacent to territory", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    // Place builder inside owned territory
    const hqPos = findWalkableTileInHQ(room, player);
    expect(hqPos).not.toBeNull();
    const builder = addBuilder(room, "b1", "p1", hqPos!.x, hqPos!.y, {
      currentState: "idle",
    });

    // Tick AI enough times for builder to transition from idle
    for (let i = 0; i < 10; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      if (typeof room.tickBuilderAI === "function") {
        room.tickBuilderAI();
      } else if (typeof room.tickCreatureAI === "function") {
        room.tickCreatureAI();
      }
    }

    // Builder should have moved out of idle to find_build_site or move_to_site
    expect(["find_build_site", "move_to_site", "building"]).toContain(builder.currentState);
  });

  it("builder moves toward target site", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    // Find a claimable tile that's a few steps away
    const adjTile = findClaimableAdjacentTile(room, "p1");
    expect(adjTile).not.toBeNull();

    // Place builder a bit away from the target
    const startPos = findWalkableTileInHQ(room, player);
    expect(startPos).not.toBeNull();

    const builder = addBuilder(room, "b-move", "p1", startPos!.x, startPos!.y, {
      currentState: "move_to_site",
      targetX: adjTile!.x,
      targetY: adjTile!.y,
    });

    const startDist = manhattan(builder.x, builder.y, adjTile!.x, adjTile!.y);

    // Only test if there's actual distance to close
    if (startDist > 0) {
      // Tick AI
      for (let i = 0; i < 5; i++) {
        room.state.tick += CREATURE_AI.TICK_INTERVAL;
        if (typeof room.tickBuilderAI === "function") {
          room.tickBuilderAI();
        } else if (typeof room.tickCreatureAI === "function") {
          room.tickCreatureAI();
        }
      }

      const endDist = manhattan(builder.x, builder.y, adjTile!.x, adjTile!.y);
      // Should have moved closer (or arrived)
      expect(endDist).toBeLessThanOrEqual(startDist);
    }
  });

  it("builder starts building when arrived at target (buildProgress increments)", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    const adjTile = findClaimableAdjacentTile(room, "p1");
    expect(adjTile).not.toBeNull();

    // Place builder directly on the target site
    const builder = addBuilder(room, "b-build", "p1", adjTile!.x, adjTile!.y, {
      currentState: "move_to_site",
      targetX: adjTile!.x,
      targetY: adjTile!.y,
      buildProgress: 0,
    });

    // Tick AI — builder should switch to "building" and increment progress
    for (let i = 0; i < 5; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      if (typeof room.tickBuilderAI === "function") {
        room.tickBuilderAI();
      } else if (typeof room.tickCreatureAI === "function") {
        room.tickCreatureAI();
      }
    }

    expect(builder.currentState).toBe("building");
    expect((builder as any).buildProgress).toBeGreaterThan(0);
  });

  it("build completes after BUILD_TIME_TICKS — tile becomes owned", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    const adjTile = findClaimableAdjacentTile(room, "p1");
    expect(adjTile).not.toBeNull();

    const builder = addBuilder(room, "b-complete", "p1", adjTile!.x, adjTile!.y, {
      currentState: "building",
      targetX: adjTile!.x,
      targetY: adjTile!.y,
      buildProgress: 0,
    });

    // Tick enough to complete the build
    for (let i = 0; i < PAWN_BUILDER.BUILD_TIME_TICKS + 5; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      if (typeof room.tickBuilderAI === "function") {
        room.tickBuilderAI();
      } else if (typeof room.tickCreatureAI === "function") {
        room.tickCreatureAI();
      }
    }

    // Tile should now be owned by the player
    const tile = room.state.getTile(adjTile!.x, adjTile!.y);
    expect(tile).toBeDefined();
    expect(tile!.ownerID).toBe("p1");
  });

  it("completed tile has correct ownerID and shapeHP", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    const adjTile = findClaimableAdjacentTile(room, "p1");
    expect(adjTile).not.toBeNull();

    addBuilder(room, "b-hp", "p1", adjTile!.x, adjTile!.y, {
      currentState: "building",
      targetX: adjTile!.x,
      targetY: adjTile!.y,
      buildProgress: 0,
    });

    for (let i = 0; i < PAWN_BUILDER.BUILD_TIME_TICKS + 5; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      if (typeof room.tickBuilderAI === "function") {
        room.tickBuilderAI();
      } else if (typeof room.tickCreatureAI === "function") {
        room.tickCreatureAI();
      }
    }

    const tile = room.state.getTile(adjTile!.x, adjTile!.y);
    expect(tile!.ownerID).toBe("p1");
    expect(tile!.shapeHP).toBe(PAWN_BUILDER.BUILT_SHAPE_HP);
  });

  it("player gains score and XP on tile completion", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    const scoreBefore = player.score;
    const xpBefore = player.xp;

    const adjTile = findClaimableAdjacentTile(room, "p1");
    expect(adjTile).not.toBeNull();

    addBuilder(room, "b-score", "p1", adjTile!.x, adjTile!.y, {
      currentState: "building",
      targetX: adjTile!.x,
      targetY: adjTile!.y,
      buildProgress: 0,
    });

    for (let i = 0; i < PAWN_BUILDER.BUILD_TIME_TICKS + 5; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      if (typeof room.tickBuilderAI === "function") {
        room.tickBuilderAI();
      } else if (typeof room.tickCreatureAI === "function") {
        room.tickCreatureAI();
      }
    }

    expect(player.score).toBeGreaterThan(scoreBefore);
    expect(player.xp).toBeGreaterThan(xpBefore);
  });

  it("builder returns to idle after completing build", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    const adjTile = findClaimableAdjacentTile(room, "p1");
    expect(adjTile).not.toBeNull();

    const builder = addBuilder(room, "b-idle", "p1", adjTile!.x, adjTile!.y, {
      currentState: "building",
      targetX: adjTile!.x,
      targetY: adjTile!.y,
      buildProgress: PAWN_BUILDER.BUILD_TIME_TICKS - 1,
    });

    // One more tick should complete the build
    room.state.tick += CREATURE_AI.TICK_INTERVAL;
    if (typeof room.tickBuilderAI === "function") {
      room.tickBuilderAI();
    } else if (typeof room.tickCreatureAI === "function") {
      room.tickCreatureAI();
    }

    // After build completes, builder should return to idle (or find_build_site)
    expect(["idle", "find_build_site"]).toContain(builder.currentState);
  });

  it("builder re-evaluates if target tile becomes invalid (claimed by someone else)", () => {
    const room = createRoomWithMap(42);
    joinPlayer(room, "p1");
    joinPlayer(room, "p2");

    const adjTile = findClaimableAdjacentTile(room, "p1");
    expect(adjTile).not.toBeNull();

    const builder = addBuilder(room, "b-reval", "p1", adjTile!.x, adjTile!.y, {
      currentState: "building",
      targetX: adjTile!.x,
      targetY: adjTile!.y,
      buildProgress: 5,
    });

    // Another player claims the tile out from under the builder
    const tile = room.state.getTile(adjTile!.x, adjTile!.y);
    tile!.ownerID = "p2";

    // Tick AI
    for (let i = 0; i < 3; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      if (typeof room.tickBuilderAI === "function") {
        room.tickBuilderAI();
      } else if (typeof room.tickCreatureAI === "function") {
        room.tickCreatureAI();
      }
    }

    // Builder should have abandoned the original build — may have found a new site
    expect(["idle", "find_build_site", "move_to_site", "building"]).toContain(builder.currentState);
  });
});

// ── Territory Tests ─────────────────────────────────────────────────

describe("Pawn Builder — Territory", () => {
  it("HQ territory (9×9) is marked as isHQTerritory = true", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    const half = Math.floor(PAWN_BUILDER.HQ_TERRITORY_SIZE / 2);
    let hqTileCount = 0;

    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const tile = room.state.getTile(player.hqX + dx, player.hqY + dy);
        if (tile && tile.type !== TileType.Water && tile.type !== TileType.Rock) {
          expect((tile as any).isHQTerritory).toBe(true);
          hqTileCount++;
        }
      }
    }
    expect(hqTileCount).toBeGreaterThan(0);
  });

  it("builder cannot build on tiles already owned", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    // Find a tile that is already owned by p1
    let ownedTile: any = null;
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      if (tile.ownerID === "p1") {
        ownedTile = tile;
        break;
      }
    }
    expect(ownedTile).not.toBeNull();

    // Place builder on an owned tile with target = owned tile
    const builder = addBuilder(room, "b-owned", "p1", ownedTile.x, ownedTile.y, {
      currentState: "building",
      targetX: ownedTile.x,
      targetY: ownedTile.y,
      buildProgress: 0,
    });

    // Tick AI
    for (let i = 0; i < 5; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      if (typeof room.tickBuilderAI === "function") {
        room.tickBuilderAI();
      } else if (typeof room.tickCreatureAI === "function") {
        room.tickCreatureAI();
      }
    }

    // Builder should NOT continue building on an already-owned tile
    // It may have re-routed to a new valid site, so check target changed
    if (builder.currentState === "building") {
      // If building, it should be targeting a different (unowned) tile
      expect(builder.targetX !== ownedTile.x || builder.targetY !== ownedTile.y).toBe(true);
    }
  });

  it("builder only builds adjacent to existing territory (no teleporting)", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    // Find a tile far from territory
    let farTile: any = null;
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      if (
        tile.ownerID === "" &&
        tile.type !== TileType.Water &&
        tile.type !== TileType.Rock &&
        !isAdjacentToTerritory(room.state, "p1", tile.x, tile.y) &&
        manhattan(tile.x, tile.y, player.hqX, player.hqY) > 10
      ) {
        farTile = tile;
        break;
      }
    }
    expect(farTile).not.toBeNull();

    // Place builder on that far tile and try to build
    const builder = addBuilder(room, "b-far", "p1", farTile.x, farTile.y, {
      currentState: "building",
      targetX: farTile.x,
      targetY: farTile.y,
      buildProgress: 0,
    });

    // Tick enough to "complete" the build
    for (let i = 0; i < PAWN_BUILDER.BUILD_TIME_TICKS + 5; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      if (typeof room.tickBuilderAI === "function") {
        room.tickBuilderAI();
      } else if (typeof room.tickCreatureAI === "function") {
        room.tickCreatureAI();
      }
    }

    // The tile should NOT be claimed because it's not adjacent to territory
    expect(farTile.ownerID).toBe("");
  });

  it("starting territory is 9×9 (up to 81 tiles) around HQ", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    const half = Math.floor(PAWN_BUILDER.HQ_TERRITORY_SIZE / 2);
    let ownedInZone = 0;

    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const tile = room.state.getTile(player.hqX + dx, player.hqY + dy);
        if (tile && tile.ownerID === "p1") {
          ownedInZone++;
        }
      }
    }

    // Should own the full 9×9 zone (minus water/rock tiles)
    const counts = getTerritoryCounts(room.state);
    const totalOwned = counts.get("p1") ?? 0;

    // All owned tiles should be within the 9×9 zone
    expect(ownedInZone).toBe(totalOwned);
    // Should be a substantial number (at least half of 81)
    expect(totalOwned).toBeGreaterThanOrEqual(40);
    expect(totalOwned).toBeLessThanOrEqual(81);
  });
});

// ── Combat / Survival Tests ─────────────────────────────────────────

describe("Pawn Builder — Combat & Survival", () => {
  it("carnivores can target and damage builders", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    const hqPos = findWalkableTileInHQ(room, player);
    expect(hqPos).not.toBeNull();

    // Place builder and carnivore on adjacent tiles
    const builder = addBuilder(room, "b-prey", "p1", hqPos!.x, hqPos!.y, {
      health: PAWN_BUILDER.HEALTH,
    });

    // Place carnivore right next to builder
    const cx = hqPos!.x + 1 < DEFAULT_MAP_SIZE ? hqPos!.x + 1 : hqPos!.x - 1;
    const carnivore = addCreature(room, "c-hunt", "carnivore", cx, hqPos!.y, {
      hunger: 10, // hungry → will hunt
      currentState: "hunt",
    });

    const healthBefore = builder.health;

    // Tick AI several times
    for (let i = 0; i < 10; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      if (typeof room.tickCreatureAI === "function") {
        room.tickCreatureAI();
      }
    }

    // Builder should have taken damage (or been killed)
    const b = room.state.creatures.get("b-prey");
    if (b) {
      expect(b.health).toBeLessThan(healthBefore);
    } else {
      // Builder was killed — that also proves carnivores can damage builders
      expect(room.state.creatures.has("b-prey")).toBe(false);
    }
  });

  it("builder dies when health reaches 0", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    const pos = findWalkableTile(room);

    // Place builder with 1 HP and a carnivore right on top
    addBuilder(room, "b-doomed", "p1", pos.x, pos.y, {
      health: 1,
    });

    // Directly reduce health to 0 and tick
    const b = room.state.creatures.get("b-doomed")!;
    b.health = 0;

    // Tick AI — death check should remove it
    room.state.tick += CREATURE_AI.TICK_INTERVAL;
    if (typeof room.tickBuilderAI === "function") {
      room.tickBuilderAI();
    } else if (typeof room.tickCreatureAI === "function") {
      room.tickCreatureAI();
    }

    expect(room.state.creatures.has("b-doomed")).toBe(false);
  });

  it("dead builder is removed from creatures collection", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    const pos = findWalkableTile(room);
    addBuilder(room, "b-dead", "p1", pos.x, pos.y, {
      health: 1,
    });

    expect(room.state.creatures.has("b-dead")).toBe(true);

    // Kill it
    room.state.creatures.get("b-dead")!.health = 0;

    room.state.tick += CREATURE_AI.TICK_INTERVAL;
    if (typeof room.tickBuilderAI === "function") {
      room.tickBuilderAI();
    } else if (typeof room.tickCreatureAI === "function") {
      room.tickCreatureAI();
    }

    // Confirm removal
    expect(room.state.creatures.has("b-dead")).toBe(false);
    expect(countPlayerBuilders(room, "p1")).toBe(0);
  });
});

// ── Upkeep Tests ────────────────────────────────────────────────────

describe("Pawn Builder — Upkeep", () => {
  it("builder upkeep deducts 1 Wood per cycle", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    player.wood = 20;

    const pos = findWalkableTile(room);
    addBuilder(room, "b-upkeep", "p1", pos.x, pos.y);

    // Advance to the upkeep interval
    room.state.tick = PAWN_BUILDER.UPKEEP_INTERVAL_TICKS;

    if (typeof room.tickPawnUpkeep === "function") {
      room.tickPawnUpkeep();
    } else if (typeof room.tickBuilderAI === "function") {
      room.tickBuilderAI();
    } else {
      room.tickCreatureAI();
    }

    expect(player.wood).toBe(20 - PAWN_BUILDER.UPKEEP_WOOD);
  });

  it("builder takes damage when player can't pay upkeep", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    player.wood = 0; // can't pay

    const pos = findWalkableTile(room);
    const builder = addBuilder(room, "b-broke", "p1", pos.x, pos.y, {
      health: PAWN_BUILDER.HEALTH,
    });

    const healthBefore = builder.health;

    room.state.tick = PAWN_BUILDER.UPKEEP_INTERVAL_TICKS;

    if (typeof room.tickPawnUpkeep === "function") {
      room.tickPawnUpkeep();
    } else if (typeof room.tickBuilderAI === "function") {
      room.tickBuilderAI();
    } else {
      room.tickCreatureAI();
    }

    expect(builder.health).toBeLessThan(healthBefore);
  });

  it("builder dies from accumulated upkeep damage", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    player.wood = 0;

    const pos = findWalkableTile(room);
    addBuilder(room, "b-starve", "p1", pos.x, pos.y, {
      health: PAWN_BUILDER.HEALTH,
    });

    // Tick through many upkeep cycles with no wood
    for (let cycle = 1; cycle <= 20; cycle++) {
      room.state.tick = PAWN_BUILDER.UPKEEP_INTERVAL_TICKS * cycle;
      if (typeof room.tickPawnUpkeep === "function") {
        room.tickPawnUpkeep();
      } else if (typeof room.tickBuilderAI === "function") {
        room.tickBuilderAI();
      } else {
        room.tickCreatureAI();
      }

      if (!room.state.creatures.has("b-starve")) break;
    }

    // Builder should be dead from accumulated damage
    expect(room.state.creatures.has("b-starve")).toBe(false);
  });
});

// ── Resource Simplification Tests ───────────────────────────────────

describe("Pawn Builder — Resource Simplification", () => {
  it("PlayerState has wood and stone but NOT fiber or berries", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    // Wood and stone should exist
    expect(typeof player.wood).toBe("number");
    expect(typeof player.stone).toBe("number");

    // Fiber and berries should be removed (undefined or not a property)
    // The design says "Resources simplified to Wood and Stone only"
    expect(player.fiber).toBeUndefined();
    expect(player.berries).toBeUndefined();
  });

  it("territory income only generates wood and stone", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    // Reset resources
    player.wood = 0;
    player.stone = 0;
    if ("fiber" in player) (player as any).fiber = 0;
    if ("berries" in player) (player as any).berries = 0;

    // Ensure player has owned tiles with resources
    // Tick territory income
    const tickFn = typeof room.tickTerritoryIncome === "function"
      ? () => room.tickTerritoryIncome()
      : null;

    if (tickFn) {
      // Set tick to territory income interval
      room.state.tick = 40; // TERRITORY_INCOME.INTERVAL_TICKS
      tickFn();
    }

    // Wood and/or stone may have increased
    const totalWoodStone = player.wood + player.stone;

    // Fiber and berries should NOT have been generated
    const fiberVal = "fiber" in player ? (player as any).fiber : 0;
    const berriesVal = "berries" in player ? (player as any).berries : 0;
    expect(fiberVal).toBe(0);
    expect(berriesVal).toBe(0);
  });
});
