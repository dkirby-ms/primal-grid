import { GameState, CreatureState } from "./GameState.js";
import {
  CREATURE_AI, CREATURE_TYPES,
  ResourceType, TileType, WORKER,
} from "@primal-grid/shared";

/** FSM states for creature AI. */
export type AIState = "idle" | "wander" | "eat" | "flee" | "hunt";

/**
 * Run one AI step for all creatures. Called every CREATURE_AI.TICK_INTERVAL ticks.
 * Modifies creature states in-place. Removes dead creatures from state.
 */
export function tickCreatureAI(state: GameState): void {
  const toRemove: string[] = [];

  state.creatures.forEach((creature) => {
    // Workers with gather command skip normal AI
    if (creature.ownerID !== "" && creature.command === "gather") {
      // Workers don't drain hunger
      // Death check (workers can be killed by hostile creatures)
      if (creature.health <= 0) {
        toRemove.push(creature.id);
        return;
      }
      tickWorkerGather(creature, state);
      return; // skip wild AI entirely
    }

    // Drain hunger
    creature.hunger = Math.max(0, creature.hunger - CREATURE_AI.HUNGER_DRAIN);

    // Starvation damage
    if (creature.hunger <= 0) {
      creature.health -= CREATURE_AI.STARVATION_DAMAGE;
    }

    // Death check
    if (creature.health <= 0) {
      toRemove.push(creature.id);
      return;
    }

    // Run FSM based on creature type
    if (creature.creatureType === "herbivore") {
      stepHerbivore(creature, state);
    } else if (creature.creatureType === "carnivore") {
      stepCarnivore(creature, state);
    }
  });

  // Remove dead creatures
  for (const id of toRemove) {
    state.creatures.delete(id);
  }
}

function stepHerbivore(creature: CreatureState, state: GameState): void {
  const typeDef = CREATURE_TYPES["herbivore"];

  // Tamed herbivores skip flee behavior (they trust their owner's pack)
  if (creature.ownerID === "") {
    const nearestCarnivore = findNearestOfType(creature, state, "carnivore", typeDef.detectionRadius);
    // Priority 1: Flee from carnivores (wild only)
    if (nearestCarnivore) {
      creature.currentState = "flee";
      moveAwayFrom(creature, nearestCarnivore.x, nearestCarnivore.y, state);
      return;
    }
  }

  // Priority 2: Eat when hungry and on a resource tile
  if (creature.hunger < CREATURE_AI.HUNGRY_THRESHOLD) {
    const currentTile = state.getTile(creature.x, creature.y);
    if (currentTile && currentTile.resourceType >= 0 && currentTile.resourceAmount > 0) {
      creature.currentState = "eat";
      currentTile.resourceAmount -= CREATURE_AI.GRAZE_AMOUNT;
      creature.hunger = Math.min(creature.hunger + CREATURE_AI.EAT_RESTORE,
        typeDef.hunger);
      if (currentTile.resourceAmount <= 0) {
        currentTile.resourceAmount = 0;
        currentTile.resourceType = -1;
      }
      return;
    }

    // Move toward nearest resource tile
    const resourceTile = findNearestResource(creature, state, typeDef.detectionRadius);
    if (resourceTile) {
      creature.currentState = "wander";
      moveToward(creature, resourceTile.x, resourceTile.y, state);
      return;
    }
  }

  // Default: Idle briefly, then wander
  idleOrWander(creature, state);
}

