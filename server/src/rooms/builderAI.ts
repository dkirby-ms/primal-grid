import { GameState, CreatureState } from "./GameState.js";
import { moveToward } from "./creatureAI.js";
import { isAdjacentToTerritory } from "./territory.js";
import { PAWN, SHAPE, TileType, PROGRESSION } from "@primal-grid/shared";

/**
 * Builder pawn FSM: idle → find_build_site → move_to_site → building → idle
 * Called each AI tick for creatures with pawnType === "builder".
 */
export function stepBuilder(creature: CreatureState, state: GameState): void {
  switch (creature.currentState) {
    case "idle":
      // Try to find a build site
      const site = findBuildSite(creature, state);
      if (site) {
        creature.targetX = site.x;
        creature.targetY = site.y;
        creature.currentState = "move_to_site";
      }
      break;

    case "move_to_site": {
      // Validate target is still valid
      const targetTile = state.getTile(creature.targetX, creature.targetY);
      if (!targetTile || targetTile.ownerID !== "" || !isValidBuildTile(targetTile)) {
        // Target invalidated — reset
        creature.targetX = -1;
        creature.targetY = -1;
        creature.currentState = "idle";
        break;
      }

      const dist = Math.abs(creature.x - creature.targetX) + Math.abs(creature.y - creature.targetY);
      if (dist <= 1) {
        // Adjacent or on the tile — start building
        creature.currentState = "building";
        creature.buildProgress = 0;
      } else {
        moveToward(creature, creature.targetX, creature.targetY, state);
      }
      break;
    }

    case "building": {
      const buildTile = state.getTile(creature.targetX, creature.targetY);
      if (!buildTile || buildTile.ownerID !== "" || !isValidBuildTile(buildTile)) {
        // Tile taken or invalidated during build
        creature.targetX = -1;
        creature.targetY = -1;
        creature.buildProgress = 0;
        creature.currentState = "idle";
        break;
      }

      // Verify build site is still adjacent to owner's territory
      if (!isAdjacentToTerritory(state, creature.ownerID, creature.targetX, creature.targetY)) {
        creature.targetX = -1;
        creature.targetY = -1;
        creature.buildProgress = 0;
        creature.currentState = "idle";
        break;
      }

      creature.buildProgress += 1;
      if (creature.buildProgress >= PAWN.BUILD_TIME_TICKS) {
        // Farm builds cost resources; abort if owner can't afford
        if (creature.buildMode === "farm") {
          const farmOwner = state.players.get(creature.ownerID);
          if (!farmOwner || farmOwner.wood < PAWN.FARM_COST_WOOD || farmOwner.stone < PAWN.FARM_COST_STONE) {
            creature.targetX = -1;
            creature.targetY = -1;
            creature.buildProgress = 0;
            creature.currentState = "idle";
            break;
          }
          farmOwner.wood -= PAWN.FARM_COST_WOOD;
          farmOwner.stone -= PAWN.FARM_COST_STONE;
        }

        // Build complete — claim the tile
        buildTile.ownerID = creature.ownerID;
        buildTile.shapeHP = SHAPE.BLOCK_HP;
        buildTile.structureType = creature.buildMode === "farm" ? "farm" : "outpost";

        const player = state.players.get(creature.ownerID);
        if (player) {
          player.score += 1;
          player.xp += PROGRESSION.XP_PER_TILE_CLAIMED;
        }

        // Reset builder to idle
        creature.targetX = -1;
        creature.targetY = -1;
        creature.buildProgress = 0;
        creature.currentState = "idle";
      }
      break;
    }

    default:
      creature.currentState = "idle";
      break;
  }
}

/** Check if a tile is valid for building (walkable terrain, no shape). */
function isValidBuildTile(tile: { type: number; shapeHP: number }): boolean {
  if (tile.type === TileType.Water || tile.type === TileType.Rock) return false;
  if (tile.shapeHP > 0) return false;
  return true;
}

/**
 * Find the nearest unclaimed walkable tile adjacent to the builder's owner's territory.
 * Scans within BUILD_SITE_SCAN_RADIUS.
 */
function findBuildSite(
  creature: CreatureState,
  state: GameState,
): { x: number; y: number } | null {
  const radius = PAWN.BUILD_SITE_SCAN_RADIUS;
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = creature.x + dx;
      const ty = creature.y + dy;
      const tile = state.getTile(tx, ty);
      if (!tile) continue;
      if (tile.ownerID !== "") continue;
      if (!isValidBuildTile(tile)) continue;
      if (!isAdjacentToTerritory(state, creature.ownerID, tx, ty)) continue;

      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > 0 && dist < bestDist) {
        bestDist = dist;
        best = { x: tx, y: ty };
      }
    }
  }

  return best;
}
