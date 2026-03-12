import { GameState, CreatureState } from "./GameState.js";
import { PAWN_TYPES } from "@primal-grid/shared";
import { isTileOpenForCreature } from "./creatureAI.js";

/** How far ahead an explorer scans to detect frontier tiles. */
const FRONTIER_SCAN_RADIUS = PAWN_TYPES.explorer.visionRadius;

/**
 * Extended radius for forward scans — lets explorers detect frontier even
 * when deep inside owned territory (e.g. a 9×9 HQ zone).
 */
const EXTENDED_SCAN_RADIUS = FRONTIER_SCAN_RADIUS * 2;

/**
 * Explorer pawn FSM: idle → wander
 * Explorers roam the map autonomously, biased toward unclaimed/unowned tiles.
 * Their large vision radius reveals fog of war for the owning player.
 */
export function stepExplorer(creature: CreatureState, state: GameState): boolean {
  switch (creature.currentState) {
    case "idle":
      creature.currentState = "wander";
      return false;

    case "wander":
      return wanderExplore(creature, state);

    default:
      creature.currentState = "wander";
      return false;
  }
}

/**
 * Count unclaimed tiles along a ray from (fromX, fromY) in direction (dx, dy).
 * Used to give explorers a sense of which direction leads toward the frontier,
 * even when all immediately adjacent tiles are owned.
 */
export function countFrontierInDirection(
  state: GameState,
  fromX: number,
  fromY: number,
  dx: number,
  dy: number,
  radius: number,
): number {
  let count = 0;
  for (let dist = 1; dist <= radius; dist++) {
    const tx = fromX + dx * dist;
    const ty = fromY + dy * dist;
    const tile = state.getTile(tx, ty);
    if (!tile) break;
    if (tile.ownerID === "") count++;
  }
  return count;
}

/**
 * Wander with strong bias toward unclaimed tiles (fog-of-war frontier).
 * Shuffles cardinal directions for tie-breaking, then scores candidates:
 *
 *  - Immediate tile: unclaimed = +5, owned = +1 (base)
 *  - Forward frontier scan: scans from the *candidate* position with extended
 *    radius (2× vision) to detect frontier even from deep inside territory.
 *    Each unclaimed tile ahead scores +3 (heavy directional pull).
 *  - Perpendicular scans: counts unclaimed tiles to the left/right of the
 *    movement direction at normal radius (+1 each). Detects frontier "off
 *    to the side" so the explorer curves toward it.
 *  - Explorer repulsion: +3 if no same-owner explorer within Manhattan
 *    distance 3 (wider spread than before).
 */
function wanderExplore(creature: CreatureState, state: GameState): boolean {
  const dirs: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  // Shuffle directions for randomness (tie-breaking when scores are equal)
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }

  // Collect positions of other same-owner explorers for repulsion
  const otherExplorers: { x: number; y: number }[] = [];
  state.creatures.forEach((other) => {
    if (other.id === creature.id) return;
    if (other.pawnType !== "explorer") return;
    if (other.ownerID !== creature.ownerID) return;
    otherExplorers.push({ x: other.x, y: other.y });
  });

  let bestX = -1;
  let bestY = -1;
  let bestScore = -1;

  for (const [dx, dy] of dirs) {
    const nx = creature.x + dx;
    const ny = creature.y + dy;
    if (!isTileOpenForCreature(state, creature, nx, ny)) continue;

    const tile = state.getTile(nx, ny);
    if (!tile) continue;

    // Immediate tile: unclaimed tiles get a strong bonus
    let score = tile.ownerID === "" ? 5 : 1;

    // Forward frontier scan from CANDIDATE position with extended radius.
    // Scanning from (nx, ny) instead of (creature.x, creature.y) gives the
    // explorer one tile of look-ahead, and the extended radius (2× vision)
    // lets it detect frontier even from deep inside a large owned territory.
    const frontierAhead = countFrontierInDirection(
      state, nx, ny, dx, dy, EXTENDED_SCAN_RADIUS,
    );
    score += frontierAhead * 3;

    // Perpendicular scans: detect frontier to the left/right of movement.
    // This lets the explorer curve toward frontier that isn't directly ahead.
    const perpDirs: [number, number][] = dx !== 0
      ? [[0, 1], [0, -1]]
      : [[1, 0], [-1, 0]];
    for (const [pdx, pdy] of perpDirs) {
      score += countFrontierInDirection(
        state, nx, ny, pdx, pdy, FRONTIER_SCAN_RADIUS,
      );
    }

    // Explorer repulsion: prefer tiles away from other same-owner explorers
    const nearExplorer = otherExplorers.some(
      (e) => Math.abs(nx - e.x) + Math.abs(ny - e.y) <= 3,
    );
    if (!nearExplorer) score += 3;

    if (score > bestScore) {
      bestScore = score;
      bestX = nx;
      bestY = ny;
    }
  }

  if (bestX >= 0 && bestY >= 0) {
    creature.x = bestX;
    creature.y = bestY;
    return true;
  }

  return false;
}
