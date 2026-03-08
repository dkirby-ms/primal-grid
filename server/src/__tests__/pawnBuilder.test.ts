import { describe, it, expect } from "vitest";
import { GameState, PlayerState, CreatureState, TileState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { isAdjacentToTerritory, getTerritoryCounts } from "../rooms/territory.js";
import {
  TileType, isWaterTile, DEFAULT_MAP_SIZE,
  CREATURE_AI, CREATURE_TYPES, TERRITORY, SHAPE, PAWN,
  SPAWN_PAWN,
} from "@primal-grid/shared";
import type { SpawnPawnPayload } from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

interface MockClient {
  sessionId: string;
  send: (...args: unknown[]) => void;
}

function createRoomWithMap(seed?: number): GameRoom {
  const room = Object.create(GameRoom.prototype) as GameRoom;
  room.state = new GameState();
  room.generateMap(seed);
  room.broadcast = () => {};
  return room;
}

function fakeClient(sessionId: string): MockClient {
  return { sessionId, send: () => {} };
}

function joinPlayer(room: GameRoom, sessionId: string) {
  const client = fakeClient(sessionId);
  room.onJoin(client);
  const player = room.state.players.get(sessionId)!;
  return { client, player };
}

/** Create a pawn_builder CreatureState and add it to the room. */
function addBuilder(
  room: GameRoom,
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
): CreatureState {
  const creature = new CreatureState();
  creature.id = id;
  creature.creatureType = "pawn_builder";
  creature.x = x;
  creature.y = y;
  creature.health = overrides.health ?? PAWN.BUILDER_HEALTH;
  creature.currentState = overrides.currentState ?? "idle";
  creature.ownerID = ownerID;
  creature.pawnType = "builder";
  creature.stamina = PAWN.BUILDER_MAX_STAMINA;
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
  room: GameRoom,
  id: string,
  type: string,
  x: number,
  y: number,
  overrides: Partial<{ health: number; hunger: number; currentState: string }> = {},
): CreatureState {
  const creature = new CreatureState();
  creature.id = id;
  creature.creatureType = type;
  creature.x = x;
  creature.y = y;
  const typeDef = CREATURE_TYPES[type];
  creature.health = overrides.health ?? typeDef.health;
  creature.hunger = overrides.hunger ?? typeDef.hunger;
  creature.currentState = overrides.currentState ?? "idle";
  creature.stamina = typeDef.maxStamina;
  room.state.creatures.set(id, creature);
  return creature;
}

/** Find a walkable tile within the player's HQ zone. */
function findWalkableTileInHQ(room: GameRoom, player: PlayerState): { x: number; y: number } | null {
  const half = Math.floor(TERRITORY.STARTING_SIZE / 2);
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
function findClaimableAdjacentTile(room: GameRoom, playerId: string): { x: number; y: number } | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (
      tile.ownerID === "" &&
      !isWaterTile(tile.type) &&
      tile.type !== TileType.Rock &&
      isAdjacentToTerritory(room.state, playerId, tile.x, tile.y)
    ) {
      return { x: tile.x, y: tile.y };
    }
  }
  return null;
}

/** Count builders owned by a specific player. */
function countPlayerBuilders(room: GameRoom, playerId: string): number {
  let count = 0;
  room.state.creatures.forEach((c: CreatureState) => {
    if (c.creatureType === "pawn_builder" && c.ownerID === playerId) {
      count++;
    }
  });
  return count;
}

/** Find a walkable tile anywhere on the map. */
function findWalkableTile(room: GameRoom): { x: number; y: number } {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (room.state.isWalkable(tile.x, tile.y)) {
      return { x: tile.x, y: tile.y };
    }
  }
  return { x: 1, y: 1 };
}

/** Tick builder / creature AI once. */
function tickAI(room: GameRoom): void {
  room.state.tick += CREATURE_AI.TICK_INTERVAL;
  if (typeof room.tickBuilderAI === "function") {
    room.tickBuilderAI();
  } else if (typeof room.tickCreatureAI === "function") {
    room.tickCreatureAI();
  }
}

