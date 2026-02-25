import { describe, it, expect } from "vitest";
import { GameState, TileState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { TileType, DEFAULT_MAP_SIZE } from "@primal-grid/shared";

/**
 * Create a room-like object that can call GameRoom's private methods
 * without requiring full Colyseus server infrastructure.
 */
function createRoomWithMap(): { state: GameState } {
  const room = Object.create(GameRoom.prototype) as any;
  room.state = new GameState();
  room.generateMap();
  return room;
}

describe("Grid Generation", () => {
  it("generates exactly 32×32 tiles (1024 total)", () => {
    const room = createRoomWithMap();
    expect(room.state.tiles.length).toBe(DEFAULT_MAP_SIZE * DEFAULT_MAP_SIZE);
    expect(room.state.tiles.length).toBe(1024);
  });

  it("sets map dimensions to DEFAULT_MAP_SIZE", () => {
    const room = createRoomWithMap();
    expect(room.state.mapWidth).toBe(DEFAULT_MAP_SIZE);
    expect(room.state.mapHeight).toBe(DEFAULT_MAP_SIZE);
  });

  it("all tiles have valid TileType values", () => {
    const room = createRoomWithMap();
    const validTypes = new Set([TileType.Grass, TileType.Water, TileType.Rock, TileType.Sand]);
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      expect(validTypes.has(tile.type)).toBe(true);
    }
  });

  it("grid contains a mix of tile types (not all one type)", () => {
    const room = createRoomWithMap();
    const typesFound = new Set<number>();
    for (let i = 0; i < room.state.tiles.length; i++) {
      typesFound.add(room.state.tiles.at(i)!.type);
    }
    // Should have at least Grass, Water, Rock, and Sand
    expect(typesFound.size).toBeGreaterThanOrEqual(4);
    expect(typesFound.has(TileType.Grass)).toBe(true);
    expect(typesFound.has(TileType.Water)).toBe(true);
    expect(typesFound.has(TileType.Rock)).toBe(true);
    expect(typesFound.has(TileType.Sand)).toBe(true);
  });

  it("tile coordinates match expected positions (row-major order)", () => {
    const room = createRoomWithMap();
    for (let y = 0; y < DEFAULT_MAP_SIZE; y++) {
      for (let x = 0; x < DEFAULT_MAP_SIZE; x++) {
        const idx = y * DEFAULT_MAP_SIZE + x;
        const tile = room.state.tiles.at(idx)!;
        expect(tile.x).toBe(x);
        expect(tile.y).toBe(y);
      }
    }
  });

  it("getTile returns correct tile at known positions", () => {
    const room = createRoomWithMap();
    // Center of the water pond (4-8, 4-8)
    const waterTile = room.state.getTile(6, 6);
    expect(waterTile).toBeDefined();
    expect(waterTile!.type).toBe(TileType.Water);

    // Center of rock formation (22-26, 22-26)
    const rockTile = room.state.getTile(24, 24);
    expect(rockTile).toBeDefined();
    expect(rockTile!.type).toBe(TileType.Rock);

    // Open area — should be grass
    const grassTile = room.state.getTile(15, 15);
    expect(grassTile).toBeDefined();
    expect(grassTile!.type).toBe(TileType.Grass);
  });

  it("water and rock tiles are not walkable", () => {
    const room = createRoomWithMap();
    // Water pond center
    expect(room.state.isWalkable(6, 6)).toBe(false);
    // Rock formation center
    expect(room.state.isWalkable(24, 24)).toBe(false);
  });

  it("grass and sand tiles are walkable", () => {
    const room = createRoomWithMap();
    // Open grass area
    expect(room.state.isWalkable(15, 15)).toBe(true);
    // Sand beach around the pond (e.g. 3,3 is sand, not water)
    expect(room.state.isWalkable(3, 3)).toBe(true);
  });
});
