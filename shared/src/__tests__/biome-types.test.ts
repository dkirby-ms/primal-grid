import { describe, it, expect } from "vitest";
import { TileType } from "../types.js";

describe("TileType enum — Phase 2.1 biomes", () => {
  it("has exactly 9 biome types", () => {
    const members = Object.keys(TileType).filter((k) => isNaN(Number(k)));
    expect(members).toHaveLength(9);
  });

  it("includes all expected biome names", () => {
    const members = Object.keys(TileType).filter((k) => isNaN(Number(k)));
    expect(members).toContain("Grassland");
    expect(members).toContain("Forest");
    expect(members).toContain("Swamp");
    expect(members).toContain("Desert");
    expect(members).toContain("Highland");
    expect(members).toContain("ShallowWater");
    expect(members).toContain("DeepWater");
    expect(members).toContain("Rock");
    expect(members).toContain("Sand");
  });

  it("all biome values are distinct numbers", () => {
    const values = [
      TileType.Grassland,
      TileType.Forest,
      TileType.Swamp,
      TileType.Desert,
      TileType.Highland,
      TileType.ShallowWater,
      TileType.DeepWater,
      TileType.Rock,
      TileType.Sand,
    ];
    const unique = new Set(values);
    expect(unique.size).toBe(9);
    values.forEach((v) => expect(typeof v).toBe("number"));
  });

  it("each biome value resolves back to its name via reverse mapping", () => {
    expect(TileType[TileType.Grassland]).toBe("Grassland");
    expect(TileType[TileType.Forest]).toBe("Forest");
    expect(TileType[TileType.Swamp]).toBe("Swamp");
    expect(TileType[TileType.Desert]).toBe("Desert");
    expect(TileType[TileType.Highland]).toBe("Highland");
    expect(TileType[TileType.ShallowWater]).toBe("ShallowWater");
    expect(TileType[TileType.DeepWater]).toBe("DeepWater");
    expect(TileType[TileType.Rock]).toBe("Rock");
    expect(TileType[TileType.Sand]).toBe("Sand");
  });
});
