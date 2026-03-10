import type { Room } from '@colyseus/sdk';
import type { Container } from 'pixi.js';
import type { HudDOM } from '../ui/HudDOM.js';
import type { HelpScreen } from '../ui/HelpScreen.js';
import type { Scoreboard } from '../ui/Scoreboard.js';
import type { Camera } from '../renderer/Camera.js';
import type { ChatPanel } from '../ui/ChatPanel.js';

export class InputHandler {
  private room: Room;
  private worldContainer: Container;
  private canvas: HTMLCanvasElement;

  private hud: HudDOM | null = null;
  private helpScreen: HelpScreen | null = null;
  private scoreboard: Scoreboard | null = null;
  private camera: Camera | null = null;
  private chatPanel: ChatPanel | null = null;
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(room: Room, worldContainer: Container, canvas: HTMLCanvasElement) {
    this.room = room;
    this.worldContainer = worldContainer;
    this.canvas = canvas;
    this.bindKeys();
    this.canvas.style.cursor = 'crosshair';
  }

  /** Wire up the HUD. */
  public setHud(hud: HudDOM): void {
    this.hud = hud;
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

  private bindKeys(): void {
    this._keyHandler = (e: KeyboardEvent) => {
      // When chat input is focused, don't process game keys
      if (this.chatPanel?.isFocused) return;

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
  }
}
