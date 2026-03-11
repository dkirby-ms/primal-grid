import { GameState, CreatureState } from "./GameState.js";
import { moveToward } from "./creatureAI.js";
import { isAdjacentToTerritory } from "./territory.js";
import { PAWN, SHAPE, TileType, PROGRESSION, MIN_OUTPOST_SPACING, isWaterTile } from "@primal-grid/shared";

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
        if (creature.buildMode === "farm") {
          buildTile.structureType = "farm";
        } else if (!hasNearbyOutpost(state, creature.ownerID, creature.targetX, creature.targetY)) {
          buildTile.structureType = "outpost";
        }

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
 * Check if any outpost owned by the same player is within
 * MIN_OUTPOST_SPACING Manhattan distance of (x, y).
 */
export function hasNearbyOutpost(
  state: GameState,
  ownerID: string,
  x: number,
  y: number,
): boolean {
  const r = MIN_OUTPOST_SPACING;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (Math.abs(dx) + Math.abs(dy) > r) continue;
      const tile = state.getTile(x + dx, y + dy);
      if (tile && tile.ownerID === ownerID && tile.structureType === "outpost") {
        return true;
      }
    }
  }
  return false;
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

/** Minimum Manhattan distance between builder targets to reduce clustering. */
const MIN_BUILDER_SEPARATION = 3;

/**
 * Collect positions already targeted by other builders of the same owner.
 * Returns both exact indices (for exclusion) and coordinate pairs (for proximity checks).
 */
function getReservedTargets(
  creature: CreatureState,
  state: GameState,
): { reserved: Set<number>; positions: { x: number; y: number }[] } {
  const reserved = new Set<number>();
  const positions: { x: number; y: number }[] = [];
  state.creatures.forEach((other: CreatureState) => {
    if (other.id === creature.id) return;
    if (other.creatureType !== "pawn_builder") return;
    if (other.ownerID !== creature.ownerID) return;
    if (other.targetX < 0 || other.targetY < 0) return;
    if (other.currentState !== "move_to_site" && other.currentState !== "building") return;
    reserved.add(other.targetY * state.mapWidth + other.targetX);
    positions.push({ x: other.targetX, y: other.targetY });
  });
  return { reserved, positions };
}

/**
 * Find the best unclaimed walkable tile adjacent to the builder's owner's territory.
 * Scans within BUILD_SITE_SCAN_RADIUS.
 * Prioritizes interior gaps (tiles surrounded on 3+ sides by owned territory)
 * before expanding outward. Within each priority tier, prefers tiles that are
 * spatially separated from other builders' targets (MIN_BUILDER_SEPARATION),
 * then closest tiles with a tiebreaker favoring outward expansion (further from HQ).
 * Skips tiles already targeted by another builder of the same owner.
 */
function findBuildSite(
  creature: CreatureState,
  state: GameState,
): { x: number; y: number } | null {
  const radius = PAWN.BUILD_SITE_SCAN_RADIUS;
  const player = state.players.get(creature.ownerID);
  const { reserved, positions: reservedPositions } = getReservedTargets(creature, state);
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  let bestHqDist = -1;
  let bestIsGap = false;
  let bestNearReserved = true;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = creature.x + dx;
      const ty = creature.y + dy;
      const tile = state.getTile(tx, ty);
      if (!tile) continue;
      if (tile.ownerID !== "") continue;
      if (!isValidBuildTile(tile)) continue;
      if (!isAdjacentToTerritory(state, creature.ownerID, tx, ty)) continue;

      const tileIdx = ty * state.mapWidth + tx;
      if (reserved.has(tileIdx)) continue;

      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist === 0) continue;

      const gap = isInteriorGap(state, creature.ownerID, tx, ty);
      const hqDist = player
        ? Math.abs(tx - player.hqX) + Math.abs(ty - player.hqY)
        : 0;

      // Check proximity to other builders' targets — prefer spatially spread tiles
      const nearReserved = reservedPositions.some(
        (r) => Math.abs(tx - r.x) + Math.abs(ty - r.y) < MIN_BUILDER_SEPARATION,
      );

      // Priority (descending): gap > spatially spread > closer to builder > further from HQ
      if (
        (gap && !bestIsGap) ||
        (gap === bestIsGap && !nearReserved && bestNearReserved) ||
        (gap === bestIsGap && nearReserved === bestNearReserved && dist < bestDist) ||
        (gap === bestIsGap && nearReserved === bestNearReserved && dist === bestDist && hqDist > bestHqDist)
      ) {
        bestDist = dist;
        bestHqDist = hqDist;
        bestIsGap = gap;
        bestNearReserved = nearReserved;
        best = { x: tx, y: ty };
      }
    }
  }

  return best;
}
