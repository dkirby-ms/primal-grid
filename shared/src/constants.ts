/** Server simulation ticks per second. */
export const TICK_RATE = 4;

/** Default world map size (tiles per side). */
export const DEFAULT_MAP_SIZE = 32;

/** Default Colyseus server port. */
export const SERVER_PORT = 2567;

/** Default seed for procedural map generation. */
export const DEFAULT_MAP_SEED = 12345;

/** Noise-based terrain generation parameters. */
export const NOISE_PARAMS = {
  ELEVATION_SCALE: 0.08,
  MOISTURE_SCALE: 0.06,
  ELEVATION_OCTAVES: 4,
  MOISTURE_OCTAVES: 3,
  WATER_LEVEL: 0.35,
  ROCK_LEVEL: 0.80,
  HIGHLAND_LEVEL: 0.65,
  FOREST_MOISTURE: 0.50,
  SWAMP_MOISTURE: 0.65,
  SWAMP_ELEVATION: 0.45,
  DESERT_MOISTURE: 0.25,
  SAND_MOISTURE: 0.35,
} as const;

/** Resource regeneration constants. */
export const RESOURCE_REGEN = {
  /** Ticks between regeneration checks (80 ticks = 20 seconds at 4 ticks/sec). */
  INTERVAL_TICKS: 80,
  /** Maximum resource amount per tile. */
  MAX_AMOUNT: 10,
  /** Amount regenerated per interval. */
  REGEN_AMOUNT: 1,
  /** Chance (0-1) of Sand tiles having Fiber. */
  SAND_FIBER_CHANCE: 0.3,
} as const;

/** Creature spawning constants. */
export const CREATURE_SPAWN = {
  /** Number of herbivores to spawn on 32×32 map. */
  HERBIVORE_COUNT: 8,
  /** Number of carnivores to spawn on 32×32 map. */
  CARNIVORE_COUNT: 4,
} as const;

/** Player survival constants. */
export const PLAYER_SURVIVAL = {
  /** Starting hunger value. */
  MAX_HUNGER: 100,
  /** Starting health value. */
  MAX_HEALTH: 100,
  /** Ticks between hunger decrements (8 ticks = 2 seconds at 4 ticks/sec). */
  HUNGER_TICK_INTERVAL: 8,
  /** Hunger lost per interval. */
  HUNGER_DRAIN: 1,
  /** Health lost per tick when starving. */
  STARVATION_DAMAGE: 1,
  /** Minimum health when starving (no player death). */
  HEALTH_FLOOR: 1,
  /** Hunger restored per berry consumed. */
  BERRY_HUNGER_RESTORE: 20,
} as const;

/** Creature respawning constants. */
export const CREATURE_RESPAWN = {
  /** Ticks between population checks (100 ticks = 25 seconds at 4 ticks/sec). */
  CHECK_INTERVAL: 100,
} as const;

/** Creature AI constants. */
export const CREATURE_AI = {
  /** Ticks between creature AI updates. */
  TICK_INTERVAL: 2,
  /** Hunger lost per AI tick. */
  HUNGER_DRAIN: 1,
  /** Health lost per AI tick when starving. */
  STARVATION_DAMAGE: 2,
  /** Hunger restored when a creature eats. */
  EAT_RESTORE: 30,
  /** Hunger threshold below which creatures seek food. */
  HUNGRY_THRESHOLD: 60,
  /** Max ticks a creature stays idle before wandering. */
  IDLE_DURATION: 3,
  /** Resource amount consumed when herbivore grazes. */
  GRAZE_AMOUNT: 1,
  /** Health damage dealt by carnivore per hunt attack. */
  HUNT_DAMAGE: 25,
} as const;

/** Farm system constants. */
export const FARM = {
  /** Ticks between farm growth updates (8 ticks = 2s at 4 ticks/sec). */
  TICK_INTERVAL: 8,
  /** Base growth rate per tick (multiplied by tile fertility). */
  GROWTH_RATE: 5,
  /** Growth threshold at which crop becomes ready (0-100). */
  READY_THRESHOLD: 100,
  /** Base berry yield on harvest. */
  BASE_HARVEST_YIELD: 3,
} as const;
