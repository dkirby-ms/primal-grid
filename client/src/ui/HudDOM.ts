import type { Room } from '@colyseus/sdk';
import { PAWN_TYPES, BUILDING_COSTS, BUILDING_CAP_BONUS, PLACE_BUILDING, STRUCTURE_INCOME, STARVATION, TICK_RATE, isEnemyBase } from '@primal-grid/shared';
import type { PlaceBuildingPayload } from '@primal-grid/shared';

/**
 * DOM-based HUD panel.
 * Same duck-typed bindToRoom() pattern.
 */
export class HudDOM {
  public readonly localSessionId: string;

  // DOM element references (cached for perf)
  private territoryCount: HTMLElement;
  private invWood: HTMLElement;
  private invStone: HTMLElement;
  private invFood: HTMLElement;
  private creatureCounts: HTMLElement;
  private dayPhaseDisplay: HTMLElement;

  // Round timer
  private roundTimerSection: HTMLElement;
  private roundTimerDisplay: HTMLElement;
  private lastTimerSecond = -1;

  // Builder panel
  private spawnBuilderBtn: HTMLButtonElement;
  private builderCountEl: HTMLElement;
  private currentWood = 0;
  private currentStone = 0;
  private currentFood = 0;
  private currentBuilderCount = 0;

  // Combat panel
  private spawnDefenderBtn: HTMLButtonElement;
  private spawnAttackerBtn: HTMLButtonElement;
  private spawnExplorerBtn: HTMLButtonElement;
  private defenderCountEl: HTMLElement;
  private attackerCountEl: HTMLElement;
  private explorerCountEl: HTMLElement;
  private enemyBaseCountEl: HTMLElement;
  private currentDefenderCount = 0;
  private currentAttackerCount = 0;
  private currentExplorerCount = 0;
  private currentEnemyBaseCount = 0;
  private currentCapBonus = 0;

  // Building placement
  private buildFarmBtn: HTMLButtonElement;
  private buildFactoryBtn: HTMLButtonElement;
  private buildPlacementHint: HTMLElement;
  private _placementMode: 'farm' | 'factory' | null = null;
  /** Callback fired when placement mode changes; InputHandler subscribes. */
  public onPlacementModeChange: ((mode: 'farm' | 'factory' | null) => void) | null = null;
  /** Callback fired when resources change; InputHandler subscribes. */
  public onResourcesChange: ((wood: number, stone: number) => void) | null = null;

  /** HQ position for colony interactions. */
  public localHqX = 0;
  public localHqY = 0;

  private room: Room | null = null;

  constructor(localSessionId: string) {
    this.localSessionId = localSessionId;

    this.territoryCount = document.getElementById('territory-count-val')!;
    this.invWood = document.getElementById('inv-wood')!;
    this.invStone = document.getElementById('inv-stone')!;
    this.invFood = document.getElementById('inv-food')!;
    this.creatureCounts = document.getElementById('creature-counts')!;
    this.dayPhaseDisplay = document.getElementById('day-phase-display')!;

    // Round timer elements
    this.roundTimerSection = document.getElementById('section-round-timer')!;
    this.roundTimerDisplay = document.getElementById('round-timer-display')!;

    // Builder panel elements
    this.builderCountEl = document.getElementById('builder-count')!;
    this.spawnBuilderBtn = document.getElementById('spawn-builder-btn') as HTMLButtonElement;
    this.spawnBuilderBtn.addEventListener('click', () => this.onSpawnBuilder());

    // Combat panel elements
    this.defenderCountEl = document.getElementById('defender-count')!;
    this.attackerCountEl = document.getElementById('attacker-count')!;
    this.explorerCountEl = document.getElementById('explorer-count')!;
    this.enemyBaseCountEl = document.getElementById('enemy-base-count')!;
    this.spawnDefenderBtn = document.getElementById('spawn-defender-btn') as HTMLButtonElement;
    this.spawnAttackerBtn = document.getElementById('spawn-attacker-btn') as HTMLButtonElement;
    this.spawnExplorerBtn = document.getElementById('spawn-explorer-btn') as HTMLButtonElement;
    this.spawnDefenderBtn.addEventListener('click', () => this.onSpawnPawn('defender'));
    this.spawnAttackerBtn.addEventListener('click', () => this.onSpawnPawn('attacker'));
    this.spawnExplorerBtn.addEventListener('click', () => this.onSpawnPawn('explorer'));

    // Building placement buttons
    this.buildFarmBtn = document.getElementById('build-farm-btn') as HTMLButtonElement;
    this.buildFactoryBtn = document.getElementById('build-factory-btn') as HTMLButtonElement;
    this.buildPlacementHint = document.getElementById('build-placement-hint')!;
    this.buildFarmBtn.addEventListener('click', () => this.togglePlacementMode('farm'));
    this.buildFactoryBtn.addEventListener('click', () => this.togglePlacementMode('factory'));
  }

