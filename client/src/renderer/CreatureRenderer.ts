import { Container, Graphics, Text } from 'pixi.js';
import { TILE_SIZE } from './GridRenderer.js';
import { CREATURE_TYPES } from '@primal-grid/shared';
import type { Room } from '@colyseus/sdk';

const CREATURE_RADIUS = 6;

// Base colors per creature type
const HERBIVORE_COLOR = 0x4caf50;
const CARNIVORE_COLOR = 0xf44336;
const BUILDER_COLOR = 0x42a5f5;

// Brighter variants for Eat state
const HERBIVORE_EAT_COLOR = 0x81c784;
const CARNIVORE_EAT_COLOR = 0xef9a9a;

// Darker variants for Hunt state
const CARNIVORE_HUNT_COLOR = 0xc62828;

interface CreatureEntry {
  container: Container;
  graphic: Graphics;
  emojiText: Text;
  indicator: Text;
  progressBar: Graphics | null;
  lastType: string;
  lastState: string;
  lastHealthLow: boolean;
  lastBuildProgress: number;
  tileX: number;
  tileY: number;
}

export class CreatureRenderer {
  public readonly container: Container;
  private entries: Map<string, CreatureEntry> = new Map();
  private localSessionId = '';

  /** Latest creature counts, readable by HUD. */
  public herbivoreCount = 0;
  public carnivoreCount = 0;

  constructor() {
    this.container = new Container();
  }

  /** Listen to Colyseus state and render/update creature markers. */
  public bindToRoom(room: Room): void {
    this.localSessionId = room.sessionId;

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
        const ownerID = (creature['ownerID'] as string) ?? '';
        const buildProgress = (creature['buildProgress'] as number) ?? 0;

        if (creatureType === 'carnivore') carns++;
        else if (creatureType === 'herbivore') herbs++;

        const isBuilder = creatureType === 'pawn_builder';
        const isLocalBuilder = isBuilder && ownerID === this.localSessionId;

        let entry = this.entries.get(id);
        if (!entry) {
          entry = this.createCreatureEntry(creatureType, currentState, isLocalBuilder);
          this.entries.set(id, entry);
          this.container.addChild(entry.container);
        }

        // Store latest position
        entry.tileX = x;
        entry.tileY = y;

        // Rebuild graphic if state or type changed
        if (entry.lastType !== creatureType || entry.lastState !== currentState) {
          this.rebuildGraphic(entry, creatureType, currentState, isLocalBuilder);
        }

        // Health-based opacity
        if (entry.lastHealthLow !== healthLow) {
          entry.container.alpha = healthLow ? 0.6 : 1.0;
          entry.lastHealthLow = healthLow;
        }

        // Build progress indicator for builders
        if (isBuilder && buildProgress > 0) {
          this.updateBuildProgress(entry, buildProgress);
        } else if (entry.progressBar) {
          entry.progressBar.visible = false;
          entry.lastBuildProgress = 0;
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

  private createCreatureEntry(creatureType: string, currentState: string, isLocalBuilder: boolean): CreatureEntry {
    const container = new Container();

    // State-colored background circle (subtle indicator behind emoji)
    const graphic = new Graphics();
    this.drawStateBackground(graphic, creatureType, currentState, isLocalBuilder);
    container.addChild(graphic);

    // Emoji icon as primary visual
    const icon = this.getIcon(creatureType, isLocalBuilder);
    const fontSize = CREATURE_RADIUS * 2.5;
    const emojiText = new Text({
      text: icon,
      style: { fontSize, fontFamily: 'sans-serif' },
    });
    emojiText.anchor?.set?.(0.5, 0.5);
    container.addChild(emojiText);

    const indicator = new Text({
      text: '',
      style: { fontSize: 10, fill: '#ffffff', fontFamily: 'monospace', fontWeight: 'bold' },
    });
    indicator.anchor?.set?.(0.5, 1);
    indicator.position.set(0, -CREATURE_RADIUS - 2);
    container.addChild(indicator);

    this.updateIndicator(indicator, currentState, creatureType === 'pawn_builder');

    return {
      container,
      graphic,
      emojiText,
      indicator,
      progressBar: null,
      lastType: creatureType,
      lastState: currentState,
      lastHealthLow: false,
      lastBuildProgress: 0,
      tileX: 0,
      tileY: 0,
    };
  }

  private rebuildGraphic(entry: CreatureEntry, creatureType: string, currentState: string, isLocalBuilder: boolean): void {
    entry.graphic.clear();
    this.drawStateBackground(entry.graphic, creatureType, currentState, isLocalBuilder);
    const icon = this.getIcon(creatureType, isLocalBuilder);
    if (entry.emojiText.text !== icon) {
      entry.emojiText.text = icon;
    }
    this.updateIndicator(entry.indicator, currentState, creatureType === 'pawn_builder');
    entry.lastType = creatureType;
    entry.lastState = currentState;
  }

  private getIcon(creatureType: string, isLocalBuilder: boolean): string {
    if (creatureType === 'pawn_builder') {
      return isLocalBuilder ? '🔨' : '⬜';
    }
    return CREATURE_TYPES[creatureType]?.icon ?? '🦕';
  }

  private drawStateBackground(g: Graphics, creatureType: string, currentState: string, isLocalBuilder: boolean): void {
    if (creatureType === 'pawn_builder') {
      const color = isLocalBuilder ? BUILDER_COLOR : 0x888888;
      g.rect(-CREATURE_RADIUS, -CREATURE_RADIUS, CREATURE_RADIUS * 2, CREATURE_RADIUS * 2);
      g.fill({ color, alpha: 0.4 });
      return;
    }
    if (currentState === 'idle' || currentState === 'wander') return;
    const color = this.getCreatureColor(creatureType, currentState);
    g.circle(0, 0, CREATURE_RADIUS + 1);
    g.fill({ color, alpha: 0.35 });
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

  private updateIndicator(indicator: Text, currentState: string, isBuilder: boolean): void {
    if (isBuilder) {
      indicator.text = '';
      indicator.visible = false;
      return;
    }
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

  /** Show/update a small progress bar below a builder when building. */
  private updateBuildProgress(entry: CreatureEntry, progress: number): void {
    if (progress === entry.lastBuildProgress) return;
    entry.lastBuildProgress = progress;

    if (!entry.progressBar) {
      entry.progressBar = new Graphics();
      entry.container.addChild(entry.progressBar);
    }

    const barWidth = TILE_SIZE * 0.7;
    const barHeight = 3;
    const barX = -barWidth / 2;
    const barY = CREATURE_RADIUS + 3;
    const pct = Math.min(1, Math.max(0, progress / 100));

    entry.progressBar.clear();
    // Background
    entry.progressBar.rect(barX, barY, barWidth, barHeight);
    entry.progressBar.fill({ color: 0x333333, alpha: 0.8 });
    // Fill
    if (pct > 0) {
      entry.progressBar.rect(barX, barY, barWidth * pct, barHeight);
      entry.progressBar.fill({ color: 0x4caf50, alpha: 0.9 });
    }
    entry.progressBar.visible = true;
  }
}