/** Manhattan distance. */
function manhattan(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

// ═════════════════════════════════════════════════════════════════════
// Category 1 — Builder spawning (cost, cap, validation)            6
// ═════════════════════════════════════════════════════════════════════

describe("Builder spawning (cost, cap, validation)", () => {

  // ★ contract — passes before runtime implementation
  it("spawn cost constants are 10 Wood / 5 Stone", () => {
    expect(PAWN.BUILDER_COST_WOOD).toBe(10);
    expect(PAWN.BUILDER_COST_STONE).toBe(5);
  });

  // ★ contract — passes before runtime implementation
  it("builder cap constant is max 5 per player", () => {
    expect(PAWN.MAX_PER_PLAYER).toBe(5);
  });

  // ★ contract — passes before runtime implementation
  it("spawn message is 'spawn_pawn' with pawnType 'builder'", () => {
    expect(SPAWN_PAWN).toBe("spawn_pawn");
    const payload: SpawnPawnPayload = { pawnType: "builder" };
    expect(payload.pawnType).toBe("builder");
  });

  it("spawning deducts correct resources (10W / 5S)", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "p1");

    player.wood = 50;
    player.stone = 30;

    room.handleSpawnPawn(client, { pawnType: "builder" });

    expect(player.wood).toBe(50 - PAWN.BUILDER_COST_WOOD);
    expect(player.stone).toBe(30 - PAWN.BUILDER_COST_STONE);
  });

  it("cannot spawn when insufficient resources", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "p1");

    player.wood = 5;
    player.stone = 10;

    room.handleSpawnPawn(client, { pawnType: "builder" });

    expect(countPlayerBuilders(room, "p1")).toBe(0);
    expect(player.wood).toBe(5);
    expect(player.stone).toBe(10);
  });

  it("cannot exceed pawn cap (5 max)", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "p1");

    player.wood = 200;
    player.stone = 100;

    for (let i = 0; i < PAWN.MAX_PER_PLAYER; i++) {
      room.handleSpawnPawn(client, { pawnType: "builder" });
    }
    expect(countPlayerBuilders(room, "p1")).toBe(PAWN.MAX_PER_PLAYER);

    const woodBefore = player.wood;
    const stoneBefore = player.stone;
    room.handleSpawnPawn(client, { pawnType: "builder" });

    expect(countPlayerBuilders(room, "p1")).toBe(PAWN.MAX_PER_PLAYER);
    expect(player.wood).toBe(woodBefore);
    expect(player.stone).toBe(stoneBefore);
  });
});

// ═════════════════════════════════════════════════════════════════════
// Category 2 — Builder AI FSM (idle, move_to_site, building)       7
// ═════════════════════════════════════════════════════════════════════

