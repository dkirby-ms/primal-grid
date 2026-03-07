/**
 * Client-side terrain memory for tiles no longer in the Colyseus StateView.
 *
 * When the server filters tiles via interest management, removed tiles are
 * retained here so the client can render "explored but not visible" terrain
 * with a dimmed fog overlay instead of pure black.
 */

export interface CachedTile {
  tileType: number;
  structureType: string;
}

export class ExploredTileCache {
  /** Map from flat tile index (y * mapWidth + x) to cached terrain data. */
  private cache = new Map<number, CachedTile>();
  private mapWidth: number;

  // Explored bounding box (tile coordinates, inclusive)
  private _minX = Infinity;
  private _minY = Infinity;
  private _maxX = -Infinity;
  private _maxY = -Infinity;
  private boundsDirty = false;

  constructor(mapWidth: number) {
    this.mapWidth = mapWidth;
  }

  /** Cache terrain data when a tile enters the StateView (onAdd). */
  public cacheTile(x: number, y: number, tileType: number, structureType: string): void {
    const idx = y * this.mapWidth + x;
    this.cache.set(idx, { tileType, structureType });

    // Expand bounding box
    if (x < this._minX || x > this._maxX || y < this._minY || y > this._maxY) {
      this._minX = Math.min(this._minX, x);
      this._minY = Math.min(this._minY, y);
      this._maxX = Math.max(this._maxX, x);
      this._maxY = Math.max(this._maxY, y);
      this.boundsDirty = true;
    }
  }

  /** Check whether a tile has ever been seen. */
  public has(x: number, y: number): boolean {
    return this.cache.has(y * this.mapWidth + x);
  }

  /** Retrieve cached terrain data (returns undefined for unexplored tiles). */
  public get(x: number, y: number): CachedTile | undefined {
    return this.cache.get(y * this.mapWidth + x);
  }

  /** Number of explored tiles. */
  public get size(): number {
    return this.cache.size;
  }

  /** Explored bounding box in tile coordinates (inclusive). */
  public get bounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    return {
      minX: this._minX,
      minY: this._minY,
      maxX: this._maxX,
      maxY: this._maxY,
    };
  }

  /** Whether the bounding box has expanded since last acknowledgement. */
  public get hasBoundsChanged(): boolean {
    return this.boundsDirty;
  }

  /** Acknowledge the bounds change (reset dirty flag). */
  public acknowledgeBoundsChange(): void {
    this.boundsDirty = false;
  }
}
