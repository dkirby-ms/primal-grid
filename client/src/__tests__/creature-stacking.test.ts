/**
 * Tests that creatures sharing a tile are rendered at offset positions
 * so they remain individually visible (regression for #74).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal PixiJS stubs
// ---------------------------------------------------------------------------
vi.mock('pixi.js', () => {
  class Container {
    children: unknown[] = [];
    position = { x: 0, y: 0, set(x: number, y: number) { this.x = x; this.y = y; } };
    alpha = 1;
    visible = true;
    addChild(child: unknown) { this.children.push(child); }
    removeChild(child: unknown) {
      const idx = this.children.indexOf(child);
      if (idx >= 0) this.children.splice(idx, 1);
    }
    destroy() { this.children = []; }
  }
  class Graphics {
    visible = true;
    clear() { return this; }
    circle() { return this; }
    rect() { return this; }
    roundRect() { return this; }
    ellipse() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    closePath() { return this; }
    fill() { return this; }
    stroke() { return this; }
  }
  class Text {
    text: string;
    visible = true;
    anchor = { set: vi.fn() };
    position = { set: vi.fn() };
    constructor(opts?: { text?: string }) { this.text = opts?.text ?? ''; }
  }
  return { Container, Graphics, Text };
});

vi.mock('@primal-grid/shared', () => ({
  CREATURE_TYPES: { herbivore: { icon: '🦕' }, carnivore: { icon: '🦖' } },
  PAWN: { BUILD_TIME_TICKS: 10 },
  ENEMY_BASE_TYPES: {} as Record<string, unknown>,
  ENEMY_MOBILE_TYPES: {} as Record<string, unknown>,
  PAWN_TYPES: {} as Record<string, unknown>,
  isEnemyBase: () => false,
  isEnemyMobile: () => false,
  isPlayerPawn: () => false,
}));

vi.mock('../renderer/GridRenderer.js', () => ({ TILE_SIZE: 32 }));
vi.mock('../renderer/CombatEffects.js', () => ({
  CombatEffects: class { update() {} trackHealth() {} removeCreature() {} },
}));

const { CreatureRenderer } = await import('../renderer/CreatureRenderer.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TILE_SIZE = 32;

function makeRoom(creatures: Record<string, Record<string, unknown>>) {
  const callbacks: Array<(state: Record<string, unknown>) => void> = [];
  return {
    sessionId: 'test-session',
    onStateChange(cb: (state: Record<string, unknown>) => void) {
      callbacks.push(cb);
    },
    fire() {
      const creaturesMap = {
        forEach(cb: (c: Record<string, unknown>, k: string) => void) {
          for (const [k, v] of Object.entries(creatures)) cb(v, k);
        },
      };
      for (const cb of callbacks) cb({ creatures: creaturesMap });
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Creature tile stacking (#74)', () => {
  let renderer: InstanceType<typeof CreatureRenderer>;

  beforeEach(() => {
    renderer = new CreatureRenderer();
  });

  it('renders a single creature at tile centre with no offset', () => {
    const room = makeRoom({
      c1: { id: 'c1', x: 3, y: 5, creatureType: 'herbivore', currentState: 'idle', health: 100, ownerID: '' },
    });
    renderer.bindToRoom(room as never);
    room.fire();

    // Run several ticks so positions converge
    for (let i = 0; i < 100; i++) renderer.tick(16);

    const child = renderer.container.children[0] as { position: { x: number; y: number } };
    expect(child.position.x).toBeCloseTo(3 * TILE_SIZE + TILE_SIZE / 2, 0);
    expect(child.position.y).toBeCloseTo(5 * TILE_SIZE + TILE_SIZE / 2, 0);
  });

  it('offsets two creatures sharing the same tile so they do not overlap', () => {
    const room = makeRoom({
      c1: { id: 'c1', x: 4, y: 4, creatureType: 'herbivore', currentState: 'idle', health: 100, ownerID: '' },
      c2: { id: 'c2', x: 4, y: 4, creatureType: 'carnivore', currentState: 'idle', health: 100, ownerID: '' },
    });
    renderer.bindToRoom(room as never);
    room.fire();

    for (let i = 0; i < 100; i++) renderer.tick(16);

    const children = renderer.container.children as Array<{ position: { x: number; y: number } }>;
    expect(children.length).toBe(2);

    const pos0 = children[0].position;
    const pos1 = children[1].position;

    // Positions must differ — the creatures are not on top of each other
    const dist = Math.sqrt((pos0.x - pos1.x) ** 2 + (pos0.y - pos1.y) ** 2);
    expect(dist).toBeGreaterThan(3); // at least a few pixels apart
  });

  it('does not offset creatures on different tiles', () => {
    const room = makeRoom({
      c1: { id: 'c1', x: 0, y: 0, creatureType: 'herbivore', currentState: 'idle', health: 100, ownerID: '' },
      c2: { id: 'c2', x: 1, y: 0, creatureType: 'carnivore', currentState: 'idle', health: 100, ownerID: '' },
    });
    renderer.bindToRoom(room as never);
    room.fire();

    for (let i = 0; i < 100; i++) renderer.tick(16);

    const children = renderer.container.children as Array<{ position: { x: number; y: number } }>;
    // Each creature should be at their own tile centre
    expect(children[0].position.x).toBeCloseTo(0 * TILE_SIZE + TILE_SIZE / 2, 0);
    expect(children[1].position.x).toBeCloseTo(1 * TILE_SIZE + TILE_SIZE / 2, 0);
  });

  it('separates three or more creatures on the same tile', () => {
    const room = makeRoom({
      c1: { id: 'c1', x: 2, y: 2, creatureType: 'herbivore', currentState: 'idle', health: 100, ownerID: '' },
      c2: { id: 'c2', x: 2, y: 2, creatureType: 'carnivore', currentState: 'idle', health: 100, ownerID: '' },
      c3: { id: 'c3', x: 2, y: 2, creatureType: 'herbivore', currentState: 'wander', health: 100, ownerID: '' },
    });
    renderer.bindToRoom(room as never);
    room.fire();

    for (let i = 0; i < 100; i++) renderer.tick(16);

    const children = renderer.container.children as Array<{ position: { x: number; y: number } }>;
    expect(children.length).toBe(3);

    // All three positions should be distinct
    const positions = children.map(c => `${c.position.x.toFixed(1)},${c.position.y.toFixed(1)}`);
    const unique = new Set(positions);
    expect(unique.size).toBe(3);
  });
});
