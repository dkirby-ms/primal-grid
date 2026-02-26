import { Container, Graphics } from 'pixi.js';
import { TileType, ResourceType, DEFAULT_MAP_SIZE } from '@primal-grid/shared';
import type { Room } from '@colyseus/sdk';

export const TILE_SIZE = 32;

const TILE_COLORS: Record<number, number> = {
  [TileType.Grassland]: 0x4a7c4f,
  [TileType.Forest]: 0x2d5a27,
  [TileType.Swamp]: 0x556b2f,
  [TileType.Desert]: 0xd2b48c,
  [TileType.Highland]: 0x8b7d6b,
  [TileType.Water]: 0x3498db,
  [TileType.Rock]: 0x7f8c8d,
  [TileType.Sand]: 0xf0d9a0,
};

const RESOURCE_COLORS: Record<number, number> = {
  [ResourceType.Wood]: 0x8b4513,
  [ResourceType.Stone]: 0x999999,
  [ResourceType.Fiber]: 0x90ee90,
  [ResourceType.Berries]: 0xda70d6,
};

const RESOURCE_DOT_SIZE = 5;
const RESOURCE_DOT_OFFSET = 4;

export class GridRenderer {
  public readonly container: Container;
  private tiles: Graphics[][] = [];
  private resourceDots: Graphics[][] = [];
  private mapSize: number;

  constructor(mapSize: number = DEFAULT_MAP_SIZE) {
    this.container = new Container();
    this.mapSize = mapSize;
    this.buildGrid();
  }

  /** Create the initial grid with all-grassland tiles. */
  private buildGrid(): void {
    for (let y = 0; y < this.mapSize; y++) {
      this.tiles[y] = [];
      this.resourceDots[y] = [];
      for (let x = 0; x < this.mapSize; x++) {
        const g = new Graphics();
        g.rect(0, 0, TILE_SIZE, TILE_SIZE);
        g.fill(TILE_COLORS[TileType.Grassland]);
        g.position.set(x * TILE_SIZE, y * TILE_SIZE);
        this.container.addChild(g);
        this.tiles[y][x] = g;

        // Resource indicator (hidden by default)
        const dot = new Graphics();
        dot.position.set(
          x * TILE_SIZE + TILE_SIZE - RESOURCE_DOT_OFFSET - RESOURCE_DOT_SIZE,
          y * TILE_SIZE + RESOURCE_DOT_OFFSET,
        );
        dot.visible = false;
        this.container.addChild(dot);
        this.resourceDots[y][x] = dot;
      }
    }
  }

  /** Repaint a single tile to a new type. */
  public updateTile(x: number, y: number, type: TileType): void {
    if (y < 0 || y >= this.mapSize || x < 0 || x >= this.mapSize) return;
    const g = this.tiles[y][x];
    g.clear();
    g.rect(0, 0, TILE_SIZE, TILE_SIZE);
    g.fill(TILE_COLORS[type] ?? TILE_COLORS[TileType.Grassland]);
  }

  /** Update the resource indicator on a tile. */
  public updateResource(x: number, y: number, resourceType: number, resourceAmount: number): void {
    if (y < 0 || y >= this.mapSize || x < 0 || x >= this.mapSize) return;
    const dot = this.resourceDots[y][x];
    if (resourceAmount > 0 && resourceType in RESOURCE_COLORS) {
      dot.clear();
      dot.rect(0, 0, RESOURCE_DOT_SIZE, RESOURCE_DOT_SIZE);
      dot.fill(RESOURCE_COLORS[resourceType]);
      dot.visible = true;
    } else {
      dot.visible = false;
    }
  }

  /** Listen to Colyseus state and update tiles when they change. */
  public bindToRoom(room: Room): void {
    // Adapt to whichever schema shape Pemulis ships.
    room.onStateChange((state: unknown) => {
      const s = state as Record<string, unknown>;
      const tiles = s['tiles'];
      if (!tiles || typeof (tiles as { forEach?: unknown }).forEach !== 'function') return;

      (tiles as { forEach: (cb: (tile: unknown, key: unknown) => void) => void })
        .forEach((rawTile: unknown, key: unknown) => {
        const tile = rawTile as Record<string, unknown>;
        const idx = typeof key === 'number' ? key : Number(key);
        const tx = (tile['x'] as number) ?? idx % this.mapSize;
        const ty = (tile['y'] as number) ?? Math.floor(idx / this.mapSize);
        const type = (tile['type'] as TileType) ?? TileType.Grassland;
        this.updateTile(tx, ty, type);

        // Resource indicator
        const resType = tile['resourceType'] as number | undefined;
        const resAmount = tile['resourceAmount'] as number | undefined;
        if (resType !== undefined && resAmount !== undefined) {
          this.updateResource(tx, ty, resType, resAmount);
        }
      });
    });
  }

  public getMapSize(): number {
    return this.mapSize;
  }
}
