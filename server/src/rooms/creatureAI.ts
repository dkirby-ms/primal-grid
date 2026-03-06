import { GameState, CreatureState } from "./GameState.js";
import { stepBuilder } from "./builderAI.js";
import {
  CREATURE_AI, CREATURE_TYPES,
  ResourceType, TileType,
} from "@primal-grid/shared";
import type { Room } from "colyseus";

/** FSM states for creature AI. */
export type AIState = "idle" | "wander" | "eat" | "flee" | "hunt";

/**
 * Run one AI step for creatures whose individual timer has expired.
 * Each creature has its own `nextMoveTick` so they move independently.
 * Modifies creature states in-place. Removes dead creatures from state.
 */
export function tickCreatureAI(state: GameState, room: Room): void {
  const toRemove: string[] = [];
  const currentTick = state.tick;

  state.creatures.forEach((creature) => {
    // Per-creature movement timer — skip if not ready
    if (currentTick < creature.nextMoveTick) return;

    // Schedule next AI step
    creature.nextMoveTick = currentTick + CREATURE_AI.TICK_INTERVAL;

    // Pawns don't have hunger mechanics
    if (creature.pawnType === "") {
      // Drain hunger
      creature.hunger = Math.max(0, creature.hunger - CREATURE_AI.HUNGER_DRAIN);

      // Starvation damage
      if (creature.hunger <= 0) {
        creature.health -= CREATURE_AI.STARVATION_DAMAGE;
      }
    }

    // Death check
    if (creature.health <= 0) {
      if (creature.creatureType === "pawn_builder" && creature.ownerID) {
        room.broadcast?.("game_log", { message: "Builder killed by carnivore", type: "death" });
      }
      toRemove.push(creature.id);
      return;
    }

    // Run FSM based on creature type
    if (creature.creatureType === "pawn_builder") {
      stepBuilder(creature, state);
    } else if (creature.creatureType === "herbivore") {
      stepHerbivore(creature, state);
    } else if (creature.creatureType === "carnivore") {
      stepCarnivore(creature, state, room);
    }
  });

  // Remove dead creatures
  for (const id of toRemove) {
    state.creatures.delete(id);
  }
}

function stepHerbivore(creature: CreatureState, state: GameState): void {
  const typeDef = CREATURE_TYPES["herbivore"];

  const nearestCarnivore = findNearestOfType(creature, state, "carnivore", typeDef.detectionRadius);
  // Priority 1: Flee from carnivores
  if (nearestCarnivore) {
    creature.currentState = "flee";
    moveAwayFrom(creature, nearestCarnivore.x, nearestCarnivore.y, state);
    return;
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

function stepCarnivore(creature: CreatureState, state: GameState, room: Room): void {
  const typeDef = CREATURE_TYPES["carnivore"];

  // Priority 1: Hunt herbivores or builders when hungry
  if (creature.hunger < CREATURE_AI.HUNGRY_THRESHOLD) {
    const prey = findNearestPrey(creature, state, typeDef.detectionRadius);
    if (prey) {
      const dist = manhattan(creature.x, creature.y, prey.x, prey.y);
      if (dist <= 1) {
        // Attack — adjacent to prey
        creature.currentState = "eat";
        prey.health -= CREATURE_AI.HUNT_DAMAGE;
        creature.hunger = Math.min(creature.hunger + CREATURE_AI.EAT_RESTORE,
          typeDef.hunger);
        if (prey.health <= 0) {
          if (prey.creatureType === "pawn_builder" && prey.ownerID) {
            room.broadcast?.("game_log", { message: "Builder killed by carnivore", type: "death" });
          }
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
    creature.currentState = "wander";
    wanderRandom(creature, state);
  } else {
    creature.currentState = "idle";
    // Stay idle for 0-2 extra AI ticks so movement feels less busy
    creature.nextMoveTick +=
      Math.floor(Math.random() * CREATURE_AI.IDLE_EXTRA_TICKS_MAX) *
      CREATURE_AI.TICK_INTERVAL;
  }
}

/** Move one tile in a random walkable direction. */
function wanderRandom(creature: CreatureState, state: GameState): void {
  const dirs = shuffleDirections();
  for (const [dx, dy] of dirs) {
    const nx = creature.x + dx;
    const ny = creature.y + dy;
    if (isTileOpenForCreature(state, creature, nx, ny)) {
      creature.x = nx;
      creature.y = ny;
      return;
    }
  }
}

/** Greedy Manhattan movement toward target. */
export function moveToward(creature: CreatureState, tx: number, ty: number, state: GameState): void {
  const dx = Math.sign(tx - creature.x);
  const dy = Math.sign(ty - creature.y);

  // Try primary axis first (larger delta), then secondary
  const candidates = getCandidateMoves(dx, dy);
  for (const [mx, my] of candidates) {
    const nx = creature.x + mx;
    const ny = creature.y + my;
    if (isTileOpenForCreature(state, creature, nx, ny)) {
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
    if (isTileOpenForCreature(state, creature, nx, ny)) {
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

/** Find nearest valid prey for carnivores: herbivores and pawn_builders. */
function findNearestPrey(
  creature: CreatureState, state: GameState, radius: number,
): CreatureState | null {
  let nearest: CreatureState | null = null;
  let bestDist = Infinity;

  state.creatures.forEach((other) => {
    if (other.id === creature.id) return;
    if (other.creatureType !== "herbivore" && other.creatureType !== "pawn_builder") return;
    // Skip prey standing inside player territory (carnivore can't reach them)
    const preyTile = state.getTile(other.x, other.y);
    if (preyTile && preyTile.ownerID !== "") return;
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
      // Skip resource tiles inside player territory (herbivore can't enter)
      if (tile.ownerID !== "") continue;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > 0 && dist <= radius && dist < bestDist) {
        bestDist = dist;
        nearest = { x: tx, y: ty };
      }
    }
  }

  return nearest;
}

/**
 * Check if a tile is open for a given creature to enter.
 * Walkability + territory ownership check:
 * - Non-pawn creatures (herbivores, carnivores) cannot enter tiles with an ownerID.
 * - Pawn builders can enter tiles owned by their own player.
 */
export function isTileOpenForCreature(state: GameState, creature: CreatureState, x: number, y: number): boolean {
  if (!state.isWalkable(x, y)) return false;
  const tile = state.getTile(x, y);
  if (!tile) return false;
  if (tile.ownerID !== "") {
    if (creature.creatureType === "pawn_builder" && creature.ownerID === tile.ownerID) {
      return true;
    }
    return false;
  }
  return true;
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

/** Fisher-Yates shuffle of the 4 cardinal directions. */
function shuffleDirections(): [number, number][] {
  const dirs: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  return dirs;
}
