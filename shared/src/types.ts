/** Tile terrain types for the world grid. */
export enum TileType {
  Grass,
  Water,
  Rock,
  Sand,
}

/** State of a single tile on the grid. */
export interface ITileState {
  type: TileType;
  x: number;
  y: number;
}

/** State of a player in the game world. */
export interface IPlayerState {
  id: string;
  x: number;
  y: number;
  color: string;
}
