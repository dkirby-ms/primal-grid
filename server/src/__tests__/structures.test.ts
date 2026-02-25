import { describe, it, expect } from "vitest";
import { GameState, PlayerState, StructureState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import {
  TileType, ItemType,
  CREATURE_TYPES, CREATURE_AI, DEFAULT_MAP_SIZE,
} from "@primal-grid/shared";
import type { PlacePayload } from "@primal-grid/shared";
import { tickCreatureAI } from "../rooms/creatureAI.js";

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

function placePlayerAt(room: any, sessionId: string, x: number, y: number) {
  const client = fakeClient(sessionId);
  room.onJoin(client);
  const player = room.state.players.get(sessionId)!;
  player.x = x;
  player.y = y;
  return { client, player };
}

/** Find two adjacent walkable tiles. */
function findAdjacentWalkablePair(room: any): { player: { x: number; y: number }; target: { x: number; y: number } } | null {
  const w = room.state.mapWidth;
  for (let y = 1; y < w - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (room.state.isWalkable(x, y) && room.state.isWalkable(x + 1, y)) {
        return { player: { x, y }, target: { x: x + 1, y } };
      }
    }
  }
  return null;
}

/** Find a tile of a specific type. */
function findTileOfType(room: any, tileType: number): { x: number; y: number } | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (tile.type === tileType) {
      return { x: tile.x, y: tile.y };
    }
  }
  return null;
}

/** Find a walkable tile with no existing structure. */
function findClearWalkableTile(room: any): { x: number; y: number } {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (room.state.isWalkable(tile.x, tile.y)) {
      let hasStructure = false;
      room.state.structures.forEach((s: any) => {
        if (s.x === tile.x && s.y === tile.y) hasStructure = true;
      });
      if (!hasStructure) return { x: tile.x, y: tile.y };
    }
  }
  return { x: 1, y: 1 };
}

// ═══════════════════════════════════════════════════════════════════
// Phase 3 — Structure Placement Tests
// ═══════════════════════════════════════════════════════════════════

describe("Phase 3 — Structure Placement: Success Cases", () => {
  it("place wall on adjacent walkable tile: structure created, tile becomes non-walkable", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentWalkablePair(room);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "builder", pair.player.x, pair.player.y);
    player.walls = 1;

    room.handlePlace(client, {
      itemType: ItemType.Wall,
      x: pair.target.x,
      y: pair.target.y,
    } as PlacePayload);

    // Wall placed
    expect(player.walls).toBe(0);
    expect(room.state.structures.size).toBe(1);

    // Tile is now non-walkable
    expect(room.state.isWalkable(pair.target.x, pair.target.y)).toBe(false);
  });

  it("place floor on adjacent walkable tile: tile stays walkable", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentWalkablePair(room);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "floor-builder", pair.player.x, pair.player.y);
    player.floors = 1;

    room.handlePlace(client, {
      itemType: ItemType.Floor,
      x: pair.target.x,
      y: pair.target.y,
    } as PlacePayload);

    expect(player.floors).toBe(0);
    expect(room.state.structures.size).toBe(1);
    // Floor does NOT block walkability
    expect(room.state.isWalkable(pair.target.x, pair.target.y)).toBe(true);
  });

  it("placed structure has correct metadata", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentWalkablePair(room);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "meta-builder", pair.player.x, pair.player.y);
    player.walls = 1;

    room.handlePlace(client, {
      itemType: ItemType.Wall,
      x: pair.target.x,
      y: pair.target.y,
    } as PlacePayload);

    let structure: any = null;
    room.state.structures.forEach((s: any) => { structure = s; });

    expect(structure).not.toBeNull();
    expect(structure.structureType).toBe(ItemType.Wall);
    expect(structure.x).toBe(pair.target.x);
    expect(structure.y).toBe(pair.target.y);
    expect(structure.placedBy).toBe("meta-builder");
  });
});

