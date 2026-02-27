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

/** Join a player and return client + player. Player gets HQ and starting territory. */
function joinPlayer(room: any, sessionId: string) {
  const client = fakeClient(sessionId);
  room.onJoin(client);
  const player = room.state.players.get(sessionId)!;
  return { client, player };
}

/** Find a walkable tile owned by the player (in their territory). */
function findOwnedWalkableTile(room: any, playerId: string): { x: number; y: number } | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (tile.ownerID === playerId && room.state.isWalkable(tile.x, tile.y)) {
      // Skip tiles that already have structures
      let hasStructure = false;
      room.state.structures.forEach((s: any) => {
        if (s.x === tile.x && s.y === tile.y) hasStructure = true;
      });
      if (!hasStructure) return { x: tile.x, y: tile.y };
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

/** Find a walkable tile with no existing structure and no owner. */
function findUnownedWalkableTile(room: any): { x: number; y: number } | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (room.state.isWalkable(tile.x, tile.y) && tile.ownerID === "") {
      return { x: tile.x, y: tile.y };
    }
  }
  return null;
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

// ═══════════════════════════════════════════════════════════════════
// Phase 3 — Structure Placement Tests
// ═══════════════════════════════════════════════════════════════════

describe("Phase 3 — Structure Placement: Success Cases", () => {
  it("place wall on owned walkable tile: structure created, tile becomes non-walkable", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "builder");
    player.walls = 1;

    const pos = findOwnedWalkableTile(room, "builder");
    if (!pos) return;

    room.handlePlace(client, {
      itemType: ItemType.Wall,
      x: pos.x,
      y: pos.y,
    } as PlacePayload);

    expect(player.walls).toBe(0);
    // HQ structure + new wall
    const wallCount = Array.from({ length: room.state.structures.size }, (_, i) => {
      let s: any; room.state.structures.forEach((st: any, idx: number) => { if (idx === i) s = st; }); return s;
    }).filter(Boolean).length;
    expect(room.state.structures.size).toBeGreaterThanOrEqual(2); // HQ + wall

    // Tile is now non-walkable
    expect(room.state.isWalkable(pos.x, pos.y)).toBe(false);
  });

  it("place floor on owned walkable tile: tile stays walkable", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "floor-builder");
    player.floors = 1;

    const pos = findOwnedWalkableTile(room, "floor-builder");
    if (!pos) return;

    room.handlePlace(client, {
      itemType: ItemType.Floor,
      x: pos.x,
      y: pos.y,
    } as PlacePayload);

    expect(player.floors).toBe(0);
    // Floor does NOT block walkability
    expect(room.state.isWalkable(pos.x, pos.y)).toBe(true);
  });

  it("placed structure has correct metadata", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "meta-builder");
    player.walls = 1;

    const pos = findOwnedWalkableTile(room, "meta-builder");
    if (!pos) return;

    room.handlePlace(client, {
      itemType: ItemType.Wall,
      x: pos.x,
      y: pos.y,
    } as PlacePayload);

    let wall: any = null;
    room.state.structures.forEach((s: any) => {
      if (s.structureType === ItemType.Wall) wall = s;
    });

    expect(wall).not.toBeNull();
    expect(wall.structureType).toBe(ItemType.Wall);
    expect(wall.x).toBe(pos.x);
    expect(wall.y).toBe(pos.y);
    expect(wall.placedBy).toBe("meta-builder");
  });
});

describe("Phase 3 — Structure Placement: Failure Cases", () => {
  it("place on unowned tile: fails", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "unowned-builder");
    player.walls = 1;

    const unowned = findUnownedWalkableTile(room);
    if (!unowned) return;

    const structsBefore = room.state.structures.size;

    room.handlePlace(client, {
      itemType: ItemType.Wall,
      x: unowned.x,
      y: unowned.y,
    } as PlacePayload);

    // Should fail — walls still 1, no new structure
    expect(player.walls).toBe(1);
    expect(room.state.structures.size).toBe(structsBefore);
  });

  it("place without item in inventory: fails", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "no-item");
    // Player has 0 walls

    const pos = findOwnedWalkableTile(room, "no-item");
    if (!pos) return;

    const structsBefore = room.state.structures.size;

    room.handlePlace(client, {
      itemType: ItemType.Wall,
      x: pos.x,
      y: pos.y,
    } as PlacePayload);

    expect(room.state.structures.size).toBe(structsBefore);
  });

  it("place on tile with existing structure: fails", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "double-builder");
    player.walls = 2;

    const pos = findOwnedWalkableTile(room, "double-builder");
    if (!pos) return;

    const structsBefore = room.state.structures.size;

    // Place first wall
    room.handlePlace(client, {
      itemType: ItemType.Wall,
      x: pos.x,
      y: pos.y,
    } as PlacePayload);
    expect(room.state.structures.size).toBe(structsBefore + 1);
    expect(player.walls).toBe(1);

    // Try to place second wall on same tile
    room.handlePlace(client, {
      itemType: ItemType.Wall,
      x: pos.x,
      y: pos.y,
    } as PlacePayload);

    // Second placement should fail
    expect(room.state.structures.size).toBe(structsBefore + 1);
    expect(player.walls).toBe(1);
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
    const pair = findAdjacentWalkablePair(room);
    if (!pair) return;
    const pos = pair.target;

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
    const pair = findAdjacentWalkablePair(room);
    if (!pair) return;
    const pos = pair.target;

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
