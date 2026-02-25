import { TileType, Personality } from "../types.js";

export interface CreatureTypeDef {
  readonly name: string;
  readonly health: number;
  readonly hunger: number;
  readonly speed: number;
  readonly detectionRadius: number;
  readonly preferredBiomes: readonly TileType[];
  readonly color: string;
  /** Minimum population — respawn if count drops below this. */
  readonly minPopulation: number;
  /** Weighted personality distribution [Docile, Neutral, Aggressive] summing to 100. */
  readonly personalityChart: readonly [number, number, number];
}

export const CREATURE_TYPES: Record<string, CreatureTypeDef> = {
  herbivore: {
    name: "Parasaurolophus",
    health: 100,
    hunger: 100,
    speed: 1,
    detectionRadius: 4,
    preferredBiomes: [TileType.Grassland, TileType.Forest],
    color: "#4CAF50",
    minPopulation: 4,
    personalityChart: [40, 40, 20],
  },
  carnivore: {
    name: "Raptor",
    health: 80,
    hunger: 80,
    speed: 1,
    detectionRadius: 6,
    preferredBiomes: [TileType.Forest, TileType.Highland],
    color: "#F44336",
    minPopulation: 2,
    personalityChart: [10, 30, 60],
  },
} as const;
