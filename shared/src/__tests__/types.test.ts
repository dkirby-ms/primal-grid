import { describe, it, expect } from "vitest";
import { TileType } from "../types.js";

describe("TileType enum", () => {
  it("has expected terrain values", () => {
    expect(TileType.Grassland).toBe(0);
    expect(TileType.Forest).toBe(1);
    expect(TileType.Swamp).toBe(2);
    expect(TileType.Desert).toBe(3);
    expect(TileType.Highland).toBe(4);
    expect(TileType.Water).toBe(5);
    expect(TileType.Rock).toBe(6);
    expect(TileType.Sand).toBe(7);
  });

  it("has exactly 8 members", () => {
    const members = Object.keys(TileType).filter((k) => isNaN(Number(k)));
    expect(members).toHaveLength(8);
    expect(members).toEqual(["Grassland", "Forest", "Swamp", "Desert", "Highland", "Water", "Rock", "Sand"]);
  });
});
