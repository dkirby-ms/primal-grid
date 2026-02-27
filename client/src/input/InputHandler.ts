import type { Room } from '@colyseus/sdk';
import { PLACE, PLACE_SHAPE, FARM_HARVEST, TAME, ItemType, SHAPE_CATALOG } from '@primal-grid/shared';
import { TILE_SIZE } from '../renderer/GridRenderer.js';
import type { Container } from 'pixi.js';
import type { CraftMenu } from '../ui/CraftMenu.js';
import type { HudDOM } from '../ui/HudDOM.js';
import type { HelpScreen } from '../ui/HelpScreen.js';
import type { CreatureRenderer } from '../renderer/CreatureRenderer.js';
import type { Camera } from '../renderer/Camera.js';

const PLACEABLE_ITEMS: { type: ItemType; name: string }[] = [
  { type: ItemType.Workbench, name: 'Workbench' },
  { type: ItemType.FarmPlot, name: 'FarmPlot' },
];

export class InputHandler {
  private room: Room;
  private worldContainer: Container;

  private craftMenu: CraftMenu | null = null;
  private hud: HudDOM | null = null;
  private helpScreen: HelpScreen | null = null;
  private buildMode = false;
  private buildIndex = 0;
  private shapeMode = false;
  private shapeIndex = 0;
  private shapeRotation = 0;
  private shapeKeys: string[] = [];
  private creatureRenderer: CreatureRenderer | null = null;
  private camera: Camera | null = null;

  private mouseScreenX = 0;
  private mouseScreenY = 0;

  constructor(room: Room, worldContainer: Container) {
    this.room = room;
    this.worldContainer = worldContainer;
    this.shapeKeys = Object.keys(SHAPE_CATALOG);
    this.bindKeys();
    this.bindClick();
    this.bindMouseTracking();
  }

  /** Wire up the craft menu for toggle and number-key crafting. */
  public setCraftMenu(menu: CraftMenu): void {
    this.craftMenu = menu;
  }

  /** Wire up the HUD for build mode indicator. */
  public setHud(hud: HudDOM): void {
    this.hud = hud;
  }

  /** Wire up the help screen for toggle. */
  public setHelpScreen(helpScreen: HelpScreen): void {
    this.helpScreen = helpScreen;
  }

  /** Wire up the creature renderer for taming queries. */
  public setCreatureRenderer(cr: CreatureRenderer): void {
    this.creatureRenderer = cr;
  }

  /** Wire up the camera. */
  public setCamera(camera: Camera): void {
    this.camera = camera;
  }

  /** Convert current mouse screen position to tile coordinates. */
  private screenToTile(): { x: number; y: number } {
    const scale = this.worldContainer.scale.x;
    const worldX = (this.mouseScreenX - this.worldContainer.position.x) / scale;
    const worldY = (this.mouseScreenY - this.worldContainer.position.y) / scale;
    return {
      x: Math.floor(worldX / TILE_SIZE),
      y: Math.floor(worldY / TILE_SIZE),
    };
  }

  private bindMouseTracking(): void {
    window.addEventListener('mousemove', (e) => {
      this.mouseScreenX = e.clientX;
      this.mouseScreenY = e.clientY;
    });
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      // Help screen toggle
      if (e.key === '?' || e.key === '/') {
        this.helpScreen?.toggle();
        return;
      }

      // Craft menu toggle
      if (e.key === 'c' || e.key === 'C') {
        if (this.buildMode) return;
        this.craftMenu?.toggle();
        return;
      }

      // Shape mode toggle
      if (e.key === 'v' || e.key === 'V') {
        if (this.craftMenu?.isOpen()) return;
        this.shapeMode = !this.shapeMode;
        this.buildMode = false;
        if (this.shapeMode) {
          const shape = SHAPE_CATALOG[this.shapeKeys[this.shapeIndex]];
          this.hud?.setBuildMode(true, `${shape.name} [R${this.shapeRotation}]`);
        } else {
          this.hud?.setBuildMode(false);
        }
        return;
      }

      // Structure build mode toggle
      if (e.key === 'b' || e.key === 'B') {
        if (this.craftMenu?.isOpen()) return;
        this.shapeMode = false;
        this.buildMode = !this.buildMode;
        if (this.buildMode) {
          this.hud?.setBuildMode(true, PLACEABLE_ITEMS[this.buildIndex].name);
        } else {
          this.hud?.setBuildMode(false);
        }
        return;
      }

      // Rotation (shape mode)
      if (e.key === 'r' || e.key === 'R') {
        if (this.shapeMode) {
          this.shapeRotation = (this.shapeRotation + 1) % 4;
          const shape = SHAPE_CATALOG[this.shapeKeys[this.shapeIndex]];
          this.hud?.setBuildMode(true, `${shape.name} [R${this.shapeRotation}]`);
        }
        return;
      }

      // Farm harvest at cursor tile
      if (e.key === 'h' || e.key === 'H') {
        const tile = this.screenToTile();
        if (tile.x >= 0 && tile.y >= 0) {
          this.room.send(FARM_HARVEST, { x: tile.x, y: tile.y });
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
        if (this.shapeMode && num <= this.shapeKeys.length) {
          this.shapeIndex = num - 1;
          this.shapeRotation = 0;
          const shape = SHAPE_CATALOG[this.shapeKeys[this.shapeIndex]];
          this.hud?.setBuildMode(true, `${shape.name} [R0]`);
          return;
        }
        if (this.buildMode && num <= PLACEABLE_ITEMS.length) {
          this.buildIndex = num - 1;
          this.hud?.setBuildMode(true, PLACEABLE_ITEMS[this.buildIndex].name);
          return;
        }
      }
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

      // Shape mode: place shape
      if (this.shapeMode) {
        const shapeId = this.shapeKeys[this.shapeIndex];
        this.room.send(PLACE_SHAPE, { shapeId, x: tileX, y: tileY, rotation: this.shapeRotation });
        return;
      }

      // Build mode: place structure
      if (this.buildMode) {
        const item = PLACEABLE_ITEMS[this.buildIndex];
        this.room.send(PLACE, { itemType: item.type, x: tileX, y: tileY });
        return;
      }

      // Normal click: check for wild creature first, then no-op
      if (this.creatureRenderer) {
        const creatureId = this.creatureRenderer.getNearestWildCreature(tileX, tileY);
        if (creatureId) {
          this.room.send(TAME, { creatureId });
          return;
        }
      }
    });
  }
}