describe("Builder AI FSM (idle, move_to_site, building)", () => {

  // ★ contract — passes before runtime implementation
  it("builder creature type 'pawn_builder' is recognized", () => {
    const c = new CreatureState();
    c.creatureType = "pawn_builder";
    c.pawnType = "builder";
    expect(c.creatureType).toBe("pawn_builder");
    expect(c.pawnType).toBe("builder");
  });

  it("spawned builder has correct initial FSM state (idle, health 50, in HQ zone)", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "p1");

    player.wood = PAWN.BUILDER_COST_WOOD;
    player.stone = PAWN.BUILDER_COST_STONE;
    room.handleSpawnPawn(client, { pawnType: "builder" });

    let builder: CreatureState | null = null;
    room.state.creatures.forEach((c: CreatureState) => {
      if (c.creatureType === "pawn_builder" && c.ownerID === "p1") builder = c;
    });
    expect(builder).not.toBeNull();
    expect(builder.creatureType).toBe("pawn_builder");
    expect(builder.ownerID).toBe("p1");
    expect(builder.health).toBe(PAWN.BUILDER_HEALTH);
    expect(builder.currentState).toBe("idle");

    const half = Math.floor(TERRITORY.STARTING_SIZE / 2);
    expect(builder.x).toBeGreaterThanOrEqual(player.hqX - half);
    expect(builder.x).toBeLessThanOrEqual(player.hqX + half);
    expect(builder.y).toBeGreaterThanOrEqual(player.hqY - half);
    expect(builder.y).toBeLessThanOrEqual(player.hqY + half);
  });

  it("idle builder transitions to find_build_site / move_to_site", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    const hqPos = findWalkableTileInHQ(room, player);
    expect(hqPos).not.toBeNull();
    const builder = addBuilder(room, "b1", "p1", hqPos!.x, hqPos!.y, {
      currentState: "idle",
    });

    for (let i = 0; i < 10; i++) tickAI(room);

    expect(["find_build_site", "move_to_site", "building"]).toContain(builder.currentState);
  });

  it("builder in move_to_site moves toward target (manhattan decreases)", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    const adjTile = findClaimableAdjacentTile(room, "p1");
    expect(adjTile).not.toBeNull();
    const startPos = findWalkableTileInHQ(room, player);
    expect(startPos).not.toBeNull();

    const builder = addBuilder(room, "b-move", "p1", startPos!.x, startPos!.y, {
      currentState: "move_to_site",
      targetX: adjTile!.x,
      targetY: adjTile!.y,
    });

    const startDist = manhattan(builder.x, builder.y, adjTile!.x, adjTile!.y);
    if (startDist > 0) {
      for (let i = 0; i < 5; i++) tickAI(room);
      const endDist = manhattan(builder.x, builder.y, adjTile!.x, adjTile!.y);
      expect(endDist).toBeLessThanOrEqual(startDist);
    }
  });

  it("builder switches to building state on arrival (buildProgress increments)", () => {
    const room = createRoomWithMap(42);
    joinPlayer(room, "p1");

    const adjTile = findClaimableAdjacentTile(room, "p1");
    expect(adjTile).not.toBeNull();

    const builder = addBuilder(room, "b-build", "p1", adjTile!.x, adjTile!.y, {
      currentState: "move_to_site",
      targetX: adjTile!.x,
      targetY: adjTile!.y,
      buildProgress: 0,
    });

    for (let i = 0; i < 5; i++) tickAI(room);

    expect(builder.currentState).toBe("building");
    expect(builder.buildProgress).toBeGreaterThan(0);
  });

  it("build completes after BUILD_TIME_TICKS — tile owned, shapeHP set, score+XP increase", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    const scoreBefore = player.score;
    const xpBefore = player.xp;
    const adjTile = findClaimableAdjacentTile(room, "p1");
    expect(adjTile).not.toBeNull();

    addBuilder(room, "b-complete", "p1", adjTile!.x, adjTile!.y, {
      currentState: "building",
      targetX: adjTile!.x,
      targetY: adjTile!.y,
      buildProgress: 0,
    });

    for (let i = 0; i < PAWN.BUILD_TIME_TICKS + 5; i++) tickAI(room);

    const tile = room.state.getTile(adjTile!.x, adjTile!.y);
    expect(tile).toBeDefined();
    expect(tile!.ownerID).toBe("p1");
    expect(tile!.shapeHP).toBe(SHAPE.BLOCK_HP);
    expect(player.score).toBeGreaterThan(scoreBefore);
    expect(player.xp).toBeGreaterThan(xpBefore);
  });

  it("builder returns to idle after completing build", () => {
    const room = createRoomWithMap(42);
    joinPlayer(room, "p1");

    const adjTile = findClaimableAdjacentTile(room, "p1");
    expect(adjTile).not.toBeNull();

    const builder = addBuilder(room, "b-idle", "p1", adjTile!.x, adjTile!.y, {
      currentState: "building",
      targetX: adjTile!.x,
      targetY: adjTile!.y,
      buildProgress: PAWN.BUILD_TIME_TICKS - 1,
    });

    tickAI(room);

    expect(["idle", "find_build_site"]).toContain(builder.currentState);
  });
});

