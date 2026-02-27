import { ItemType } from "../types.js";

export interface RecipeIngredient {
  /** Resource field name on PlayerState (e.g. "wood", "stone", "fiber"). */
  readonly resource: "wood" | "stone" | "fiber" | "berries";
  readonly amount: number;
}

export interface RecipeDef {
  readonly id: string;
  readonly output: ItemType;
  readonly outputCount: number;
  readonly ingredients: readonly RecipeIngredient[];
}

export const RECIPES: Record<string, RecipeDef> = {
  wall: {
    id: "wall",
    output: ItemType.Wall,
    outputCount: 1,
    ingredients: [
      { resource: "wood", amount: 5 },
      { resource: "stone", amount: 2 },
    ],
  },
  floor: {
    id: "floor",
    output: ItemType.Floor,
    outputCount: 1,
    ingredients: [
      { resource: "wood", amount: 3 },
    ],
  },
  workbench: {
    id: "workbench",
    output: ItemType.Workbench,
    outputCount: 1,
    ingredients: [
      { resource: "wood", amount: 5 },
      { resource: "stone", amount: 3 },
    ],
  },
  farm_plot: {
    id: "farm_plot",
    output: ItemType.FarmPlot,
    outputCount: 1,
    ingredients: [
      { resource: "wood", amount: 4 },
      { resource: "fiber", amount: 2 },
    ],
  },
  turret: {
    id: "turret",
    output: ItemType.Turret,
    outputCount: 1,
    ingredients: [
      { resource: "wood", amount: 5 },
      { resource: "stone", amount: 5 },
    ],
  },
} as const;

/** Map from ItemType to the player inventory field name. */
const ITEM_TYPE_TO_FIELD: Record<number, string> = {
  [ItemType.Wall]: "walls",
  [ItemType.Floor]: "floors",
  [ItemType.Workbench]: "workbenches",
  [ItemType.FarmPlot]: "farmPlots",
  [ItemType.Turret]: "turrets",
};

export function getItemField(itemType: number): string | undefined {
  return ITEM_TYPE_TO_FIELD[itemType];
}

/** Check whether a player has sufficient resources for a recipe. */
export function canCraft(
  player: Record<string, number>,
  recipeId: string,
): boolean {
  const recipe = RECIPES[recipeId];
  if (!recipe) return false;
  return recipe.ingredients.every(
    (ing) => (player[ing.resource] ?? 0) >= ing.amount,
  );
}
