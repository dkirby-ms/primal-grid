import { Container, Text } from 'pixi.js';
import type { ConnectionStatus as Status } from '../network.js';

const LABELS: Record<Status, string> = {
  connecting: '⏳ Connecting…',
  connected: '✅ Connected',
  disconnected: '❌ Disconnected',
  error: '⚠️ Error',
};

const COLORS: Record<Status, string> = {
  connecting: '#f1c40f',
  connected: '#2ecc71',
  disconnected: '#e74c3c',
  error: '#e67e22',
};

export class ConnectionStatusUI {
  public readonly container: Container;
  private label: Text;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(screenWidth: number) {
    this.container = new Container();
    this.label = new Text({
      text: '',
      style: {
        fontSize: 16,
        fill: '#ffffff',
        fontFamily: 'monospace',
      },
    });
    this.container.addChild(this.label);
    this.container.position.set(screenWidth - 200, 12);
  }

  public update(status: Status): void {
    this.label.text = LABELS[status];
    this.label.style.fill = COLORS[status];
    this.container.visible = true;

    if (this.hideTimer) clearTimeout(this.hideTimer);

    if (status === 'connected') {
      this.hideTimer = setTimeout(() => {
        this.container.visible = false;
      }, 2000);
    }
  }

  public reposition(screenWidth: number): void {
    this.container.position.x = screenWidth - 200;
  }
}
