import { Container, Graphics, Text } from 'pixi.js';
import { TILE_SIZE } from './GridRenderer.js';
import { CREATURE_TYPES } from '@primal-grid/shared';
import type { Room } from '@colyseus/sdk';

const CREATURE_RADIUS = 6;
const RING_RADIUS = 9;
const MAX_PACK_SIZE = 8;

// Base colors per creature type
const HERBIVORE_COLOR = 0x4caf50;
const CARNIVORE_COLOR = 0xf44336;

// Brighter variants for Eat state
const HERBIVORE_EAT_COLOR = 0x81c784;
const CARNIVORE_EAT_COLOR = 0xef9a9a;

// Darker variants for Hunt state
const CARNIVORE_HUNT_COLOR = 0xc62828;

// Ownership ring colors
const RING_SELECTED_COLOR = 0xffd700; // bright gold — in pack
const RING_OWNED_COLOR = 0xb8860b; // dim gold — owned but not selected

interface CreatureEntry {
  container: Container;
  graphic: Graphics;
  emojiText: Text;
  indicator: Text;
  ring: Graphics;
  statText: Text;
  followText: Text;
  commandText: Text;
  lastType: string;
  lastState: string;
  lastHealthLow: boolean;
  lastRingState: 'none' | 'owned' | 'selected';
  lastCommand: string;
  tileX: number;
  tileY: number;
  ownerID: string;
  trust: number;
  speed: number;
  personality: string;
}

export class CreatureRenderer {
  public readonly container: Container;
  private entries: Map<string, CreatureEntry> = new Map();
  private localSessionId: string;
  private selectedPack: Set<string> = new Set();
  private selectedPawnId: string | null = null;

  /** Latest creature counts, readable by HUD. */
  public herbivoreCount = 0;
  public carnivoreCount = 0;

