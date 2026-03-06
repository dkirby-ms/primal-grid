import { Container, Graphics } from 'pixi.js';
import { TILE_SIZE } from './GridRenderer.js';

// ---------------------------------------------------------------------------
// Rendering-only constants (not game tuning — lives in client, not shared/)
// ---------------------------------------------------------------------------

const MAX_PARTICLES = 150;

const DAWN_COUNT = 35;
const DAY_COUNT = 8;
const DUSK_COUNT = 35;
const NIGHT_STAR_COUNT = 70;
const NIGHT_FIREFLY_COUNT = 18;

const DAWN_COLOR = 0xffd700;
const DUSK_COLOR = 0xff8c00;
const STAR_COLOR = 0xcce0ff;
const FIREFLY_COLOR = 0x9acd32;

// Phase overlay tints (RGBA packed as {color, alpha})
const OVERLAY_TINTS: Record<string, { color: number; alpha: number }> = {
  dawn:  { color: 0xffd700, alpha: 0.08 },
  day:   { color: 0xfffff0, alpha: 0.02 },
  dusk:  { color: 0xcc6600, alpha: 0.10 },
  night: { color: 0x1a1a4e, alpha: 0.15 },
};

// ---------------------------------------------------------------------------
// Particle data
// ---------------------------------------------------------------------------

interface Particle {
  x: number;
  y: number;
  alpha: number;
  scale: number;
  speedX: number;
  speedY: number;
  life: number;
  maxLife: number;
  color: number;
  /** Extra per-particle phase for sine offsets */
  phase: number;
  kind: 'mote' | 'star' | 'firefly';
  active: boolean;
}

// ---------------------------------------------------------------------------
// ParticlePool — fixed-size pool, zero GC pressure
// ---------------------------------------------------------------------------

class ParticlePool {
  readonly pool: Particle[] = [];

  constructor(capacity: number) {
    for (let i = 0; i < capacity; i++) {
      this.pool.push(this.blank());
    }
  }

  private blank(): Particle {
    return {
      x: 0, y: 0, alpha: 0, scale: 1,
      speedX: 0, speedY: 0,
      life: 0, maxLife: 1,
      color: 0xffffff, phase: 0,
      kind: 'mote', active: false,
    };
  }