function stepCarnivore(creature: CreatureState, state: GameState): void {
  const typeDef = CREATURE_TYPES["carnivore"];

  // Priority 1: Hunt herbivores when hungry
  if (creature.hunger < CREATURE_AI.HUNGRY_THRESHOLD) {
    const prey = findNearestOfType(creature, state, "herbivore", typeDef.detectionRadius);
    if (prey) {
      const dist = manhattan(creature.x, creature.y, prey.x, prey.y);
      if (dist <= 1) {
        // Attack — adjacent to prey
        creature.currentState = "eat";
        prey.health -= CREATURE_AI.HUNT_DAMAGE;
        creature.hunger = Math.min(creature.hunger + CREATURE_AI.EAT_RESTORE,
          typeDef.hunger);
        if (prey.health <= 0) {
          state.creatures.delete(prey.id);
        }
        return;
      }
      // Move toward prey
      creature.currentState = "hunt";
      moveToward(creature, prey.x, prey.y, state);
      return;
    }
  }

  // Default: Idle briefly, then wander
  idleOrWander(creature, state);
}

/** Switch between idle and wander. Uses a simple tick-count heuristic. */
function idleOrWander(creature: CreatureState, state: GameState): void {
  if (creature.currentState === "idle") {
    // After being idle, start wandering
    creature.currentState = "wander";
    wanderRandom(creature, state);
  } else {
    creature.currentState = "idle";
  }
}

/** Move one tile in a random walkable direction. */
function wanderRandom(creature: CreatureState, state: GameState): void {
  const dirs = shuffleDirections();
  for (const [dx, dy] of dirs) {
    const nx = creature.x + dx;
    const ny = creature.y + dy;
    if (state.isWalkable(nx, ny)) {
      creature.x = nx;
      creature.y = ny;
      return;
    }
  }
}

/** Greedy Manhattan movement toward target. Exported for pack follow. */
export function moveToward(creature: CreatureState, tx: number, ty: number, state: GameState): void {
  const dx = Math.sign(tx - creature.x);
  const dy = Math.sign(ty - creature.y);

  // Try primary axis first (larger delta), then secondary
  const candidates = getCandidateMoves(dx, dy);
  for (const [mx, my] of candidates) {
    const nx = creature.x + mx;
    const ny = creature.y + my;
    if (state.isWalkable(nx, ny)) {
      creature.x = nx;
      creature.y = ny;
      return;
    }
  }
}

/** Greedy Manhattan movement away from threat. */
function moveAwayFrom(creature: CreatureState, tx: number, ty: number, state: GameState): void {
  const dx = -Math.sign(tx - creature.x);
  const dy = -Math.sign(ty - creature.y);

  const candidates = getCandidateMoves(dx, dy);
  for (const [mx, my] of candidates) {
    const nx = creature.x + mx;
    const ny = creature.y + my;
    if (state.isWalkable(nx, ny)) {
      creature.x = nx;
      creature.y = ny;
      return;
    }
  }
}

/** Get ordered candidate moves for greedy Manhattan movement. */
function getCandidateMoves(dx: number, dy: number): [number, number][] {
  const moves: [number, number][] = [];
  if (dx !== 0) moves.push([dx, 0]);
  if (dy !== 0) moves.push([0, dy]);
  // Fallback to perpendicular directions
  if (dy !== 0 && dx === 0) { moves.push([1, 0]); moves.push([-1, 0]); }
  if (dx !== 0 && dy === 0) { moves.push([0, 1]); moves.push([0, -1]); }
  return moves;
}

function findNearestOfType(
  creature: CreatureState, state: GameState, targetType: string, radius: number,
): CreatureState | null {
  let nearest: CreatureState | null = null;
  let bestDist = Infinity;

  state.creatures.forEach((other) => {
    if (other.id === creature.id || other.creatureType !== targetType) return;
    const dist = manhattan(creature.x, creature.y, other.x, other.y);
    if (dist <= radius && dist < bestDist) {
      bestDist = dist;
      nearest = other;
    }
  });

  return nearest;
}

function findNearestResource(
  creature: CreatureState, state: GameState, radius: number,
): { x: number; y: number } | null {
  let nearest: { x: number; y: number } | null = null;
  let bestDist = Infinity;

  const cx = creature.x;
  const cy = creature.y;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = cx + dx;
      const ty = cy + dy;
      const tile = state.getTile(tx, ty);
      if (!tile || tile.resourceType < 0 || tile.resourceAmount <= 0) continue;
      if (!state.isWalkable(tx, ty)) continue;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > 0 && dist <= radius && dist < bestDist) {
        bestDist = dist;
        nearest = { x: tx, y: ty };
      }
    }
  }

  return nearest;
}

