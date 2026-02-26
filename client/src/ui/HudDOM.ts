import type { Room } from '@colyseus/sdk';

/**
 * DOM-based HUD panel — replaces the canvas-rendered HudRenderer.
 * Same duck-typed bindToRoom() pattern.
 */
export class HudDOM {
  private localSessionId: string;

  // DOM element references (cached for perf)
  private healthFill: HTMLElement;
  private healthVal: HTMLElement;
  private hungerFill: HTMLElement;
  private hungerVal: HTMLElement;
  private invWood: HTMLElement;
  private invStone: HTMLElement;
  private invFiber: HTMLElement;
  private invBerries: HTMLElement;
  private invMeat: HTMLElement;
  private craftWalls: HTMLElement;
  private craftFloors: HTMLElement;
  private craftAxes: HTMLElement;
  private craftPickaxes: HTMLElement;
  private craftWorkbenches: HTMLElement;
  private craftFarms: HTMLElement;
  private creatureCounts: HTMLElement;
  private tamedInfo: HTMLElement;
  private packInfo: HTMLElement;
  private buildIndicator: HTMLElement;

  /** Callback invoked with latest player resources for craft menu updates. */
  public onInventoryUpdate: ((resources: Record<string, number>) => void) | null = null;

  /** Readable player position for farm harvest. */
  public localPlayerX = 0;
  public localPlayerY = 0;
  public packSize = 0;

  constructor(localSessionId: string) {
    this.localSessionId = localSessionId;

    this.healthFill = document.getElementById('health-fill')!;
    this.healthVal = document.getElementById('health-val')!;
    this.hungerFill = document.getElementById('hunger-fill')!;
    this.hungerVal = document.getElementById('hunger-val')!;
    this.invWood = document.getElementById('inv-wood')!;
    this.invStone = document.getElementById('inv-stone')!;
    this.invFiber = document.getElementById('inv-fiber')!;
    this.invBerries = document.getElementById('inv-berries')!;
    this.invMeat = document.getElementById('inv-meat')!;
    this.craftWalls = document.getElementById('craft-walls')!;
    this.craftFloors = document.getElementById('craft-floors')!;
    this.craftAxes = document.getElementById('craft-axes')!;
    this.craftPickaxes = document.getElementById('craft-pickaxes')!;
    this.craftWorkbenches = document.getElementById('craft-workbenches')!;
    this.craftFarms = document.getElementById('craft-farms')!;
    this.creatureCounts = document.getElementById('creature-counts')!;
    this.tamedInfo = document.getElementById('tamed-info')!;
    this.packInfo = document.getElementById('pack-info')!;
    this.buildIndicator = document.getElementById('build-indicator')!;
  }

  /** Show or hide build mode indicator with selected item name. */
  public setBuildMode(active: boolean, itemName?: string): void {
    if (active) {
      this.buildIndicator.textContent = `🔨 BUILD MODE [${itemName ?? ''}]`;
      this.buildIndicator.classList.add('active');
    } else {
      this.buildIndicator.classList.remove('active');
    }
  }

