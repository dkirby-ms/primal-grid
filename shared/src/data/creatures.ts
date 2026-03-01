import { TileType } from "../types.js";

export interface CreatureTypeDef {
  readonly name: string;
  readonly icon: string;
  readonly health: number;
  readonly hunger: number;
  readonly detectionRadius: number;
  readonly preferredBiomes: readonly TileType[];
  readonly color: string;
  /** Minimum population — respawn if count drops below this. */
  readonly minPopulation: number;
}

export const CREATURE_TYPES: Record<string, CreatureTypeDef> = {
  herbivore: {
    name: "Parasaurolophus",
    icon: "🦕",
    health: 100,
    hunger: 100,
    detectionRadius: 4,
    preferredBiomes: [TileType.Grassland, TileType.Forest],
    color: "#4CAF50",
    minPopulation: 4,
  },
  carnivore: {
    name: "Raptor",
    icon: "🦖",
    health: 80,
    hunger: 80,
    detectionRadius: 6,
    preferredBiomes: [TileType.Forest, TileType.Highland],
    color: "#F44336",
    minPopulation: 2,
  },
} as const;
