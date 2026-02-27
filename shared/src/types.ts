/** Tile terrain types for the world grid. */
export enum TileType {
  Grassland,
  Forest,
  Swamp,
  Desert,
  Highland,
  Water,
  Rock,
  Sand,
}

/** Resource types available on tiles. */
export enum ResourceType {
  Wood = 0,
  Stone = 1,
  Fiber = 2,
  Berries = 3,
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
}

/** Creature type identifiers. */
export type CreatureType = 'herbivore' | 'carnivore';

/** Creature personality types — affects taming speed and behavior. */
export enum Personality {
  Docile = "docile",
  Neutral = "neutral",
  Aggressive = "aggressive",
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
  ownerID: string;
  trust: number;
  speed: number;
  personality: string;
  lastBredTick: number;
  /** Active command assigned by owner. */
  command: string;
  /** X coordinate of assigned zone. */
  zoneX: number;
  /** Y coordinate of assigned zone. */
  zoneY: number;
}

/** Craftable / placeable item types. */
export enum ItemType {
  Wall = 0,
  Floor = 1,
  Workbench = 2,
  FarmPlot = 5,
  Turret = 6,
  HQ = 7,
}

/** State of a structure placed in the world. */
export interface IStructureState {
  id: string;
  structureType: number;
  x: number;
  y: number;
  placedBy: string;
  /** Growth progress for farm plots (0-100). */
  growthProgress?: number;
  /** Whether a farm plot crop is ready for harvest. */
  cropReady?: boolean;
  /** Structure hit points. */
  health: number;
}

/** State of a player in the game world. */
export interface IPlayerState {
  id: string;
  color: string;
  wood: number;
  stone: number;
  fiber: number;
  berries: number;
  workbenches: number;
  farmPlots: number;
  turrets: number;
  /** X coordinate of player's HQ tile. */
  hqX: number;
  /** Y coordinate of player's HQ tile. */
  hqY: number;
  /** Player score for the current round. */
  score: number;
}
