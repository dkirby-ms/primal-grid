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
  /** Maximum stamina pool. */
  readonly maxStamina: number;
  /** Stamina spent per tile moved. */
  readonly staminaCostPerMove: number;
  /** Stamina recovered per AI tick when not moving. */
  readonly staminaRegenPerTick: number;
  /** Stamina must reach this value to exit exhaustion (hysteresis). */
  readonly exhaustedThreshold: number;
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
    minPopulation: 3,
    maxStamina: 10,
    staminaCostPerMove: 2,
    staminaRegenPerTick: 1,
    exhaustedThreshold: 5,
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
    maxStamina: 14,
    staminaCostPerMove: 2,
    staminaRegenPerTick: 1,
    exhaustedThreshold: 6,
  },
  bird: {
    name: "Eagle",
    icon: "🦅",
    health: 60,
    hunger: 90,
    detectionRadius: 8,
    preferredBiomes: [TileType.Highland, TileType.Grassland],
    color: "#795548",
    minPopulation: 2,
    maxStamina: 18,
    staminaCostPerMove: 1,
    staminaRegenPerTick: 2,
    exhaustedThreshold: 6,
  },
  monkey: {
    name: "Monkey",
    icon: "🐒",
    health: 70,
    hunger: 95,
    detectionRadius: 5,
    preferredBiomes: [TileType.Forest],
    color: "#8D6E63",
    minPopulation: 2,
    maxStamina: 12,
    staminaCostPerMove: 2,
    staminaRegenPerTick: 1,
    exhaustedThreshold: 5,
  },
  spider: {
    name: "Giant Spider",
    icon: "🕷️",
    health: 50,
    hunger: 70,
    detectionRadius: 4,
    preferredBiomes: [TileType.Swamp, TileType.Forest],
    color: "#424242",
    minPopulation: 2,
    maxStamina: 8,
    staminaCostPerMove: 2,
    staminaRegenPerTick: 1,
    exhaustedThreshold: 4,
  },
} as const;
