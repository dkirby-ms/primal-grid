import type { Room } from '@colyseus/sdk';
import type { Container } from 'pixi.js';
import type { HudDOM } from '../ui/HudDOM.js';
import type { HelpScreen } from '../ui/HelpScreen.js';
import type { Scoreboard } from '../ui/Scoreboard.js';
import type { Camera } from '../renderer/Camera.js';
import type { ChatPanel } from '../ui/ChatPanel.js';
import type { GridRenderer } from '../renderer/GridRenderer.js';
import { TILE_SIZE } from '../renderer/GridRenderer.js';

export class InputHandler {
  private room: Room;
  private worldContainer: Container;
  private canvas: HTMLCanvasElement;

  private hud: HudDOM | null = null;
  private helpScreen: HelpScreen | null = null;
  private scoreboard: Scoreboard | null = null;
  private camera: Camera | null = null;
  private chatPanel: ChatPanel | null = null;
  private gridRenderer: GridRenderer | null = null;
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private _clickHandler: ((e: MouseEvent) => void) | null = null;

  constructor(room: Room, worldContainer: Container, canvas: HTMLCanvasElement) {
    this.room = room;
    this.worldContainer = worldContainer;
    this.canvas = canvas;
    this.bindKeys();
    this.bindClicks();
    this.canvas.style.cursor = 'crosshair';
  }

  /** Wire up the HUD. */
  public setHud(hud: HudDOM): void {
    this.hud = hud;
    // Subscribe to placement mode changes to show/hide highlights
    hud.onPlacementModeChange = (mode) => {
      if (mode) {
        this.gridRenderer?.showPlacementHighlights();
      } else {
        this.gridRenderer?.clearPlacementHighlights();
      }
    };
  }

  /** Wire up the help screen for toggle. */
  public setHelpScreen(helpScreen: HelpScreen): void {
    this.helpScreen = helpScreen;
  }

  /** Wire up the scoreboard for toggle. */
  public setScoreboard(scoreboard: Scoreboard): void {
    this.scoreboard = scoreboard;
  }

  /** Wire up the camera. */
  public setCamera(camera: Camera): void {
    this.camera = camera;
  }

  /** Wire up the chat panel. */
  public setChatPanel(chatPanel: ChatPanel): void {
    this.chatPanel = chatPanel;
  }

  /** Wire up the grid renderer for placement highlights. */
  public setGridRenderer(gridRenderer: GridRenderer): void {
    this.gridRenderer = gridRenderer;
  }

  /** Convert screen coordinates to world tile coordinates. */
  private screenToTile(screenX: number, screenY: number): { x: number; y: number } | null {
    // Get the world container's global transform to account for camera pan/zoom
    const worldTransform = this.worldContainer.worldTransform;
    // Invert the transform: world = (screen - translate) / scale
    const worldX = (screenX - worldTransform.tx) / worldTransform.a;
    const worldY = (screenY - worldTransform.ty) / worldTransform.d;
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);
    if (tileX < 0 || tileY < 0) return null;
    return { x: tileX, y: tileY };
  }

  private bindClicks(): void {
    this._clickHandler = (e: MouseEvent) => {
      // Only process left clicks
      if (e.button !== 0) return;

      // Don't process if not in placement mode
      if (!this.hud?.placementMode) return;

      const rect = this.canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      const tile = this.screenToTile(screenX, screenY);
      if (!tile) return;

      // Validate placement client-side before sending
      if (!this.gridRenderer?.isValidPlacementTile(tile.x, tile.y)) return;

      this.hud.sendPlaceBuilding(tile.x, tile.y);
    };

    this.canvas.addEventListener('click', this._clickHandler);
  }

  private bindKeys(): void {
    this._keyHandler = (e: KeyboardEvent) => {
      // When chat input is focused, don't process game keys
      if (this.chatPanel?.isFocused) return;

      // ESC cancels building placement mode
      if (e.key === 'Escape') {
        if (this.hud?.placementMode) {
          e.preventDefault();
          this.hud.cancelPlacementMode();
          return;
        }
      }

      // Help screen toggle
      if (e.key === '?' || e.key === '/') {
        this.helpScreen?.toggle();
        return;
      }

      // Scoreboard toggle (Tab key)
      if (e.key === 'Tab') {
        e.preventDefault();
        this.scoreboard?.toggle();
        return;
      }

      // Chat toggle
      if (e.key === 'c' || e.key === 'C') {
        this.chatPanel?.toggle();
        return;
      }

      // Focus chat on Enter
      if (e.key === 'Enter') {
        e.preventDefault();
        this.chatPanel?.focus();
        return;
      }

      // Center camera on HQ
      if (e.key === ' ') {
        e.preventDefault();
        this.camera?.centerOnHQ(this.hud?.localHqX ?? 0, this.hud?.localHqY ?? 0);
        return;
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  /** Remove all event listeners. Call when leaving a game session. */
  dispose(): void {
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    if (this._clickHandler) {
      this.canvas.removeEventListener('click', this._clickHandler);
      this._clickHandler = null;
    }
    if (this.hud) {
      this.hud.onPlacementModeChange = null;
    }
  }
}
