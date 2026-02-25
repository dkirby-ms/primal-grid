import { Container, Graphics, Text } from 'pixi.js';
import type { Room } from '@colyseus/sdk';

const BAR_WIDTH = 150;
const BAR_HEIGHT = 16;
const BAR_PADDING = 12;
const BAR_GAP = 6;
const LABEL_WIDTH = 60;

export class HudRenderer {
  public readonly container: Container;
  private localSessionId: string;

  private healthBarBg: Graphics;
  private healthBarFill: Graphics;
  private healthLabel: Text;
  private healthValue: Text;

  private hungerBarBg: Graphics;
  private hungerBarFill: Graphics;
  private hungerLabel: Text;
  private hungerValue: Text;

  private creatureCountText: Text;
  private inventoryText: Text;
  private craftedText: Text;
  private buildModeText: Text;

  /** Callback invoked with latest player resources for craft menu updates. */
  public onInventoryUpdate: ((resources: Record<string, number>) => void) | null = null;

  /** Readable player position for farm harvest. */
  public localPlayerX = 0;
  public localPlayerY = 0;

  constructor(localSessionId: string) {
    this.localSessionId = localSessionId;
    this.container = new Container();
    this.container.position.set(BAR_PADDING, BAR_PADDING);

    // --- Health bar ---
    const healthY = 0;

    this.healthLabel = new Text({
      text: 'Health',
      style: { fontSize: 12, fill: '#ffffff', fontFamily: 'monospace' },
    });
    this.healthLabel.position.set(0, healthY);
    this.container.addChild(this.healthLabel);

    this.healthBarBg = new Graphics();
    this.healthBarBg.rect(0, 0, BAR_WIDTH, BAR_HEIGHT);
    this.healthBarBg.fill(0x441111);
    this.healthBarBg.position.set(LABEL_WIDTH, healthY);
    this.container.addChild(this.healthBarBg);

    this.healthBarFill = new Graphics();
    this.healthBarFill.position.set(LABEL_WIDTH, healthY);
    this.container.addChild(this.healthBarFill);

    this.healthValue = new Text({
      text: '100/100',
      style: { fontSize: 12, fill: '#ffffff', fontFamily: 'monospace' },
    });
    this.healthValue.position.set(LABEL_WIDTH + BAR_WIDTH + 6, healthY);
    this.container.addChild(this.healthValue);

    // --- Hunger bar ---
    const hungerY = BAR_HEIGHT + BAR_GAP;

    this.hungerLabel = new Text({
      text: 'Hunger',
      style: { fontSize: 12, fill: '#ffffff', fontFamily: 'monospace' },
    });
    this.hungerLabel.position.set(0, hungerY);
    this.container.addChild(this.hungerLabel);

    this.hungerBarBg = new Graphics();
    this.hungerBarBg.rect(0, 0, BAR_WIDTH, BAR_HEIGHT);
    this.hungerBarBg.fill(0x442211);
    this.hungerBarBg.position.set(LABEL_WIDTH, hungerY);
    this.container.addChild(this.hungerBarBg);

    this.hungerBarFill = new Graphics();
    this.hungerBarFill.position.set(LABEL_WIDTH, hungerY);
    this.container.addChild(this.hungerBarFill);

    this.hungerValue = new Text({
      text: '100/100',
      style: { fontSize: 12, fill: '#ffffff', fontFamily: 'monospace' },
    });
    this.hungerValue.position.set(LABEL_WIDTH + BAR_WIDTH + 6, hungerY);
    this.container.addChild(this.hungerValue);

    // --- Creature count ---
    const creatureY = hungerY + BAR_HEIGHT + BAR_GAP + 4;
    this.creatureCountText = new Text({
      text: '\uD83E\uDD95 0  \uD83E\uDD96 0',
      style: { fontSize: 12, fill: '#cccccc', fontFamily: 'monospace' },
    });
    this.creatureCountText.position.set(0, creatureY);
    this.container.addChild(this.creatureCountText);

    // --- Inventory display ---
    const invY = creatureY + 20;
    this.inventoryText = new Text({
      text: '\uD83E\uDEB5 0  \uD83E\uDEA8 0  \uD83C\uDF3F 0  \uD83E\uDED0 0',
      style: { fontSize: 11, fill: '#aaaaaa', fontFamily: 'monospace' },
    });
    this.inventoryText.position.set(0, invY);
    this.container.addChild(this.inventoryText);

    const craftedY = invY + 18;
    this.craftedText = new Text({
      text: '',
      style: { fontSize: 11, fill: '#aaaaaa', fontFamily: 'monospace' },
    });
    this.craftedText.position.set(0, craftedY);
    this.container.addChild(this.craftedText);

    // --- Build mode indicator ---
    this.buildModeText = new Text({
      text: '',
      style: { fontSize: 14, fill: '#ffcc00', fontFamily: 'monospace', fontWeight: 'bold' },
    });
    this.buildModeText.position.set(0, craftedY + 22);
    this.buildModeText.visible = false;
    this.container.addChild(this.buildModeText);

    // Draw initial full bars
    this.drawBar(this.healthBarFill, 1, 0x2ecc71);
    this.drawBar(this.hungerBarFill, 1, 0xf39c12);
  }

