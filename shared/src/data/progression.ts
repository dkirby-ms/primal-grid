import { PROGRESSION } from "../constants.js";

/** Get the level a player should be at for a given XP total. */
export function getLevelForXP(xp: number): number {
  let level = 1;
  for (const def of PROGRESSION.LEVELS) {
    if (xp >= def.xpRequired) level = def.level;
  }
  return Math.min(level, PROGRESSION.MAX_LEVEL);
}

/** Get all shape IDs available at a given level (cumulative). */
export function getAvailableShapes(level: number): string[] {
  const shapes: string[] = [];
  for (const def of PROGRESSION.LEVELS) {
    if (def.level <= level) {
      shapes.push(...def.shapes);
    }
  }
  return shapes;
}

/** Get XP required for the next level, or null if max. */
export function xpForNextLevel(currentLevel: number): number | null {
  const next = PROGRESSION.LEVELS.find((d) => d.level === currentLevel + 1);
  return next ? next.xpRequired : null;
}

/** Check if a specific ability is unlocked at a given level. */
export function hasAbility(level: number, ability: string): boolean {
  for (const def of PROGRESSION.LEVELS) {
    if (def.level <= level && "abilities" in def) {
      if ((def as any).abilities?.includes(ability)) return true;
    }
  }
  return false;
}
