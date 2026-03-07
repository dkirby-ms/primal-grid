import { Container, Graphics, Text } from 'pixi.js';
import { TileType, ResourceType, DEFAULT_MAP_SIZE } from '@primal-grid/shared';
import type { Room } from '@colyseus/sdk';

export const TILE_SIZE = 32;

const TILE_COLORS: Record<number, number> = {
  [TileType.Grassland]: 0x4a7c4f,
  [TileType.Forest]: 0x2d5a27,
  [TileType.Swamp]: 0x556b2f,
  [TileType.Desert]: 0xd2b48c,
  [TileType.Highland]: 0x8b7d6b,
  [TileType.ShallowWater]: 0x5da5d5,
  [TileType.DeepWater]: 0x2e6b9e,
  [TileType.Rock]: 0x7f8c8d,
  [TileType.Sand]: 0xf0d9a0,
};

const RESOURCE_COLORS: Record<number, number> = {
  [ResourceType.Wood]: 0x8b4513,
  [ResourceType.Stone]: 0x999999,
};

/** Linearly interpolate between two packed RGB colors. t=0 returns a, t=1 returns b. */
function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** Parse a CSS hex color string (e.g. "#FF0000") to a numeric color. */
function parseColor(color: string): number {
  if (color.startsWith('#')) return parseInt(color.slice(1), 16);
  return parseInt(color, 16) || 0xffffff;
}

export class GridRenderer {
  public readonly container: Container;
  private tiles: Graphics[][] = [];
  private territoryOverlays: Graphics[][] = [];
  private territoryContainer: Container;
  private hqContainer: Container;
  private hqMarkers: Map<string, Container> = new Map();
  private hqNameLabels: Map<string, Text> = new Map();
  private mapSize: number;
  private playerColors: Map<string, string> = new Map();
  private lastOwnerIDs: string[][] = [];
  private lastShapeHPs: number[][] = [];
  private lastClaiming: boolean[][] = [];
  private lastIsHQTerritory: boolean[][] = [];
  private claimingTiles: Map<string, { x: number; y: number }> = new Map();
  private localPlayerId: string = '';

  constructor(mapSize: number = DEFAULT_MAP_SIZE) {
    this.container = new Container();
    this.territoryContainer = new Container();
    this.hqContainer = new Container();
    this.mapSize = mapSize;
    this.buildGrid();
    this.container.addChild(this.territoryContainer);
    this.container.addChild(this.hqContainer);
  }

