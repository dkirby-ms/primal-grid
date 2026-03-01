import { Schema, type, ArraySchema, MapSchema } from "@colyseus/schema";
import { TileType, DEFAULT_MAP_SIZE, DEFAULT_MAP_SEED } from "@primal-grid/shared";

export class TileState extends Schema {
  @type("number")
  type: number = TileType.Grassland;

  @type("number")
  x: number = 0;

  @type("number")
  y: number = 0;

  @type("number")
  fertility: number = 0;

  @type("number")
  moisture: number = 0;

  @type("number")
  resourceType: number = -1;

  @type("number")
  resourceAmount: number = 0;

  @type("number")
  shapeHP: number = 0;

  @type("string")
  ownerID: string = "";

  @type("number")
  claimProgress: number = 0;

  @type("string")
  claimingPlayerID: string = "";
}

export class PlayerState extends Schema {
  @type("string")
  id: string = "";

  @type("string")
  color: string = "#ffffff";

  @type("number")
  wood: number = 0;

  @type("number")
  stone: number = 0;

  @type("number")
  fiber: number = 0;

  @type("number")
  berries: number = 0;

  @type("number")
  hqX: number = -1;

  @type("number")
  hqY: number = -1;

  @type("number")
  score: number = 0;

  @type("number")
  level: number = 1;

  @type("number")
  xp: number = 0;
}

export class CreatureState extends Schema {
  @type("string")
  id: string = "";

  @type("string")
  creatureType: string = "herbivore";

  @type("number")
  x: number = 0;

  @type("number")
  y: number = 0;

  @type("number")
  health: number = 100;

  @type("number")
  hunger: number = 100;

  @type("string")
  currentState: string = "idle";
}

export class GameState extends Schema {
  @type("number")
  tick: number = 0;

  @type("number")
  roundTimer: number = -1;

  @type("string")
  roundPhase: string = "playing";

  @type([TileState])
  tiles = new ArraySchema<TileState>();

  @type({ map: PlayerState })
  players = new MapSchema<PlayerState>();

  @type({ map: CreatureState })
  creatures = new MapSchema<CreatureState>();

  @type("number")
  mapWidth: number = DEFAULT_MAP_SIZE;

  @type("number")
  mapHeight: number = DEFAULT_MAP_SIZE;

  @type("number")
  mapSeed: number = DEFAULT_MAP_SEED;

  /** Get tile at (x, y). Returns undefined if out of bounds. */
  getTile(x: number, y: number): TileState | undefined {
    if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) {
      return undefined;
    }
    return this.tiles.at(y * this.mapWidth + x);
  }

  /** Check if tile at (x, y) is walkable (not water, not rock, no shape block). */
  isWalkable(x: number, y: number): boolean {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    if (tile.type === TileType.Water || tile.type === TileType.Rock) return false;
    if (tile.shapeHP > 0) return false;
    return true;
  }
}
