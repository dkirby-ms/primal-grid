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
  private shapePreviewContainer: Container;
  private shapePreviewGraphics: Graphics[] = [];
  private mapSize: number;
  private playerColors: Map<string, string> = new Map();
  private lastOwnerIDs: string[][] = [];
  private lastShapeHPs: number[][] = [];
  private lastClaiming: boolean[][] = [];
  private claimingTiles: Map<string, { x: number; y: number }> = new Map();

  constructor(mapSize: number = DEFAULT_MAP_SIZE) {
    this.container = new Container();
    this.territoryContainer = new Container();
    this.shapePreviewContainer = new Container();
    this.mapSize = mapSize;
    this.buildGrid();
    this.container.addChild(this.territoryContainer);
    this.container.addChild(this.shapePreviewContainer);
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
      // Pulsing dashed border — no fill
      const colorStr = this.playerColors.get(claimingPlayerID) ?? '#ffffff';
      const color = parseColor(colorStr);
      overlay.rect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
      overlay.stroke({ width: 2, color, alpha: 0.8 });
      overlay.visible = true;
      this.claimingTiles.set(key, { x, y });
    } else if (ownerID !== '') {
      this.claimingTiles.delete(key);
      overlay.alpha = 1.0;
      const colorStr = this.playerColors.get(ownerID) ?? '#ffffff';
      const color = parseColor(colorStr);

      // Draw border edges only where neighbor is not same owner
      const borderW = shapeHP > 0 ? 2 : 1.5;
      const dirs: [number, number, number, number, number, number, number, number][] = [
        // [nx, ny, lineX1, lineY1, lineX2, lineY2, ... unused]
      ];
      // Top edge
      if (!this.isSameOwner(x, y - 1, ownerID)) {
        overlay.moveTo(0, 0); overlay.lineTo(TILE_SIZE, 0);
        overlay.stroke({ width: borderW, color });
      }
      // Bottom edge
      if (!this.isSameOwner(x, y + 1, ownerID)) {
        overlay.moveTo(0, TILE_SIZE); overlay.lineTo(TILE_SIZE, TILE_SIZE);
        overlay.stroke({ width: borderW, color });
      }
      // Left edge
      if (!this.isSameOwner(x - 1, y, ownerID)) {
        overlay.moveTo(0, 0); overlay.lineTo(0, TILE_SIZE);
        overlay.stroke({ width: borderW, color });
      }
      // Right edge
      if (!this.isSameOwner(x + 1, y, ownerID)) {
        overlay.moveTo(TILE_SIZE, 0); overlay.lineTo(TILE_SIZE, TILE_SIZE);
        overlay.stroke({ width: borderW, color });
      }

      overlay.visible = true;
    } else {
      this.claimingTiles.delete(key);
      overlay.alpha = 1.0;
      overlay.visible = false;
    }
  }

  /** Check if tile at (x,y) is owned by the given player. */
  private isSameOwner(x: number, y: number, ownerID: string): boolean {
    if (x < 0 || x >= this.mapSize || y < 0 || y >= this.mapSize) return false;
    return this.lastOwnerIDs[y][x] === ownerID;
  }

  /** Force redraw of territory borders for a tile and its neighbors. */
  private refreshTerritoryBorders(x: number, y: number): void {
    const ownerID = this.lastOwnerIDs[y]?.[x] ?? '';
    const shapeHP = this.lastShapeHPs[y]?.[x] ?? 0;
    const isClaiming = this.lastClaiming[y]?.[x] ?? false;
    // Reset cache to force redraw
    this.lastOwnerIDs[y][x] = '__dirty__';
    this.updateTerritoryOverlay(x, y, ownerID, shapeHP,
      isClaiming ? ownerID : '', isClaiming ? 1 : 0);
    // Also refresh cardinal neighbors so their borders update
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= this.mapSize || ny < 0 || ny >= this.mapSize) continue;
      const nOwner = this.lastOwnerIDs[ny][nx];
      if (nOwner === '' || nOwner === '__dirty__') continue;
      const nHP = this.lastShapeHPs[ny][nx];
      const nClaiming = this.lastClaiming[ny][nx];
      this.lastOwnerIDs[ny][nx] = '__dirty__';
      this.updateTerritoryOverlay(nx, ny, nOwner, nHP,
        nClaiming ? nOwner : '', nClaiming ? 1 : 0);
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
      const changedTiles: { x: number; y: number }[] = [];
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

        // Track if ownership changed so we can refresh neighbor borders
        const prevOwner = this.lastOwnerIDs[ty]?.[tx] ?? '';
        if (prevOwner !== ownerID) {
          changedTiles.push({ x: tx, y: ty });
        }

        this.updateTerritoryOverlay(tx, ty, ownerID, shapeHP, claimingPlayerID, claimProgress);

        // Resource indicator
        const resType = tile['resourceType'] as number | undefined;
        const resAmount = tile['resourceAmount'] as number | undefined;
        if (resType !== undefined && resAmount !== undefined) {
          this.updateResource(tx, ty, resType, resAmount);
        }
      });

      // Refresh neighbor borders for tiles whose ownership changed
      for (const { x: cx, y: cy } of changedTiles) {
        this.refreshTerritoryBorders(cx, cy);
      }
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
    overlay.rect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
    overlay.stroke({ width: 2, color, alpha: 0.8 });
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

  /** Get the color assigned to a player (for preview rendering). */
  public getPlayerColor(playerId: string): string {
    return this.playerColors.get(playerId) ?? '#ffffff';
  }

  /** Render a translucent ghost preview of a shape at the given tile position. */
  public updateShapePreview(cells: { dx: number; dy: number }[], tileX: number, tileY: number, color: string): void {
    const numColor = parseColor(color);

    // Reuse or create Graphics objects as needed
    while (this.shapePreviewGraphics.length < cells.length) {
      const g = new Graphics();
      this.shapePreviewContainer.addChild(g);
      this.shapePreviewGraphics.push(g);
    }
    // Hide excess graphics from previous frame
    for (let i = cells.length; i < this.shapePreviewGraphics.length; i++) {
      this.shapePreviewGraphics[i].visible = false;
    }

    for (let i = 0; i < cells.length; i++) {
      const g = this.shapePreviewGraphics[i];
      g.clear();
      g.rect(0, 0, TILE_SIZE, TILE_SIZE);
      g.fill({ color: numColor, alpha: 0.35 });
      g.rect(0, 0, TILE_SIZE, TILE_SIZE);
      g.stroke({ width: 1.5, color: numColor, alpha: 0.7 });
      g.position.set((tileX + cells[i].dx) * TILE_SIZE, (tileY + cells[i].dy) * TILE_SIZE);
      g.visible = true;
    }
  }

  /** Clear the shape ghost preview. */
  public clearShapePreview(): void {
    for (const g of this.shapePreviewGraphics) {
      g.visible = false;
    }
  }

  public getMapSize(): number {
    return this.mapSize;
  }
}
