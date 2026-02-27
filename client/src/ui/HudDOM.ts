import type { Room } from '@colyseus/sdk';
import { SHAPE_CATALOG, type ShapeDef } from '@primal-grid/shared';

/**
 * DOM-based HUD panel — replaces the canvas-rendered HudRenderer.
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
  private craftWorkbenches: HTMLElement;
  private craftFarms: HTMLElement;
  private creatureCounts: HTMLElement;
  private tamedInfo: HTMLElement;
  private packInfo: HTMLElement;
  private buildIndicator: HTMLElement;
  private pawnList: HTMLElement;
  private pawnTitle: HTMLElement;
  private shapeCarousel: HTMLElement;
  private shapeCarouselItems: HTMLElement;
  private shapeItemEls: HTMLElement[] = [];
  private shapeKeys: string[] = [];

  /** Callback invoked with latest player resources for craft menu updates. */
  public onInventoryUpdate: ((resources: Record<string, number>) => void) | null = null;

  /** HQ position for colony interactions. */
  public localHqX = 0;
  public localHqY = 0;
  public packSize = 0;

  constructor(localSessionId: string) {
    this.localSessionId = localSessionId;

    this.territoryCount = document.getElementById('territory-count-val')!;
    this.invWood = document.getElementById('inv-wood')!;
    this.invStone = document.getElementById('inv-stone')!;
    this.invFiber = document.getElementById('inv-fiber')!;
    this.invBerries = document.getElementById('inv-berries')!;
    this.craftWorkbenches = document.getElementById('craft-workbenches')!;
    this.craftFarms = document.getElementById('craft-farms')!;
    this.creatureCounts = document.getElementById('creature-counts')!;
    this.tamedInfo = document.getElementById('tamed-info')!;
    this.packInfo = document.getElementById('pack-info')!;
    this.buildIndicator = document.getElementById('build-indicator')!;
    this.pawnList = document.getElementById('pawn-list')!;
    this.pawnTitle = document.querySelector('#section-pawns .section-title') as HTMLElement;
    this.shapeCarousel = document.getElementById('shape-carousel')!;
    this.shapeCarouselItems = document.getElementById('shape-carousel-items')!;
    this.shapeKeys = Object.keys(SHAPE_CATALOG);
    this.buildShapeCarousel();
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

  /** Show/hide shape carousel and highlight selected shape. */
  public setShapeMode(active: boolean, selectedIndex: number = 0, rotation: number = 0): void {
    this.shapeCarousel.style.display = active ? 'block' : 'none';
    if (!active) return;
    for (let i = 0; i < this.shapeItemEls.length; i++) {
      this.shapeItemEls[i].classList.toggle('selected', i === selectedIndex);
    }
    // Update the mini-grid for the selected shape to show current rotation
    this.updateShapeGrid(selectedIndex, rotation);
  }

  /** Callback when user clicks a shape in the carousel. */
  public onShapeSelect: ((index: number) => void) | null = null;

  private buildShapeCarousel(): void {
    this.shapeCarouselItems.innerHTML = '';
    this.shapeItemEls = [];
    for (let i = 0; i < this.shapeKeys.length; i++) {
      const shapeDef = SHAPE_CATALOG[this.shapeKeys[i]];
      const item = document.createElement('div');
      item.className = 'shape-item';
      item.title = shapeDef.name;

      const grid = document.createElement('div');
      grid.className = 'shape-grid';
      grid.dataset.shapeIndex = String(i);
      this.renderShapeGrid(grid, shapeDef, 0);
      item.appendChild(grid);

      const label = document.createElement('div');
      label.className = 'shape-label';
      label.textContent = shapeDef.name;
      item.appendChild(label);

      item.addEventListener('click', () => {
        this.onShapeSelect?.(i);
      });

      this.shapeCarouselItems.appendChild(item);
      this.shapeItemEls.push(item);
    }
  }

  private renderShapeGrid(grid: HTMLElement, shapeDef: ShapeDef, rotation: number): void {
    const cells = shapeDef.rotations[rotation] ?? shapeDef.rotations[0];
    const maxDx = Math.max(...cells.map(c => c.dx)) + 1;
    const maxDy = Math.max(...cells.map(c => c.dy)) + 1;

    grid.style.gridTemplateColumns = `repeat(${maxDx}, 6px)`;
    grid.innerHTML = '';
    const filled = new Set(cells.map(c => `${c.dx},${c.dy}`));
    for (let y = 0; y < maxDy; y++) {
      for (let x = 0; x < maxDx; x++) {
        const cell = document.createElement('div');
        cell.className = `shape-cell ${filled.has(`${x},${y}`) ? 'filled' : 'empty'}`;
        grid.appendChild(cell);
      }
    }
  }

  private updateShapeGrid(index: number, rotation: number): void {
    const grid = this.shapeCarouselItems.querySelector(
      `.shape-grid[data-shape-index="${index}"]`,
    ) as HTMLElement | null;
    if (!grid) return;
    const shapeDef = SHAPE_CATALOG[this.shapeKeys[index]];
    this.renderShapeGrid(grid, shapeDef, rotation);
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

          // Colony HQ position
          this.localHqX = (player['hqX'] as number) ?? 0;
          this.localHqY = (player['hqY'] as number) ?? 0;

          // Territory count
          const score = (player['score'] as number) ?? 0;
          this.territoryCount.textContent = String(score);

          // Inventory
          const wood = (player['wood'] as number) ?? 0;
          const stone = (player['stone'] as number) ?? 0;
          const fiber = (player['fiber'] as number) ?? 0;
          const berries = (player['berries'] as number) ?? 0;
          this.invWood.textContent = String(wood);
          this.invStone.textContent = String(stone);
          this.invFiber.textContent = String(fiber);
          this.invBerries.textContent = String(berries);

          // Crafted items
          const workbenches = (player['workbenches'] as number) ?? 0;
          const farmPlots = (player['farmPlots'] as number) ?? 0;
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
        this.updatePawnList(creatures);
      }
    });
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

  private updatePawnList(
    creatures: { forEach: (cb: (creature: Record<string, unknown>, key: string) => void) => void },
  ): void {
    if (!this.pawnList) return;
    let pawnCount = 0;
    let pawnHtml = '';

    creatures.forEach((creature) => {
      const ownerId = (creature['ownerID'] as string) ?? '';
      if (ownerId !== this.localSessionId) return;
      pawnCount++;
      const creatureType = (creature['creatureType'] as string) ?? 'herbivore';
      const command = (creature['command'] as string) ?? 'idle';
      const trust = (creature['trust'] as number) ?? 0;
      const emoji = creatureType === 'carnivore' ? '🦖' : '🦕';
      const cmdIcon = command === 'gather' ? '⛏' : command === 'guard' ? '🛡' : '💤';
      const trustPct = Math.round(trust);
      pawnHtml += `<div class="pawn-row">${emoji} ${creatureType} [${cmdIcon} ${command}] Trust: ${trustPct}%</div>`;
    });

    this.pawnList.innerHTML = pawnHtml || '<div style="color:#888;font-size:11px">No tamed creatures</div>';
    if (this.pawnTitle) this.pawnTitle.textContent = `🐾 Pawns (${pawnCount}/8)`;
  }
}
