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

    // Draw initial full bars
    this.drawBar(this.healthBarFill, 1, 0x2ecc71);
    this.drawBar(this.hungerBarFill, 1, 0xf39c12);
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
