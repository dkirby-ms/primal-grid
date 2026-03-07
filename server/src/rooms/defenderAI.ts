import { GameState, CreatureState } from "./GameState.js";
import { moveToward } from "./creatureAI.js";
import { PAWN_TYPES, isEnemyMobile } from "@primal-grid/shared";

/**
 * Defender pawn FSM: patrol → engage → returning → patrol
 * Defenders patrol within owned territory and engage hostiles that enter it.
 * They NEVER leave owned territory.
 */
export function stepDefender(creature: CreatureState, state: GameState): boolean {
  const pawnDef = PAWN_TYPES["defender"];
  if (!pawnDef) return false;

  switch (creature.currentState) {
    case "idle":
    case "patrol": {
      // Check for hostiles in detection range within own territory
      const hostile = findHostileInTerritory(creature, state, pawnDef.detectionRadius);
      if (hostile) {
        creature.targetX = hostile.x;
        creature.targetY = hostile.y;
        creature.currentState = "engage";
        return moveTowardInTerritory(creature, hostile.x, hostile.y, state);
      }

      // Patrol: wander within own territory
      creature.currentState = "patrol";
      return wanderInTerritory(creature, state);
    }

    case "engage": {
      // Re-check for nearest hostile
      const hostile = findHostileInTerritory(creature, state, pawnDef.detectionRadius);
      if (!hostile) {
        // No more hostiles — return to patrol
        creature.currentState = "patrol";
        creature.targetX = -1;
        creature.targetY = -1;
        return false;
      }

      creature.targetX = hostile.x;
      creature.targetY = hostile.y;

      const dist = Math.abs(creature.x - hostile.x) + Math.abs(creature.y - hostile.y);
      if (dist <= 1) {
        // Adjacent — combat is handled by tickCombat()
        return false;
      }

      // Move toward hostile, but only within territory
      return moveTowardInTerritory(creature, hostile.x, hostile.y, state);
    }

    case "returning": {
      // Find nearest owned tile and move to it
      const ownedTile = findNearestOwnedTile(creature, state);
      if (ownedTile) {
        const onOwned = isOnOwnedTile(creature, state);
        if (onOwned) {
          creature.currentState = "patrol";
          return false;
        }
        // Use regular moveToward since we might be outside territory
        return moveToward(creature, ownedTile.x, ownedTile.y, state);
      }
      creature.currentState = "patrol";
      return false;
    }

    default:
      creature.currentState = "patrol";
      return false;
  }
}

/** Find nearest hostile creature within detection radius that is also within owned territory. */
function findHostileInTerritory(
  creature: CreatureState,
  state: GameState,
  radius: number,
): CreatureState | null {
  let nearest: CreatureState | null = null;
  let bestDist = Infinity;

  state.creatures.forEach((other) => {
    if (other.id === creature.id || other.health <= 0) return;
    // Hostiles: enemy mobiles and carnivores
    if (!isEnemyMobile(other.creatureType) && other.creatureType !== "carnivore") return;

    // Must be within our territory
    const otherTile = state.getTile(other.x, other.y);
    if (!otherTile || otherTile.ownerID !== creature.ownerID) return;

    const dist = Math.abs(creature.x - other.x) + Math.abs(creature.y - other.y);
    if (dist <= radius && dist < bestDist) {
      bestDist = dist;
      nearest = other;
    }
  });

  return nearest;
}

/** Move one step toward target, but only onto tiles owned by this creature's owner. */
function moveTowardInTerritory(
  creature: CreatureState,
  tx: number,
  ty: number,
  state: GameState,
): boolean {
  const dx = Math.sign(tx - creature.x);
  const dy = Math.sign(ty - creature.y);

  const candidates: [number, number][] = [];
  if (dx !== 0) candidates.push([dx, 0]);
  if (dy !== 0) candidates.push([0, dy]);
  if (dy !== 0 && dx === 0) { candidates.push([1, 0]); candidates.push([-1, 0]); }
  if (dx !== 0 && dy === 0) { candidates.push([0, 1]); candidates.push([0, -1]); }

  for (const [mx, my] of candidates) {
    const nx = creature.x + mx;
    const ny = creature.y + my;
    if (!state.isWalkable(nx, ny)) continue;
    const tile = state.getTile(nx, ny);
    if (!tile || tile.ownerID !== creature.ownerID) continue;
    creature.x = nx;
    creature.y = ny;
    return true;
  }
  return false;
}

/** Wander randomly within owned territory. */
function wanderInTerritory(creature: CreatureState, state: GameState): boolean {
  const dirs: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  // Shuffle
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  for (const [dx, dy] of dirs) {
    const nx = creature.x + dx;
    const ny = creature.y + dy;
    if (!state.isWalkable(nx, ny)) continue;
    const tile = state.getTile(nx, ny);
    if (!tile || tile.ownerID !== creature.ownerID) continue;
    creature.x = nx;
    creature.y = ny;
    return true;
  }
  return false;
}

function findNearestOwnedTile(creature: CreatureState, state: GameState): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  const radius = 10;

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

function isOnOwnedTile(creature: CreatureState, state: GameState): boolean {
  const tile = state.getTile(creature.x, creature.y);
  return !!tile && tile.ownerID === creature.ownerID;
}
