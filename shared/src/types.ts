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
}

/** Craftable / placeable item types. */
export enum ItemType {
  Wall = 0,
  Floor = 1,
  Workbench = 2,
  Axe = 3,
  Pickaxe = 4,
  FarmPlot = 5,
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
}

/** State of a player in the game world. */
export interface IPlayerState {
  id: string;
  x: number;
  y: number;
  color: string;
  wood: number;
  stone: number;
  fiber: number;
  berries: number;
  hunger: number;
  health: number;
  walls: number;
  floors: number;
  workbenches: number;
  axes: number;
  pickaxes: number;
  farmPlots: number;
}
