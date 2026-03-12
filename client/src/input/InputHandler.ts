import type { Room } from '@colyseus/sdk';
import type { Container } from 'pixi.js';
import type { HudDOM } from '../ui/HudDOM.js';
import type { HelpScreen } from '../ui/HelpScreen.js';
import type { Scoreboard } from '../ui/Scoreboard.js';
import type { Camera } from '../renderer/Camera.js';
import type { ChatPanel } from '../ui/ChatPanel.js';
import type { GridRenderer } from '../renderer/GridRenderer.js';
import type { UpgradeModal } from '../ui/UpgradeModal.js';
import { TILE_SIZE } from '../renderer/GridRenderer.js';
import { OUTPOST_UPGRADE } from '@primal-grid/shared';

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
  private upgradeModal: UpgradeModal | null = null;
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private _clickHandler: ((e: MouseEvent) => void) | null = null;
  private _contextMenuHandler: ((e: MouseEvent) => void) | null = null;

  // Track current player's resources for validation
  private currentWood = 0;
  private currentStone = 0;

  constructor(room: Room, worldContainer: Container, canvas: HTMLCanvasElement) {
    this.room = room;
    this.worldContainer = worldContainer;
    this.canvas = canvas;
    this.bindKeys();
    this.bindClicks();
    this.bindContextMenu();
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

  /** Wire up the upgrade modal. */
  public setUpgradeModal(upgradeModal: UpgradeModal): void {
    this.upgradeModal = upgradeModal;
  }

  /** Update current resources (called by HUD when resources change). */
  public updateResources(wood: number, stone: number): void {
    this.currentWood = wood;
    this.currentStone = stone;
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

  /** Check if tile is an upgradeable outpost and show modal if so. */
  private tryShowUpgradeModal(screenX: number, screenY: number): boolean {
    const tile = this.screenToTile(screenX, screenY);
    if (!tile) return false;

    const tileData = this.gridRenderer?.getTileData(tile.x, tile.y);
    if (!tileData) return false;

    const localPlayerId = this.hud?.localSessionId ?? '';
    const isOwnedOutpost = tileData.owner === localPlayerId && tileData.structure === 'outpost';
    const isNotUpgraded = !tileData.upgraded;
    const hasEnoughResources = this.currentWood >= OUTPOST_UPGRADE.COST_WOOD &&
                                this.currentStone >= OUTPOST_UPGRADE.COST_STONE;

    if (isOwnedOutpost && isNotUpgraded && hasEnoughResources) {
      this.upgradeModal?.show(tile.x, tile.y);
      return true;
    }
    return false;
  }

  private bindClicks(): void {
    this._clickHandler = (e: MouseEvent) => {
      if (e.button !== 0) return;

      const rect = this.canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      // Try upgrade modal first (works outside placement mode)
      if (this.tryShowUpgradeModal(screenX, screenY)) return;

      // Otherwise handle building placement
      if (!this.hud?.placementMode) return;

      const tile = this.screenToTile(screenX, screenY);
      if (!tile) return;

      if (!this.gridRenderer?.isValidPlacementTile(tile.x, tile.y)) return;

      this.hud.sendPlaceBuilding(tile.x, tile.y);
    };

    this.canvas.addEventListener('click', this._clickHandler);
  }

  private bindContextMenu(): void {
    this._contextMenuHandler = (e: MouseEvent) => {
      e.preventDefault();

      const rect = this.canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      this.tryShowUpgradeModal(screenX, screenY);
    };

    this.canvas.addEventListener('contextmenu', this._contextMenuHandler);
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
    if (this._contextMenuHandler) {
      this.canvas.removeEventListener('contextmenu', this._contextMenuHandler);
      this._contextMenuHandler = null;
    }
    if (this.hud) {
      this.hud.onPlacementModeChange = null;
    }
  }
}
