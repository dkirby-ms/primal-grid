import { GameState, CreatureState } from "./GameState.js";
import { PAWN_TYPES } from "@primal-grid/shared";
import { isTileOpenForCreature } from "./creatureAI.js";

/** How far ahead an explorer scans to detect frontier tiles. */
const FRONTIER_SCAN_RADIUS = PAWN_TYPES.explorer.visionRadius;

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
 * Wander with bias toward unclaimed tiles (tiles not owned by any player).
 * Shuffles cardinal directions, then scores candidates:
 *  - Immediate tile: unclaimed = +3, owned = +1
 *  - Frontier scan: +1 per unclaimed tile in that direction (up to SCAN_RADIUS)
 *  - Explorer repulsion: +2 if no same-owner explorer within Manhattan distance 2
 *
 * The frontier scan is the key improvement: when an explorer is deep inside
 * owned territory and all adjacent tiles score equally, the scan detects which
 * direction leads toward unexplored territory and biases movement that way.
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

    // Immediate tile: unclaimed tiles get a strong base score
    let score = tile.ownerID === "" ? 3 : 1;

    // Frontier scan: count unclaimed tiles ahead in this direction
    score += countFrontierInDirection(
      state, creature.x, creature.y, dx, dy, FRONTIER_SCAN_RADIUS,
    );

    // Explorer repulsion: prefer tiles away from other same-owner explorers
    const nearExplorer = otherExplorers.some(
      (e) => Math.abs(nx - e.x) + Math.abs(ny - e.y) <= 2,
    );
    if (!nearExplorer) score += 2;

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
