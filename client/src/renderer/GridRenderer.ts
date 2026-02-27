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
const TERRITORY_ALPHA = 0.25;

/** Parse a CSS hex color string (e.g. "#FF0000") to a numeric color. */
function parseColor(color: string): number {
  if (color.startsWith('#')) return parseInt(color.slice(1), 16);
  return parseInt(color, 16) || 0xffffff;
}

export class GridRenderer {
  public readonly container: Container;
  private tiles: Graphics[][] = [];
  private resourceDots: Graphics[][] = [];
  private territoryOverlays: Graphics[][] = [];
  private territoryContainer: Container;
  private mapSize: number;
  private playerColors: Map<string, string> = new Map();
  private lastOwnerIDs: string[][] = [];

  constructor(mapSize: number = DEFAULT_MAP_SIZE) {
    this.container = new Container();
    this.territoryContainer = new Container();
    this.mapSize = mapSize;
    this.buildGrid();
    this.container.addChild(this.territoryContainer);
  }

  /** Create the initial grid with all-grassland tiles. */
  private buildGrid(): void {
    for (let y = 0; y < this.mapSize; y++) {
      this.tiles[y] = [];
      this.resourceDots[y] = [];
      this.territoryOverlays[y] = [];
      this.lastOwnerIDs[y] = [];
      for (let x = 0; x < this.mapSize; x++) {
        const g = new Graphics();
        g.rect(0, 0, TILE_SIZE, TILE_SIZE);
        g.fill(TILE_COLORS[TileType.Grassland]);
        g.position.set(x * TILE_SIZE, y * TILE_SIZE);
        this.container.addChild(g);
        this.tiles[y][x] = g;

        // Territory overlay (hidden by default)
        const overlay = new Graphics();
        overlay.position.set(x * TILE_SIZE, y * TILE_SIZE);
        overlay.visible = false;
        this.territoryContainer.addChild(overlay);
        this.territoryOverlays[y][x] = overlay;
        this.lastOwnerIDs[y][x] = '';

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

  /** Update the territory overlay for a tile. */
  private updateTerritoryOverlay(x: number, y: number, ownerID: string): void {
    if (y < 0 || y >= this.mapSize || x < 0 || x >= this.mapSize) return;
    if (this.lastOwnerIDs[y][x] === ownerID) return;
    this.lastOwnerIDs[y][x] = ownerID;

    const overlay = this.territoryOverlays[y][x];
    overlay.clear();

    if (ownerID !== '') {
      const colorStr = this.playerColors.get(ownerID) ?? '#ffffff';
      overlay.rect(0, 0, TILE_SIZE, TILE_SIZE);
      overlay.fill({ color: parseColor(colorStr), alpha: TERRITORY_ALPHA });
      overlay.visible = true;
    } else {
      overlay.visible = false;
    }
  }

  /** Listen to Colyseus state and update tiles when they change. */
  public bindToRoom(room: Room): void {
    room.onStateChange((state: unknown) => {
      const s = state as Record<string, unknown>;

      // Cache player colors for territory overlay
      const players = s['players'];
      if (players && typeof (players as { forEach?: unknown }).forEach === 'function') {
        (players as { forEach: (cb: (p: unknown, k: unknown) => void) => void })
          .forEach((rawPlayer: unknown, key: unknown) => {
          const player = rawPlayer as Record<string, unknown>;
          const id = (player['id'] as string) ?? String(key);
          const color = (player['color'] as string) ?? '#ffffff';
          this.playerColors.set(id, color);
        });
      }

      const tiles = s['tiles'];
      if (!tiles || typeof (tiles as { forEach?: unknown }).forEach !== 'function') return;

      // forEach must be called directly on tiles — extracting loses ArraySchema 'this' binding
      (tiles as { forEach: (cb: (tile: unknown, key: unknown) => void) => void })
        .forEach((rawTile: unknown, key: unknown) => {
        const tile = rawTile as Record<string, unknown>;
        const idx = typeof key === 'number' ? key : Number(key);
        const tx = (tile['x'] as number) ?? idx % this.mapSize;
        const ty = (tile['y'] as number) ?? Math.floor(idx / this.mapSize);
        const type = (tile['type'] as TileType) ?? TileType.Grassland;
        this.updateTile(tx, ty, type);

        // Territory overlay
        const ownerID = (tile['ownerID'] as string) ?? '';
        this.updateTerritoryOverlay(tx, ty, ownerID);

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
