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
}

/** Creature type identifiers. */
export type CreatureType = 'herbivore' | 'carnivore';

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
}
