import { TileType } from "../types.js";

export interface CreatureTypeDef {
  readonly name: string;
  readonly health: number;
  readonly hunger: number;
  readonly speed: number;
  readonly detectionRadius: number;
  readonly preferredBiomes: readonly TileType[];
  readonly color: string;
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
  },
  carnivore: {
    name: "Raptor",
    health: 80,
    hunger: 80,
    speed: 1,
    detectionRadius: 6,
    preferredBiomes: [TileType.Forest, TileType.Highland],
    color: "#F44336",
  },
} as const;
