import { Container } from 'pixi.js';
import { TILE_SIZE } from './GridRenderer.js';

const PAN_SPEED = 8;
// Zoom levels chosen so that scale * TILE_SIZE produces an integer tile pixel size,
// eliminating sub-pixel seams between tiles for the current TILE_SIZE.
const ZOOM_LEVELS = [
  0.5, 0.625, 0.75, 0.875,
  1.0, 1.125, 1.25, 1.5, 1.75,
  2.0, 2.25, 2.5, 2.75, 3.0,
];

/** Minimum explored area padding in tiles for comfortable scrolling. */
const BOUNDS_PADDING = 2;
/** Minimum viewport extent in tiles so a 5×5 HQ area isn't claustrophobic. */
const MIN_BOUNDS_EXTENT = 10;
/** Lerp speed for smooth bounds expansion (0–1 per frame). */
const BOUNDS_LERP_SPEED = 0.08;

export class Camera {
  private target: Container;
  private viewWidth: number;
  private viewHeight: number;
  private mapPixelSize: number;

  private keys = { w: false, a: false, s: false, d: false };
  private dragging = false;
  private lastMouse = { x: 0, y: 0 };

  // Explored-area camera bounds (in pixels). Null = use full map bounds.
  private exploredBoundsTarget: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  private exploredBoundsCurrent: { minX: number; minY: number; maxX: number; maxY: number } | null = null;