  /** Show or hide build mode indicator with selected item name. */
  public setBuildMode(active: boolean, itemName?: string): void {
    this.buildModeText.visible = active;
    if (active) {
      this.buildModeText.text = `🔨 BUILD MODE [${itemName ?? ''}]`;
    }
  }

  /** Listen to Colyseus state and update HUD bars for the local player. */
  public bindToRoom(room: Room): void {
    room.onStateChange((state: Record<string, unknown>) => {
      const players = state['players'] as
        | { forEach: (cb: (player: Record<string, unknown>, key: string) => void) => void }
        | undefined;
      if (players && typeof players.forEach === 'function') {
        players.forEach((player, key) => {
          const id = (player['id'] as string) ?? key;
          if (id !== this.localSessionId) return;

          const health = (player['health'] as number) ?? 100;
          const hunger = (player['hunger'] as number) ?? 100;

          this.updateHealth(health);
          this.updateHunger(hunger);

          // Track position for farm harvest
          this.localPlayerX = (player['x'] as number) ?? 0;
          this.localPlayerY = (player['y'] as number) ?? 0;

          // Update inventory display
          const wood = (player['wood'] as number) ?? 0;
          const stone = (player['stone'] as number) ?? 0;
          const fiber = (player['fiber'] as number) ?? 0;
          const berries = (player['berries'] as number) ?? 0;
          this.inventoryText.text =
            `\uD83E\uDEB5 ${wood}  \uD83E\uDEA8 ${stone}  \uD83C\uDF3F ${fiber}  \uD83E\uDED0 ${berries}`;

          // Crafted items
          const walls = (player['walls'] as number) ?? 0;
          const floors = (player['floors'] as number) ?? 0;
          const axes = (player['axes'] as number) ?? 0;
          const pickaxes = (player['pickaxes'] as number) ?? 0;
          const workbenches = (player['workbenches'] as number) ?? 0;
          const farmPlots = (player['farmPlots'] as number) ?? 0;
          this.craftedText.text =
            `Wall:${walls} Floor:${floors} Axe:${axes} Pick:${pickaxes} WB:${workbenches} Farm:${farmPlots}`;

          // Notify craft menu of resource changes
          if (this.onInventoryUpdate) {
            this.onInventoryUpdate({ wood, stone, fiber, berries });
          }
        });
      }

      // Count creatures
      const creatures = state['creatures'] as
        | { forEach: (cb: (creature: Record<string, unknown>, key: string) => void) => void }
        | undefined;
      if (creatures && typeof creatures.forEach === 'function') {
        let herbs = 0;
        let carns = 0;
        creatures.forEach((creature) => {
          const t = (creature['creatureType'] as string) ?? 'herbivore';
          if (t === 'carnivore') carns++;
          else herbs++;
        });
        this.updateCreatureCounts(herbs, carns);
      }
    });
  }

  private updateHealth(value: number): void {
    const clamped = Math.max(0, Math.min(100, value));
    const ratio = clamped / 100;
    // Lerp from red (low) to green (high)
    const color = ratio > 0.5 ? 0x2ecc71 : ratio > 0.25 ? 0xf39c12 : 0xe74c3c;
    this.drawBar(this.healthBarFill, ratio, color);
    this.healthValue.text = `${Math.round(clamped)}/100`;
  }

  private updateHunger(value: number): void {
    const clamped = Math.max(0, Math.min(100, value));
    const ratio = clamped / 100;
    const color = ratio > 0.5 ? 0xf39c12 : ratio > 0.25 ? 0xe67e22 : 0xe74c3c;
    this.drawBar(this.hungerBarFill, ratio, color);
    this.hungerValue.text = `${Math.round(clamped)}/100`;
  }

  private drawBar(bar: Graphics, ratio: number, color: number): void {
    bar.clear();
    if (ratio > 0) {
      bar.rect(0, 0, BAR_WIDTH * ratio, BAR_HEIGHT);
      bar.fill(color);
    }
  }

  private updateCreatureCounts(herbivores: number, carnivores: number): void {
    this.creatureCountText.text = `\uD83E\uDD95 ${herbivores}  \uD83E\uDD96 ${carnivores}`;
  }
}
