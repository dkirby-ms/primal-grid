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

/** Find the first tile of a given type in the generated map. */
function findTileOfType(state: GameState, type: TileType): TileState | undefined {
  for (let i = 0; i < state.tiles.length; i++) {
    const tile = state.tiles.at(i)!;
    if (tile.type === type) return tile;
  }
  return undefined;
}

describe("Grid Generation", () => {
  it("generates exactly 64×64 tiles (4096 total)", () => {
    const room = createRoomWithMap();
    expect(room.state.tiles.length).toBe(DEFAULT_MAP_SIZE * DEFAULT_MAP_SIZE);
    expect(room.state.tiles.length).toBe(4096);
  });

  it("sets map dimensions to DEFAULT_MAP_SIZE", () => {
    const room = createRoomWithMap();
    expect(room.state.mapWidth).toBe(DEFAULT_MAP_SIZE);
    expect(room.state.mapHeight).toBe(DEFAULT_MAP_SIZE);
  });

  it("all tiles have valid TileType values", () => {
    const room = createRoomWithMap();
    const validTypes = new Set([TileType.Grassland, TileType.Forest, TileType.Swamp, TileType.Desert, TileType.Highland, TileType.Water, TileType.Rock, TileType.Sand]);
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      expect(validTypes.has(tile.type)).toBe(true);
    }
  });

  it("grid contains a mix of biome types (at least 3 distinct)", () => {
    const room = createRoomWithMap();
    const typesFound = new Set<number>();
    for (let i = 0; i < room.state.tiles.length; i++) {
      typesFound.add(room.state.tiles.at(i)!.type);
    }
    expect(typesFound.size).toBeGreaterThanOrEqual(3);
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

  it("contains both walkable and non-walkable tiles", () => {
    const room = createRoomWithMap();
    let walkableCount = 0;
    let nonWalkableCount = 0;
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      if (room.state.isWalkable(tile.x, tile.y)) walkableCount++;
      else nonWalkableCount++;
    }
    expect(walkableCount).toBeGreaterThan(0);
    expect(nonWalkableCount).toBeGreaterThan(0);
  });

  it("water and rock tiles are not walkable", () => {
    const room = createRoomWithMap();
    const waterTile = findTileOfType(room.state, TileType.Water);
    const rockTile = findTileOfType(room.state, TileType.Rock);
    if (waterTile) expect(room.state.isWalkable(waterTile.x, waterTile.y)).toBe(false);
    if (rockTile) expect(room.state.isWalkable(rockTile.x, rockTile.y)).toBe(false);
  });

  it("grassland, forest, sand, desert, swamp, highland tiles are walkable", () => {
    const room = createRoomWithMap();
    const walkableTypes = [TileType.Grassland, TileType.Forest, TileType.Sand, TileType.Desert, TileType.Swamp, TileType.Highland];
    for (const type of walkableTypes) {
      const tile = findTileOfType(room.state, type);
      if (tile) expect(room.state.isWalkable(tile.x, tile.y)).toBe(true);
    }
  });

  it("same seed produces identical maps", () => {
    const room1 = Object.create(GameRoom.prototype) as any;
    room1.state = new GameState();
    room1.generateMap(42);

    const room2 = Object.create(GameRoom.prototype) as any;
    room2.state = new GameState();
    room2.generateMap(42);

    for (let i = 0; i < room1.state.tiles.length; i++) {
      const t1 = room1.state.tiles.at(i)!;
      const t2 = room2.state.tiles.at(i)!;
      expect(t1.type).toBe(t2.type);
      expect(t1.fertility).toBe(t2.fertility);
      expect(t1.moisture).toBe(t2.moisture);
    }
  });

  it("different seeds produce different maps", () => {
    const room1 = Object.create(GameRoom.prototype) as any;
    room1.state = new GameState();
    room1.generateMap(1);

    const room2 = Object.create(GameRoom.prototype) as any;
    room2.state = new GameState();
    room2.generateMap(99999);

    let differences = 0;
    for (let i = 0; i < room1.state.tiles.length; i++) {
      if (room1.state.tiles.at(i)!.type !== room2.state.tiles.at(i)!.type) differences++;
    }
    expect(differences).toBeGreaterThan(0);
  });

  it("tiles have fertility and moisture values in [0, 1]", () => {
    const room = createRoomWithMap();
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      expect(tile.fertility).toBeGreaterThanOrEqual(0);
      expect(tile.fertility).toBeLessThanOrEqual(1);
      expect(tile.moisture).toBeGreaterThanOrEqual(0);
      expect(tile.moisture).toBeLessThanOrEqual(1);
    }
  });

  it("mapSeed is stored in state", () => {
    const room = createRoomWithMap();
    expect(typeof room.state.mapSeed).toBe("number");
  });
});
