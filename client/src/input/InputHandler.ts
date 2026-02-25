import type { Room } from 'colyseus.js';
import { MOVE } from '@primal-grid/shared';
import { TILE_SIZE } from '../renderer/GridRenderer.js';
import type { Container } from 'pixi.js';

const MOVE_DEBOUNCE_MS = 150;

export class InputHandler {
  private room: Room;
  private worldContainer: Container;
  private lastMoveTime = 0;

  constructor(room: Room, worldContainer: Container) {
    this.room = room;
    this.worldContainer = worldContainer;
    this.bindKeys();
    this.bindClick();
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      let dx = 0;
      let dy = 0;
      switch (e.key) {
        case 'ArrowUp':
          dy = -1;
          break;
        case 'ArrowDown':
          dy = 1;
          break;
        case 'ArrowLeft':
          dx = -1;
          break;
        case 'ArrowRight':
          dx = 1;
          break;
        default:
          return; // not a movement key
      }
      e.preventDefault();
      this.sendMove(dx, dy);
    });
  }

  private bindClick(): void {
    window.addEventListener('click', (e) => {
      // Convert screen position to world tile
      const scale = this.worldContainer.scale.x;
      const worldX = (e.clientX - this.worldContainer.position.x) / scale;
      const worldY = (e.clientY - this.worldContainer.position.y) / scale;
      const tileX = Math.floor(worldX / TILE_SIZE);
      const tileY = Math.floor(worldY / TILE_SIZE);

      if (tileX < 0 || tileY < 0) return;

      // Send a single-step move toward the clicked tile
      // Server will interpret this; for now just send the target position
      this.room.send(MOVE, { x: tileX, y: tileY });
    });
  }

  private sendMove(dx: number, dy: number): void {
    const now = Date.now();
    if (now - this.lastMoveTime < MOVE_DEBOUNCE_MS) return;
    this.lastMoveTime = now;
    this.room.send(MOVE, { dx, dy });
  }
}
