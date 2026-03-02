import type { Room } from '@colyseus/sdk';
import { PLACE_SHAPE, SHAPE_CATALOG, getAvailableShapes } from '@primal-grid/shared';
import { TILE_SIZE } from '../renderer/GridRenderer.js';
import type { Container } from 'pixi.js';
import type { HudDOM } from '../ui/HudDOM.js';
import type { HelpScreen } from '../ui/HelpScreen.js';
import type { Camera } from '../renderer/Camera.js';
import type { GridRenderer } from '../renderer/GridRenderer.js';

export class InputHandler {
  private room: Room;
  private worldContainer: Container;
  private canvas: HTMLCanvasElement;

  private hud: HudDOM | null = null;
  private helpScreen: HelpScreen | null = null;
  private selectedShapeIndex = -1;
  private shapeRotation = 0;
  private shapeKeys: string[] = [];
  private camera: Camera | null = null;
  private gridRenderer: GridRenderer | null = null;

  private mouseScreenX = 0;
  private mouseScreenY = 0;

  constructor(room: Room, worldContainer: Container, canvas: HTMLCanvasElement) {
    this.room = room;
    this.worldContainer = worldContainer;
    this.canvas = canvas;
    this.shapeKeys = getAvailableShapes(1);
    this.bindKeys();
    this.bindClick();
    this.bindMouseTracking();
    this.updateCursor();
  }

  /** Wire up the HUD for shape selection. */
  public setHud(hud: HudDOM): void {
    this.hud = hud;
    // Wire carousel click → toggle shape selection
    hud.onShapeSelect = (index: number) => {
      if (this.selectedShapeIndex === index) {
        // Click same shape = deselect
        this.selectedShapeIndex = -1;
      } else {
        this.selectedShapeIndex = index;
      }
      this.shapeRotation = 0;
      this.updateSelectionHud();
    };
  }

  /** Wire up the help screen for toggle. */
  public setHelpScreen(helpScreen: HelpScreen): void {
    this.helpScreen = helpScreen;
  }

  /** Wire up the camera. */
  public setCamera(camera: Camera): void {
    this.camera = camera;
  }

