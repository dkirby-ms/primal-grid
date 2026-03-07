import { Container, Text } from 'pixi.js';
import { TILE_SIZE } from './GridRenderer.js';

/** Duration (ms) for floating damage number animation. */
const FLOAT_DURATION = 1000;
/** Vertical travel (px) for floating damage number. */
const FLOAT_RISE = 30;
/** Duration (ms) for hit flash tint decay. */
const FLASH_DURATION = 250;

interface FloatingNumber {
  text: Text;
  startTime: number;
  startX: number;
  startY: number;
}

interface HitFlash {
  container: Container;
  startTime: number;
}

/**
 * Manages combat visual effects: floating damage numbers and hit flash tints.
 * HP delta detection is performed externally; this class provides spawn/update/cleanup.
 */
export class CombatEffects {
  public readonly container: Container;
  private floats: FloatingNumber[] = [];
  private flashes: HitFlash[] = [];
  private prevHealth: Map<string, number> = new Map();

  constructor() {
    this.container = new Container();
  }

  /**
   * Detect HP changes for a creature and trigger effects.
   * Call once per creature per state update.
   */
  public trackHealth(
    id: string,
    health: number,
    creatureContainer: Container,
    displayX: number,
    displayY: number,
  ): void {
    const prev = this.prevHealth.get(id);
    if (prev !== undefined && health < prev) {
      const delta = prev - health;
      this.spawnFloatingNumber(delta, displayX, displayY);
      this.spawnHitFlash(creatureContainer);
    }
    this.prevHealth.set(id, health);
  }

  /** Remove tracked health for a creature that despawned. */
  public removeCreature(id: string): void {
    this.prevHealth.delete(id);
  }

  /** Advance all active effects. Call once per frame with elapsed ms. */
  public update(now: number): void {
    // Floating numbers: rise + fade
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      const elapsed = now - f.startTime;
      if (elapsed >= FLOAT_DURATION) {
        this.container.removeChild(f.text);
        f.text.destroy();
        this.floats.splice(i, 1);
        continue;
      }
      const t = elapsed / FLOAT_DURATION;
      // ease-out: decelerating curve
      const ease = 1 - (1 - t) * (1 - t);
      f.text.position.set(f.startX, f.startY - FLOAT_RISE * ease);
      f.text.alpha = 1 - t;
    }

    // Hit flashes: decay tint back to white
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const flash = this.flashes[i];
      const elapsed = now - flash.startTime;
      if (elapsed >= FLASH_DURATION) {
        flash.container.tint = 0xffffff;
        this.flashes.splice(i, 1);
        continue;
      }
      const t = elapsed / FLASH_DURATION;
      // Lerp tint from red (0xff4444) back to white (0xffffff)
      const r = Math.round(0xff);
      const g = Math.round(0x44 + (0xff - 0x44) * t);
      const b = Math.round(0x44 + (0xff - 0x44) * t);
      flash.container.tint = (r << 16) | (g << 8) | b;
    }
  }

  private spawnFloatingNumber(damage: number, x: number, y: number): void {
    const text = new Text({
      text: `-${damage}`,
      style: {
        fontSize: 14,
        fontFamily: 'monospace',
        fontWeight: 'bold',
        fill: '#ff3333',
        stroke: { color: '#000000', width: 2 },
      },
    });
    text.anchor?.set?.(0.5, 1);
    text.position.set(x, y - TILE_SIZE * 0.4);

    this.container.addChild(text);
    this.floats.push({
      text,
      startTime: performance.now(),
      startX: x,
      startY: y - TILE_SIZE * 0.4,
    });
  }

  private spawnHitFlash(creatureContainer: Container): void {
    // Remove any existing flash on this container to avoid stacking
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      if (this.flashes[i].container === creatureContainer) {
        this.flashes.splice(i, 1);
      }
    }
    creatureContainer.tint = 0xff4444;
    this.flashes.push({
      container: creatureContainer,
      startTime: performance.now(),
    });
  }
}
