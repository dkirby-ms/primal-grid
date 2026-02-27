import { Container, Graphics, Text } from 'pixi.js';

const PANEL_WIDTH = 420;
const PANEL_PADDING = 24;
const ROW_HEIGHT = 22;
const HEADER_SIZE = 16;
const BODY_SIZE = 12;

const KEYBINDINGS: [string, string][] = [
  ['Click', 'Claim tile / Place structure (build)'],
  ['W A S D', 'Pan camera'],
  ['Scroll', 'Zoom in / out'],
  ['C', 'Open / close craft menu'],
  ['V', 'Toggle build mode'],
  ['1-9', 'Craft item (menu) / Select build item'],
  ['H', 'Harvest farm (cursor tile)'],
  ['I', 'Tame creature (cursor tile)'],
  ['?', 'Toggle this help screen'],
];

export class HelpScreen {
  public readonly container: Container;
  private visible = false;
  private overlay: Graphics;
  private panel: Graphics;

  private screenWidth: number;
  private screenHeight: number;

  constructor(screenWidth: number, screenHeight: number) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.container = new Container();
    this.container.visible = false;

    // Full-screen semi-transparent overlay
    this.overlay = new Graphics();
    this.overlay.rect(0, 0, screenWidth, screenHeight);
    this.overlay.fill({ color: 0x000000, alpha: 0.6 });
    this.container.addChild(this.overlay);

    // Centered panel
    this.panel = new Graphics();
    this.container.addChild(this.panel);

    // Title
    const title = new Text({
      text: '⌨ KEYBINDINGS',
      style: { fontSize: HEADER_SIZE, fill: '#ffffff', fontFamily: 'monospace', fontWeight: 'bold' },
    });
    title.position.set(PANEL_PADDING, PANEL_PADDING);
    this.panel.addChild(title);

    // Separator
    const sepY = PANEL_PADDING + HEADER_SIZE + 8;
    const sep = new Graphics();
    sep.rect(PANEL_PADDING, sepY, PANEL_WIDTH - PANEL_PADDING * 2, 1);
    sep.fill({ color: 0x888888, alpha: 0.5 });
    this.panel.addChild(sep);

    // Key rows
    let y = sepY + 10;
    for (const [key, desc] of KEYBINDINGS) {
      const keyText = new Text({
        text: key,
        style: { fontSize: BODY_SIZE, fill: '#ffcc00', fontFamily: 'monospace', fontWeight: 'bold' },
      });
      keyText.position.set(PANEL_PADDING, y);
      this.panel.addChild(keyText);

      const descText = new Text({
        text: desc,
        style: { fontSize: BODY_SIZE, fill: '#cccccc', fontFamily: 'monospace' },
      });
      descText.position.set(PANEL_PADDING + 130, y);
      this.panel.addChild(descText);

      y += ROW_HEIGHT;
    }

    // Footer hint
    y += 6;
    const footer = new Text({
      text: 'Press ? or / to close',
      style: { fontSize: 11, fill: '#888888', fontFamily: 'monospace' },
    });
    footer.position.set(PANEL_PADDING, y);
    this.panel.addChild(footer);

    // Panel background
    const panelHeight = y + PANEL_PADDING + 12;
    const panelBg = new Graphics();
    panelBg.roundRect(0, 0, PANEL_WIDTH, panelHeight, 8);
    panelBg.fill({ color: 0x111122, alpha: 0.95 });
    panelBg.stroke({ color: 0x444466, width: 1 });
    this.panel.addChildAt(panelBg, 0);

    // Center the panel
    this.panel.position.set(
      Math.round((screenWidth - PANEL_WIDTH) / 2),
      Math.round((screenHeight - panelHeight) / 2),
    );
  }

  public toggle(): void {
    this.visible = !this.visible;
    this.container.visible = this.visible;
  }

  public isOpen(): boolean {
    return this.visible;
  }
}
