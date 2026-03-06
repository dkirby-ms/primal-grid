import { describe, it, expect } from "vitest";
import { TileType, isWaterTile } from "../types.js";

describe("TileType enum", () => {
  it("has expected terrain values", () => {
    expect(TileType.Grassland).toBe(0);
    expect(TileType.Forest).toBe(1);
    expect(TileType.Swamp).toBe(2);
    expect(TileType.Desert).toBe(3);
    expect(TileType.Highland).toBe(4);
    expect(TileType.ShallowWater).toBe(5);
    expect(TileType.DeepWater).toBe(6);
    expect(TileType.Rock).toBe(7);
    expect(TileType.Sand).toBe(8);
  });

  it("has exactly 9 members", () => {
    const members = Object.keys(TileType).filter((k) => isNaN(Number(k)));
    expect(members).toHaveLength(9);
    expect(members).toEqual(["Grassland", "Forest", "Swamp", "Desert", "Highland", "ShallowWater", "DeepWater", "Rock", "Sand"]);
  });

  it("isWaterTile returns true for ShallowWater and DeepWater only", () => {
    expect(isWaterTile(TileType.ShallowWater)).toBe(true);
    expect(isWaterTile(TileType.DeepWater)).toBe(true);
    expect(isWaterTile(TileType.Grassland)).toBe(false);
    expect(isWaterTile(TileType.Rock)).toBe(false);
  });
});
