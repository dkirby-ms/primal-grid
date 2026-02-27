/** Server simulation ticks per second. */
export const TICK_RATE = 4;

/** Default world map size (tiles per side). */
export const DEFAULT_MAP_SIZE = 64;

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
  /** Number of herbivores to spawn on 64×64 map. */
  HERBIVORE_COUNT: 32,
  /** Number of carnivores to spawn on 64×64 map. */
  CARNIVORE_COUNT: 16,
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

/** Taming system constants. */
export const TAMING = {
  /** Trust gained per feed interaction (docile creatures get double). */
  TRUST_PER_FEED: 5,
  /** Trust gained per proximity tick (every 10 ticks within detection radius). */
  TRUST_PER_PROXIMITY_TICK: 1,
  /** Trust lost per decay tick (every 20 ticks if owner distance > 3). */
  TRUST_DECAY_ALONE: 1,
  /** Trust penalty when creature takes damage. */
  TRUST_DAMAGE_PENALTY: 10,
  /** Trust threshold at which creature obeys commands. */
  TRUST_AT_OBEDIENT: 70,
  /** Maximum tamed creatures per player. */
  MAX_PACK_SIZE: 8,
  /** Ticks of zero trust before auto-abandon. */
  ZERO_TRUST_ABANDON_TICKS: 50,
} as const;

/** Breeding system constants. */
export const BREEDING = {
  /** Berry cost per breeding attempt. */
  FOOD_COST: 10,
  /** Cooldown ticks between breeding attempts per creature. */
  COOLDOWN_TICKS: 100,
  /** Offspring initial trust (pre-bonded). */
  OFFSPRING_TRUST: 50,
  /** Maximum trait mutation per breeding (±1 per trait). */
  TRAIT_MUTATION_RANGE: 1,
  /** Hard cap on trait delta values. */
  TRAIT_CAP: 3,
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

/** Territory claim constants. */
export const TERRITORY = {
  /** Starting territory radius in tiles. */
  STARTING_SIZE: 3,
  /** Wood cost to claim one tile. */
  CLAIM_COST_WOOD: 1,
  /** Starting wood for new players. */
  STARTING_WOOD: 10,
  /** Starting stone for new players. */
  STARTING_STONE: 5,
  /** Starting fiber for new players. */
  STARTING_FIBER: 0,
  /** Starting berries for new players. */
  STARTING_BERRIES: 5,
} as const;

/** Wave spawner constants (Phase B). */
export const WAVE_SPAWNER = {
  /** Ticks between waves (240 ticks = 60 seconds at 4 ticks/sec). */
  INTERVAL_TICKS: 240,
  /** Base number of creatures per wave. */
  BASE_WAVE_SIZE: 3,
  /** Additional creatures per wave number. */
  ESCALATION_PER_WAVE: 1,
} as const;

/** Turret constants (Phase B). */
export const TURRET = {
  /** Turret firing range in tiles. */
  RANGE: 2,
  /** Damage per turret shot. */
  DAMAGE: 15,
  /** Ticks between turret shots. */
  FIRE_INTERVAL: 4,
} as const;

/** Round timer constants (Phase D). */
export const ROUND = {
  /** Round duration in ticks (3600 ticks = 15 minutes at 4 ticks/sec). */
  DURATION_TICKS: 3600,
} as const;

/** Pawn command constants (Phase C). */
export const PAWN_COMMAND = {
  /** Ticks between pawn gather attempts. */
  GATHER_INTERVAL: 4,
  /** Guard detection radius in tiles. */
  GUARD_RANGE: 3,
  /** Patrol movement: ticks between steps. */
  PATROL_STEP_INTERVAL: 2,
} as const;
