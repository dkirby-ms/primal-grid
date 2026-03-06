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
  /** Max extra AI ticks a creature may stay idle before wandering. */
  IDLE_EXTRA_TICKS_MAX: 3,
  /** Resource amount consumed when herbivore grazes. */
  GRAZE_AMOUNT: 1,
  /** Health damage dealt by carnivore per hunt attack. */
  HUNT_DAMAGE: 30,
} as const;



/** Territory claim constants. */
export const TERRITORY = {
  /** Starting territory size in tiles (side length of square). */
  STARTING_SIZE: 5,
  /** Starting wood for new players (enough for 1-2 builders). */
  STARTING_WOOD: 25,
  /** Starting stone for new players. */
  STARTING_STONE: 15,
  /** Ticks to claim a tile (8 ticks ≈ 2 seconds at 4 ticks/sec). */
  CLAIM_TICKS: 8,
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

/** Round timer constants (Phase D). */
export const ROUND = {
  /** Round duration in ticks (3600 ticks = 15 minutes at 4 ticks/sec). */
  DURATION_TICKS: 3600,
} as const;

/** Shape placement durability constants. */
export const SHAPE = {
  BLOCK_HP: 100,
} as const;

/** Structure-based income constants (StarCraft-style). */
export const STRUCTURE_INCOME = {
  /** Ticks between income ticks (40 ticks = 10 seconds at 4 ticks/sec). */
  INTERVAL_TICKS: 40,
  /** Wood income from HQ per tick. */
  HQ_WOOD: 2,
  /** Stone income from HQ per tick. */
  HQ_STONE: 2,
  /** Wood income per farm per tick. */
  FARM_WOOD: 1,
  /** Stone income per farm per tick. */
  FARM_STONE: 1,
} as const;

/** Progression level definitions. */
export const PROGRESSION = {
  MAX_LEVEL: 7,
  XP_PER_TILE_CLAIMED: 1,
  LEVELS: [
    { level: 1, xpRequired: 0,   shapes: ["tetra_o", "tetra_i"] },
    { level: 2, xpRequired: 10,  shapes: ["tetra_t"] },
    { level: 3, xpRequired: 25,  shapes: ["tetra_l"] },
    { level: 4, xpRequired: 45,  shapes: ["tetra_j"] },
    { level: 5, xpRequired: 70,  shapes: ["tetra_s", "tetra_z"] },
    { level: 6, xpRequired: 100, shapes: [], abilities: ["pets"] },
    { level: 7, xpRequired: 140, shapes: [], abilities: ["pet_breeding"] },
  ],
} as const;

/** Pawn system constants. */
export const PAWN = {
  /** Wood cost to spawn a builder. */
  BUILDER_COST_WOOD: 10,
  /** Stone cost to spawn a builder. */
  BUILDER_COST_STONE: 5,
  /** Builder starting health. */
  BUILDER_HEALTH: 50,
  /** Ticks to complete a build (16 ticks = 4 seconds at 4 ticks/sec). */
  BUILD_TIME_TICKS: 16,
  /** Wood upkeep cost per cycle. */
  BUILDER_UPKEEP_WOOD: 1,
  /** Ticks between upkeep deductions (60 ticks = 15 seconds at 4 ticks/sec). */
  UPKEEP_INTERVAL_TICKS: 60,
  /** Damage dealt when upkeep can't be paid. */
  UPKEEP_DAMAGE: 10,
  /** Maximum builders per player. */
  MAX_PER_PLAYER: 5,
  /** Radius to scan for build sites. */
  BUILD_SITE_SCAN_RADIUS: 8,
  /** Wood cost to build a farm structure. */
  FARM_COST_WOOD: 8,
  /** Stone cost to build a farm structure. */
  FARM_COST_STONE: 3,
} as const;