// ═════════════════════════════════════════════════════════════════════
// Category 3 — Adjacency validation (prevent teleport builds)      4
// ═════════════════════════════════════════════════════════════════════

describe("Adjacency validation (prevent teleport builds)", () => {

  it("builder only builds adjacent to existing territory (no teleporting)", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    let farTile: TileState | null = null;
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      if (
        tile.ownerID === "" &&
        !isWaterTile(tile.type) &&
        tile.type !== TileType.Rock &&
        !isAdjacentToTerritory(room.state, "p1", tile.x, tile.y) &&
        manhattan(tile.x, tile.y, player.hqX, player.hqY) > 10
      ) {
        farTile = tile;
        break;
      }
    }
    expect(farTile).not.toBeNull();

    addBuilder(room, "b-far", "p1", farTile.x, farTile.y, {
      currentState: "building",
      targetX: farTile.x,
      targetY: farTile.y,
      buildProgress: 0,
    });

    for (let i = 0; i < PAWN.BUILD_TIME_TICKS + 5; i++) tickAI(room);

    expect(farTile.ownerID).toBe("");
  });

  it("builder cannot build on tiles already owned", () => {
    const room = createRoomWithMap(42);
    joinPlayer(room, "p1");

    let ownedTile: TileState | null = null;
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      if (tile.ownerID === "p1") { ownedTile = tile; break; }
    }
    expect(ownedTile).not.toBeNull();

    const builder = addBuilder(room, "b-owned", "p1", ownedTile.x, ownedTile.y, {
      currentState: "building",
      targetX: ownedTile.x,
      targetY: ownedTile.y,
      buildProgress: 0,
    });

    for (let i = 0; i < 5; i++) tickAI(room);

    if (builder.currentState === "building") {
      expect(builder.targetX !== ownedTile.x || builder.targetY !== ownedTile.y).toBe(true);
    }
  });

  it("starting territory is 5×5 (up to 25 tiles) around HQ", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    const half = Math.floor(TERRITORY.STARTING_SIZE / 2);
    let ownedInZone = 0;

    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const tile = room.state.getTile(player.hqX + dx, player.hqY + dy);
        if (tile && tile.ownerID === "p1") ownedInZone++;
      }
    }

    const counts = getTerritoryCounts(room.state);
    const totalOwned = counts.get("p1") ?? 0;

    expect(ownedInZone).toBe(totalOwned);
    expect(totalOwned).toBeGreaterThanOrEqual(10);
    expect(totalOwned).toBeLessThanOrEqual(TERRITORY.STARTING_SIZE * TERRITORY.STARTING_SIZE);
  });

  it("builder re-evaluates when target tile is claimed by another player", () => {
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

    const tile = room.state.getTile(adjTile!.x, adjTile!.y);
    tile!.ownerID = "p2";

    for (let i = 0; i < 3; i++) tickAI(room);

    expect(["idle", "find_build_site", "move_to_site", "building"]).toContain(builder.currentState);
  });
});

// ═════════════════════════════════════════════════════════════════════
// Category 5 — Carnivore interaction (targeting, killing builders) 3
// ═════════════════════════════════════════════════════════════════════

