import { GameState, CreatureState } from "./GameState.js";
import { moveToward } from "./creatureAI.js";
import { ENEMY_MOBILE_TYPES, isEnemyMobile } from "@primal-grid/shared";

/**
 * Enemy Mobile FSM: seek_territory → move_to_target → attacking_tile → loop
 * Enemy mobiles seek player-owned tiles, move toward them, and attack shapeHP.
 */
export function stepEnemyMobile(creature: CreatureState, state: GameState): boolean {
  const mobileDef = ENEMY_MOBILE_TYPES[creature.creatureType];
  if (!mobileDef) return false;

  switch (creature.currentState) {
    case "seek_territory": {
      const target = findNearestPlayerTile(creature, state, mobileDef.detectionRadius);
      if (target) {
        creature.targetX = target.x;
        creature.targetY = target.y;
        creature.currentState = "move_to_target";
      } else {
        // Wander toward map center
        const cx = Math.floor(state.mapWidth / 2);
        const cy = Math.floor(state.mapHeight / 2);
        moveToward(creature, cx, cy, state);
      }
      return false;
    }

    case "move_to_target": {
      // Validate target still owned by a player
      const targetTile = state.getTile(creature.targetX, creature.targetY);
      if (!targetTile || targetTile.ownerID === "" || targetTile.isHQTerritory) {
        creature.currentState = "seek_territory";
        creature.targetX = -1;
        creature.targetY = -1;
        return false;
      }

      const dist = Math.abs(creature.x - creature.targetX) + Math.abs(creature.y - creature.targetY);
      if (dist <= 1) {
        creature.currentState = "attacking_tile";
        return false;
      }

      return moveToward(creature, creature.targetX, creature.targetY, state);
    }

    case "attacking_tile": {
      const tile = state.getTile(creature.targetX, creature.targetY);
      if (!tile || tile.ownerID === "" || tile.isHQTerritory) {
        // Tile already unclaimed or is HQ — seek next target
        creature.currentState = "seek_territory";
        creature.targetX = -1;
        creature.targetY = -1;
        return false;
      }

      // Tile damage is handled in tickCombat via TILE_ATTACK_COOLDOWN
      // The creature stays in attacking_tile state; combat.ts applies the damage
      return false;
    }

    default:
      creature.currentState = "seek_territory";
      return false;
  }
}

/** Find nearest player-owned tile within detection radius (skipping HQ territory). */
function findNearestPlayerTile(
  creature: CreatureState,
  state: GameState,
  radius: number,
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = creature.x + dx;
      const ty = creature.y + dy;
      const tile = state.getTile(tx, ty);
      if (!tile || tile.ownerID === "" || tile.isHQTerritory) continue;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > 0 && dist <= radius && dist < bestDist) {
        bestDist = dist;
        best = { x: tx, y: ty };
      }
    }
  }

  return best;
}
