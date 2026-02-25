import { Container, Graphics } from 'pixi.js';
import { TILE_SIZE } from './GridRenderer.js';
import type { Room } from '@colyseus/sdk';

const PLAYER_RADIUS = 12;

export class PlayerRenderer {
  public readonly container: Container;
  private sprites: Map<string, Graphics> = new Map();
  private localSessionId: string;

  constructor(localSessionId: string) {
    this.container = new Container();
    this.localSessionId = localSessionId;
  }

  /** Listen to Colyseus state and render/update player markers. */
  public bindToRoom(room: Room): void {
    room.onStateChange((state: Record<string, unknown>) => {
      const players = state['players'] as
        | { forEach: (cb: (player: Record<string, unknown>, key: string) => void) => void }
        | undefined;
      if (!players || typeof players.forEach !== 'function') return;

      const seen = new Set<string>();

      players.forEach((player, key) => {
        const id = (player['id'] as string) ?? key;
        seen.add(id);

        const x = (player['x'] as number) ?? 0;
        const y = (player['y'] as number) ?? 0;
        const color = (player['color'] as number) ?? 0xffffff;

        let sprite = this.sprites.get(id);
        if (!sprite) {
          sprite = this.createPlayerGraphic(color, id === this.localSessionId);
          this.sprites.set(id, sprite);
          this.container.addChild(sprite);
        }

        // Snap to tile center
        sprite.position.set(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2);
      });

      // Remove players who left
      for (const [id, sprite] of this.sprites) {
        if (!seen.has(id)) {
          this.container.removeChild(sprite);
          sprite.destroy();
          this.sprites.delete(id);
        }
      }
    });
  }

  private createPlayerGraphic(color: number, isLocal: boolean): Graphics {
    const g = new Graphics();

    if (isLocal) {
      // Glow / border for local player
      g.circle(0, 0, PLAYER_RADIUS + 3);
      g.fill(0xffd700);
    }

    g.circle(0, 0, PLAYER_RADIUS);
    g.fill(color);

    return g;
  }
}
