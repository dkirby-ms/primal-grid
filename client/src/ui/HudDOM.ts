import type { Room } from '@colyseus/sdk';
import { xpForNextLevel } from '@primal-grid/shared';

/**
 * DOM-based HUD panel.
 * Same duck-typed bindToRoom() pattern.
 */
export class HudDOM {
  private localSessionId: string;

  // DOM element references (cached for perf)
  private territoryCount: HTMLElement;
  private invWood: HTMLElement;
  private invStone: HTMLElement;
  private invFiber: HTMLElement;
  private invBerries: HTMLElement;
  private creatureCounts: HTMLElement;
  private levelVal: HTMLElement;
  private xpText: HTMLElement;
  private xpBarFill: HTMLElement;
  private currentLevel = 1;

  /** HQ position for colony interactions. */
  public localHqX = 0;
  public localHqY = 0;

  /** Callback when level changes. */
  public onLevelChange: ((level: number) => void) | null = null;

  constructor(localSessionId: string) {
    this.localSessionId = localSessionId;

    this.territoryCount = document.getElementById('territory-count-val')!;
    this.invWood = document.getElementById('inv-wood')!;
    this.invStone = document.getElementById('inv-stone')!;
    this.invFiber = document.getElementById('inv-fiber')!;
    this.invBerries = document.getElementById('inv-berries')!;
    this.creatureCounts = document.getElementById('creature-counts')!;
    this.levelVal = document.getElementById('level-val')!;
    this.xpText = document.getElementById('xp-text')!;
    this.xpBarFill = document.getElementById('xp-bar-fill')!;
  }

  /** Update the level/XP display. */
  public updateLevelDisplay(level: number, xp: number): void {
    this.levelVal.textContent = String(level);
    const nextXp = xpForNextLevel(level);
    if (nextXp !== null) {
      const pct = Math.min(100, Math.round((xp / nextXp) * 100));
      this.xpText.textContent = `${xp} / ${nextXp}`;
      this.xpBarFill.style.width = `${pct}%`;
    } else {
      this.xpText.textContent = `${xp} (MAX)`;
      this.xpBarFill.style.width = '100%';
    }
    if (level !== this.currentLevel) {
      this.currentLevel = level;
      this.onLevelChange?.(level);
    }
  }

  /** Listen to Colyseus state and update DOM elements for the local player. */
  public bindToRoom(room: Room): void {
    room.onStateChange((state: Record<string, unknown>) => {
      const players = state['players'] as
        | { forEach: (cb: (player: Record<string, unknown>, key: string) => void) => void }
        | undefined;
      if (players && typeof players.forEach === 'function') {
        players.forEach((player, key) => {
          const id = (player['id'] as string) ?? key;
          if (id !== this.localSessionId) return;

          // Colony HQ position
          this.localHqX = (player['hqX'] as number) ?? 0;
          this.localHqY = (player['hqY'] as number) ?? 0;

          // Territory count
          const score = (player['score'] as number) ?? 0;
          this.territoryCount.textContent = String(score);

          // Level / XP
          const level = (player['level'] as number) ?? 1;
          const xp = (player['xp'] as number) ?? 0;
          this.updateLevelDisplay(level, xp);

          // Inventory
          const wood = (player['wood'] as number) ?? 0;
          const stone = (player['stone'] as number) ?? 0;
          const fiber = (player['fiber'] as number) ?? 0;
          const berries = (player['berries'] as number) ?? 0;
          this.invWood.textContent = String(wood);
          this.invStone.textContent = String(stone);
          this.invFiber.textContent = String(fiber);
          this.invBerries.textContent = String(berries);
        });
      }

      // Creature counts
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
        this.creatureCounts.textContent = `🦕 ${herbs}  🦖 ${carns}`;
      }
    });
  }
}