  constructor(localSessionId = '') {
    this.container = new Container();
    this.localSessionId = localSessionId;
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
        const ownerID = (creature['ownerID'] as string) ?? '';
        const trust = (creature['trust'] as number) ?? 0;
        const speed = (creature['speed'] as number) ?? 1;
        const personality = (creature['personality'] as string) ?? 'neutral';
        const command = (creature['command'] as string) ?? 'idle';

        if (creatureType === 'carnivore') carns++;
        else herbs++;

        let entry = this.entries.get(id);
        if (!entry) {
          entry = this.createCreatureEntry(creatureType, currentState);
          this.entries.set(id, entry);
          this.container.addChild(entry.container);
        }

        // Store latest taming data
        entry.tileX = x;
        entry.tileY = y;
        entry.ownerID = ownerID;
        entry.trust = trust;
        entry.speed = speed;
        entry.personality = personality;

        // Rebuild graphic if state or type changed
        if (entry.lastType !== creatureType || entry.lastState !== currentState) {
          this.rebuildGraphic(entry, creatureType, currentState);
        }

        // Health-based opacity
        if (entry.lastHealthLow !== healthLow) {
          entry.container.alpha = healthLow ? 0.6 : 1.0;
          entry.lastHealthLow = healthLow;
        }

        // Update ownership ring
        const isOwned = ownerID === this.localSessionId && this.localSessionId !== '';
        const isSelected = isOwned && (this.selectedPack.has(id) || this.selectedPawnId === id);
        const ringState: 'none' | 'owned' | 'selected' = isSelected
          ? 'selected'
          : isOwned
            ? 'owned'
            : 'none';
        if (entry.lastRingState !== ringState) {
          this.updateRing(entry, ringState);
        }

        // Show stat/follow text for selected pack creatures
        if (isSelected) {
          const delta = speed - 1;
          const sign = delta >= 0 ? '+' : '';
          entry.statText.text = `${personality} Spd:${sign}${delta} Trust:${trust}/100`;
          entry.statText.visible = true;
          entry.followText.text = 'Following';
          entry.followText.visible = true;
        } else {
          entry.statText.visible = false;
          entry.followText.visible = false;
        }

        // Command visual indicator for tamed creatures (C8)
        if (isOwned && entry.lastCommand !== command) {
          if (command === 'gather') {
            entry.commandText.text = '⛏';
            entry.commandText.visible = true;
          } else if (command === 'guard') {
            entry.commandText.text = '🛡';
            entry.commandText.visible = true;
          } else {
            entry.commandText.visible = false;
          }
          entry.lastCommand = command;
        } else if (!isOwned && entry.commandText.visible) {
          entry.commandText.visible = false;
          entry.lastCommand = '';
        }

        // Snap to tile center
        entry.container.position.set(
          x * TILE_SIZE + TILE_SIZE / 2,
          y * TILE_SIZE + TILE_SIZE / 2,
        );
      });

      this.herbivoreCount = herbs;
      this.carnivoreCount = carns;

      // Remove creatures that despawned — also clean from pack
      for (const [id, entry] of this.entries) {
        if (!seen.has(id)) {
          this.container.removeChild(entry.container);
          entry.container.destroy({ children: true });
          this.entries.delete(id);
          this.selectedPack.delete(id);
        }
      }
    });
  }

  /** Toggle a creature in/out of the selected pack. Returns new selection state. */
  public togglePackSelection(creatureId: string): boolean {
    if (this.selectedPack.has(creatureId)) {
      this.selectedPack.delete(creatureId);
      return false;
    }
    if (this.selectedPack.size >= MAX_PACK_SIZE) return false;
    this.selectedPack.add(creatureId);
    return true;
  }

  /** Get current pack size. */
  public getPackSize(): number {
    return this.selectedPack.size;
  }

  /** Set the currently selected pawn for command assignment. */
  public setSelectedPawnId(id: string | null): void {
    this.selectedPawnId = id;
  }

  /** Get the currently selected pawn ID. */
  public getSelectedPawnId(): string | null {
    return this.selectedPawnId;
  }

  /** Find nearest wild creature adjacent to (px, py). */
  public getNearestWildCreature(px: number, py: number): string | null {
    return this.findNearest(px, py, (e) => !e.ownerID, 1);
  }

  /** Find nearest owned creature adjacent to (px, py). */
  public getNearestOwnedCreature(px: number, py: number): string | null {
    return this.findNearest(px, py, (e) => e.ownerID === this.localSessionId, 1);
  }

  /** Find two nearest owned creatures with trust≥70 for breeding. */
  public getNearestBreedPair(px: number, py: number): [string, string] | null {
    const candidates: { id: string; dist: number }[] = [];
    for (const [id, entry] of this.entries) {
      if (entry.ownerID !== this.localSessionId) continue;
      if (entry.trust < 70) continue;
      const dist = Math.abs(entry.tileX - px) + Math.abs(entry.tileY - py);
      candidates.push({ id, dist });
    }
    candidates.sort((a, b) => a.dist - b.dist);
    if (candidates.length < 2) return null;
    return [candidates[0].id, candidates[1].id];
  }

  private findNearest(
    px: number,
    py: number,
    filter: (e: CreatureEntry) => boolean,
    maxDist?: number,
  ): string | null {
    let bestId: string | null = null;
    let bestDist = Infinity;
    for (const [id, entry] of this.entries) {
      if (!filter(entry)) continue;
      const dist = Math.abs(entry.tileX - px) + Math.abs(entry.tileY - py);
      if (maxDist !== undefined && dist > maxDist) continue;
      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    }
    return bestId;
  }

  private createCreatureEntry(creatureType: string, currentState: string): CreatureEntry {
    const container = new Container();

    // Ring (behind creature shape)
    const ring = new Graphics();
    ring.visible = false;
    container.addChild(ring);

    // State-colored background circle (subtle indicator behind emoji)
    const graphic = new Graphics();
    this.drawStateBackground(graphic, creatureType, currentState);
    container.addChild(graphic);

    // Emoji icon as primary visual
    const icon = CREATURE_TYPES[creatureType]?.icon ?? '🦕';
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

    this.updateIndicator(indicator, currentState);

    // Follow text (below creature)
    const followText = new Text({
      text: '',
      style: { fontSize: 8, fill: '#ffd700', fontFamily: 'monospace' },
    });
    followText.anchor?.set?.(0.5, 0);
    followText.position.set(0, CREATURE_RADIUS + 2);
    followText.visible = false;
    container.addChild(followText);

    // Stat overlay text (above indicator)
    const statText = new Text({
      text: '',
      style: { fontSize: 8, fill: '#ffffff', fontFamily: 'monospace' },
    });
    statText.anchor?.set?.(0.5, 1);
    statText.position.set(0, -CREATURE_RADIUS - 14);
    statText.visible = false;
    container.addChild(statText);

    // Command label (below creature, for tamed pawns)
    const commandText = new Text({
      text: '',
      style: { fontSize: 10, fill: '#ffd700', fontFamily: 'sans-serif' },
    });
    commandText.anchor?.set?.(0.5, 0);
    commandText.position.set(0, CREATURE_RADIUS + 10);
    commandText.visible = false;
    container.addChild(commandText);

    return {
      container,
      graphic,
      emojiText,
      indicator,
      ring,
      statText,
      followText,
      commandText,
      lastType: creatureType,
      lastState: currentState,
      lastHealthLow: false,
      lastRingState: 'none',
      lastCommand: '',
      tileX: 0,
      tileY: 0,
      ownerID: '',
      trust: 0,
      speed: 1,
      personality: 'neutral',
    };
  }

  private rebuildGraphic(entry: CreatureEntry, creatureType: string, currentState: string): void {
    entry.graphic.clear();
    this.drawStateBackground(entry.graphic, creatureType, currentState);
    // Update emoji if creature type changed
    const icon = CREATURE_TYPES[creatureType]?.icon ?? '🦕';
    if (entry.emojiText.text !== icon) {
      entry.emojiText.text = icon;
    }
    this.updateIndicator(entry.indicator, currentState);
    entry.lastType = creatureType;
    entry.lastState = currentState;
  }

  private drawStateBackground(g: Graphics, creatureType: string, currentState: string): void {
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

  private updateRing(entry: CreatureEntry, ringState: 'none' | 'owned' | 'selected'): void {
    entry.ring.clear();
    if (ringState === 'none') {
      entry.ring.visible = false;
    } else {
      const color = ringState === 'selected' ? RING_SELECTED_COLOR : RING_OWNED_COLOR;
      entry.ring.circle(0, 0, RING_RADIUS);
      entry.ring.stroke({ width: 2, color });
      entry.ring.visible = true;
    }
    entry.lastRingState = ringState;
  }
}
