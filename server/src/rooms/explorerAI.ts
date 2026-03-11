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
 * Penalizes tiles near other same-owner explorers to encourage spreading out.
 */
function wanderExplore(creature: CreatureState, state: GameState): boolean {
  const dirs: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  // Shuffle directions for randomness
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

  // Score each candidate: prefer unclaimed tiles and tiles away from other explorers
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
    let score = tile.ownerID === "" ? 2 : 1;

    // Bonus for tiles away from other same-owner explorers
    const nearExplorer = otherExplorers.some(
      (e) => Math.abs(nx - e.x) + Math.abs(ny - e.y) <= 2,
    );
    if (!nearExplorer) score += 1;

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
