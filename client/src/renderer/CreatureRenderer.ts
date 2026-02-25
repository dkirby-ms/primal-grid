import { Container, Graphics } from 'pixi.js';
import { TILE_SIZE } from './GridRenderer.js';
import type { Room } from '@colyseus/sdk';

const CREATURE_RADIUS = 6;
const HERBIVORE_COLOR = 0x4caf50;
const CARNIVORE_COLOR = 0xf44336;

export class CreatureRenderer {
  public readonly container: Container;
  private sprites: Map<string, Graphics> = new Map();

  constructor() {
    this.container = new Container();
  }

  /** Listen to Colyseus state and render/update creature markers. */
  public bindToRoom(room: Room): void {
    room.onStateChange((state: Record<string, unknown>) => {
      const creatures = state['creatures'] as
        | { forEach: (cb: (creature: Record<string, unknown>, key: string) => void) => void }
        | undefined;
      if (!creatures || typeof creatures.forEach !== 'function') return;

      const seen = new Set<string>();

      creatures.forEach((creature, key) => {
        const id = (creature['id'] as string) ?? key;
        seen.add(id);

        const x = (creature['x'] as number) ?? 0;
        const y = (creature['y'] as number) ?? 0;
        const creatureType = (creature['creatureType'] as string) ?? 'herbivore';

        let sprite = this.sprites.get(id);
        if (!sprite) {
          sprite = this.createCreatureGraphic(creatureType);
          this.sprites.set(id, sprite);
          this.container.addChild(sprite);
        }

        // Snap to tile center
        sprite.position.set(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2);
      });

      // Remove creatures that despawned
      for (const [id, sprite] of this.sprites) {
        if (!seen.has(id)) {
          this.container.removeChild(sprite);
          sprite.destroy();
          this.sprites.delete(id);
        }
      }
    });
  }

  private createCreatureGraphic(creatureType: string): Graphics {
    const g = new Graphics();

    if (creatureType === 'carnivore') {
      // Red triangle
      const r = CREATURE_RADIUS;
      g.moveTo(0, -r);
      g.lineTo(r, r);
      g.lineTo(-r, r);
      g.closePath();
      g.fill(CARNIVORE_COLOR);
    } else {
      // Green circle (herbivore default)
      g.circle(0, 0, CREATURE_RADIUS);
      g.fill(HERBIVORE_COLOR);
    }

    return g;
  }
}