  /** Wire up the grid renderer for optimistic claim visuals. */
  public setGridRenderer(gr: GridRenderer): void {
    this.gridRenderer = gr;
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

  /** Convert viewport clientX/Y to canvas-local coordinates. */
  private toCanvasCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  private bindMouseTracking(): void {
    window.addEventListener('mousemove', (e) => {
      const local = this.toCanvasCoords(e.clientX, e.clientY);
      this.mouseScreenX = local.x;
      this.mouseScreenY = local.y;
    });
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      // Help screen toggle
      if (e.key === '?' || e.key === '/') {
        this.helpScreen?.toggle();
        return;
      }

      // Escape: deselect shape
      if (e.key === 'Escape') {
        this.selectedShapeIndex = -1;
        this.shapeRotation = 0;
        this.gridRenderer?.clearShapePreview();
        this.updateSelectionHud();
        return;
      }

      // Cycle shape: Q = prev, E = next
      if (e.key === 'q' || e.key === 'Q') {
        if (this.selectedShapeIndex === -1) {
          this.selectedShapeIndex = this.shapeKeys.length - 1;
        } else {
          this.selectedShapeIndex = (this.selectedShapeIndex - 1 + this.shapeKeys.length) % this.shapeKeys.length;
        }
        this.shapeRotation = 0;
        this.updateSelectionHud();
        return;
      }
      if (e.key === 'e' || e.key === 'E') {
        if (this.selectedShapeIndex === -1) {
          this.selectedShapeIndex = 0;
        } else {
          this.selectedShapeIndex = (this.selectedShapeIndex + 1) % this.shapeKeys.length;
        }
        this.shapeRotation = 0;
        this.updateSelectionHud();
        return;
      }

      // Rotation (only if shape selected)
      if (e.key === 'r' || e.key === 'R') {
        if (this.selectedShapeIndex >= 0) {
          this.shapeRotation = (this.shapeRotation + 1) % 4;
          this.updateSelectionHud();
        }
        return;
      }

      // Center camera on HQ
      if (e.key === ' ') {
        e.preventDefault();
        this.camera?.centerOnHQ(this.hud?.localHqX ?? 0, this.hud?.localHqY ?? 0);
        return;
      }

      // Number keys: select/deselect shape (toggle)
      if (e.key >= '1' && e.key <= '9') {
        const num = parseInt(e.key, 10);
        if (num <= this.shapeKeys.length) {
          const idx = num - 1;
          if (this.selectedShapeIndex === idx) {
            this.selectedShapeIndex = -1;
          } else {
            this.selectedShapeIndex = idx;
          }
          this.shapeRotation = 0;
          this.updateSelectionHud();
          return;
        }
      }
    });
  }

  private bindClick(): void {
    window.addEventListener('click', (e) => {
      // Convert screen position to world tile
      const local = this.toCanvasCoords(e.clientX, e.clientY);
      const scale = this.worldContainer.scale.x;
      const worldX = (local.x - this.worldContainer.position.x) / scale;
      const worldY = (local.y - this.worldContainer.position.y) / scale;
      const tileX = Math.floor(worldX / TILE_SIZE);
      const tileY = Math.floor(worldY / TILE_SIZE);

      if (tileX < 0 || tileY < 0) return;

      // Place shape if one is selected (stays selected for rapid building)
      if (this.selectedShapeIndex >= 0) {
        const shapeId = this.shapeKeys[this.selectedShapeIndex];
        this.showOptimisticClaim(shapeId, tileX, tileY, this.shapeRotation);
        this.room.send(PLACE_SHAPE, { shapeId, x: tileX, y: tileY, rotation: this.shapeRotation });
        return;
      }
    });

    // Right-click: deselect shape
    window.addEventListener('contextmenu', (e) => {
      if (this.selectedShapeIndex >= 0) {
        e.preventDefault();
        this.selectedShapeIndex = -1;
        this.shapeRotation = 0;
        this.gridRenderer?.clearShapePreview();
        this.updateSelectionHud();
      }
    });
  }

  /** Show optimistic claiming overlay for all cells of a shape. */
  private showOptimisticClaim(shapeId: string, x: number, y: number, rotation: number): void {
    if (!this.gridRenderer) return;
    const shapeDef = SHAPE_CATALOG[shapeId];
    if (!shapeDef) return;
    const cells = shapeDef.rotations[rotation] ?? shapeDef.rotations[0];
    const playerId = this.room.sessionId;
    for (const c of cells) {
      this.gridRenderer.showOptimisticClaim(x + c.dx, y + c.dy, playerId);
    }
  }

  /** Update HUD carousel for current selection state. */
  private updateSelectionHud(): void {
    this.hud?.setSelectedShape(this.selectedShapeIndex, this.shapeRotation);
    this.updateCursor();
  }

  /** Update available shape keys when the player's level changes. */
  public updateShapeKeys(level: number): void {
    this.shapeKeys = getAvailableShapes(level);
    this.selectedShapeIndex = Math.min(this.selectedShapeIndex, this.shapeKeys.length - 1);
    if (this.selectedShapeIndex >= 0) {
      this.updateSelectionHud();
    }
  }

  /** Set the canvas CSS cursor based on the current input mode. */
  private updateCursor(): void {
    if (this.selectedShapeIndex >= 0) {
      this.canvas.style.cursor = 'cell';
    } else {
      this.canvas.style.cursor = 'crosshair';
    }
  }

  /** Called each frame to update the shape ghost preview on the map. */
  public updatePreview(): void {
    if (!this.gridRenderer) return;
    if (this.selectedShapeIndex < 0) {
      this.gridRenderer.clearShapePreview();
      return;
    }
    const shapeId = this.shapeKeys[this.selectedShapeIndex];
    const shapeDef = SHAPE_CATALOG[shapeId];
    if (!shapeDef) return;
    const cells = shapeDef.rotations[this.shapeRotation] ?? shapeDef.rotations[0];
    const tile = this.screenToTile();
    const color = this.gridRenderer.getPlayerColor(this.room.sessionId);
    this.gridRenderer.updateShapePreview(cells as { dx: number; dy: number }[], tile.x, tile.y, color);
  }
}