  /** Return the first inactive particle, or null if the pool is full. */
  acquire(): Particle | null {
    for (const p of this.pool) {
      if (!p.active) return p;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// ParticleSystem
// ---------------------------------------------------------------------------

export class ParticleSystem {
  /** World-space container (moves with camera like tiles/creatures). */
  public readonly worldContainer: Container;
  /** Screen-space container for stars (fixed relative to viewport). */
  public readonly screenContainer: Container;

  private pool: ParticlePool;
  private gfxWorld: Graphics;
  private gfxScreen: Graphics;

  private currentPhase = 'day';
  private mapPixelSize: number;
  private viewWidth: number;
  private viewHeight: number;

  /** Smooth fade multiplier: 0 → 1 over ~1 s on phase change. */
  private fadeFactor = 1;
  private fading = false;

  constructor(mapSize: number, viewWidth: number, viewHeight: number) {
    this.mapPixelSize = mapSize * TILE_SIZE;
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;

    this.pool = new ParticlePool(MAX_PARTICLES);

    this.worldContainer = new Container();
    this.screenContainer = new Container();

    this.gfxWorld = new Graphics();
    this.worldContainer.addChild(this.gfxWorld);

    this.gfxScreen = new Graphics();
    this.screenContainer.addChild(this.gfxScreen);
  }

  // -----------------------------------------------------------------------
  // Phase management
  // -----------------------------------------------------------------------

  /** Call when the server's dayPhase changes. */
  public setPhase(phase: string): void {
    if (phase === this.currentPhase) return;

    // Kill all active particles and start fresh for the new phase
    for (const p of this.pool.pool) {
      p.active = false;
    }

    this.currentPhase = phase;
    this.fadeFactor = 0;
    this.fading = true;

    // Pre-populate stars (they're static, not spawned per-frame)
    if (phase === 'night') {
      this.spawnStars();
    }
  }

  // -----------------------------------------------------------------------
  // Spawning helpers
  // -----------------------------------------------------------------------

  private spawnStars(): void {
    for (let i = 0; i < NIGHT_STAR_COUNT; i++) {
      const p = this.pool.acquire();
      if (!p) break;
      p.active = true;
      p.kind = 'star';
      // Screen-space: random position across viewport
      p.x = Math.random() * this.viewWidth;
      p.y = Math.random() * this.viewHeight;
      p.speedX = 0;
      p.speedY = 0;
      p.color = STAR_COLOR;
      p.scale = 1 + Math.random() * 0.5;
      p.phase = Math.random() * Math.PI * 2; // twinkle offset
      p.life = 1;
      p.maxLife = Infinity; // persist until phase change
      p.alpha = 0.5;
    }
  }

  private spawnMote(
    worldX: number, worldY: number,
    color: number, sX: number, sY: number,
    lifeRange: [number, number], scaleRange: [number, number],
  ): void {
    const p = this.pool.acquire();
    if (!p) return;
    p.active = true;
    p.kind = 'mote';
    p.x = worldX;
    p.y = worldY;
    p.color = color;
    p.speedX = sX;
    p.speedY = sY;
    p.scale = scaleRange[0] + Math.random() * (scaleRange[1] - scaleRange[0]);
    p.maxLife = lifeRange[0] + Math.random() * (lifeRange[1] - lifeRange[0]);
    p.life = p.maxLife;
    p.phase = Math.random() * Math.PI * 2;
    p.alpha = 0.3 + Math.random() * 0.3;
  }

  private spawnFirefly(worldX: number, worldY: number): void {
    const p = this.pool.acquire();
    if (!p) return;
    p.active = true;
    p.kind = 'firefly';
    p.x = worldX;
    p.y = worldY;
    p.color = FIREFLY_COLOR;
    p.speedX = (Math.random() - 0.5) * 0.4;
    p.speedY = (Math.random() - 0.5) * 0.4;
    p.scale = 2 + Math.random();
    p.maxLife = 4 + Math.random() * 4;
    p.life = p.maxLife;
    p.phase = Math.random() * Math.PI * 2;
    p.alpha = 0.5;
  }

  // -----------------------------------------------------------------------
  // Per-frame tick
  // -----------------------------------------------------------------------

  /**
   * @param dt frame delta in seconds (e.g. ticker.deltaTime / 60)
   * @param camX grid container world-space x (usually negative)
   * @param camY grid container world-space y
   * @param camScale grid container scale
   */
  public tick(dt: number, camX: number, camY: number, camScale: number): void {
    // Fade-in on phase transition
    if (this.fading) {
      this.fadeFactor = Math.min(1, this.fadeFactor + dt * 1.5);
      if (this.fadeFactor >= 1) this.fading = false;
    }

    const time = performance.now() / 1000;

    // Visible world-space rect (in tile-pixel coords)
    const vLeft = -camX / camScale;
    const vTop = -camY / camScale;
    const vRight = vLeft + this.viewWidth / camScale;
    const vBottom = vTop + this.viewHeight / camScale;

    // Spawn new particles to maintain target count per phase
    this.spawnForPhase(vLeft, vTop, vRight, vBottom);

    // Update all active particles
    this.gfxWorld.clear();
    this.gfxScreen.clear();

    for (const p of this.pool.pool) {
      if (!p.active) continue;

      if (p.kind === 'star') {
        // Stars are screen-space and don't move
        const twinkle = 0.3 + 0.7 * Math.sin(time * 1.8 + p.phase);
        const a = twinkle * this.fadeFactor;
        this.gfxScreen.circle(p.x, p.y, p.scale);
        this.gfxScreen.fill({ color: p.color, alpha: a });
        continue;
      }

      // Decrement life
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }

      // Movement
      if (p.kind === 'firefly') {
        // Erratic wander: small velocity changes each frame
        p.speedX += (Math.random() - 0.5) * 0.3 * dt;
        p.speedY += (Math.random() - 0.5) * 0.3 * dt;
        const maxSpeed = 0.6;
        p.speedX = Math.max(-maxSpeed, Math.min(maxSpeed, p.speedX));
        p.speedY = Math.max(-maxSpeed, Math.min(maxSpeed, p.speedY));
      } else {
        // Motes: horizontal sine sway
        p.speedX = Math.sin(time * 1.2 + p.phase) * 0.15;
      }

      p.x += p.speedX;
      p.y += p.speedY;

      // Viewport culling (world-space particles)
      if (p.x < vLeft - 20 || p.x > vRight + 20 || p.y < vTop - 20 || p.y > vBottom + 20) {
        continue; // skip drawing but keep alive
      }

      // Alpha: fade-in at start, fade-out at end of life
      const lifeRatio = p.life / p.maxLife;
      let alpha: number;
      if (p.kind === 'firefly') {
        // Pulsing glow
        alpha = 0.2 + 0.6 * Math.abs(Math.sin(time * 2.5 + p.phase));
      } else {
        // Mote: fade in first 20%, fade out last 20%
        alpha = p.alpha;
        if (lifeRatio > 0.8) alpha *= (1 - lifeRatio) / 0.2;
        else if (lifeRatio < 0.2) alpha *= lifeRatio / 0.2;
      }
      alpha *= this.fadeFactor;

      this.gfxWorld.circle(p.x, p.y, p.scale);
      this.gfxWorld.fill({ color: p.color, alpha });
    }
  }

  // -----------------------------------------------------------------------
  // Spawn budget per phase
  // -----------------------------------------------------------------------

  private spawnForPhase(vLeft: number, vTop: number, vRight: number, vBottom: number): void {
    const active = this.countActive();

    switch (this.currentPhase) {
      case 'dawn':
        this.spawnMotes(active, DAWN_COUNT, vLeft, vTop, vRight, vBottom,
          DAWN_COLOR, -0.3, [4, 7], [1.2, 2.2]);
        break;
      case 'dusk':
        this.spawnMotes(active, DUSK_COUNT, vLeft, vTop, vRight, vBottom,
          DUSK_COLOR, 0.2, [4, 7], [1.5, 2.8]);
        break;
      case 'day':
        this.spawnMotes(active, DAY_COUNT, vLeft, vTop, vRight, vBottom,
          0xffffee, -0.1, [5, 8], [0.8, 1.2]);
        break;
      case 'night':
        this.spawnFireflies(active, vLeft, vTop, vRight, vBottom);
        break;
    }
  }

  private spawnMotes(
    currentActive: number, target: number,
    vL: number, vT: number, vR: number, vB: number,
    color: number, speedY: number,
    life: [number, number], scale: [number, number],
  ): void {
    const deficit = target - currentActive;
    // Spawn a few per frame to stagger
    const toSpawn = Math.min(deficit, 3);
    for (let i = 0; i < toSpawn; i++) {
      const x = vL + Math.random() * (vR - vL);
      const y = vT + Math.random() * (vB - vT);
      this.spawnMote(x, y, color, 0, speedY, life, scale);
    }
  }

  private spawnFireflies(currentActive: number, vL: number, vT: number, vR: number, vB: number): void {
    // Stars are already spawned; count non-star active
    let nonStar = 0;
    for (const p of this.pool.pool) {
      if (p.active && p.kind !== 'star') nonStar++;
    }
    const deficit = NIGHT_FIREFLY_COUNT - nonStar;
    const toSpawn = Math.min(deficit, 2);
    if (currentActive >= MAX_PARTICLES) return;

    for (let i = 0; i < toSpawn; i++) {
      const x = vL + Math.random() * (vR - vL);
      const y = vT + Math.random() * (vB - vT);
      this.spawnFirefly(x, y);
    }
  }

  private countActive(): number {
    let n = 0;
    for (const p of this.pool.pool) {
      if (p.active) n++;
    }
    return n;
  }

  /** Resize viewport dimensions (call on window resize). */
  public resize(w: number, h: number): void {
    this.viewWidth = w;
    this.viewHeight = h;
  }
}

// ---------------------------------------------------------------------------
// Color overlay — simple full-map tinted rectangle per phase
// ---------------------------------------------------------------------------

export class DayNightOverlay {
  public readonly container: Container;
  private gfx: Graphics;
  private currentPhase = '';
  private mapPixelSize: number;

  constructor(mapSize: number) {
    this.mapPixelSize = mapSize * TILE_SIZE;
    this.container = new Container();
    this.gfx = new Graphics();
    this.container.addChild(this.gfx);
  }

  /** Redraw overlay when phase changes. */
  public setPhase(phase: string): void {
    if (phase === this.currentPhase) return;
    this.currentPhase = phase;

    const tint = OVERLAY_TINTS[phase];
    this.gfx.clear();
    if (!tint || tint.alpha <= 0) return;

    this.gfx.rect(0, 0, this.mapPixelSize, this.mapPixelSize);
    this.gfx.fill({ color: tint.color, alpha: tint.alpha });
  }
}