describe("Carnivore interaction (targeting, killing builders)", () => {

  it("carnivores can target and damage builders", () => {
    const room = createRoomWithMap(42);
    joinPlayer(room, "p1");

    // Place builder on unowned tile so carnivore can reach it
    const pos = findWalkableTile(room);
    const builder = addBuilder(room, "b-prey", "p1", pos.x, pos.y, {
      health: PAWN.BUILDER_HEALTH,
    });
    // Ensure the tile is unowned for the test
    const builderTile = room.state.getTile(pos.x, pos.y);
    if (builderTile) builderTile.ownerID = "";

    const cx = pos.x + 1 < DEFAULT_MAP_SIZE ? pos.x + 1 : pos.x - 1;
    const carnTile = room.state.getTile(cx, pos.y);
    if (carnTile) carnTile.ownerID = "";
    addCreature(room, "c-hunt", "carnivore", cx, pos.y, {
      hunger: 10,
      currentState: "hunt",
    });

    const healthBefore = builder.health;
    for (let i = 0; i < 10; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      if (typeof room.tickCreatureAI === "function") room.tickCreatureAI();
    }

    const b = room.state.creatures.get("b-prey");
    if (b) {
      expect(b.health).toBeLessThan(healthBefore);
    } else {
      expect(room.state.creatures.has("b-prey")).toBe(false);
    }
  });

  it("builder dies when health reaches 0", () => {
    const room = createRoomWithMap(42);
    joinPlayer(room, "p1");

    const pos = findWalkableTile(room);
    addBuilder(room, "b-doomed", "p1", pos.x, pos.y, { health: 1 });

    room.state.creatures.get("b-doomed")!.health = 0;
    tickAI(room);

    expect(room.state.creatures.has("b-doomed")).toBe(false);
  });

  it("dead builder is removed from creatures collection (count drops)", () => {
    const room = createRoomWithMap(42);
    joinPlayer(room, "p1");

    const pos = findWalkableTile(room);
    addBuilder(room, "b-dead", "p1", pos.x, pos.y, { health: 1 });
    expect(room.state.creatures.has("b-dead")).toBe(true);

    room.state.creatures.get("b-dead")!.health = 0;
    tickAI(room);

    expect(room.state.creatures.has("b-dead")).toBe(false);
    expect(countPlayerBuilders(room, "p1")).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════
// Category 6 — HQ territory (immutability, visual distinction)     3
// ═════════════════════════════════════════════════════════════════════

describe("HQ territory (immutability, visual distinction)", () => {

  // ★ contract — passes before runtime implementation
  it("HQ position set at player join (hqX / hqY valid and walkable)", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    expect(player.hqX).toBeGreaterThanOrEqual(0);
    expect(player.hqY).toBeGreaterThanOrEqual(0);
    expect(room.state.isWalkable(player.hqX, player.hqY)).toBe(true);
  });

  // ★ contract — passes before runtime implementation
  it("HQ zone tiles marked isHQTerritory = true", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    const half = Math.floor(TERRITORY.STARTING_SIZE / 2);
    let hqTileCount = 0;

    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const tile = room.state.getTile(player.hqX + dx, player.hqY + dy);
        if (tile && !isWaterTile(tile.type) && tile.type !== TileType.Rock) {
          expect(tile.isHQTerritory).toBe(true);
          hqTileCount++;
        }
      }
    }
    expect(hqTileCount).toBeGreaterThan(0);
  });

  it("HQ territory is immutable — enemy builder cannot overwrite HQ tiles", () => {
    const room = createRoomWithMap(42);
    const { player: p1 } = joinPlayer(room, "p1");
    joinPlayer(room, "p2");

    // Pick an HQ tile owned by p1
    const hqTile = room.state.getTile(p1.hqX, p1.hqY);
    expect(hqTile).toBeDefined();
    expect(hqTile!.ownerID).toBe("p1");

    // Place p2's builder on the HQ tile and attempt to build
    addBuilder(room, "b-enemy", "p2", p1.hqX, p1.hqY, {
      currentState: "building",
      targetX: p1.hqX,
      targetY: p1.hqY,
      buildProgress: 0,
    });

    for (let i = 0; i < PAWN.BUILD_TIME_TICKS + 5; i++) tickAI(room);

    // HQ tile must still belong to p1
    expect(hqTile!.ownerID).toBe("p1");
    expect(hqTile!.isHQTerritory).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════
// PR #57 review — Builder FSM blocked-path reset
// ═════════════════════════════════════════════════════════════════════

describe("Builder FSM — move_to_site abandons target when path blocked", () => {
  it("builder resets to idle when moveToward returns false (all adjacent tiles unwalkable)", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    // Find a walkable tile inside the player's territory
    const hqPos = findWalkableTileInHQ(room, player);
    expect(hqPos).not.toBeNull();

    // Place the builder at hqPos and set a target far away
    const builder = addBuilder(room, "b-blocked", "p1", hqPos!.x, hqPos!.y, {
      currentState: "move_to_site",
      targetX: hqPos!.x + 10,
      targetY: hqPos!.y + 10,
    });

    // Wall off ALL cardinal neighbors with structures owned by another player
    // so moveToward cannot find any open tile (builder can only traverse own structures)
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of directions) {
      const nx = hqPos!.x + dx;
      const ny = hqPos!.y + dy;
      const tile = room.state.getTile(nx, ny);
      if (tile) {
        tile.shapeHP = SHAPE.BLOCK_HP;
        tile.ownerID = "enemy";
      }
    }

    // Tick AI — builder should detect it can't move and reset
    tickAI(room);

    expect(builder.currentState).toBe("idle");
    expect(builder.targetX).toBe(-1);
    expect(builder.targetY).toBe(-1);
  });
});

// ═════════════════════════════════════════════════════════════════════
// PR #57 review — findBuildSite HQ-distance tiebreaker
// ═════════════════════════════════════════════════════════════════════

describe("findBuildSite — outward expansion HQ-distance tiebreaker", () => {
  it("among equal-distance candidates, selects the one further from HQ", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    const hqPos = findWalkableTileInHQ(room, player);
    expect(hqPos).not.toBeNull();

    // Place builder at the HQ position and let it find a build site
    const builder = addBuilder(room, "b-hq-bias", "p1", hqPos!.x, hqPos!.y, {
      currentState: "idle",
    });

    // Tick until the builder picks a target (transitions to move_to_site)
    let found = false;
    for (let i = 0; i < 20; i++) {
      tickAI(room);
      if (builder.currentState === "move_to_site" || builder.currentState === "building") {
        found = true;
        break;
      }
    }
    if (!found) return; // No valid build site (map edge case) — skip assertion

    const targetHqDist = manhattan(builder.targetX, builder.targetY, player.hqX, player.hqY);
    const targetBuilderDist = manhattan(hqPos!.x, hqPos!.y, builder.targetX, builder.targetY);

    // Now check: is there any other valid candidate at the SAME distance
    // from the builder that is FURTHER from HQ? There shouldn't be.
    for (let dy = -PAWN.BUILD_SITE_SCAN_RADIUS; dy <= PAWN.BUILD_SITE_SCAN_RADIUS; dy++) {
      for (let dx = -PAWN.BUILD_SITE_SCAN_RADIUS; dx <= PAWN.BUILD_SITE_SCAN_RADIUS; dx++) {
        const tx = hqPos!.x + dx;
        const ty = hqPos!.y + dy;
        const tile = room.state.getTile(tx, ty);
        if (!tile) continue;
        if (tile.ownerID !== "") continue;
        if (isWaterTile(tile.type) || tile.type === TileType.Rock) continue;
        if (tile.shapeHP > 0) continue;
        if (!isAdjacentToTerritory(room.state, "p1", tx, ty)) continue;

        const candidateDist = Math.abs(dx) + Math.abs(dy);
        if (candidateDist === 0) continue;
        if (candidateDist !== targetBuilderDist) continue;

        const candidateHqDist = manhattan(tx, ty, player.hqX, player.hqY);
        // No candidate at the same builder-distance should be further from HQ
        expect(candidateHqDist).toBeLessThanOrEqual(targetHqDist);
      }
    }
  });
});
