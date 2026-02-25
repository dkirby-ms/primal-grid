import { Schema, type, ArraySchema, MapSchema } from "@colyseus/schema";
import { TileType, ItemType, DEFAULT_MAP_SIZE, DEFAULT_MAP_SEED } from "@primal-grid/shared";

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

  @type("number")
  wood: number = 0;

  @type("number")
  stone: number = 0;

  @type("number")
  fiber: number = 0;

  @type("number")
  berries: number = 0;

  @type("number")
  meat: number = 0;

  @type("number")
  hunger: number = 100;

  @type("number")
  health: number = 100;

  @type("number")
  walls: number = 0;

  @type("number")
  floors: number = 0;

  @type("number")
  workbenches: number = 0;

  @type("number")
  axes: number = 0;

  @type("number")
  pickaxes: number = 0;

  @type("number")
  farmPlots: number = 0;
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

  @type("string")
  ownerID: string = "";

  @type("number")
  trust: number = 0;

  @type("number")
  speed: number = 0;

  @type("string")
  personality: string = "neutral";

  @type("number")
  lastBredTick: number = 0;

  /** Consecutive ticks at trust=0 (for auto-abandon). Not synced to client. */
  zeroTrustTicks: number = 0;
}

export class StructureState extends Schema {
  @type("string")
  id: string = "";

  @type("number")
  structureType: number = ItemType.Wall;

  @type("number")
  x: number = 0;

  @type("number")
  y: number = 0;

  @type("string")
  placedBy: string = "";

  @type("number")
  growthProgress: number = 0;

  @type("boolean")
  cropReady: boolean = false;
}

export class GameState extends Schema {
  @type("number")
  tick: number = 0;

  @type([TileState])
  tiles = new ArraySchema<TileState>();

  @type({ map: PlayerState })
  players = new MapSchema<PlayerState>();

  @type({ map: CreatureState })
  creatures = new MapSchema<CreatureState>();

  @type({ map: StructureState })
  structures = new MapSchema<StructureState>();

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

  /** Check if tile at (x, y) is walkable (not water, not rock, no blocking structure). */
  isWalkable(x: number, y: number): boolean {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    if (tile.type === TileType.Water || tile.type === TileType.Rock) return false;

    // Check for blocking structures (Wall, Workbench block; Floor, FarmPlot do not)
    let blocked = false;
    this.structures.forEach((s) => {
      if (s.x === x && s.y === y) {
        if (s.structureType === ItemType.Wall || s.structureType === ItemType.Workbench) {
          blocked = true;
        }
      }
    });
    return !blocked;
  }
}
