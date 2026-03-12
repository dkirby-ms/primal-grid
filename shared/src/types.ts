/** Tile terrain types for the world grid. */
export enum TileType {
  Grassland,
  Forest,
  Swamp,
  Desert,
  Highland,
  ShallowWater,
  DeepWater,
  Rock,
  Sand,
}

/** Check if a tile type is any water variant (shallow or deep). */
export function isWaterTile(tileType: TileType): boolean {
  return tileType === TileType.ShallowWater || tileType === TileType.DeepWater;
}

/** Resource types available on tiles. */
export enum ResourceType {
  Wood = 0,
  Stone = 1,
  Food = 2,
}

/** State of a single tile on the grid. */
export interface ITileState {
  type: TileType;
  x: number;
  y: number;
  fertility: number;
  moisture: number;
  /** Resource type on this tile, or -1 for none. */
  resourceType: number;
  /** Resource amount remaining (0-10). */
  resourceAmount: number;
  /** Hit points of a placed shape block on this tile (0 = no block). */
  shapeHP: number;
  /** Player who owns this tile (empty string = unclaimed). */
  ownerID: string;
  /** Whether this tile is part of a player's immutable HQ zone. */
  isHQTerritory: boolean;
  /** Structure type on this tile ("" = none, "hq", "outpost", "farm"). */
  structureType: string;
  /** Whether this outpost has been upgraded to ranged defense. */
  upgraded: boolean;
  /** Ticks remaining until upgraded outpost can attack again. */
  attackCooldown: number;
}

/** Creature type identifiers. */
export type CreatureType = 'herbivore' | 'carnivore';

/** Check if a creature type is an enemy base. */
export function isEnemyBase(creatureType: string): boolean {
  return creatureType.startsWith("enemy_base_");
}

/** Check if a creature type is an enemy mobile. */
export function isEnemyMobile(creatureType: string): boolean {
  return creatureType === "enemy_scout"
      || creatureType === "enemy_raider"
      || creatureType === "enemy_swarm";
}

/** Check if a creature type is a player-owned pawn. */
export function isPlayerPawn(creatureType: string): boolean {
  return creatureType.startsWith("pawn_");
}

/** Check if a pawn type is a combat pawn (defender or attacker). */
export function isCombatPawn(pawnType: string): boolean {
  return pawnType === "defender" || pawnType === "attacker";
}

/** Check if a creature type is a grave marker (inert death remnant). */
export function isGraveMarker(creatureType: string): boolean {
  return creatureType === "grave_marker";
}

/** State of a creature in the game world. */
export interface ICreatureState {
  id: string;
  creatureType: string;
  x: number;
  y: number;
  health: number;
  hunger: number;
  currentState: string;
  /** Player who owns this creature (empty for wildlife). */
  ownerID: string;
  /** Pawn type (empty for wildlife, "builder" for builders). */
  pawnType: string;
  /** Target X coordinate (-1 = no target). */
  targetX: number;
  /** Target Y coordinate (-1 = no target). */
  targetY: number;
  /** Build progress (0 to BUILD_TIME_TICKS). */
  buildProgress: number;
  /** What the builder builds: "outpost" (default) or "farm". */
  buildMode: string;
  /** Tick at which this creature next takes an AI step. */
  nextMoveTick: number;
  /** Current stamina level. */
  stamina: number;
}

/** Fog of war tile visibility states. */
export enum FogState {
  Unexplored = 0,
  Explored = 1,
  Visible = 2,
}

/** Reasons a game can end. */
export enum GameEndReason {
  LastStanding = "last_standing",
  TimeUp = "time_up",
  Surrender = "surrender",
}

/** Day/night cycle phase identifiers. */
export enum DayPhase {
  Dawn = "dawn",
  Day = "day",
  Dusk = "dusk",
  Night = "night",
}

/** Placeable item types. */
export enum ItemType {
  HQ = 7,
}

/** State of a player in the game world. */
export interface IPlayerState {
  id: string;
  /** Player's chosen display name (empty string = unnamed). */
  displayName: string;
  color: string;
  wood: number;
  stone: number;
  food: number;
  /** X coordinate of player's HQ tile. */
  hqX: number;
  /** Y coordinate of player's HQ tile. */
  hqY: number;
  /** Player score for the current round. */
  score: number;
  /** Player's current level (1–7). */
  level: number;
  /** Experience points earned this round. */
  xp: number;
  /** Whether this player has been eliminated from the current game. */
  isEliminated: boolean;
}
