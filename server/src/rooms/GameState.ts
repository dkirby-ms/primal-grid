import { Schema, type, ArraySchema, MapSchema } from "@colyseus/schema";
import { TileType, DEFAULT_MAP_SIZE } from "@primal-grid/shared";

export class TileState extends Schema {
  @type("number")
  type: number = TileType.Grass;

  @type("number")
  x: number = 0;

  @type("number")
  y: number = 0;
}

export class PlayerState extends Schema {
  @type("string")
  id: string = "";

  @type("number")
  x: number = 0;

  @type("number")
  y: number = 0;

  @type("string")
  color: string = "#ffffff";
}

export class GameState extends Schema {
  @type("number")
  tick: number = 0;

  @type([TileState])
  tiles = new ArraySchema<TileState>();

  @type({ map: PlayerState })
  players = new MapSchema<PlayerState>();

  @type("number")
  mapWidth: number = DEFAULT_MAP_SIZE;

  @type("number")
  mapHeight: number = DEFAULT_MAP_SIZE;

  /** Get tile at (x, y). Returns undefined if out of bounds. */
  getTile(x: number, y: number): TileState | undefined {
    if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) {
      return undefined;
    }
    return this.tiles.at(y * this.mapWidth + x);
  }

  /** Check if tile at (x, y) is walkable (not water, not rock). */
  isWalkable(x: number, y: number): boolean {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    return tile.type !== TileType.Water && tile.type !== TileType.Rock;
  }
}
