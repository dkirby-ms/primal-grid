import { Container, Graphics, Text } from 'pixi.js';
import { TILE_SIZE } from './GridRenderer.js';
import type { Room } from '@colyseus/sdk';

const CREATURE_RADIUS = 6;

// Base colors per creature type
const HERBIVORE_COLOR = 0x4caf50;
const CARNIVORE_COLOR = 0xf44336;

// Brighter variants for Eat state
const HERBIVORE_EAT_COLOR = 0x81c784;
const CARNIVORE_EAT_COLOR = 0xef9a9a;

// Darker variants for Hunt state
const CARNIVORE_HUNT_COLOR = 0xc62828;

interface CreatureEntry {
  container: Container;
  graphic: Graphics;
  indicator: Text;
  lastType: string;
  lastState: string;
  lastHealthLow: boolean;
}

export class CreatureRenderer {
  public readonly container: Container;
  private entries: Map<string, CreatureEntry> = new Map();
  /** Latest creature counts, readable by HUD. */
  public herbivoreCount = 0;
  public carnivoreCount = 0;

  constructor() {
    this.container = new Container();
  }

  /** Listen to Colyseus state and render/update creature markers. */
  public bindToRoom(room: Room): void {
    room.onStateChange((state: Record<string, unknown>) => {
      const creatures = state['creatures'] as
        | { forEach: (cb: (creature: Record<string, unknown>, key: string) => void) => void }
        | undefined;
      if (!creatures || typeof creatures.forEach !== 'function') return;

      const seen = new Set<string>();
      let herbs = 0;
      let carns = 0;

      creatures.forEach((creature, key) => {
        const id = (creature['id'] as string) ?? key;
        seen.add(id);

        const x = (creature['x'] as number) ?? 0;
        const y = (creature['y'] as number) ?? 0;
        const creatureType = (creature['creatureType'] as string) ?? 'herbivore';
        const currentState = (creature['currentState'] as string) ?? 'idle';
        const health = (creature['health'] as number) ?? 100;
        const healthLow = health < 50;

        if (creatureType === 'carnivore') carns++;
        else herbs++;

        let entry = this.entries.get(id);
        if (!entry) {
          entry = this.createCreatureEntry(creatureType, currentState);
          this.entries.set(id, entry);
          this.container.addChild(entry.container);
        }

        // Rebuild graphic if state or type changed
        if (entry.lastType !== creatureType || entry.lastState !== currentState) {
          this.rebuildGraphic(entry, creatureType, currentState);
        }

        // Health-based opacity
        if (entry.lastHealthLow !== healthLow) {
          entry.container.alpha = healthLow ? 0.6 : 1.0;
          entry.lastHealthLow = healthLow;
        }

        // Snap to tile center
        entry.container.position.set(
          x * TILE_SIZE + TILE_SIZE / 2,
          y * TILE_SIZE + TILE_SIZE / 2,
        );
      });

      this.herbivoreCount = herbs;
      this.carnivoreCount = carns;

      // Remove creatures that despawned
      for (const [id, entry] of this.entries) {
        if (!seen.has(id)) {
          this.container.removeChild(entry.container);
          entry.container.destroy({ children: true });
          this.entries.delete(id);
        }
      }
    });
  }

  private createCreatureEntry(creatureType: string, currentState: string): CreatureEntry {
    const container = new Container();

    const graphic = new Graphics();
    this.drawCreatureShape(graphic, creatureType, currentState);
    container.addChild(graphic);

    const indicator = new Text({
      text: '',
      style: { fontSize: 10, fill: '#ffffff', fontFamily: 'monospace', fontWeight: 'bold' },
    });
    indicator.anchor?.set?.(0.5, 1);
    indicator.position.set(0, -CREATURE_RADIUS - 2);
    container.addChild(indicator);

    this.updateIndicator(indicator, currentState);

    return { container, graphic, indicator, lastType: creatureType, lastState: currentState, lastHealthLow: false };
  }

  private rebuildGraphic(entry: CreatureEntry, creatureType: string, currentState: string): void {
    entry.graphic.clear();
    this.drawCreatureShape(entry.graphic, creatureType, currentState);
    this.updateIndicator(entry.indicator, currentState);
    entry.lastType = creatureType;
    entry.lastState = currentState;
  }

  private drawCreatureShape(g: Graphics, creatureType: string, currentState: string): void {
    const color = this.getCreatureColor(creatureType, currentState);

    if (creatureType === 'carnivore') {
      const r = CREATURE_RADIUS;
      g.moveTo(0, -r);
      g.lineTo(r, r);
      g.lineTo(-r, r);
      g.closePath();
      g.fill(color);
    } else {
      g.circle(0, 0, CREATURE_RADIUS);
      g.fill(color);
    }
  }

  private getCreatureColor(creatureType: string, currentState: string): number {
    if (creatureType === 'carnivore') {
      if (currentState === 'eat') return CARNIVORE_EAT_COLOR;
      if (currentState === 'hunt') return CARNIVORE_HUNT_COLOR;
      return CARNIVORE_COLOR;
    }
    if (currentState === 'eat') return HERBIVORE_EAT_COLOR;
    return HERBIVORE_COLOR;
  }

  private updateIndicator(indicator: Text, currentState: string): void {
    if (currentState === 'flee') {
      indicator.text = '!';
      indicator.visible = true;
    } else if (currentState === 'hunt') {
      indicator.text = '\u2694';
      indicator.visible = true;
    } else {
      indicator.text = '';
      indicator.visible = false;
    }
  }
}
