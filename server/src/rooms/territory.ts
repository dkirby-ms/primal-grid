import { GameState, TileState, PlayerState, StructureState, CreatureState } from "./GameState.js";
import { TERRITORY, TileType, ItemType } from "@primal-grid/shared";

/** Check if (x,y) is adjacent (cardinal) to any tile owned by playerId. */
export function isAdjacentToTerritory(state: GameState, playerId: string, x: number, y: number): boolean {
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (const [dx, dy] of dirs) {
    const neighbor = state.getTile(x + dx, y + dy);
    if (neighbor && neighbor.ownerID === playerId) return true;
  }
  return false;
}

/** Check if any cell in the shape is adjacent to (or inside) the player's existing territory. */
export function isShapeAdjacentToTerritory(
  state: GameState,
  playerId: string,
  cells: Array<{ x: number; y: number }>
): boolean {
  for (const cell of cells) {
    if (isAdjacentToTerritory(state, playerId, cell.x, cell.y)) return true;
    // Also count the cell itself as adjacent if already owned
    const tile = state.getTile(cell.x, cell.y);
    if (tile && tile.ownerID === playerId) return true;
  }
  return false;
}

/** Claim a single tile for a player. No validation — caller must validate first. */
export function claimTile(state: GameState, playerId: string, x: number, y: number): void {
  const tile = state.getTile(x, y);
  if (!tile) return;
  tile.ownerID = playerId;

  const player = state.players.get(playerId);
  if (player) player.score += 1;
}

/** Spawn HQ for a player: place HQ structure, claim 3×3 area, set starting resources, spawn worker. */
export function spawnHQ(
  state: GameState,
  player: PlayerState,
  hqX: number,
  hqY: number,
  nextStructureId: { value: number },
  nextCreatureId?: { value: number },
): void {
  // Place HQ structure
  const hq = new StructureState();
  hq.id = `structure_${nextStructureId.value++}`;
  hq.structureType = ItemType.HQ;
  hq.x = hqX;
  hq.y = hqY;
  hq.placedBy = player.id;
  hq.health = -1; // indestructible for now
  state.structures.set(hq.id, hq);

  // Set player HQ position
  player.hqX = hqX;
  player.hqY = hqY;

  // Claim 3×3 area around HQ
  const halfSize = Math.floor(TERRITORY.STARTING_SIZE / 2);
  for (let dy = -halfSize; dy <= halfSize; dy++) {
    for (let dx = -halfSize; dx <= halfSize; dx++) {
      const tx = hqX + dx;
      const ty = hqY + dy;
      const tile = state.getTile(tx, ty);
      if (tile && tile.type !== TileType.Water && tile.type !== TileType.Rock) {
        tile.ownerID = player.id;
        player.score += 1;
      }
    }
  }

  // Starting resources
  player.wood = TERRITORY.STARTING_WOOD;
  player.stone = TERRITORY.STARTING_STONE;
  player.fiber = TERRITORY.STARTING_FIBER;
  player.berries = TERRITORY.STARTING_BERRIES;

  // Spawn starting worker creature at HQ
  if (nextCreatureId) {
    const WORKER_HEALTH = 50; // TODO: import from shared WORKER constants when available
    const worker = new CreatureState();
    worker.id = `creature_${nextCreatureId.value++}`;
    worker.creatureType = "worker";
    worker.x = hqX;
    worker.y = hqY;
    worker.health = WORKER_HEALTH;
    worker.hunger = 100;
    worker.personality = "docile";
    worker.currentState = "idle";
    worker.ownerID = player.id;
    worker.trust = 100;
    worker.command = "gather";
    state.creatures.set(worker.id, worker);
  }
}

/** Get count of tiles owned by each player. */
export function getTerritoryCounts(state: GameState): Map<string, number> {
  const counts = new Map<string, number>();
  const len = state.tiles.length;
  for (let i = 0; i < len; i++) {
    const tile = state.tiles.at(i);
    if (tile && tile.ownerID) {
      const owner = tile.ownerID;
      counts.set(owner, (counts.get(owner) || 0) + 1);
    }
  }
  return counts;
}