describe("Phase 3 — Structure Placement: Failure Cases", () => {
  it("place on Water tile: fails", () => {
    const room = createRoomWithMap(42);
    const waterPos = findTileOfType(room, TileType.Water);
    if (!waterPos) return;

    // Place player adjacent to water
    const px = Math.max(0, waterPos.x - 1);
    const py = waterPos.y;
    const { client, player } = placePlayerAt(room, "water-builder", px, py);
    player.walls = 1;

    room.handlePlace(client, {
      itemType: ItemType.Wall,
      x: waterPos.x,
      y: waterPos.y,
    } as PlacePayload);

    // Should fail — walls still 1, no structure
    expect(player.walls).toBe(1);
    expect(room.state.structures.size).toBe(0);
  });

  it("place on Rock tile: fails", () => {
    const room = createRoomWithMap(42);
    const rockPos = findTileOfType(room, TileType.Rock);
    if (!rockPos) return;

    const px = Math.max(0, rockPos.x - 1);
    const py = rockPos.y;
    const { client, player } = placePlayerAt(room, "rock-builder", px, py);
    player.walls = 1;

    room.handlePlace(client, {
      itemType: ItemType.Wall,
      x: rockPos.x,
      y: rockPos.y,
    } as PlacePayload);

    expect(player.walls).toBe(1);
    expect(room.state.structures.size).toBe(0);
  });

  it("place without item in inventory: fails", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentWalkablePair(room);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "no-item", pair.player.x, pair.player.y);
    // Player has 0 walls

    room.handlePlace(client, {
      itemType: ItemType.Wall,
      x: pair.target.x,
      y: pair.target.y,
    } as PlacePayload);

    expect(room.state.structures.size).toBe(0);
  });

  it("place on tile with existing structure: fails", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentWalkablePair(room);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "double-builder", pair.player.x, pair.player.y);
    player.walls = 2;

    // Place first wall
    room.handlePlace(client, {
      itemType: ItemType.Wall,
      x: pair.target.x,
      y: pair.target.y,
    } as PlacePayload);
    expect(room.state.structures.size).toBe(1);
    expect(player.walls).toBe(1);

    // Try to place second wall on same tile
    room.handlePlace(client, {
      itemType: ItemType.Wall,
      x: pair.target.x,
      y: pair.target.y,
    } as PlacePayload);

    // Second placement should fail
    expect(room.state.structures.size).toBe(1);
    expect(player.walls).toBe(1);
  });

  it("place non-adjacent to player: fails", () => {
    const room = createRoomWithMap(42);
    const pos = findClearWalkableTile(room);
    const { client, player } = placePlayerAt(room, "far-builder", pos.x, pos.y);
    player.walls = 1;

    // Pick a far-away tile (5 tiles away)
    const farX = (pos.x + 5) % DEFAULT_MAP_SIZE;
    const farY = (pos.y + 5) % DEFAULT_MAP_SIZE;

    room.handlePlace(client, {
      itemType: ItemType.Wall,
      x: farX,
      y: farY,
    } as PlacePayload);

    expect(player.walls).toBe(1);
    expect(room.state.structures.size).toBe(0);
  });
});

describe("Phase 3 — Creature Pathfinding Respects Structures", () => {
  it("creature cannot move to tile with Wall structure", () => {
    const room = createRoomWithMap(42);
    room.state.creatures.clear();

    const pair = findAdjacentWalkablePair(room);
    if (!pair) return;

    // Place a wall structure at the target tile
    const wall = new StructureState();
    wall.id = "wall_block";
    wall.structureType = ItemType.Wall;
    wall.x = pair.target.x;
    wall.y = pair.target.y;
    wall.placedBy = "test";
    room.state.structures.set(wall.id, wall);

    // Verify it's no longer walkable
    expect(room.state.isWalkable(pair.target.x, pair.target.y)).toBe(false);

    // Place a creature next to the wall
    const creature = new CreatureState();
    creature.id = "blocked_creature";
    creature.creatureType = "herbivore";
    creature.x = pair.player.x;
    creature.y = pair.player.y;
    creature.health = 100;
    creature.hunger = 100;
    creature.currentState = "wander";
    room.state.creatures.set(creature.id, creature);

    // Run multiple AI ticks — creature should never end up on the wall tile
    for (let i = 0; i < 50; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      tickCreatureAI(room.state);
      const c = room.state.creatures.get("blocked_creature");
      if (c) {
        expect(
          c.x !== pair.target.x || c.y !== pair.target.y
        ).toBe(true);
      }
    }
  });

  it("Wall makes isWalkable return false", () => {
    const room = createRoomWithMap(42);
    const pos = findClearWalkableTile(room);

    // Before wall: walkable
    expect(room.state.isWalkable(pos.x, pos.y)).toBe(true);

    // Place wall
    const wall = new StructureState();
    wall.id = "walk_test";
    wall.structureType = ItemType.Wall;
    wall.x = pos.x;
    wall.y = pos.y;
    wall.placedBy = "test";
    room.state.structures.set(wall.id, wall);

    // After wall: not walkable
    expect(room.state.isWalkable(pos.x, pos.y)).toBe(false);
  });

  it("Floor does NOT block walkability", () => {
    const room = createRoomWithMap(42);
    const pos = findClearWalkableTile(room);

    const floor = new StructureState();
    floor.id = "floor_test";
    floor.structureType = ItemType.Floor;
    floor.x = pos.x;
    floor.y = pos.y;
    floor.placedBy = "test";
    room.state.structures.set(floor.id, floor);

    expect(room.state.isWalkable(pos.x, pos.y)).toBe(true);
  });
});
