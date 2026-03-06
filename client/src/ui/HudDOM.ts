import type { Room } from '@colyseus/sdk';
import { xpForNextLevel } from '@primal-grid/shared';

/** Cost to spawn a builder pawn. */
const BUILDER_COST_WOOD = 10;
const BUILDER_COST_STONE = 5;
const MAX_BUILDERS = 5;

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
  private creatureCounts: HTMLElement;
  private levelVal: HTMLElement;
  private xpText: HTMLElement;
  private xpBarFill: HTMLElement;
  private dayPhaseDisplay: HTMLElement;
  private currentLevel = 1;

  // Builder panel
  private spawnBuilderBtn: HTMLButtonElement;
  private builderCountEl: HTMLElement;
  private currentWood = 0;
  private currentStone = 0;
  private currentBuilderCount = 0;

  /** HQ position for colony interactions. */
  public localHqX = 0;
  public localHqY = 0;

  /** Callback when level changes. */
  public onLevelChange: ((level: number) => void) | null = null;

  private room: Room | null = null;

  constructor(localSessionId: string) {
    this.localSessionId = localSessionId;

    this.territoryCount = document.getElementById('territory-count-val')!;
    this.invWood = document.getElementById('inv-wood')!;
    this.invStone = document.getElementById('inv-stone')!;
    this.creatureCounts = document.getElementById('creature-counts')!;
    this.levelVal = document.getElementById('level-val')!;
    this.xpText = document.getElementById('xp-text')!;
    this.xpBarFill = document.getElementById('xp-bar-fill')!;
    this.dayPhaseDisplay = document.getElementById('day-phase-display')!;

    // Builder panel elements
    this.builderCountEl = document.getElementById('builder-count')!;
    this.spawnBuilderBtn = document.getElementById('spawn-builder-btn') as HTMLButtonElement;
    this.spawnBuilderBtn.addEventListener('click', () => this.onSpawnBuilder());
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

  /** Handle spawn builder button click. */
  private onSpawnBuilder(): void {
    if (!this.room) return;
    if (this.currentWood < BUILDER_COST_WOOD || this.currentStone < BUILDER_COST_STONE) return;
    if (this.currentBuilderCount >= MAX_BUILDERS) return;
    this.room.send('spawn_pawn', { pawnType: 'builder' });
  }

  /** Update spawn button enabled/disabled state. */
  private updateSpawnButton(): void {
    const canAfford = this.currentWood >= BUILDER_COST_WOOD && this.currentStone >= BUILDER_COST_STONE;
    const underCap = this.currentBuilderCount < MAX_BUILDERS;
    this.spawnBuilderBtn.disabled = !canAfford || !underCap;
  }

  private static readonly PHASE_EMOJI: Record<string, string> = {
    Dawn: '🌅',
    Day: '☀️',
    Dusk: '🌆',
    Night: '🌙',
  };

  private static readonly PHASE_COLOR: Record<string, string> = {
    Dawn: '#ffa726',
    Day: '#ffd54f',
    Dusk: '#ff7043',
    Night: '#90caf9',
  };

  /** Update the day/night phase indicator. */
  public updateDayPhase(phase: string): void {
    const emoji = HudDOM.PHASE_EMOJI[phase] ?? '☀️';
    const color = HudDOM.PHASE_COLOR[phase] ?? '#ffa726';
    this.dayPhaseDisplay.textContent = `${emoji} ${phase}`;
    this.dayPhaseDisplay.style.color = color;
  }

  /** Listen to Colyseus state and update DOM elements for the local player. */
  public bindToRoom(room: Room): void {
    this.room = room;

    room.onStateChange((state: Record<string, unknown>) => {
      // Day/night phase (global state)
      const dayPhase = state['dayPhase'] as string | undefined;
      if (dayPhase) {
        this.updateDayPhase(dayPhase);
      }

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

          // Inventory (wood & stone only)
          this.currentWood = (player['wood'] as number) ?? 0;
          this.currentStone = (player['stone'] as number) ?? 0;
          this.invWood.textContent = String(this.currentWood);
          this.invStone.textContent = String(this.currentStone);
          this.updateSpawnButton();
        });
      }

      // Creature counts (including builder pawns)
      const creatures = state['creatures'] as
        | { forEach: (cb: (creature: Record<string, unknown>, key: string) => void) => void }
        | undefined;
      if (creatures && typeof creatures.forEach === 'function') {
        let herbs = 0;
        let carns = 0;
        let builders = 0;
        creatures.forEach((creature) => {
          const t = (creature['creatureType'] as string) ?? 'herbivore';
          const ownerID = (creature['ownerID'] as string) ?? '';
          if (t === 'pawn_builder' && ownerID === this.localSessionId) {
            builders++;
          } else if (t === 'carnivore') {
            carns++;
          } else if (t === 'herbivore') {
            herbs++;
          }
        });
        this.creatureCounts.textContent = `🦕 ${herbs}  🦖 ${carns}`;
        this.currentBuilderCount = builders;
        this.builderCountEl.textContent = `Builders: ${builders}/${MAX_BUILDERS}`;
        this.updateSpawnButton();
      }
    });
  }
}
