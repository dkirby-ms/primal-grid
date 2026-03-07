import { GameState, CreatureState } from "./GameState.js";
import { moveToward } from "./creatureAI.js";
import { PAWN_TYPES, ENEMY_SPAWNING, isEnemyBase, isEnemyMobile } from "@primal-grid/shared";

/** Server-side tracking for each attacker pawn. */
export interface AttackerTracker {
  returnTick: number;
  homeTileX: number;
  homeTileY: number;
}

/**
 * Attacker pawn FSM: seek_target → move_to_target → attacking → returning
 * Attackers seek out enemy bases, move to them, attack, and return after a time limit.
 */
export function stepAttacker(
  creature: CreatureState,
  state: GameState,
  attackerState: Map<string, AttackerTracker>,
): boolean {
  const pawnDef = PAWN_TYPES["attacker"];
  if (!pawnDef) return false;

  // Get or create tracker
  let tracker = attackerState.get(creature.id);

  // Check sortie timeout
  if (tracker && state.tick >= tracker.returnTick && creature.currentState !== "returning") {
    creature.currentState = "returning";
    creature.targetX = tracker.homeTileX;
    creature.targetY = tracker.homeTileY;
  }

  switch (creature.currentState) {
    case "idle":
    case "seek_target": {
      const target = findNearestEnemyTarget(creature, state, pawnDef.detectionRadius);
      if (target) {
        creature.targetX = target.x;
        creature.targetY = target.y;
        creature.currentState = "move_to_target";

        // Initialize tracker on first dispatch
        if (!tracker) {
          const homeTile = findNearestOwnedTile(creature, state);
          tracker = {
            returnTick: state.tick + ENEMY_SPAWNING.ATTACKER_SORTIE_TICKS,
            homeTileX: homeTile ? homeTile.x : creature.x,
            homeTileY: homeTile ? homeTile.y : creature.y,
          };
          attackerState.set(creature.id, tracker);
        }
        return false;
      }
      // No targets — patrol own territory
      creature.currentState = "seek_target";
      return false;
    }

    case "move_to_target": {
      // Validate target still exists
      const targetCreature = findCreatureAt(state, creature.targetX, creature.targetY);
      if (!targetCreature || (!isEnemyBase(targetCreature.creatureType) && !isEnemyMobile(targetCreature.creatureType))) {
        // Target gone — re-seek
        creature.currentState = "seek_target";
        creature.targetX = -1;
        creature.targetY = -1;
        return false;
      }

      // Update target position (mobiles move)
      creature.targetX = targetCreature.x;
      creature.targetY = targetCreature.y;

      const dist = Math.abs(creature.x - creature.targetX) + Math.abs(creature.y - creature.targetY);
      if (dist <= 1) {
        creature.currentState = "attacking";
        return false;
      }

      return moveToward(creature, creature.targetX, creature.targetY, state);
    }

    case "attacking": {
      // Check if target still adjacent
      const targetCreature = findAdjacentEnemy(creature, state);
      if (!targetCreature) {
        // Target moved or died — re-seek
        creature.currentState = "seek_target";
        creature.targetX = -1;
        creature.targetY = -1;
        return false;
      }

      // Combat damage handled by tickCombat() — stay in attacking state
      creature.targetX = targetCreature.x;
      creature.targetY = targetCreature.y;
      return false;
    }

    case "returning": {
      if (!tracker) {
        creature.currentState = "seek_target";
        return false;
      }

      // Update home tile to nearest owned tile (territory may have changed)
      const homeTile = findNearestOwnedTile(creature, state);
      if (homeTile) {
        tracker.homeTileX = homeTile.x;
        tracker.homeTileY = homeTile.y;
      }

      const dist = Math.abs(creature.x - tracker.homeTileX) + Math.abs(creature.y - tracker.homeTileY);
      if (dist <= 1) {
        // Home — reset and seek again
        creature.currentState = "seek_target";
        creature.targetX = -1;
        creature.targetY = -1;
        attackerState.delete(creature.id);
        return false;
      }

      return moveToward(creature, tracker.homeTileX, tracker.homeTileY, state);
    }

    default:
      creature.currentState = "seek_target";
      return false;
  }
}

/** Find nearest enemy base or enemy mobile. Prefers bases. */
function findNearestEnemyTarget(
  creature: CreatureState,
  state: GameState,
  _detectionRadius: number,
): { x: number; y: number; id: string } | null {
  let nearestBase: { x: number; y: number; id: string; dist: number } | null = null;
  let nearestMobile: { x: number; y: number; id: string; dist: number } | null = null;

  state.creatures.forEach((other) => {
    if (other.id === creature.id || other.health <= 0) return;

    const dist = Math.abs(creature.x - other.x) + Math.abs(creature.y - other.y);

    if (isEnemyBase(other.creatureType)) {
      if (!nearestBase || dist < nearestBase.dist) {
        nearestBase = { x: other.x, y: other.y, id: other.id, dist };
      }
    } else if (isEnemyMobile(other.creatureType)) {
      if (!nearestMobile || dist < nearestMobile.dist) {
        nearestMobile = { x: other.x, y: other.y, id: other.id, dist };
      }
    }
  });

  // Prefer bases over mobiles
  if (nearestBase) return nearestBase;
  return nearestMobile;
}

/** Find a creature at the given tile position. */
function findCreatureAt(
  state: GameState,
  x: number,
  y: number,
): CreatureState | null {
  let found: CreatureState | null = null;
  state.creatures.forEach((c) => {
    if (c.x === x && c.y === y && c.health > 0) {
      if (isEnemyBase(c.creatureType) || isEnemyMobile(c.creatureType)) {
        found = c;
      }
    }
  });
  return found;
}

/** Find an adjacent enemy creature (base or mobile). */
function findAdjacentEnemy(creature: CreatureState, state: GameState): CreatureState | null {
  let nearest: CreatureState | null = null;
  let bestDist = Infinity;

  state.creatures.forEach((other) => {
    if (other.id === creature.id || other.health <= 0) return;
    if (!isEnemyBase(other.creatureType) && !isEnemyMobile(other.creatureType)) return;

    const dist = Math.abs(creature.x - other.x) + Math.abs(creature.y - other.y);
    if (dist <= 1 && dist < bestDist) {
      bestDist = dist;
      nearest = other;
    }
  });

  return nearest;
}

function findNearestOwnedTile(creature: CreatureState, state: GameState): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  const radius = 20;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = creature.x + dx;
      const ty = creature.y + dy;
      const tile = state.getTile(tx, ty);
      if (!tile || tile.ownerID !== creature.ownerID) continue;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = { x: tx, y: ty };
      }
    }
  }

  return best;
}
