import { GameState, CreatureState } from "./GameState.js";
import { moveToward } from "./creatureAI.js";
import { isAdjacentToTerritory } from "./territory.js";
import { PAWN, SHAPE, TileType, PROGRESSION, isWaterTile } from "@primal-grid/shared";

/**
 * Builder pawn FSM: idle → find_build_site → move_to_site → building → idle
 * Called each AI tick for creatures with pawnType === "builder".
 */
export function stepBuilder(creature: CreatureState, state: GameState): void {
  switch (creature.currentState) {
    case "idle": {
      // Try to find a build site
      const site = findBuildSite(creature, state);
      if (site) {
        creature.targetX = site.x;
        creature.targetY = site.y;
        creature.currentState = "move_to_site";
      }
      break;
    }

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
        const moved = moveToward(creature, creature.targetX, creature.targetY, state);
        if (!moved) {
          // Path blocked — abandon target and re-scan next tick
          creature.targetX = -1;
          creature.targetY = -1;
          creature.currentState = "idle";
        }
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
  if (isWaterTile(tile.type) || tile.type === TileType.Rock) return false;
  if (tile.shapeHP > 0) return false;
  return true;
}

/**
 * Check if a tile is an interior gap: unowned but surrounded on 3+ cardinal
 * sides by tiles owned by the same player.
 */
function isInteriorGap(
  state: GameState,
  ownerID: string,
  x: number,
  y: number,
): boolean {
  let ownedNeighbors = 0;
  for (const [nx, ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
    const neighbor = state.getTile(nx, ny);
    if (neighbor && neighbor.ownerID === ownerID) ownedNeighbors++;
  }
  return ownedNeighbors >= 3;
}

/**
 * Collect the set of tiles already targeted by other same-owner builders,
 * so we can avoid sending multiple pawns to the same location.
 */
function getReservedTargets(
  creature: CreatureState,
  state: GameState,
): Set<string> {
  const reserved = new Set<string>();
  state.creatures.forEach((other) => {
    if (
      other !== creature &&
      other.ownerID === creature.ownerID &&
      other.pawnType === "builder" &&
      other.targetX >= 0 &&
      other.targetY >= 0
    ) {
      reserved.add(`${other.targetX},${other.targetY}`);
    }
  });
  return reserved;
}

/**
 * Find the best unclaimed walkable tile adjacent to the builder's owner's territory.
 * Scans within BUILD_SITE_SCAN_RADIUS.
 * Prioritizes interior gaps (tiles surrounded on 3+ sides by owned territory)
 * before expanding outward. Within each priority tier, prefers closest tiles
 * with a tiebreaker favoring outward expansion (further from HQ).
 *
 * Skips tiles already targeted by other same-owner builders to prevent
 * multiple pawns from clustering toward the same destination.
 */
function findBuildSite(
  creature: CreatureState,
  state: GameState,
): { x: number; y: number } | null {
  const radius = PAWN.BUILD_SITE_SCAN_RADIUS;
  const player = state.players.get(creature.ownerID);
  const reserved = getReservedTargets(creature, state);
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  let bestHqDist = -1;
  let bestIsGap = false;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = creature.x + dx;
      const ty = creature.y + dy;
      const tile = state.getTile(tx, ty);
      if (!tile) continue;
      if (tile.ownerID !== "") continue;
      if (!isValidBuildTile(tile)) continue;
      if (!isAdjacentToTerritory(state, creature.ownerID, tx, ty)) continue;
      if (reserved.has(`${tx},${ty}`)) continue;

      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist === 0) continue;

      const gap = isInteriorGap(state, creature.ownerID, tx, ty);
      const hqDist = player
        ? Math.abs(tx - player.hqX) + Math.abs(ty - player.hqY)
        : 0;

      // Interior gaps always beat non-gaps; within same tier, prefer closer,
      // then further from HQ (outward expansion bias as secondary tiebreaker)
      if (
        (gap && !bestIsGap) ||
        (gap === bestIsGap && dist < bestDist) ||
        (gap === bestIsGap && dist === bestDist && hqDist > bestHqDist)
      ) {
        bestDist = dist;
        bestHqDist = hqDist;
        bestIsGap = gap;
        best = { x: tx, y: ty };
      }
    }
  }

  return best;
}