  /** Update the pack size display immediately (called by InputHandler on F key). */
  public updatePackSize(size: number): void {
    this.packSize = size;
    this.packInfo.textContent = `Pack: ${size}/8`;
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

          const health = (player['health'] as number) ?? 100;
          const hunger = (player['hunger'] as number) ?? 100;

          this.updateHealth(health);
          this.updateHunger(hunger);

          this.localPlayerX = (player['x'] as number) ?? 0;
          this.localPlayerY = (player['y'] as number) ?? 0;

          // Inventory
          const wood = (player['wood'] as number) ?? 0;
          const stone = (player['stone'] as number) ?? 0;
          const fiber = (player['fiber'] as number) ?? 0;
          const berries = (player['berries'] as number) ?? 0;
          const meat = (player['meat'] as number) ?? 0;
          this.invWood.textContent = String(wood);
          this.invStone.textContent = String(stone);
          this.invFiber.textContent = String(fiber);
          this.invBerries.textContent = String(berries);
          this.invMeat.textContent = String(meat);

          // Crafted items
          const walls = (player['walls'] as number) ?? 0;
          const floors = (player['floors'] as number) ?? 0;
          const axes = (player['axes'] as number) ?? 0;
          const pickaxes = (player['pickaxes'] as number) ?? 0;
          const workbenches = (player['workbenches'] as number) ?? 0;
          const farmPlots = (player['farmPlots'] as number) ?? 0;
          this.craftWalls.textContent = String(walls);
          this.craftFloors.textContent = String(floors);
          this.craftAxes.textContent = String(axes);
          this.craftPickaxes.textContent = String(pickaxes);
          this.craftWorkbenches.textContent = String(workbenches);
          this.craftFarms.textContent = String(farmPlots);

          if (this.onInventoryUpdate) {
            this.onInventoryUpdate({ wood, stone, fiber, berries });
          }
        });
      }

      // Creature counts + taming info
      const creatures = state['creatures'] as
        | { forEach: (cb: (creature: Record<string, unknown>, key: string) => void) => void }
        | undefined;
      if (creatures && typeof creatures.forEach === 'function') {
        let herbs = 0;
        let carns = 0;
        let ownedHerbs = 0;
        let ownedCarns = 0;
        const herbTrusts: number[] = [];
        const carnTrusts: number[] = [];
        creatures.forEach((creature) => {
          const t = (creature['creatureType'] as string) ?? 'herbivore';
          if (t === 'carnivore') carns++;
          else herbs++;
          const ownerId = (creature['ownerID'] as string) ?? '';
          if (ownerId === this.localSessionId) {
            const trust = (creature['trust'] as number) ?? 0;
            if (t === 'carnivore') {
              ownedCarns++;
              carnTrusts.push(trust);
            } else {
              ownedHerbs++;
              herbTrusts.push(trust);
            }
          }
        });
        this.creatureCounts.textContent = `🦕 ${herbs}  🦖 ${carns}`;
        this.updateTamedDisplay(ownedHerbs, ownedCarns, herbTrusts, carnTrusts);
      }
    });
  }

  private updateHealth(value: number): void {
    const clamped = Math.max(0, Math.min(100, value));
    const ratio = clamped / 100;
    const color = ratio > 0.5 ? '#2ecc71' : ratio > 0.25 ? '#f39c12' : '#e74c3c';
    this.healthFill.style.width = `${ratio * 100}%`;
    this.healthFill.style.background = color;
    this.healthVal.textContent = `${Math.round(clamped)}/100`;
  }

  private updateHunger(value: number): void {
    const clamped = Math.max(0, Math.min(100, value));
    const ratio = clamped / 100;
    const color = ratio > 0.5 ? '#f39c12' : ratio > 0.25 ? '#e67e22' : '#e74c3c';
    this.hungerFill.style.width = `${ratio * 100}%`;
    this.hungerFill.style.background = color;
    this.hungerVal.textContent = `${Math.round(clamped)}/100`;
  }

  private updateTamedDisplay(
    ownedHerbs: number,
    ownedCarns: number,
    herbTrusts: number[],
    carnTrusts: number[],
  ): void {
    if (ownedHerbs === 0 && ownedCarns === 0) {
      this.tamedInfo.innerHTML = '<span style="color:#666;font-size:11px">No tamed creatures</span>';
      this.packInfo.textContent = this.packSize > 0 ? `Pack: ${this.packSize}/8` : '';
      return;
    }

    let html = '';
    if (ownedHerbs > 0) {
      html += `<div class="creature-row">🦕 ${ownedHerbs} herbivore${ownedHerbs > 1 ? 's' : ''}</div>`;
      for (const trust of herbTrusts) {
        const color = trust >= 60 ? '#2ecc71' : trust >= 30 ? '#f39c12' : '#e74c3c';
        html += `<div class="trust-bar"><div class="trust-bar-fill" style="width:${trust}%;background:${color}"></div></div>`;
      }
    }
    if (ownedCarns > 0) {
      html += `<div class="creature-row">🦖 ${ownedCarns} carnivore${ownedCarns > 1 ? 's' : ''}</div>`;
      for (const trust of carnTrusts) {
        const color = trust >= 60 ? '#2ecc71' : trust >= 30 ? '#f39c12' : '#e74c3c';
        html += `<div class="trust-bar"><div class="trust-bar-fill" style="width:${trust}%;background:${color}"></div></div>`;
      }
    }
    this.tamedInfo.innerHTML = html;
    this.packInfo.textContent = `Pack: ${this.packSize}/8`;
  }
}
