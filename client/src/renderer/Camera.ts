import { Container } from 'pixi.js';
import { TILE_SIZE } from './GridRenderer.js';

const PAN_SPEED = 8;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;

export class Camera {
  private target: Container;
  private viewWidth: number;
  private viewHeight: number;
  private mapPixelSize: number;

  private keys = { w: false, a: false, s: false, d: false };
  private dragging = false;
  private lastMouse = { x: 0, y: 0 };

  private tracking = false;
  private trackingTarget: (() => { x: number; y: number }) | null = null;

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
    const dir = e.deltaY < 0 ? 1 : -1;
    const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.target.scale.x + dir * ZOOM_STEP));
    this.target.scale.set(newScale, newScale);
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
    this.tracking = false;
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

  /** Call once per frame to apply WASD panning or tracking. */
  public update(): void {
    let dx = 0;
    let dy = 0;
    if (this.keys.w) dy += PAN_SPEED;
    if (this.keys.s) dy -= PAN_SPEED;
    if (this.keys.a) dx += PAN_SPEED;
    if (this.keys.d) dx -= PAN_SPEED;

    if (dx !== 0 || dy !== 0) {
      this.tracking = false;
      this.target.position.x += dx;
      this.target.position.y += dy;
      this.clamp();
      return;
    }

    if (this.tracking && this.trackingTarget) {
      const pos = this.trackingTarget();
      this.centerOn(pos.x, pos.y);
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

  /** Register a callback that returns the tile position to track. */
  public setTrackingTarget(getter: () => { x: number; y: number }): void {
    this.trackingTarget = getter;
  }

  /** Toggle center-on-player tracking. Returns the new state. */
  public toggleTracking(): boolean {
    if (!this.trackingTarget) return false;
    this.tracking = !this.tracking;
    return this.tracking;
  }

  public isTracking(): boolean {
    return this.tracking;
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
}
