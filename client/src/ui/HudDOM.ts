import type { Room } from '@colyseus/sdk';
import { SHAPE_CATALOG, type ShapeDef, getAvailableShapes, xpForNextLevel } from '@primal-grid/shared';

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
  private creatureCounts: HTMLElement;
  private buildIndicator: HTMLElement;
  private shapeCarousel: HTMLElement;
  private shapeCarouselItems: HTMLElement;
  private shapeItemEls: HTMLElement[] = [];
  private shapeKeys: string[] = [];
  private levelVal: HTMLElement;
  private xpText: HTMLElement;
  private xpBarFill: HTMLElement;
  private currentLevel = 1;

  /** HQ position for colony interactions. */
  public localHqX = 0;
  public localHqY = 0;

  constructor(localSessionId: string) {
    this.localSessionId = localSessionId;

    this.territoryCount = document.getElementById('territory-count-val')!;
    this.invWood = document.getElementById('inv-wood')!;
    this.invStone = document.getElementById('inv-stone')!;
    this.invFiber = document.getElementById('inv-fiber')!;
    this.invBerries = document.getElementById('inv-berries')!;
    this.creatureCounts = document.getElementById('creature-counts')!;
    this.buildIndicator = document.getElementById('build-indicator')!;
    this.shapeCarousel = document.getElementById('shape-carousel')!;
    this.shapeCarouselItems = document.getElementById('shape-carousel-items')!;
    this.levelVal = document.getElementById('level-val')!;
    this.xpText = document.getElementById('xp-text')!;
    this.xpBarFill = document.getElementById('xp-bar-fill')!;
    this.shapeKeys = getAvailableShapes(this.currentLevel);
    this.buildShapeCarousel();
  }

  /** Show or hide build mode indicator and shape carousel. */
  public setBuildMode(active: boolean, selectedIndex: number = 0, rotation: number = 0): void {
    if (active) {
      const shape = SHAPE_CATALOG[this.shapeKeys[selectedIndex]];
      this.buildIndicator.textContent = `🔨 BUILD MODE [${shape?.name ?? ''}]`;
      this.buildIndicator.classList.add('active');
    } else {
      this.buildIndicator.classList.remove('active');
    }
    this.shapeCarousel.style.display = active ? 'block' : 'none';
    if (!active) return;
    for (let i = 0; i < this.shapeItemEls.length; i++) {
      this.shapeItemEls[i].classList.toggle('selected', i === selectedIndex);
    }
    this.updateShapeGrid(selectedIndex, rotation);
  }

  /** Callback when user clicks a shape in the carousel. */
  public onShapeSelect: ((index: number) => void) | null = null;

  /** Callback when level changes (carousel rebuilt, shape list changed). */
  public onLevelChange: ((level: number) => void) | null = null;

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
      this.updateCarouselForLevel(level);
      this.onLevelChange?.(level);
    }
  }

  /** Rebuild the carousel to show only shapes available at the given level. */
  public updateCarouselForLevel(level: number): void {
    this.shapeKeys = getAvailableShapes(level);
    this.buildShapeCarousel();
  }

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