function manhattan(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

// Phase 5: A* pathfinding integration point
// Currently uses greedy Manhattan movement. Replace moveToward/moveAwayFrom
// calls with pathfindAStar when implemented.
export function pathfindAStar(
  state: any, fromX: number, fromY: number, toX: number, toY: number
): { x: number; y: number } | null {
  // TODO Phase 5: Implement A* pathfinding
  return null; // Falls through to greedy movement
}

function tickWorkerGather(creature: CreatureState, state: GameState): void {
  const owner = state.players.get(creature.ownerID);
  if (!owner) return;

  // Check if current tile has resources to gather
  const currentTile = state.getTile(creature.x, creature.y);
  if (currentTile && currentTile.ownerID === creature.ownerID
      && currentTile.resourceAmount > 0 && currentTile.resourceType >= 0) {
    // Gather from current tile
    const amount = Math.min(WORKER.GATHER_AMOUNT, currentTile.resourceAmount);
    currentTile.resourceAmount -= amount;

    // Add to owner's stockpile based on resource type
    switch (currentTile.resourceType) {
      case ResourceType.Wood:    owner.wood    += amount; break;
      case ResourceType.Stone:   owner.stone   += amount; break;
      case ResourceType.Fiber:   owner.fiber   += amount; break;
      case ResourceType.Berries: owner.berries += amount; break;
    }

    // If tile depleted, clear resource type
    if (currentTile.resourceAmount <= 0) {
      currentTile.resourceAmount = 0;
      currentTile.resourceType = -1;
    }

    // Don't move this tick — gathering takes the action
    creature.currentState = "eat";
    return;
  }

  // Find nearest resource tile in owned territory
  const target = findNearestOwnedResource(creature, state);
  if (target) {
    creature.currentState = "wander";
    moveToward(creature, target.x, target.y, state);
    return;
  }

  // No resources available — wander within territory
  wanderInTerritory(creature, state);
}

function findNearestOwnedResource(
  creature: CreatureState, state: GameState,
): { x: number; y: number } | null {
  let nearest: { x: number; y: number } | null = null;
  let bestDist = Infinity;

  // Scan a reasonable radius around the creature
  const SCAN_RADIUS = 10;
  for (let dy = -SCAN_RADIUS; dy <= SCAN_RADIUS; dy++) {
    for (let dx = -SCAN_RADIUS; dx <= SCAN_RADIUS; dx++) {
      const tx = creature.x + dx;
      const ty = creature.y + dy;
      const tile = state.getTile(tx, ty);
      if (!tile) continue;
      if (tile.ownerID !== creature.ownerID) continue;  // only owned tiles
      if (tile.resourceAmount <= 0 || tile.resourceType < 0) continue;
      if (!state.isWalkable(tx, ty)) continue;  // respect shape blocks
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > 0 && dist < bestDist) {
        bestDist = dist;
        nearest = { x: tx, y: ty };
      }
    }
  }
  return nearest;
}

function wanderInTerritory(creature: CreatureState, state: GameState): void {
  // Try to wander to an adjacent owned walkable tile
  const dirs = shuffleDirections();
  for (const [dx, dy] of dirs) {
    const nx = creature.x + dx;
    const ny = creature.y + dy;
    const tile = state.getTile(nx, ny);
    if (tile && tile.ownerID === creature.ownerID && state.isWalkable(nx, ny)) {
      creature.x = nx;
      creature.y = ny;
      creature.currentState = "wander";
      return;
    }
  }
  creature.currentState = "idle";
}

/** Fisher-Yates shuffle of the 4 cardinal directions. */
function shuffleDirections(): [number, number][] {
  const dirs: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  return dirs;
}
