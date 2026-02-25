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

/** State of a single tile on the grid. */
export interface ITileState {
  type: TileType;
  x: number;
  y: number;
  fertility: number;
  moisture: number;
}

/** State of a player in the game world. */
export interface IPlayerState {
  id: string;
  x: number;
  y: number;
  color: string;
}
