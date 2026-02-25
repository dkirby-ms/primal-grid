import { Container, Graphics, Text } from 'pixi.js';
import { TILE_SIZE } from './GridRenderer.js';
import { ItemType } from '@primal-grid/shared';
import type { Room } from '@colyseus/sdk';

const STRUCT_PAD = 4;

interface StructureEntry {
  container: Container;
  graphic: Graphics;
  growthIndicator: Graphics | null;
  lastGrowth: number;
  lastCropReady: boolean;
}

export class StructureRenderer {
  public readonly container: Container;
  private entries: Map<string, StructureEntry> = new Map();

  constructor() {
    this.container = new Container();
  }

  /** Listen to Colyseus state and render/update structure visuals. */
  public bindToRoom(room: Room): void {
    room.onStateChange((state: Record<string, unknown>) => {
      const structures = state['structures'] as
        | { forEach: (cb: (s: Record<string, unknown>, key: string) => void) => void }
        | undefined;
      if (!structures || typeof structures.forEach !== 'function') return;

      const seen = new Set<string>();

      structures.forEach((structure, key) => {
        const id = (structure['id'] as string) ?? key;
        seen.add(id);

        const x = (structure['x'] as number) ?? 0;
        const y = (structure['y'] as number) ?? 0;
        const structureType = (structure['structureType'] as number) ?? 0;
        const growthProgress = (structure['growthProgress'] as number) ?? 0;
        const cropReady = (structure['cropReady'] as boolean) ?? false;

        let entry = this.entries.get(id);
        if (!entry) {
          entry = this.createEntry(structureType, growthProgress, cropReady);
          this.entries.set(id, entry);
          this.container.addChild(entry.container);
        }

        // Update farm plot growth visuals
        if (structureType === ItemType.FarmPlot && entry.growthIndicator) {
          if (entry.lastGrowth !== growthProgress || entry.lastCropReady !== cropReady) {
            this.updateFarmGrowth(entry, growthProgress, cropReady);
          }
        }

        entry.container.position.set(x * TILE_SIZE, y * TILE_SIZE);
      });

      // Remove structures that were destroyed
      for (const [id, entry] of this.entries) {
        if (!seen.has(id)) {
          this.container.removeChild(entry.container);
          entry.container.destroy({ children: true });
          this.entries.delete(id);
        }
      }
    });
  }

  private createEntry(
    structureType: number,
    growthProgress: number,
    cropReady: boolean,
  ): StructureEntry {
    const container = new Container();
    const graphic = new Graphics();
    container.addChild(graphic);

    let growthIndicator: Graphics | null = null;

    switch (structureType) {
      case ItemType.Wall:
        this.drawWall(graphic);
        break;
      case ItemType.Floor:
        this.drawFloor(graphic);
        break;
      case ItemType.Workbench:
        this.drawWorkbench(graphic, container);
        break;
      case ItemType.FarmPlot: {
        this.drawFarmBase(graphic);
        growthIndicator = new Graphics();
        container.addChild(growthIndicator);
        break;
      }
    }

    const entry: StructureEntry = {
      container,
      graphic,
      growthIndicator,
      lastGrowth: -1,
      lastCropReady: false,
    };

    if (structureType === ItemType.FarmPlot && growthIndicator) {
      this.updateFarmGrowth(entry, growthProgress, cropReady);
    }

    return entry;
  }

  private drawWall(g: Graphics): void {
    const pad = STRUCT_PAD;
    const size = TILE_SIZE - pad * 2;
    g.rect(pad, pad, size, size);
    g.stroke({ width: 3, color: 0x8b6914 });
  }

  private drawFloor(g: Graphics): void {
    g.rect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
    g.fill({ color: 0xd2b48c, alpha: 0.4 });
  }

  private drawWorkbench(g: Graphics, container: Container): void {
    const pad = STRUCT_PAD;
    const size = TILE_SIZE - pad * 2;
    g.rect(pad, pad, size, size);
    g.fill(0x8b6914);

    const label = new Text({
      text: 'T',
      style: { fontSize: 14, fill: '#ffffff', fontFamily: 'monospace', fontWeight: 'bold' },
    });
    label.anchor?.set?.(0.5, 0.5);
    label.position.set(TILE_SIZE / 2, TILE_SIZE / 2);
    container.addChild(label);
  }

  private drawFarmBase(g: Graphics): void {
    g.rect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
    g.fill(0x8b7355);
  }

  private updateFarmGrowth(entry: StructureEntry, growthProgress: number, cropReady: boolean): void {
    const g = entry.growthIndicator!;
    g.clear();

    if (cropReady) {
      // Ready to harvest: bright green background with berry dots
      g.rect(2, 2, TILE_SIZE - 4, TILE_SIZE - 4);
      g.fill({ color: 0x00cc00, alpha: 0.6 });
      g.circle(10, 10, 3);
      g.fill(0xda70d6);
      g.circle(22, 10, 3);
      g.fill(0xda70d6);
      g.circle(16, 22, 3);
      g.fill(0xda70d6);
    } else if (growthProgress >= 67) {
      // Growing: medium green
      g.rect(6, 6, TILE_SIZE - 12, TILE_SIZE - 12);
      g.fill({ color: 0x4caf50, alpha: 0.7 });
    } else if (growthProgress >= 34) {
      // Small sprout: light green dot
      g.circle(TILE_SIZE / 2, TILE_SIZE / 2, 4);
      g.fill({ color: 0x90ee90, alpha: 0.8 });
    }
    // 0-33: empty soil (just the brown base)

    entry.lastGrowth = growthProgress;
    entry.lastCropReady = cropReady;
  }
}
