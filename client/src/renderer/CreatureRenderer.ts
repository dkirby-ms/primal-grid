import { Container, Graphics, Text } from 'pixi.js';
import { TILE_SIZE } from './GridRenderer.js';
import {
  CREATURE_TYPES,
  PAWN,
  ENEMY_BASE_TYPES,
  ENEMY_MOBILE_TYPES,
  PAWN_TYPES,
  isEnemyBase,
  isEnemyMobile,
  isPlayerPawn,
} from '@primal-grid/shared';
import type { Room } from '@colyseus/sdk';
import { CombatEffects } from './CombatEffects.js';

const CREATURE_RADIUS = 6;
const ENEMY_BASE_RADIUS = 9;

// Pixel offsets applied when multiple creatures share a tile so they don't visually merge.
const STACK_OFFSETS: ReadonlyArray<Readonly<{ x: number; y: number }>> = [
  { x: -5, y: -4 },
  { x: 5, y: 4 },
  { x: 5, y: -4 },
  { x: -5, y: 4 },
  { x: 0, y: -6 },
  { x: 0, y: 6 },
];

// Base colors per creature type
const HERBIVORE_COLOR = 0x4caf50;
const CARNIVORE_COLOR = 0xf44336;
const BUILDER_COLOR = 0x42a5f5;
const DEFENDER_COLOR = 0x2196f3;
const ATTACKER_COLOR = 0xff9800;

// Brighter variants for Eat state
const HERBIVORE_EAT_COLOR = 0x81c784;
const CARNIVORE_EAT_COLOR = 0xef9a9a;

// Darker variants for Hunt state
const CARNIVORE_HUNT_COLOR = 0xc62828;

// Exhausted state color (gray/muted)
const EXHAUSTED_COLOR = 0x9e9e9e;

interface CreatureEntry {
  container: Container;
  graphic: Graphics;
  emojiText: Text;
  indicator: Text;
  progressBar: Graphics | null;
  hpBar: Graphics | null;
  lastType: string;
  lastState: string;
  lastHealthLow: boolean;
  lastBuildProgress: number;
  lastHealthPct: number;
  tileX: number;
  tileY: number;
  displayX: number;
  displayY: number;
}

export class CreatureRenderer {
  public readonly container: Container;
  private entries: Map<string, CreatureEntry> = new Map();
  private localSessionId = '';
  private combatEffects: CombatEffects | null = null;

  /** Latest creature counts, readable by HUD. */
  public herbivoreCount = 0;
  public carnivoreCount = 0;
  public defenderCount = 0;
  public attackerCount = 0;
  public enemyBaseCount = 0;

  constructor() {
    this.container = new Container();
  }

