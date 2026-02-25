import { Container, Graphics, Text } from 'pixi.js';
import { RECIPES, canCraft, CRAFT } from '@primal-grid/shared';
import type { Room } from '@colyseus/sdk';

const MENU_WIDTH = 260;
const MENU_PADDING = 12;
const ROW_HEIGHT = 22;

const RESOURCE_EMOJI: Record<string, string> = {
  wood: '🪵',
  stone: '🪨',
  fiber: '🌿',
  berries: '🫐',
};

const RECIPE_KEYS = Object.keys(RECIPES);

export class CraftMenu {
  public readonly container: Container;
  private room: Room;
  private visible = false;
  private bg: Graphics;
  private titleText: Text;
  private recipeTexts: Text[] = [];
  private playerResources: Record<string, number> = {};

  constructor(room: Room) {
    this.room = room;
    this.container = new Container();
    this.container.visible = false;

    // Semi-transparent background
    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.titleText = new Text({
      text: '⚒ CRAFT MENU',
      style: { fontSize: 14, fill: '#ffffff', fontFamily: 'monospace', fontWeight: 'bold' },
    });
    this.titleText.position.set(MENU_PADDING, MENU_PADDING);
    this.container.addChild(this.titleText);

    // Create recipe rows
    let y = MENU_PADDING + 24;
    for (let i = 0; i < RECIPE_KEYS.length; i++) {
      const recipeId = RECIPE_KEYS[i];
      const recipe = RECIPES[recipeId];
      const costStr = recipe.ingredients
        .map((ing) => `${RESOURCE_EMOJI[ing.resource] ?? ing.resource}${ing.amount}`)
        .join(' ');
      const name = recipeId.replace('_', ' ');

      const text = new Text({
        text: `[${i + 1}] ${name} — ${costStr}`,
        style: { fontSize: 12, fill: '#cccccc', fontFamily: 'monospace' },
      });
      text.position.set(MENU_PADDING, y);
      this.container.addChild(text);
      this.recipeTexts.push(text);
      y += ROW_HEIGHT;
    }

    // Draw background to fit
    const menuHeight = y + MENU_PADDING;
    this.bg.rect(0, 0, MENU_WIDTH, menuHeight);
    this.bg.fill({ color: 0x000000, alpha: 0.8 });

    // Position in center-ish area
    this.container.position.set(270, 80);
  }

  public toggle(): void {
    this.visible = !this.visible;
    this.container.visible = this.visible;
    if (this.visible) this.refreshColors();
  }

  public isOpen(): boolean {
    return this.visible;
  }

  /** Update cached player resources for affordability display. */
  public updateResources(resources: Record<string, number>): void {
    this.playerResources = resources;
    if (this.visible) this.refreshColors();
  }

  /** Try to craft recipe by 1-based number key. */
  public craftByIndex(index: number): void {
    if (index < 1 || index > RECIPE_KEYS.length) return;
    const recipeId = RECIPE_KEYS[index - 1];
    if (canCraft(this.playerResources, recipeId)) {
      this.room.send(CRAFT, { recipeId });
    }
  }

  private refreshColors(): void {
    for (let i = 0; i < RECIPE_KEYS.length; i++) {
      const recipeId = RECIPE_KEYS[i];
      const affordable = canCraft(this.playerResources, recipeId);
      const text = this.recipeTexts[i];
      text.style.fill = affordable ? '#ffffff' : '#666666';
    }
  }
}
