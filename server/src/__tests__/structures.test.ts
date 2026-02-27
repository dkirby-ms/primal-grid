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
  it("place workbench on owned walkable tile: structure created, tile becomes non-walkable", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "builder");
    player.workbenches = 1;

    const pos = findOwnedWalkableTile(room, "builder");
    if (!pos) return;

    room.handlePlace(client, {
      itemType: ItemType.Workbench,
      x: pos.x,
      y: pos.y,
    } as PlacePayload);

    expect(player.workbenches).toBe(0);
    expect(room.state.structures.size).toBeGreaterThanOrEqual(2); // HQ + workbench

    // Tile is now non-walkable (workbench blocks)
    expect(room.state.isWalkable(pos.x, pos.y)).toBe(false);
  });
});

describe("Phase 3 — Structure Placement: Failure Cases", () => {
  it("place on unowned tile: fails", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "unowned-builder");
    player.workbenches = 1;

    const unowned = findUnownedWalkableTile(room);
    if (!unowned) return;

    const structsBefore = room.state.structures.size;

    room.handlePlace(client, {
      itemType: ItemType.Workbench,
      x: unowned.x,
      y: unowned.y,
    } as PlacePayload);

    // Should fail — workbenches still 1, no new structure
    expect(player.workbenches).toBe(1);
    expect(room.state.structures.size).toBe(structsBefore);
  });

  it("place without item in inventory: fails", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "no-item");
    // Player has 0 workbenches

    const pos = findOwnedWalkableTile(room, "no-item");
    if (!pos) return;

    const structsBefore = room.state.structures.size;

    room.handlePlace(client, {
      itemType: ItemType.Workbench,
      x: pos.x,
      y: pos.y,
    } as PlacePayload);

    expect(room.state.structures.size).toBe(structsBefore);
  });

  it("place on tile with existing structure: fails", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "double-builder");
    player.workbenches = 2;

    const pos = findOwnedWalkableTile(room, "double-builder");
    if (!pos) return;

    const structsBefore = room.state.structures.size;

    // Place first workbench
    room.handlePlace(client, {
      itemType: ItemType.Workbench,
      x: pos.x,
      y: pos.y,
    } as PlacePayload);
    expect(room.state.structures.size).toBe(structsBefore + 1);
    expect(player.workbenches).toBe(1);

    // Try to place second workbench on same tile
    room.handlePlace(client, {
      itemType: ItemType.Workbench,
      x: pos.x,
      y: pos.y,
    } as PlacePayload);

    // Second placement should fail
    expect(room.state.structures.size).toBe(structsBefore + 1);
    expect(player.workbenches).toBe(1);
  });
});

describe("Phase 3 — Creature Pathfinding Respects Structures", () => {
  it("creature cannot move to tile with Workbench structure", () => {
    const room = createRoomWithMap(42);
    room.state.creatures.clear();

    const pair = findAdjacentWalkablePair(room);
    if (!pair) return;

    // Place a workbench structure at the target tile
    const wb = new StructureState();
    wb.id = "wb_block";
    wb.structureType = ItemType.Workbench;
    wb.x = pair.target.x;
    wb.y = pair.target.y;
    wb.placedBy = "test";
    room.state.structures.set(wb.id, wb);

    // Verify it's no longer walkable
    expect(room.state.isWalkable(pair.target.x, pair.target.y)).toBe(false);

    // Place a creature next to the workbench
    const creature = new CreatureState();
    creature.id = "blocked_creature";
    creature.creatureType = "herbivore";
    creature.x = pair.player.x;
    creature.y = pair.player.y;
    creature.health = 100;
    creature.hunger = 100;
    creature.currentState = "wander";
    room.state.creatures.set(creature.id, creature);

    // Run multiple AI ticks — creature should never end up on the workbench tile
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

  it("Workbench makes isWalkable return false", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentWalkablePair(room);
    if (!pair) return;
    const pos = pair.target;

    // Before workbench: walkable
    expect(room.state.isWalkable(pos.x, pos.y)).toBe(true);

    // Place workbench
    const wb = new StructureState();
    wb.id = "walk_test";
    wb.structureType = ItemType.Workbench;
    wb.x = pos.x;
    wb.y = pos.y;
    wb.placedBy = "test";
    room.state.structures.set(wb.id, wb);

    // After workbench: not walkable
    expect(room.state.isWalkable(pos.x, pos.y)).toBe(false);
  });
});
