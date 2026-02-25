import type { Room } from '@colyseus/sdk';
import { MOVE, PLACE, FARM_HARVEST, ItemType } from '@primal-grid/shared';
import { TILE_SIZE } from '../renderer/GridRenderer.js';
import type { Container } from 'pixi.js';
import type { CraftMenu } from '../ui/CraftMenu.js';
import type { HudRenderer } from '../ui/HudRenderer.js';

const MOVE_DEBOUNCE_MS = 150;

const PLACEABLE_ITEMS: { type: ItemType; name: string }[] = [
  { type: ItemType.Wall, name: 'Wall' },
  { type: ItemType.Floor, name: 'Floor' },
  { type: ItemType.Workbench, name: 'Workbench' },
  { type: ItemType.FarmPlot, name: 'FarmPlot' },
];

export class InputHandler {
  private room: Room;
  private worldContainer: Container;
  private lastMoveTime = 0;

  private craftMenu: CraftMenu | null = null;
  private hud: HudRenderer | null = null;
  private buildMode = false;
  private buildIndex = 0;

  constructor(room: Room, worldContainer: Container) {
    this.room = room;
    this.worldContainer = worldContainer;
    this.bindKeys();
    this.bindClick();
  }

  /** Wire up the craft menu for toggle and number-key crafting. */
  public setCraftMenu(menu: CraftMenu): void {
    this.craftMenu = menu;
  }

  /** Wire up the HUD for build mode indicator and player position. */
  public setHud(hud: HudRenderer): void {
    this.hud = hud;
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      // Craft menu toggle
      if (e.key === 'c' || e.key === 'C') {
        if (this.buildMode) return; // ignore while building
        this.craftMenu?.toggle();
        return;
      }

      // Build mode toggle
      if (e.key === 'b' || e.key === 'B') {
        if (this.craftMenu?.isOpen()) return; // ignore while crafting
        this.buildMode = !this.buildMode;
        this.hud?.setBuildMode(this.buildMode, PLACEABLE_ITEMS[this.buildIndex].name);
        return;
      }

      // Farm harvest
      if (e.key === 'h' || e.key === 'H') {
        if (this.hud) {
          this.room.send(FARM_HARVEST, {
            x: this.hud.localPlayerX,
            y: this.hud.localPlayerY,
          });
        }
        return;
      }

      // Number keys: craft (when menu open) or cycle build item
      if (e.key >= '1' && e.key <= '9') {
        const num = parseInt(e.key, 10);
        if (this.craftMenu?.isOpen()) {
          this.craftMenu.craftByIndex(num);
          return;
        }
        if (this.buildMode && num <= PLACEABLE_ITEMS.length) {
          this.buildIndex = num - 1;
          this.hud?.setBuildMode(true, PLACEABLE_ITEMS[this.buildIndex].name);
          return;
        }
      }

      // Movement keys
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
          return;
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

      // Build mode: place structure instead of moving
      if (this.buildMode) {
        const item = PLACEABLE_ITEMS[this.buildIndex];
        this.room.send(PLACE, { itemType: item.type, x: tileX, y: tileY });
        return;
      }

      // Normal click-to-move
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
