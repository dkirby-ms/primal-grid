/** Server simulation ticks per second. */
export const TICK_RATE = 4;

/** Default world map size (tiles per side). */
export const DEFAULT_MAP_SIZE = 128;

/** Default Colyseus server port. */
export const SERVER_PORT = 2567;

/** Default seed for procedural map generation. */
export const DEFAULT_MAP_SEED = 12345;

/** Noise-based terrain generation parameters. */
export const NOISE_PARAMS = {
  ELEVATION_SCALE: 0.045,
  MOISTURE_SCALE: 0.035,
  ELEVATION_OCTAVES: 3,
  MOISTURE_OCTAVES: 2,
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
  /** Number of herbivores to spawn on 128×128 map. */
  HERBIVORE_COUNT: 64,
  /** Number of carnivores to spawn on 128×128 map. */
  CARNIVORE_COUNT: 32,
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
  /** Builder maximum stamina pool. */
  BUILDER_MAX_STAMINA: 20,
  /** Builder stamina cost per tile moved. */
  BUILDER_STAMINA_COST_PER_MOVE: 1,
  /** Builder stamina recovered per AI tick when not moving. */
  BUILDER_STAMINA_REGEN_PER_TICK: 2,
  /** Builder stamina threshold to exit exhaustion. */
  BUILDER_EXHAUSTED_THRESHOLD: 5,
} as const;

/** Water depth generation constants. */
export const WATER_GENERATION = {
  /** Tiles within this distance of non-water are shallow. */
  SHALLOW_RADIUS: 2,
} as const;

/** Fog of war visibility constants. */
export const FOG_OF_WAR = {
  /** Ticks between visibility recomputation (2 ticks = 0.5s at 4 ticks/sec). */
  TICK_INTERVAL: 2,
  /** Vision radius from territory edge tiles. */
  TERRITORY_EDGE_RADIUS: 3,
  /** Vision radius from HQ center. */
  HQ_RADIUS: 5,
  /** Vision radius from builder pawns. */
  PAWN_RADIUS: 4,
  /** Effective radius modifier per day/night phase. */
  DAY_NIGHT_MODIFIERS: { dawn: -1, day: 0, dusk: -1, night: -2 } as Record<string, number>,
  /** Minimum vision radius after day/night modifiers. */
  MIN_RADIUS: 1,
} as const;

/** Watchtower structure constants. */
export const WATCHTOWER = {
  /** Vision radius from watchtower. */
  RADIUS: 8,
  /** Wood cost to build a watchtower. */
  COST_WOOD: 15,
  /** Stone cost to build a watchtower. */
  COST_STONE: 10,
  /** Maximum watchtowers per player. */
  MAX_PER_PLAYER: 3,
  /** Ticks to complete watchtower construction. */
  BUILD_TICKS: 24,
} as const;

/** Day/night cycle constants (Phase 1 — visual only). */
export const DAY_NIGHT = {
  /** Total ticks for one full day/night cycle (480 ticks = 2 minutes at 4 ticks/sec). */
  CYCLE_LENGTH_TICKS: 480,
  /** Phase definitions with name and percentage boundaries. */
  PHASES: [
    { name: "dawn",  startPercent: 0,  endPercent: 15 },
    { name: "day",   startPercent: 15, endPercent: 50 },
    { name: "dusk",  startPercent: 50, endPercent: 65 },
    { name: "night", startPercent: 65, endPercent: 100 },
  ],
} as const;