  /** Create the initial grid with all-grassland tiles. */
  private buildGrid(): void {
    for (let y = 0; y < this.mapSize; y++) {
      this.tiles[y] = [];
      this.territoryOverlays[y] = [];
      this.lastOwnerIDs[y] = [];
      this.lastShapeHPs[y] = [];
      this.lastClaiming[y] = [];
      this.lastIsHQTerritory[y] = [];
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
        this.lastIsHQTerritory[y][x] = false;
      }
    }
  }

  /** Repaint a single tile, optionally tinting it to indicate a resource. */
  public updateTile(
    x: number, y: number, type: TileType,
    resourceType?: number, resourceAmount?: number,
  ): void {
    if (y < 0 || y >= this.mapSize || x < 0 || x >= this.mapSize) return;
    const g = this.tiles[y][x];
    g.clear();

    const baseColor = TILE_COLORS[type] ?? TILE_COLORS[TileType.Grassland];

    if (resourceAmount && resourceAmount > 0 && resourceType !== undefined && resourceType in RESOURCE_COLORS) {
      // Blend biome color toward resource color (~25%) so the biome stays recognizable
      const tinted = lerpColor(baseColor, RESOURCE_COLORS[resourceType], 0.25);
      g.rect(0, 0, TILE_SIZE, TILE_SIZE);
      g.fill(tinted);
      // Thin inner border in the resource color for extra contrast
      const inset = 2;
      g.rect(inset, inset, TILE_SIZE - inset * 2, TILE_SIZE - inset * 2);
      g.stroke({ width: 1, color: RESOURCE_COLORS[resourceType], alpha: 0.4 });
    } else {
      g.rect(0, 0, TILE_SIZE, TILE_SIZE);
      g.fill(baseColor);
    }
  }

  /** Update the territory overlay for a tile (owned or claiming). */
  private updateTerritoryOverlay(
    x: number, y: number, ownerID: string, shapeHP: number,
    claimingPlayerID: string, claimProgress: number,
    isHQTerritory: boolean = false,
  ): void {
    if (y < 0 || y >= this.mapSize || x < 0 || x >= this.mapSize) return;

    const isClaiming = claimProgress > 0 && claimingPlayerID !== '';
    if (
      this.lastOwnerIDs[y][x] === ownerID &&
      this.lastShapeHPs[y][x] === shapeHP &&
      this.lastClaiming[y][x] === isClaiming &&
      this.lastIsHQTerritory[y][x] === isHQTerritory
    ) return;
    this.lastOwnerIDs[y][x] = ownerID;
    this.lastShapeHPs[y][x] = shapeHP;
    this.lastClaiming[y][x] = isClaiming;
    this.lastIsHQTerritory[y][x] = isHQTerritory;

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
      const isLocal = ownerID === this.localPlayerId;
      const color = isLocal ? 0xffd700 : 0xe6194b;

      // HQ territory gets a subtle fill to visually distinguish from expansion territory
      if (isHQTerritory) {
        overlay.rect(0, 0, TILE_SIZE, TILE_SIZE);
        overlay.fill({ color, alpha: 0.15 });
      }

      // Draw border edges only where neighbor is not same owner
      const borderW = isHQTerritory ? 2.5 : (shapeHP > 0 ? 2 : 1.5);
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

  /** Set the local player's session ID so territory can be color-coded. */
  public setLocalPlayerId(id: string): void {
    this.localPlayerId = id;
  }

  /** Listen to Colyseus state and update tiles when they change. */
  public bindToRoom(room: Room): void {
    room.onStateChange((state: unknown) => {
      const s = state as Record<string, unknown>;

      // Cache player colors for territory overlay
      const players = s['players'];
      if (players && typeof (players as { forEach?: unknown }).forEach === 'function') {
        const currentPlayerIds = new Set<string>();
        (players as { forEach: (cb: (p: unknown, k: unknown) => void) => void })
          .forEach((rawPlayer: unknown, key: unknown) => {
          const player = rawPlayer as Record<string, unknown>;
          const id = (player['id'] as string) ?? String(key);
          const color = (player['color'] as string) ?? '#ffffff';
          const hqX = (player['hqX'] as number) ?? -1;
          const hqY = (player['hqY'] as number) ?? -1;
          const displayName = (player['displayName'] as string) || '';
          this.playerColors.set(id, color);
          currentPlayerIds.add(id);

          // Render HQ marker if player has an HQ
          if (hqX >= 0 && hqY >= 0) {
            this.updateHQMarker(id, hqX, hqY, displayName, color);
          } else {
            this.removeHQMarker(id);
          }
        });

        // Remove markers for players who left
        for (const playerId of this.hqMarkers.keys()) {
          if (!currentPlayerIds.has(playerId)) {
            this.removeHQMarker(playerId);
          }
        }
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
        // Resource info passed to updateTile for background tinting
        const resType = tile['resourceType'] as number | undefined;
        const resAmount = tile['resourceAmount'] as number | undefined;
        this.updateTile(tx, ty, type, resType, resAmount);

        // Territory overlay
        const ownerID = (tile['ownerID'] as string) ?? '';
        const shapeHP = (tile['shapeHP'] as number) ?? 0;
        const claimingPlayerID = (tile['claimingPlayerID'] as string) ?? '';
        const claimProgress = (tile['claimProgress'] as number) ?? 0;
        const isHQTerritory = (tile['isHQTerritory'] as boolean) ?? false;

        // Track if ownership changed so we can refresh neighbor borders
        const prevOwner = this.lastOwnerIDs[ty]?.[tx] ?? '';
        if (prevOwner !== ownerID) {
          changedTiles.push({ x: tx, y: ty });
        }

        this.updateTerritoryOverlay(tx, ty, ownerID, shapeHP, claimingPlayerID, claimProgress, isHQTerritory);
      });

      // Refresh neighbor borders for tiles whose ownership changed
      for (const { x: cx, y: cy } of changedTiles) {
        this.refreshTerritoryBorders(cx, cy);
      }
    });
  }

  /** Show an optimistic claiming overlay immediately (before server confirms). */
  public showOptimisticClaim(x: number, y: number, _playerId: string): void {
    if (y < 0 || y >= this.mapSize || x < 0 || x >= this.mapSize) return;
    const key = `${x},${y}`;
    if (this.claimingTiles.has(key)) return;

    const overlay = this.territoryOverlays[y][x];
    overlay.clear();
    const color = 0xffd700;
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

  public getMapSize(): number {
    return this.mapSize;
  }

  /** Update or create an HQ marker for a player at the given tile coordinates. */
  private updateHQMarker(playerId: string, hqX: number, hqY: number, displayName: string, color: string): void {
    let marker = this.hqMarkers.get(playerId);
    if (!marker) {
      marker = new Container();
      this.hqContainer.addChild(marker);
      this.hqMarkers.set(playerId, marker);

      const label = new Text({
        text: '🏰',
        style: { fontSize: 18, fontFamily: 'monospace' },
      });
      label.anchor.set(0.5, 0.5);
      label.position.set(TILE_SIZE / 2, TILE_SIZE / 2);
      marker.addChild(label);
    }

    marker.position.set(hqX * TILE_SIZE, hqY * TILE_SIZE);

    // Player name label below HQ
    let nameLabel = this.hqNameLabels.get(playerId);
    if (!nameLabel && displayName) {
      nameLabel = new Text({
        text: displayName,
        style: {
          fontSize: 10,
          fontFamily: 'monospace',
          fontWeight: 'bold',
          fill: color,
          stroke: { color: '#000000', width: 3 },
        },
      });
      nameLabel.anchor.set(0.5, 0);
      nameLabel.position.set(TILE_SIZE / 2, TILE_SIZE + 2);
      marker.addChild(nameLabel);
      this.hqNameLabels.set(playerId, nameLabel);
    } else if (nameLabel) {
      if (nameLabel.text !== displayName && displayName) {
        nameLabel.text = displayName;
      }
      nameLabel.style.fill = color;
    }
  }

  /** Remove the HQ marker for a player. */
  private removeHQMarker(playerId: string): void {
    const marker = this.hqMarkers.get(playerId);
    if (marker) {
      this.hqContainer.removeChild(marker);
      this.hqMarkers.delete(playerId);
    }
    this.hqNameLabels.delete(playerId);
  }
}
