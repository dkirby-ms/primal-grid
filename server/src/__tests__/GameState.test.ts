import { describe, it, expect } from "vitest";
import { GameState, TileState, PlayerState } from "../rooms/GameState.js";
import { TileType, DEFAULT_MAP_SIZE, DEFAULT_MAP_SEED } from "@primal-grid/shared";

describe("TileState", () => {
  it("can be instantiated with defaults", () => {
    const tile = new TileState();
    expect(tile.type).toBe(TileType.Grassland);
    expect(tile.x).toBe(0);
    expect(tile.y).toBe(0);
    expect(tile.fertility).toBe(0);
    expect(tile.moisture).toBe(0);
  });
});

describe("PlayerState", () => {
  it("can be instantiated with defaults", () => {
    const player = new PlayerState();
    expect(player.id).toBe("");
    expect(player.color).toBe("#ffffff");
    expect(player.hqX).toBe(-1);
    expect(player.hqY).toBe(-1);
    expect(player.score).toBe(0);
  });
});

describe("GameState", () => {
  it("can be instantiated", () => {
    const state = new GameState();
    expect(state).toBeDefined();
  });

  it("initializes tick to 0", () => {
    const state = new GameState();
    expect(state.tick).toBe(0);
  });

  it("has default map dimensions", () => {
    const state = new GameState();
    expect(state.mapWidth).toBe(DEFAULT_MAP_SIZE);
    expect(state.mapHeight).toBe(DEFAULT_MAP_SIZE);
  });

  it("has default map seed", () => {
    const state = new GameState();
    expect(state.mapSeed).toBe(DEFAULT_MAP_SEED);
  });

  it("getTile returns undefined for out-of-bounds", () => {
    const state = new GameState();
    expect(state.getTile(-1, 0)).toBeUndefined();
    expect(state.getTile(0, -1)).toBeUndefined();
    expect(state.getTile(DEFAULT_MAP_SIZE, 0)).toBeUndefined();
  });

  it("isWalkable returns false for out-of-bounds", () => {
    const state = new GameState();
    expect(state.isWalkable(-1, 0)).toBe(false);
  });

  it("isWalkable returns true for grass, false for water/rock", () => {
    const state = new GameState();
    // Populate a small 2x2 grid for testing
    state.mapWidth = 2;
    state.mapHeight = 2;
    const types = [TileType.Grassland, TileType.Water, TileType.Rock, TileType.Sand];
    for (let i = 0; i < 4; i++) {
      const t = new TileState();
      t.x = i % 2;
      t.y = Math.floor(i / 2);
      t.type = types[i];
      state.tiles.push(t);
    }
    expect(state.isWalkable(0, 0)).toBe(true);  // Grassland
    expect(state.isWalkable(1, 0)).toBe(false); // Water
    expect(state.isWalkable(0, 1)).toBe(false); // Rock
    expect(state.isWalkable(1, 1)).toBe(true);  // Sand
  });
});
