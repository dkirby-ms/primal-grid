import { GameState } from "./GameState.js";
import { FOG_OF_WAR } from "@primal-grid/shared";

/**
 * Collect tiles within Manhattan distance ≤ radius of (cx, cy),
 * clamped to map bounds. Returns flat tile indices.
 */
function addCircleFill(
  cx: number,
  cy: number,
  radius: number,
  mapWidth: number,
  mapHeight: number,
  out: Set<number>,
): void {
  const minX = Math.max(0, cx - radius);
  const maxX = Math.min(mapWidth - 1, cx + radius);
  const minY = Math.max(0, cy - radius);
  const maxY = Math.min(mapHeight - 1, cy + radius);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (Math.abs(x - cx) + Math.abs(y - cy) <= radius) {
        out.add(y * mapWidth + x);
      }
    }
  }
}

/**
 * Get the effective vision radius after applying the day/night modifier.
 */
function effectiveRadius(baseRadius: number, dayPhase: string): number {
  const modifier = FOG_OF_WAR.DAY_NIGHT_MODIFIERS[dayPhase] ?? 0;
  return Math.max(FOG_OF_WAR.MIN_RADIUS, baseRadius + modifier);
}

/** Moore neighborhood offsets (8 directions). */
const MOORE_OFFSETS: ReadonlyArray<[number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1,  0],          [1,  0],
  [-1,  1], [0,  1], [1,  1],
];

/**
 * Compute the set of tile indices visible to a specific player.
 *
 * Vision sources (Phase A):
 *  1. HQ center — FOG_OF_WAR.HQ_RADIUS
 *  2. Territory edge tiles — FOG_OF_WAR.TERRITORY_EDGE_RADIUS
 *  3. Pawn builders — FOG_OF_WAR.PAWN_RADIUS
 */
export function computeVisibleTiles(state: GameState, playerId: string): Set<number> {
  const visible = new Set<number>();
  const w = state.mapWidth;
  const h = state.mapHeight;
  const dayPhase = state.dayPhase;

  const player = state.players.get(playerId);
  if (!player || player.hqX < 0 || player.hqY < 0) return visible;

  // 1. HQ center vision
  const hqRadius = effectiveRadius(FOG_OF_WAR.HQ_RADIUS, dayPhase);
  addCircleFill(player.hqX, player.hqY, hqRadius, w, h, visible);

  // 2. Territory edge tiles — iterate all tiles, find owned edge tiles
  const edgeRadius = effectiveRadius(FOG_OF_WAR.TERRITORY_EDGE_RADIUS, dayPhase);
  const len = state.tiles.length;
  for (let i = 0; i < len; i++) {
    const tile = state.tiles.at(i);
    if (!tile || tile.ownerID !== playerId) continue;

    // Check if this tile is on the territory edge (has a Moore neighbor that is
    // unowned or out of bounds)
    let isEdge = false;
    for (const [dx, dy] of MOORE_OFFSETS) {
      const nx = tile.x + dx;
      const ny = tile.y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
        isEdge = true;
        break;
      }
      const neighbor = state.tiles.at(ny * w + nx);
      if (!neighbor || neighbor.ownerID !== playerId) {
        isEdge = true;
        break;
      }
    }

    if (isEdge) {
      addCircleFill(tile.x, tile.y, edgeRadius, w, h, visible);
    }
  }

  // 3. Pawn builder vision
  const pawnRadius = effectiveRadius(FOG_OF_WAR.PAWN_RADIUS, dayPhase);
  state.creatures.forEach((creature) => {
    if (creature.creatureType === "pawn_builder" && creature.ownerID === playerId) {
      addCircleFill(creature.x, creature.y, pawnRadius, w, h, visible);
    }
  });

  return visible;
}
