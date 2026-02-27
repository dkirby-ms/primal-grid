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

/** Darken a numeric color by a factor (0–1). */
function darkenColor(color: number, factor: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * factor);
  const g = Math.floor(((color >> 8) & 0xff) * factor);
  const b = Math.floor((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

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
  private lastShapeHPs: number[][] = [];
  private lastClaiming: boolean[][] = [];
  private claimingTiles: Map<string, { x: number; y: number }> = new Map();

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
      this.lastShapeHPs[y] = [];
      this.lastClaiming[y] = [];
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
        this.lastShapeHPs[y][x] = 0;
        this.lastClaiming[y][x] = false;

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

  /** Update the territory overlay for a tile (owned or claiming). */
  private updateTerritoryOverlay(
    x: number, y: number, ownerID: string, shapeHP: number,
    claimingPlayerID: string, claimProgress: number,
  ): void {
    if (y < 0 || y >= this.mapSize || x < 0 || x >= this.mapSize) return;

    const isClaiming = claimProgress > 0 && claimingPlayerID !== '';
    if (
      this.lastOwnerIDs[y][x] === ownerID &&
      this.lastShapeHPs[y][x] === shapeHP &&
      this.lastClaiming[y][x] === isClaiming
    ) return;
    this.lastOwnerIDs[y][x] = ownerID;
    this.lastShapeHPs[y][x] = shapeHP;
    this.lastClaiming[y][x] = isClaiming;

    const overlay = this.territoryOverlays[y][x];
    overlay.clear();

    const key = `${x},${y}`;
    if (isClaiming) {
      const colorStr = this.playerColors.get(claimingPlayerID) ?? '#ffffff';
      const color = parseColor(colorStr);
      overlay.rect(0, 0, TILE_SIZE, TILE_SIZE);
      overlay.fill({ color, alpha: 0.5 });
      overlay.stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
      overlay.visible = true;
      this.claimingTiles.set(key, { x, y });
    } else if (ownerID !== '') {
      this.claimingTiles.delete(key);
      overlay.alpha = 1.0;
      const colorStr = this.playerColors.get(ownerID) ?? '#ffffff';
      const color = parseColor(colorStr);
      overlay.rect(0, 0, TILE_SIZE, TILE_SIZE);

      if (shapeHP > 0) {
        overlay.fill({ color, alpha: 0.6 });
        overlay.stroke({ width: 1, color: darkenColor(color, 0.5) });
      } else {
        overlay.fill({ color, alpha: TERRITORY_ALPHA });
      }
      overlay.visible = true;
    } else {
      this.claimingTiles.delete(key);
      overlay.alpha = 1.0;
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
        const shapeHP = (tile['shapeHP'] as number) ?? 0;
        const claimingPlayerID = (tile['claimingPlayerID'] as string) ?? '';
        const claimProgress = (tile['claimProgress'] as number) ?? 0;
        this.updateTerritoryOverlay(tx, ty, ownerID, shapeHP, claimingPlayerID, claimProgress);

        // Resource indicator
        const resType = tile['resourceType'] as number | undefined;
        const resAmount = tile['resourceAmount'] as number | undefined;
        if (resType !== undefined && resAmount !== undefined) {
          this.updateResource(tx, ty, resType, resAmount);
        }
      });
    });
  }

  /** Show an optimistic claiming overlay immediately (before server confirms). */
  public showOptimisticClaim(x: number, y: number, playerId: string): void {
    if (y < 0 || y >= this.mapSize || x < 0 || x >= this.mapSize) return;
    const key = `${x},${y}`;
    if (this.claimingTiles.has(key)) return;

    const overlay = this.territoryOverlays[y][x];
    overlay.clear();
    const colorStr = this.playerColors.get(playerId) ?? '#ffffff';
    const color = parseColor(colorStr);
    overlay.rect(0, 0, TILE_SIZE, TILE_SIZE);
    overlay.fill({ color, alpha: 0.5 });
    overlay.stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
    overlay.visible = true;
    this.claimingTiles.set(key, { x, y });
    // Mark cache as claiming so server state doesn't skip the update
    this.lastClaiming[y][x] = true;
  }

  /** Animate claiming tiles with a pulsing effect. Call from PixiJS ticker. */
  public tick(): void {
    if (this.claimingTiles.size === 0) return;
    const pulse = 0.3 + 0.7 * Math.abs(Math.sin(Date.now() * 0.006));
    for (const { x, y } of this.claimingTiles.values()) {
      this.territoryOverlays[y][x].alpha = pulse;
    }
  }

  public getMapSize(): number {
    return this.mapSize;
  }
}
