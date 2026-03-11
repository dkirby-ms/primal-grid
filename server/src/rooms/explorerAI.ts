import { GameState, CreatureState } from "./GameState.js";
import { isTileOpenForCreature } from "./creatureAI.js";

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
 * Wander with bias toward unclaimed tiles (tiles not owned by any player).
 * Shuffles cardinal directions, then scores candidates: unclaimed tiles get
 * priority over owned tiles, encouraging the explorer toward the frontier.
 */
function wanderExplore(creature: CreatureState, state: GameState): boolean {
  const dirs: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  // Shuffle directions for randomness
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }

  // Score each candidate: prefer unclaimed tiles
  let bestX = -1;
  let bestY = -1;
  let bestScore = -1;

  for (const [dx, dy] of dirs) {
    const nx = creature.x + dx;
    const ny = creature.y + dy;
    if (!isTileOpenForCreature(state, creature, nx, ny)) continue;

    const tile = state.getTile(nx, ny);
    if (!tile) continue;

    // Unclaimed tiles score higher — explorer prefers the frontier
    const score = tile.ownerID === "" ? 2 : 1;
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