  /** Handle spawn builder button click. */
  private onSpawnBuilder(): void {
    if (!this.room) return;
    const builderDef = PAWN_TYPES['builder'];
    if (!builderDef) return;
    if (this.currentWood < builderDef.cost.wood || this.currentStone < builderDef.cost.stone) return;
    if (this.currentFood <= 0) return;
    if (this.currentBuilderCount >= builderDef.maxCount) return;
    this.room.send('spawn_pawn', { pawnType: 'builder' });
  }

  /** Handle spawn defender/attacker/explorer button click. */
  private onSpawnPawn(pawnType: 'defender' | 'attacker' | 'explorer'): void {
    if (!this.room) return;
    const def = PAWN_TYPES[pawnType];
    if (!def) return;
    if (this.currentWood < def.cost.wood || this.currentStone < def.cost.stone) return;
    if (this.currentFood <= 0) return;
    let count: number;
    switch (pawnType) {
      case 'defender': count = this.currentDefenderCount; break;
      case 'attacker': count = this.currentAttackerCount; break;
      case 'explorer': count = this.currentExplorerCount; break;
    }
    if (count >= def.maxCount) return;
    this.room.send('spawn_pawn', { pawnType });
  }

  /** Toggle building placement mode. */
  private togglePlacementMode(buildingType: 'farm' | 'factory'): void {
    if (this._placementMode === buildingType) {
      this.cancelPlacementMode();
    } else {
      this._placementMode = buildingType;
      this.buildFarmBtn.classList.toggle('active', buildingType === 'farm');
      this.buildFactoryBtn.classList.toggle('active', buildingType === 'factory');
      this.buildPlacementHint.classList.add('visible');
      this.onPlacementModeChange?.(buildingType);
    }
  }

  /** Cancel building placement mode. */
  public cancelPlacementMode(): void {
    this._placementMode = null;
    this.buildFarmBtn.classList.remove('active');
    this.buildFactoryBtn.classList.remove('active');
    this.buildPlacementHint.classList.remove('visible');
    this.onPlacementModeChange?.(null);
  }

  /** Get current placement mode. */
  public get placementMode(): 'farm' | 'factory' | null {
    return this._placementMode;
  }

  /** Send a PLACE_BUILDING message to the server. Returns true if sent. */
  public sendPlaceBuilding(x: number, y: number): boolean {
    if (!this.room || !this._placementMode) return false;
    const cost = BUILDING_COSTS[this._placementMode];
    if (!cost) return false;
    if (this.currentWood < cost.wood || this.currentStone < cost.stone) return false;

    const payload: PlaceBuildingPayload = {
      x,
      y,
      buildingType: this._placementMode,
    };
    this.room.send(PLACE_BUILDING, payload);
    this.cancelPlacementMode();
    return true;
  }

  /** Update spawn button enabled/disabled state. */
  private updateSpawnButton(): void {
    const cap = this.currentCapBonus;
    const starving = this.currentFood <= 0;

    const builderDef = PAWN_TYPES['builder'];
    const canAfford = builderDef
      ? this.currentWood >= builderDef.cost.wood && this.currentStone >= builderDef.cost.stone
      : false;
    const underCap = builderDef ? this.currentBuilderCount < builderDef.maxCount + cap : false;
    this.spawnBuilderBtn.disabled = !canAfford || !underCap || starving;

    // Defender button
    const defDef = PAWN_TYPES['defender'];
    if (defDef) {
      const canAffordDef = this.currentWood >= defDef.cost.wood && this.currentStone >= defDef.cost.stone;
      this.spawnDefenderBtn.disabled = !canAffordDef || this.currentDefenderCount >= defDef.maxCount + cap || starving;
    }

    // Attacker button
    const atkDef = PAWN_TYPES['attacker'];
    if (atkDef) {
      const canAffordAtk = this.currentWood >= atkDef.cost.wood && this.currentStone >= atkDef.cost.stone;
      this.spawnAttackerBtn.disabled = !canAffordAtk || this.currentAttackerCount >= atkDef.maxCount + cap || starving;
    }

    // Explorer button
    const expDef = PAWN_TYPES['explorer'];
    if (expDef) {
      const canAffordExp = this.currentWood >= expDef.cost.wood && this.currentStone >= expDef.cost.stone;
      this.spawnExplorerBtn.disabled = !canAffordExp || this.currentExplorerCount >= expDef.maxCount + cap || starving;
    }

    // Building buttons
    const farmCost = BUILDING_COSTS['farm'];
    if (farmCost) {
      this.buildFarmBtn.disabled = this.currentWood < farmCost.wood || this.currentStone < farmCost.stone;
    }
    const factoryCost = BUILDING_COSTS['factory'];
    if (factoryCost) {
      this.buildFactoryBtn.disabled = this.currentWood < factoryCost.wood || this.currentStone < factoryCost.stone;
    }
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

  /** Update the round timer display. Throttled to 1 update/sec. */
  public updateRoundTimer(roundTimer: number): void {
    if (roundTimer === -1) {
      this.roundTimerSection.classList.add('hidden');
      this.lastTimerSecond = -1;
      return;
    }

    const totalSeconds = Math.max(0, Math.ceil(roundTimer / TICK_RATE));

    // Throttle: only update DOM when the displayed second changes
    if (totalSeconds === this.lastTimerSecond) return;
    this.lastTimerSecond = totalSeconds;

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    this.roundTimerSection.classList.remove('hidden');
    this.roundTimerDisplay.textContent = `⏱ ${display}`;

    // Flash when under 60 seconds
    this.roundTimerSection.classList.toggle('urgent', totalSeconds < 60 && totalSeconds > 0);
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

      // Round timer
      const roundTimer = state['roundTimer'] as number | undefined;
      if (roundTimer !== undefined) {
        this.updateRoundTimer(roundTimer);
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

          // Inventory (wood, stone & food)
          this.currentWood = (player['wood'] as number) ?? 0;
          this.currentStone = (player['stone'] as number) ?? 0;
          const reportedFood = (player['food'] as number) ?? 0;
          this.currentFood = Math.max(0, reportedFood);
          this.invWood.textContent = String(this.currentWood);
          this.invStone.textContent = String(this.currentStone);
          this.invFood.textContent = String(this.currentFood);
          this.invFood.title = this.currentFood === 0
            ? `Food depleted: pawn spawning is disabled and one random living pawn loses ${STARVATION.DAMAGE_PER_TICK} HP every ${Math.round(STRUCTURE_INCOME.INTERVAL_TICKS / TICK_RATE)}s until food recovers.`
            : 'Food available';
          this.updateSpawnButton();
          
          // Notify InputHandler of resource changes for upgrade validation
          this.onResourcesChange?.(this.currentWood, this.currentStone);
        });
      }