  constructor(target: Container, viewWidth: number, viewHeight: number, mapTiles: number) {
    this.target = target;
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;
    this.mapPixelSize = mapTiles * TILE_SIZE;
    this.bindEvents();
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => this.onKey(e.key.toLowerCase(), true));
    window.addEventListener('keyup', (e) => this.onKey(e.key.toLowerCase(), false));
    window.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', () => this.onMouseUp());
  }

  private onKey(key: string, down: boolean): void {
    if (key in this.keys) {
      this.keys[key as keyof typeof this.keys] = down;
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const oldScale = this.target.scale.x;
    // Find the current index (nearest level)
    let idx = 0;
    let minDist = Math.abs(ZOOM_LEVELS[0] - oldScale);
    for (let i = 1; i < ZOOM_LEVELS.length; i++) {
      const dist = Math.abs(ZOOM_LEVELS[i] - oldScale);
      if (dist < minDist) { minDist = dist; idx = i; }
    }
    // Step to next/previous level
    const dir = e.deltaY < 0 ? 1 : -1;
    const nextIdx = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, idx + dir));
    const newScale = ZOOM_LEVELS[nextIdx];

    // Anchor zoom to the mouse cursor position so the world point under
    // the cursor stays fixed after the scale change.
    const anchorX = e.clientX;
    const anchorY = e.clientY;
    const worldX = (anchorX - this.target.position.x) / oldScale;
    const worldY = (anchorY - this.target.position.y) / oldScale;
    this.target.scale.set(newScale, newScale);
    this.target.position.x = anchorX - worldX * newScale;
    this.target.position.y = anchorY - worldY * newScale;

    this.clamp();
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button === 1 || e.button === 2) {
      // Middle or right click to drag
      this.dragging = true;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastMouse.x;
    const dy = e.clientY - this.lastMouse.y;
    this.target.position.x += dx;
    this.target.position.y += dy;
    this.lastMouse = { x: e.clientX, y: e.clientY };
    this.clamp();
  }

  private onMouseUp(): void {
    this.dragging = false;
  }

  /**
   * Update the explored bounding box (in tile coordinates).
   * The camera will smoothly lerp to the new bounds.
   */
  public setExploredBounds(minTileX: number, minTileY: number, maxTileX: number, maxTileY: number): void {
    // Apply padding and enforce minimum extent
    const centerX = (minTileX + maxTileX) / 2;
    const centerY = (minTileY + maxTileY) / 2;
    const halfW = Math.max((maxTileX - minTileX) / 2 + BOUNDS_PADDING, MIN_BOUNDS_EXTENT / 2);
    const halfH = Math.max((maxTileY - minTileY) / 2 + BOUNDS_PADDING, MIN_BOUNDS_EXTENT / 2);

    const mapTiles = this.mapPixelSize / TILE_SIZE;
    const padMinX = Math.max(0, centerX - halfW) * TILE_SIZE;
    const padMinY = Math.max(0, centerY - halfH) * TILE_SIZE;
    const padMaxX = Math.min(mapTiles, centerX + halfW + 1) * TILE_SIZE;
    const padMaxY = Math.min(mapTiles, centerY + halfH + 1) * TILE_SIZE;

    this.exploredBoundsTarget = { minX: padMinX, minY: padMinY, maxX: padMaxX, maxY: padMaxY };

    // First-time: snap immediately instead of lerping from zero
    if (!this.exploredBoundsCurrent) {
      this.exploredBoundsCurrent = { ...this.exploredBoundsTarget };
    }
  }

  /** Call once per frame to apply WASD panning. */
  public update(): void {
    // Smoothly lerp camera bounds toward target
    if (this.exploredBoundsTarget && this.exploredBoundsCurrent) {
      const t = this.exploredBoundsTarget;
      const c = this.exploredBoundsCurrent;
      c.minX += (t.minX - c.minX) * BOUNDS_LERP_SPEED;
      c.minY += (t.minY - c.minY) * BOUNDS_LERP_SPEED;
      c.maxX += (t.maxX - c.maxX) * BOUNDS_LERP_SPEED;
      c.maxY += (t.maxY - c.maxY) * BOUNDS_LERP_SPEED;
    }

    let dx = 0;
    let dy = 0;
    if (this.keys.w) dy += PAN_SPEED;
    if (this.keys.s) dy -= PAN_SPEED;
    if (this.keys.a) dx += PAN_SPEED;
    if (this.keys.d) dx -= PAN_SPEED;

    if (dx !== 0 || dy !== 0) {
      this.target.position.x += dx;
      this.target.position.y += dy;
      this.clamp();
    }
  }

  /** Keep the viewport within bounds (explored area if set, otherwise full map). */
  private clamp(): void {
    const scale = this.target.scale.x;
    const b = this.exploredBoundsCurrent;

    if (b) {
      // Clamp to explored bounding box
      const worldMinX = b.minX * scale;
      const worldMinY = b.minY * scale;
      const worldMaxX = b.maxX * scale;
      const worldMaxY = b.maxY * scale;
      const worldW = worldMaxX - worldMinX;
      const worldH = worldMaxY - worldMinY;

      if (worldW <= this.viewWidth) {
        // Explored area fits in viewport — center it
        this.target.position.x = this.viewWidth / 2 - (worldMinX + worldW / 2);
      } else {
        const maxPosX = -worldMinX;
        const minPosX = this.viewWidth - worldMaxX;
        this.target.position.x = Math.min(maxPosX, Math.max(minPosX, this.target.position.x));
      }

      if (worldH <= this.viewHeight) {
        this.target.position.y = this.viewHeight / 2 - (worldMinY + worldH / 2);
      } else {
        const maxPosY = -worldMinY;
        const minPosY = this.viewHeight - worldMaxY;
        this.target.position.y = Math.min(maxPosY, Math.max(minPosY, this.target.position.y));
      }
    } else {
      // Full map bounds (original behavior)
      const worldW = this.mapPixelSize * scale;
      const worldH = this.mapPixelSize * scale;
      const minX = this.viewWidth - worldW;
      const minY = this.viewHeight - worldH;
      this.target.position.x = Math.min(0, Math.max(minX, this.target.position.x));
      this.target.position.y = Math.min(0, Math.max(minY, this.target.position.y));
    }
  }

  public resize(w: number, h: number): void {
    this.viewWidth = w;
    this.viewHeight = h;
    this.clamp();
  }

  /** Center the viewport on a tile position. */
  public centerOn(tileX: number, tileY: number): void {
    const scale = this.target.scale.x;
    const worldX = tileX * TILE_SIZE + TILE_SIZE / 2;
    const worldY = tileY * TILE_SIZE + TILE_SIZE / 2;
    this.target.position.x = this.viewWidth / 2 - worldX * scale;
    this.target.position.y = this.viewHeight / 2 - worldY * scale;
    this.clamp();
  }

  /** Center camera on HQ tile position. */
  public centerOnHQ(hqX: number, hqY: number): void {
    this.centerOn(hqX, hqY);
  }
}
