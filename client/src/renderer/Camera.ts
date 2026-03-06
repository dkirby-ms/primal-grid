import { Container } from 'pixi.js';
import { TILE_SIZE } from './GridRenderer.js';

const PAN_SPEED = 8;
// Zoom levels where scale * TILE_SIZE (32) yields an integer pixel size,
// eliminating sub-pixel seams between tiles.
const ZOOM_LEVELS = [
  0.5, 0.625, 0.75, 0.875,
  1.0, 1.125, 1.25, 1.5, 1.75,
  2.0, 2.25, 2.5, 2.75, 3.0,
];

export class Camera {
  private target: Container;
  private viewWidth: number;
  private viewHeight: number;
  private mapPixelSize: number;

  private keys = { w: false, a: false, s: false, d: false };
  private dragging = false;
  private lastMouse = { x: 0, y: 0 };

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
    const cur = this.target.scale.x;
    // Find the current index (nearest level)
    let idx = 0;
    let minDist = Math.abs(ZOOM_LEVELS[0] - cur);
    for (let i = 1; i < ZOOM_LEVELS.length; i++) {
      const dist = Math.abs(ZOOM_LEVELS[i] - cur);
      if (dist < minDist) { minDist = dist; idx = i; }
    }
    // Step to next/previous level
    const dir = e.deltaY < 0 ? 1 : -1;
    const nextIdx = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, idx + dir));
    this.target.scale.set(ZOOM_LEVELS[nextIdx], ZOOM_LEVELS[nextIdx]);
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

  /** Call once per frame to apply WASD panning. */
  public update(): void {
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

  /** Keep the viewport within map bounds. */
  private clamp(): void {
    const scale = this.target.scale.x;
    const worldW = this.mapPixelSize * scale;
    const worldH = this.mapPixelSize * scale;

    // Don't let the user scroll past the edges
    const minX = this.viewWidth - worldW;
    const minY = this.viewHeight - worldH;

    this.target.position.x = Math.min(0, Math.max(minX, this.target.position.x));
    this.target.position.y = Math.min(0, Math.max(minY, this.target.position.y));
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