      // Count building cap bonus from tiles
      const tiles = state['tiles'] as
        | { forEach: (cb: (tile: Record<string, unknown>, key: string) => void) => void; length?: number }
        | undefined;
      if (tiles && typeof tiles.forEach === 'function') {
        let capBonus = 0;
        tiles.forEach((tile) => {
          const ownerID = (tile['ownerID'] as string) ?? '';
          if (ownerID !== this.localSessionId) return;
          const st = (tile['structureType'] as string) ?? '';
          const b = BUILDING_CAP_BONUS[st];
          if (b) capBonus += b;
        });
        this.currentCapBonus = capBonus;
      }

      // Creature counts (including builder pawns and combat entities)
      const creatures = state['creatures'] as
        | { forEach: (cb: (creature: Record<string, unknown>, key: string) => void) => void }
        | undefined;
      if (creatures && typeof creatures.forEach === 'function') {
        let herbs = 0;
        let carns = 0;
        let builders = 0;
        let defenders = 0;
        let attackers = 0;
        let explorers = 0;
        let enemyBases = 0;
        creatures.forEach((creature) => {
          const t = (creature['creatureType'] as string) ?? 'herbivore';
          const ownerID = (creature['ownerID'] as string) ?? '';
          if (t === 'pawn_builder' && ownerID === this.localSessionId) {
            builders++;
          } else if (t === 'pawn_defender' && ownerID === this.localSessionId) {
            defenders++;
          } else if (t === 'pawn_attacker' && ownerID === this.localSessionId) {
            attackers++;
          } else if (t === 'pawn_explorer' && ownerID === this.localSessionId) {
            explorers++;
          } else if (t === 'carnivore') {
            carns++;
          } else if (t === 'herbivore') {
            herbs++;
          }
          if (isEnemyBase(t)) enemyBases++;
        });
        this.creatureCounts.textContent = `🦕 ${herbs}  🦖 ${carns}`;
        this.currentBuilderCount = builders;
        const capBonus = this.currentCapBonus;
        const bonusTag = capBonus > 0 ? ` (+${capBonus})` : '';
        this.builderCountEl.textContent = `Builders: ${builders}/${(PAWN_TYPES['builder']?.maxCount ?? 5) + capBonus}`;
        if (capBonus > 0) this.builderCountEl.innerHTML = `Builders: ${builders}/${(PAWN_TYPES['builder']?.maxCount ?? 5) + capBonus} <span style="color:#7ecfff">(+${capBonus})</span>`;

        // Combat counts
        const defDef = PAWN_TYPES['defender'];
        const atkDef = PAWN_TYPES['attacker'];
        const expDef = PAWN_TYPES['explorer'];
        this.currentDefenderCount = defenders;
        this.currentAttackerCount = attackers;
        this.currentExplorerCount = explorers;
        this.currentEnemyBaseCount = enemyBases;
        this.defenderCountEl.textContent = `🛡 ${defenders}/${(defDef?.maxCount ?? 3) + capBonus}${bonusTag}`;
        this.attackerCountEl.textContent = `⚔ ${attackers}/${(atkDef?.maxCount ?? 2) + capBonus}${bonusTag}`;
        this.explorerCountEl.textContent = `🔭 ${explorers}/${(expDef?.maxCount ?? 3) + capBonus}${bonusTag}`;
        this.enemyBaseCountEl.textContent = enemyBases > 0 ? `⛺ ${enemyBases} active` : 'No threats';

        this.updateSpawnButton();
      }
    });
  }
}
