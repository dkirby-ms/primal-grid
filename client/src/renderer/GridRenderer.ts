import { Container, Graphics } from 'pixi.js';
import { TileType, DEFAULT_MAP_SIZE } from '@primal-grid/shared';
import type { Room } from 'colyseus.js';

export const TILE_SIZE = 32;

const TILE_COLORS: Record<number, number> = {
  [TileType.Grass]: 0x4a7c4f,
  [TileType.Water]: 0x3498db,
  [TileType.Rock]: 0x7f8c8d,
  [TileType.Sand]: 0xf0d9a0,
};

export class GridRenderer {
  public readonly container: Container;
  private tiles: Graphics[][] = [];
  private mapSize: number;

  constructor(mapSize: number = DEFAULT_MAP_SIZE) {
    this.container = new Container();
    this.mapSize = mapSize;
    this.buildGrid();
  }

  /** Create the initial grid with all-grass tiles. */
  private buildGrid(): void {
    for (let y = 0; y < this.mapSize; y++) {
      this.tiles[y] = [];
      for (let x = 0; x < this.mapSize; x++) {
        const g = new Graphics();
        g.rect(0, 0, TILE_SIZE, TILE_SIZE);
        g.fill(TILE_COLORS[TileType.Grass]);
        g.position.set(x * TILE_SIZE, y * TILE_SIZE);
        this.container.addChild(g);
        this.tiles[y][x] = g;
      }
    }
  }

  /** Repaint a single tile to a new type. */
  public updateTile(x: number, y: number, type: TileType): void {
    if (y < 0 || y >= this.mapSize || x < 0 || x >= this.mapSize) return;
    const g = this.tiles[y][x];
    g.clear();
    g.rect(0, 0, TILE_SIZE, TILE_SIZE);
    g.fill(TILE_COLORS[type] ?? TILE_COLORS[TileType.Grass]);
  }

  /** Listen to Colyseus state and update tiles when they change. */
  public bindToRoom(room: Room): void {
    // Adapt to whichever schema shape Pemulis ships.
    room.onStateChange((state: unknown) => {
      const s = state as Record<string, unknown>;
      const tiles = s['tiles'];
      if (!tiles || typeof (tiles as { forEach?: unknown }).forEach !== 'function') return;

      const forEach = (tiles as { forEach: (cb: (tile: unknown, key: unknown) => void) => void })
        .forEach;
      forEach((rawTile: unknown, key: unknown) => {
        const tile = rawTile as Record<string, unknown>;
        const idx = typeof key === 'number' ? key : Number(key);
        const tx = (tile['x'] as number) ?? idx % this.mapSize;
        const ty = (tile['y'] as number) ?? Math.floor(idx / this.mapSize);
        const type = (tile['type'] as TileType) ?? TileType.Grass;
        this.updateTile(tx, ty, type);
      });
    });
  }

  public getMapSize(): number {
    return this.mapSize;
  }
}