  /** Inject combat effects manager for floating damage numbers and hit flashes. */
  public setCombatEffects(effects: CombatEffects): void {
    this.combatEffects = effects;
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
      let defenders = 0;
      let attackers = 0;
      let enemyBases = 0;

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
        const isGrave = creatureType === 'grave_marker';

        if (creatureType === 'carnivore') carns++;
        else if (creatureType === 'herbivore') herbs++;
        else if (creatureType === 'pawn_defender' && ownerID === this.localSessionId) defenders++;
        else if (creatureType === 'pawn_attacker' && ownerID === this.localSessionId) attackers++;
        if (isEnemyBase(creatureType)) enemyBases++;

        const isBuilder = creatureType === 'pawn_builder';
        const isLocalBuilder = isBuilder && ownerID === this.localSessionId;
        const isCombatEntity = !isGrave && (isEnemyBase(creatureType) || isEnemyMobile(creatureType) || creatureType === 'pawn_defender' || creatureType === 'pawn_attacker');

        let entry = this.entries.get(id);
        if (!entry) {
          if (isGrave) {
            entry = this.createGraveMarkerEntry();
          } else {
            entry = this.createCreatureEntry(creatureType, currentState, isLocalBuilder);
          }
          this.entries.set(id, entry);
          this.container.addChild(entry.container);
        }

        // Update target tile (display position interpolated in tick())
        entry.tileX = x;
        entry.tileY = y;

        // Grave markers: skip all living-creature updates
        if (isGrave) {
          // Fade in to 0.65 over ~200ms (lerp toward target each sync)
          if (entry.container.alpha < 0.65) {
            entry.container.alpha = Math.min(0.65, entry.container.alpha + 0.15);
          }
          if (entry.displayX === 0 && entry.displayY === 0) {
            entry.displayX = x * TILE_SIZE + TILE_SIZE / 2;
            entry.displayY = y * TILE_SIZE + TILE_SIZE / 2;
            entry.container.position.set(entry.displayX, entry.displayY);
          }
          return; // forEach continue
        }

        // Rebuild graphic if state or type changed
        if (entry.lastType !== creatureType || entry.lastState !== currentState) {
          this.rebuildGraphic(entry, creatureType, currentState, isLocalBuilder);
        }

        // Health-based opacity
        if (entry.lastHealthLow !== healthLow) {
          entry.container.alpha = healthLow ? 0.6 : 1.0;
          entry.lastHealthLow = healthLow;
        }

        // Combat effects: detect HP delta and trigger floating numbers / hit flash
        if (this.combatEffects) {
          this.combatEffects.trackHealth(id, health, entry.container, entry.displayX, entry.displayY);
        }

        // HP bar for combat entities
        if (isCombatEntity) {
          const maxHealth = this.getMaxHealth(creatureType);
          const healthPct = maxHealth > 0 ? Math.min(1, Math.max(0, health / maxHealth)) : 1;
          if (Math.abs(healthPct - entry.lastHealthPct) > 0.01 || healthPct < 1) {
            this.updateHpBar(entry, healthPct, creatureType);
          }
        }

        // Build progress indicator for builders
        if (isBuilder && buildProgress > 0) {
          this.updateBuildProgress(entry, buildProgress);
        } else if (entry.progressBar) {
          entry.progressBar.visible = false;
          entry.lastBuildProgress = 0;
        }

        // Position is now interpolated in tick(); only snap on first spawn
        if (entry.displayX === 0 && entry.displayY === 0) {
          entry.displayX = x * TILE_SIZE + TILE_SIZE / 2;
          entry.displayY = y * TILE_SIZE + TILE_SIZE / 2;
          entry.container.position.set(entry.displayX, entry.displayY);
        }
      });

      this.herbivoreCount = herbs;
      this.carnivoreCount = carns;
      this.defenderCount = defenders;
      this.attackerCount = attackers;
      this.enemyBaseCount = enemyBases;

      // Remove creatures that despawned
      for (const [id, entry] of this.entries) {
        if (!seen.has(id)) {
          this.container.removeChild(entry.container);
          entry.container.destroy({ children: true });
          this.entries.delete(id);
          this.combatEffects?.removeCreature(id);
        }
      }
    });
  }

  /** Create a tombstone graphic for a grave marker (no emoji, pure PixiJS Graphics). */
  private createGraveMarkerEntry(): CreatureEntry {
    const container = new Container();
    container.alpha = 0; // starts invisible, fades in

    const graphic = new Graphics();

    // Shadow (slightly offset ellipse)
    graphic.ellipse(1, 6, 7, 2);
    graphic.fill({ color: 0x000000, alpha: 0.25 });

    // Base (rectangular stone slab)
    graphic.rect(-6, 2, 12, 4);
    graphic.fill({ color: 0x555555 });

    // Headstone (rounded rectangle)
    graphic.roundRect(-5, -10, 10, 14, 3);
    graphic.fill({ color: 0x666666 });
    graphic.roundRect(-5, -10, 10, 14, 3);
    graphic.stroke({ color: 0x555555, width: 0.5 });

    // Cross etching on headstone
    graphic.rect(-0.5, -7, 1, 7);
    graphic.fill({ color: 0x4a4a4a });
    graphic.rect(-2.5, -5, 5, 1);
    graphic.fill({ color: 0x4a4a4a });

    container.addChild(graphic);

    // Dummy text objects (grave markers don't use emoji/indicator)
    const emojiText = new Text({ text: '', style: { fontSize: 1 } });
    emojiText.visible = false;
    container.addChild(emojiText);

    const indicator = new Text({ text: '', style: { fontSize: 1 } });
    indicator.visible = false;
    container.addChild(indicator);

    return {
      container,
      graphic,
      emojiText,
      indicator,
      progressBar: null,
      hpBar: null,
      lastType: 'grave_marker',
      lastState: 'idle',
      lastHealthLow: false,
      lastBuildProgress: 0,
      lastHealthPct: 1,
      tileX: 0,
      tileY: 0,
      displayX: 0,
      displayY: 0,
    };
  }

  private createCreatureEntry(creatureType: string, currentState: string, isLocalBuilder: boolean): CreatureEntry {
    const container = new Container();

    // State-colored background circle (subtle indicator behind emoji)
    const graphic = new Graphics();
    this.drawStateBackground(graphic, creatureType, currentState, isLocalBuilder);
    container.addChild(graphic);

    // Emoji icon as primary visual (enemy bases render 1.5× larger)
    const isBase = isEnemyBase(creatureType);
    const fontSize = isBase ? ENEMY_BASE_RADIUS * 2.5 : CREATURE_RADIUS * 2.5;
    const icon = this.getIcon(creatureType, isLocalBuilder);
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

    this.updateIndicator(indicator, currentState, creatureType);

    return {
      container,
      graphic,
      emojiText,
      indicator,
      progressBar: null,
      hpBar: null,
      lastType: creatureType,
      lastState: currentState,
      lastHealthLow: false,
      lastBuildProgress: 0,
      lastHealthPct: 1,
      tileX: 0,
      tileY: 0,
      displayX: 0,
      displayY: 0,
    };
  }

  private rebuildGraphic(entry: CreatureEntry, creatureType: string, currentState: string, isLocalBuilder: boolean): void {
    entry.graphic.clear();
    this.drawStateBackground(entry.graphic, creatureType, currentState, isLocalBuilder);
    const icon = this.getIcon(creatureType, isLocalBuilder);
    if (entry.emojiText.text !== icon) {
      entry.emojiText.text = icon;
    }
    this.updateIndicator(entry.indicator, currentState, creatureType);
    entry.lastType = creatureType;
    entry.lastState = currentState;
  }

  private getIcon(creatureType: string, isLocalBuilder: boolean): string {
    if (creatureType === 'pawn_builder') {
      return isLocalBuilder ? '🔨' : '⬜';
    }
    // Combat pawn icons from PAWN_TYPES registry
    if (creatureType === 'pawn_defender') return PAWN_TYPES['defender']?.icon ?? '🛡';
    if (creatureType === 'pawn_attacker') return PAWN_TYPES['attacker']?.icon ?? '⚔';
    // Enemy base icons from ENEMY_BASE_TYPES registry
    if (isEnemyBase(creatureType)) return ENEMY_BASE_TYPES[creatureType]?.icon ?? '⛺';
    // Enemy mobile icons from ENEMY_MOBILE_TYPES registry
    if (isEnemyMobile(creatureType)) return ENEMY_MOBILE_TYPES[creatureType]?.icon ?? '👁';
    return CREATURE_TYPES[creatureType]?.icon ?? '🦕';
  }

  private drawStateBackground(g: Graphics, creatureType: string, currentState: string, isLocalBuilder: boolean): void {
    // Player pawns — square backgrounds
    if (isPlayerPawn(creatureType)) {
      let color: number;
      let alpha = 0.4;
      if (creatureType === 'pawn_builder') {
        color = currentState === 'exhausted' ? EXHAUSTED_COLOR : (isLocalBuilder ? BUILDER_COLOR : 0x888888);
        alpha = currentState === 'exhausted' ? 0.3 : 0.4;
      } else if (creatureType === 'pawn_defender') {
        color = currentState === 'exhausted' ? EXHAUSTED_COLOR : DEFENDER_COLOR;
        alpha = currentState === 'exhausted' ? 0.3 : 0.4;
      } else {
        // pawn_attacker
        color = currentState === 'exhausted' ? EXHAUSTED_COLOR : ATTACKER_COLOR;
        alpha = currentState === 'exhausted' ? 0.3 : 0.4;
      }
      g.rect(-CREATURE_RADIUS, -CREATURE_RADIUS, CREATURE_RADIUS * 2, CREATURE_RADIUS * 2);
      g.fill({ color, alpha });
      return;
    }
    // Enemy bases — larger diamond shape
    if (isEnemyBase(creatureType)) {
      const baseColor = ENEMY_BASE_TYPES[creatureType]?.color ?? 0xcc0000;
      g.moveTo(0, -ENEMY_BASE_RADIUS);
      g.lineTo(ENEMY_BASE_RADIUS, 0);
      g.lineTo(0, ENEMY_BASE_RADIUS);
      g.lineTo(-ENEMY_BASE_RADIUS, 0);
      g.closePath();
      g.fill({ color: baseColor, alpha: 0.45 });
      g.stroke({ color: baseColor, width: 1.5, alpha: 0.7 });
      return;
    }
    // Enemy mobiles — circle with enemy color
    if (isEnemyMobile(creatureType)) {
      const mobileColor = ENEMY_MOBILE_TYPES[creatureType]?.color ?? 0xff0000;
      g.circle(0, 0, CREATURE_RADIUS + 1);
      g.fill({ color: mobileColor, alpha: 0.4 });
      return;
    }
    // Wildlife
    if (currentState === 'exhausted') {
      g.circle(0, 0, CREATURE_RADIUS + 1);
      g.fill({ color: EXHAUSTED_COLOR, alpha: 0.3 });
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

  private updateIndicator(indicator: Text, currentState: string, creatureType: string): void {
    // Enemy bases/mobiles never show exhaustion — skip to their own indicators
    if (currentState === 'exhausted' && !isEnemyBase(creatureType) && !isEnemyMobile(creatureType)) {
      indicator.text = '💤';
      indicator.visible = true;
      return;
    }
    if (creatureType === 'pawn_builder') {
      indicator.text = '';
      indicator.visible = false;
      return;
    }
    // Combat pawn state indicators
    if (creatureType === 'pawn_defender' || creatureType === 'pawn_attacker') {
      if (currentState === 'engage' || currentState === 'attack') {
        indicator.text = '⚔';
        indicator.visible = true;
      } else if (currentState === 'patrol') {
        indicator.text = '👁';
        indicator.visible = true;
      } else if (currentState === 'return') {
        indicator.text = '↩';
        indicator.visible = true;
      } else {
        indicator.text = '';
        indicator.visible = false;
      }
      return;
    }
    // Enemy mobile state indicators
    if (isEnemyMobile(creatureType)) {
      if (currentState === 'attack') {
        indicator.text = '💥';
        indicator.visible = true;
      } else if (currentState === 'seek') {
        indicator.text = '!';
        indicator.visible = true;
      } else {
        indicator.text = '';
        indicator.visible = false;
      }
      return;
    }
    // Wildlife indicators
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
    const pct = Math.min(1, Math.max(0, progress / PAWN.BUILD_TIME_TICKS));

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

  /** Look up max health for a combat entity from the registries. */
  private getMaxHealth(creatureType: string): number {
    if (isEnemyBase(creatureType)) return ENEMY_BASE_TYPES[creatureType]?.health ?? 100;
    if (isEnemyMobile(creatureType)) return ENEMY_MOBILE_TYPES[creatureType]?.health ?? 20;
    if (creatureType === 'pawn_defender') return PAWN_TYPES['defender']?.health ?? 80;
    if (creatureType === 'pawn_attacker') return PAWN_TYPES['attacker']?.health ?? 60;
    return 100;
  }

  /** Show/update HP bar above a combat entity. */
  private updateHpBar(entry: CreatureEntry, healthPct: number, creatureType: string): void {
    entry.lastHealthPct = healthPct;

    if (!entry.hpBar) {
      entry.hpBar = new Graphics();
      entry.container.addChild(entry.hpBar);
    }

    const radius = isEnemyBase(creatureType) ? ENEMY_BASE_RADIUS : CREATURE_RADIUS;
    const barWidth = TILE_SIZE * 0.7;
    const barHeight = 2;
    const barX = -barWidth / 2;
    const barY = -radius - 6;

    entry.hpBar.clear();
    entry.hpBar.rect(barX, barY, barWidth, barHeight);
    entry.hpBar.fill({ color: 0x333333, alpha: 0.8 });
    if (healthPct > 0) {
      const fillColor = healthPct > 0.5 ? 0x4caf50 : healthPct > 0.25 ? 0xff9800 : 0xf44336;
      entry.hpBar.rect(barX, barY, barWidth * healthPct, barHeight);
      entry.hpBar.fill({ color: fillColor, alpha: 0.9 });
    }
    entry.hpBar.visible = true;
  }

  /** Smoothly interpolate creature display positions and update combat effects.
   *  Creatures sharing a tile are offset so they remain individually visible. */
  public tick(_dt: number): void {
    const speed = 0.15;

    // Group entries by tile so we can detect stacking
    const tileGroups = new Map<string, CreatureEntry[]>();
    for (const entry of this.entries.values()) {
      const key = `${entry.tileX},${entry.tileY}`;
      let group = tileGroups.get(key);
      if (!group) {
        group = [];
        tileGroups.set(key, group);
      }
      group.push(entry);
    }

    for (const group of tileGroups.values()) {
      const stacked = group.length > 1;
      for (let i = 0; i < group.length; i++) {
        const entry = group[i];
        const offset = stacked
          ? STACK_OFFSETS[i % STACK_OFFSETS.length]
          : { x: 0, y: 0 };
        const targetX = entry.tileX * TILE_SIZE + TILE_SIZE / 2 + offset.x;
        const targetY = entry.tileY * TILE_SIZE + TILE_SIZE / 2 + offset.y;
        entry.displayX += (targetX - entry.displayX) * speed;
        entry.displayY += (targetY - entry.displayY) * speed;
        entry.container.position.set(entry.displayX, entry.displayY);
      }
    }

    // Drive combat effect animations (floating numbers, hit flash decay)
    this.combatEffects?.update(performance.now());
  }
}
