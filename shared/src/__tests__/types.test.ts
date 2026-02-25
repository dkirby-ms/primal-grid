import { describe, it, expect } from "vitest";
import { TileType } from "../types.js";

describe("TileType enum", () => {
  it("has expected terrain values", () => {
    expect(TileType.Grass).toBe(0);
    expect(TileType.Water).toBe(1);
    expect(TileType.Rock).toBe(2);
    expect(TileType.Sand).toBe(3);
  });

  it("has exactly 4 members", () => {
    const members = Object.keys(TileType).filter((k) => isNaN(Number(k)));
    expect(members).toHaveLength(4);
    expect(members).toEqual(["Grass", "Water", "Rock", "Sand"]);
  });
});
