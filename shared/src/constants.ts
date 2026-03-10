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

/** Enemy base type definition. */
export interface EnemyBaseTypeDef {
  readonly name: string;
  readonly icon: string;
  readonly health: number;
  readonly spawnInterval: number;
  readonly spawnType: string;
  readonly maxMobiles: number;
  readonly color: number;
  /** Resources awarded to the player who destroys this base. */
  readonly reward: { wood: number; stone: number };
}

/** Enemy mobile type definition. */
export interface EnemyMobileTypeDef {
  readonly name: string;
  readonly icon: string;
  readonly health: number;
  readonly damage: number;
  readonly tileDamage: number;
  readonly speed: number;
  readonly detectionRadius: number;
  readonly color: number;
}

/** Pawn type definition (builder, defender, attacker). */
export interface PawnTypeDef {
  readonly name: string;
  readonly icon: string;
  readonly creatureType: string;
  readonly health: number;
  readonly cost: { wood: number; stone: number };
  readonly maxCount: number;
  readonly damage: number;
  readonly detectionRadius: number;
  readonly maxStamina: number;
  readonly staminaCostPerMove: number;
  readonly staminaRegenPerTick: number;
  readonly exhaustedThreshold: number;
  readonly visionRadius: number;
}

/** Enemy base type registry. */
export const ENEMY_BASE_TYPES: Record<string, EnemyBaseTypeDef> = {
  enemy_base_raider: {
    name: "Raider Camp",
    icon: "⛺",
    health: 200,
    spawnInterval: 80,
    spawnType: "enemy_raider",
    maxMobiles: 3,
    color: 0xcc0000,
    reward: { wood: 15, stone: 10 },
  },
  enemy_base_hive: {
    name: "Hive",
    icon: "🪺",
    health: 150,
    spawnInterval: 40,
    spawnType: "enemy_swarm",
    maxMobiles: 6,
    color: 0xcccc00,
    reward: { wood: 10, stone: 5 },
  },
  enemy_base_fortress: {
    name: "Fortress",
    icon: "🏰",
    health: 400,
    spawnInterval: 120,
    spawnType: "enemy_raider",
    maxMobiles: 4,
    color: 0x880000,
    reward: { wood: 25, stone: 20 },
  },
};

/** Enemy mobile type registry. */
export const ENEMY_MOBILE_TYPES: Record<string, EnemyMobileTypeDef> = {
  enemy_scout: {
    name: "Scout",
    icon: "👁",
    health: 20,
    damage: 5,
    tileDamage: 10,
    speed: 1,
    detectionRadius: 6,
    color: 0xff6600,
  },
  enemy_raider: {
    name: "Raider",
    icon: "⚔",
    health: 40,
    damage: 15,
    tileDamage: 25,
    speed: 2,
    detectionRadius: 4,
    color: 0xff0000,
  },
  enemy_swarm: {
    name: "Swarm",
    icon: "🐛",
    health: 15,
    damage: 8,
    tileDamage: 5,
    speed: 1,
    detectionRadius: 3,
    color: 0xffcc00,
  },
};

/** Pawn type registry (builder, defender, attacker). */
export const PAWN_TYPES: Record<string, PawnTypeDef> = {
  builder: {
    name: "Builder",
    icon: "🔨",
    creatureType: "pawn_builder",
    health: 50,
    cost: { wood: 10, stone: 5 },
    maxCount: 5,
    damage: 0,
    detectionRadius: 0,
    maxStamina: 20,
    staminaCostPerMove: 1,
    staminaRegenPerTick: 2,
    exhaustedThreshold: 5,
    visionRadius: 4,
  },
  defender: {
    name: "Defender",
    icon: "🛡",
    creatureType: "pawn_defender",
    health: 80,
    cost: { wood: 15, stone: 10 },
    maxCount: 3,
    damage: 20,
    detectionRadius: 5,
    maxStamina: 25,
    staminaCostPerMove: 1,
    staminaRegenPerTick: 2,
    exhaustedThreshold: 5,
    visionRadius: 4,
  },
  attacker: {
    name: "Attacker",
    icon: "⚔",
    creatureType: "pawn_attacker",
    health: 60,
    cost: { wood: 20, stone: 15 },
    maxCount: 2,
    damage: 25,
    detectionRadius: 6,
    maxStamina: 30,
    staminaCostPerMove: 1,
    staminaRegenPerTick: 2,
    exhaustedThreshold: 5,
    visionRadius: 5,
  },
  explorer: {
    name: "Explorer",
    icon: "🔭",
    creatureType: "pawn_explorer",
    health: 35,
    cost: { wood: 12, stone: 8 },
    maxCount: 3,
    damage: 0,
    detectionRadius: 0,
    maxStamina: 30,
    staminaCostPerMove: 1,
    staminaRegenPerTick: 2,
    exhaustedThreshold: 5,
    visionRadius: 6,
  },
};

/** Grave marker constants. */
export const GRAVE_MARKER = {
  /** Ticks before a grave marker decays (480 ticks ≈ 2 minutes at 4 ticks/sec). */
  DECAY_TICKS: 480,
} as const;

/** Combat resolution constants. */
export const COMBAT = {
  ATTACK_COOLDOWN_TICKS: 4,
  TILE_ATTACK_COOLDOWN_TICKS: 8,
  COMBAT_TICK_INTERVAL: 2,
} as const;

/** Enemy spawning constants (replaces WAVE_SPAWNER). */
export const ENEMY_SPAWNING = {
  BASE_SPAWN_INTERVAL_TICKS: 120,
  MAX_BASES: 8,
  MIN_DISTANCE_FROM_HQ: 15,
  MIN_DISTANCE_BETWEEN_BASES: 10,
  FIRST_BASE_DELAY_TICKS: 240,
  /** Manhattan radius around player territory that rejects enemy base spawns. */
  MIN_DISTANCE_FROM_TERRITORY: 5,
  /** Maximum ticks an attacker stays on sortie before returning. */
  ATTACKER_SORTIE_TICKS: 200,
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

/** Building placement costs (instant placement via PLACE_BUILDING). */
export const BUILDING_COSTS: Record<string, { wood: number; stone: number }> = {
  farm: { wood: 12, stone: 6 },
  factory: { wood: 20, stone: 12 },
} as const;

/** Per-building income awarded each structure income tick. */
export const BUILDING_INCOME: Record<string, { wood: number; stone: number }> = {
  farm: { wood: 1, stone: 1 },
  factory: { wood: 2, stone: 1 },
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

/** CPU player constants. */
export const CPU_PLAYER = {
  /** Maximum CPU players per game. */
  MAX_COUNT: 7,
  /** Ticks between CPU AI decision evaluations (~4 seconds at 4 ticks/sec). */
  TICK_INTERVAL: 16,
  /** Session ID prefix for CPU players. */
  SESSION_PREFIX: "cpu_",
  /** Display names assigned to CPU players in order. */
  NAMES: ["Atlas", "Borealis", "Cypher", "Draco", "Echo", "Fenrir", "Golem"],
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
