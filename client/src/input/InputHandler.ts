import type { Room } from '@colyseus/sdk';
import type { Container } from 'pixi.js';
import type { HudDOM } from '../ui/HudDOM.js';
import type { HelpScreen } from '../ui/HelpScreen.js';
import type { Camera } from '../renderer/Camera.js';

export class InputHandler {
  private room: Room;
  private worldContainer: Container;
  private canvas: HTMLCanvasElement;

  private hud: HudDOM | null = null;
  private helpScreen: HelpScreen | null = null;
  private camera: Camera | null = null;

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

  /** Wire up the camera. */
  public setCamera(camera: Camera): void {
    this.camera = camera;
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      // Help screen toggle
      if (e.key === '?' || e.key === '/') {
        this.helpScreen?.toggle();
        return;
      }

      // Center camera on HQ
      if (e.key === ' ') {
        e.preventDefault();
        this.camera?.centerOnHQ(this.hud?.localHqX ?? 0, this.hud?.localHqY ?? 0);
        return;
      }
    });
  }
}
