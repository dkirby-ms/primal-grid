import { describe, it, expect } from "vitest";
import { RECIPES, canCraft, getItemField } from "../data/recipes.js";
import { ItemType, ResourceType } from "../types.js";

// ═══════════════════════════════════════════════════════════════════
// Phase 3 — Recipe System Tests
// ═══════════════════════════════════════════════════════════════════

describe("Phase 3 — Recipe Definitions", () => {
  const recipeIds = ["workbench", "farm_plot", "turret"];

  it("all 3 recipes are defined", () => {
    for (const id of recipeIds) {
      expect(RECIPES[id]).toBeDefined();
      expect(RECIPES[id].id).toBe(id);
    }
    expect(Object.keys(RECIPES).length).toBe(3);
  });

  it("each recipe has valid output type and positive outputCount", () => {
    for (const id of recipeIds) {
      const recipe = RECIPES[id];
      expect(Object.values(ItemType)).toContain(recipe.output);
      expect(recipe.outputCount).toBeGreaterThan(0);
    }
  });

  it("each recipe has at least one ingredient", () => {
    for (const id of recipeIds) {
      expect(RECIPES[id].ingredients.length).toBeGreaterThan(0);
    }
  });

  it("recipe inputs reference valid resource field names", () => {
    const validFields = ["wood", "stone", "fiber", "berries"];
    for (const id of recipeIds) {
      for (const ing of RECIPES[id].ingredients) {
        expect(validFields).toContain(ing.resource);
        expect(ing.amount).toBeGreaterThan(0);
      }
    }
  });

  it("each recipe produces correct output type", () => {
    expect(RECIPES.workbench.output).toBe(ItemType.Workbench);
    expect(RECIPES.farm_plot.output).toBe(ItemType.FarmPlot);
    expect(RECIPES.turret.output).toBe(ItemType.Turret);
  });

  it("each recipe produces exactly 1 item", () => {
    for (const id of recipeIds) {
      expect(RECIPES[id].outputCount).toBe(1);
    }
  });
});

describe("Phase 3 — canCraft", () => {
  it("returns true when player has sufficient resources", () => {
    const player = { wood: 10, stone: 10, fiber: 10, berries: 10 };
    for (const id of Object.keys(RECIPES)) {
      expect(canCraft(player, id)).toBe(true);
    }
  });

  it("returns false when player lacks wood for workbench", () => {
    const player = { wood: 0, stone: 10, fiber: 0, berries: 0 };
    expect(canCraft(player, "workbench")).toBe(false);
  });

  it("returns false when player lacks stone for workbench", () => {
    const player = { wood: 10, stone: 0, fiber: 0, berries: 0 };
    expect(canCraft(player, "workbench")).toBe(false);
  });

  it("returns false when player has exactly 1 less than required", () => {
    // Workbench needs wood:5, stone:3
    const player = { wood: 4, stone: 3, fiber: 0, berries: 0 };
    expect(canCraft(player, "workbench")).toBe(false);
  });

  it("returns true when player has exactly the required amounts", () => {
    // Workbench needs wood:5, stone:3
    const player = { wood: 5, stone: 3, fiber: 0, berries: 0 };
    expect(canCraft(player, "workbench")).toBe(true);
  });

  it("returns false for unknown recipe ID", () => {
    const player = { wood: 99, stone: 99, fiber: 99, berries: 99 };
    expect(canCraft(player, "nonexistent")).toBe(false);
  });

  it("returns false when player has zero resources", () => {
    const player = { wood: 0, stone: 0, fiber: 0, berries: 0 };
    for (const id of Object.keys(RECIPES)) {
      expect(canCraft(player, id)).toBe(false);
    }
  });
});

describe("Phase 3 — getItemField", () => {
  it("maps each ItemType to the correct inventory field", () => {
    expect(getItemField(ItemType.Workbench)).toBe("workbenches");
    expect(getItemField(ItemType.FarmPlot)).toBe("farmPlots");
    expect(getItemField(ItemType.Turret)).toBe("turrets");
  });

  it("returns undefined for unknown ItemType", () => {
    expect(getItemField(999)).toBeUndefined();
  });
});
