import { GameState, CreatureState } from "./GameState.js";
import {
  ENEMY_BASE_TYPES, ENEMY_MOBILE_TYPES,
  CREATURE_AI, DayPhase,
} from "@primal-grid/shared";
import type { Room } from "colyseus";

/** Server-side tracking for each enemy base. */
export interface EnemyBaseTracker {
  spawnedMobileIds: Set<string>;
}

/**
 * Run one AI step for an enemy base creature.
 * Bases don't move — they spawn mobiles on a timer when it's night.
 */
export function stepEnemyBase(
  base: CreatureState,
  state: GameState,
  room: Room,
  enemyBaseState: Map<string, EnemyBaseTracker>,
  nextCreatureId: { value: number },
): void {
  const baseDef = ENEMY_BASE_TYPES[base.creatureType];
  if (!baseDef) return;

  // Only spawn mobiles during night phase
  if (state.dayPhase !== DayPhase.Night) {
    // Re-check periodically so spawning starts promptly when night falls
    base.nextMoveTick = state.tick + CREATURE_AI.TICK_INTERVAL;
    return;
  }

  // Get or create tracker
  let tracker = enemyBaseState.get(base.id);
  if (!tracker) {
    tracker = { spawnedMobileIds: new Set() };
    enemyBaseState.set(base.id, tracker);
  }

  // Prune dead mobiles from tracker
  for (const mobId of tracker.spawnedMobileIds) {
    if (!state.creatures.has(mobId)) {
      tracker.spawnedMobileIds.delete(mobId);
    }
  }

  // Check mobile cap
  if (tracker.spawnedMobileIds.size >= baseDef.maxMobiles) {
    base.nextMoveTick = state.tick + baseDef.spawnInterval;
    return;
  }

  // Find walkable tile adjacent to base for spawn
  const spawnPos = findAdjacentWalkable(base.x, base.y, state);
  if (!spawnPos) {
    base.nextMoveTick = state.tick + baseDef.spawnInterval;
    return;
  }

  // Spawn mobile
  const mobileDef = ENEMY_MOBILE_TYPES[baseDef.spawnType];
  if (!mobileDef) return;

  const mobile = new CreatureState();
  mobile.id = `enemy_${nextCreatureId.value++}`;
  mobile.creatureType = baseDef.spawnType;
  mobile.x = spawnPos.x;
  mobile.y = spawnPos.y;
  mobile.health = mobileDef.health;
  mobile.hunger = 100;
  mobile.currentState = "seek_territory";
  mobile.ownerID = "";
  mobile.pawnType = "";
  mobile.targetX = -1;
  mobile.targetY = -1;
  mobile.stamina = 0;
  // Stagger AI ticks
  mobile.nextMoveTick = state.tick + 1 + (nextCreatureId.value % CREATURE_AI.TICK_INTERVAL);
  state.creatures.set(mobile.id, mobile);

  tracker.spawnedMobileIds.add(mobile.id);
  base.nextMoveTick = state.tick + baseDef.spawnInterval;

  room.broadcast?.("game_log", {
    message: `Enemy mobile spawned: ${mobileDef.name} from ${baseDef.name} (base=${base.id}) at (${spawnPos.x},${spawnPos.y}) on tick ${state.tick} [mobiles=${tracker.spawnedMobileIds.size}/${baseDef.maxMobiles}]`,
    type: "spawn",
  });
}

/** Find a walkable tile adjacent (Manhattan dist 1) to (cx, cy). */
function findAdjacentWalkable(cx: number, cy: number, state: GameState): { x: number; y: number } | null {
  const dirs: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  // Shuffle to avoid always spawning in same direction
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  for (const [dx, dy] of dirs) {
    const nx = cx + dx;
    const ny = cy + dy;
    if (state.isWalkable(nx, ny)) {
      return { x: nx, y: ny };
    }
  }
  return null;
}

/**
 * Handle death of an enemy base: despawn all its mobiles.
 */
export function onBaseDestroyed(
  baseId: string,
  state: GameState,
  enemyBaseState: Map<string, EnemyBaseTracker>,
): void {
  const tracker = enemyBaseState.get(baseId);
  if (tracker) {
    for (const mobId of tracker.spawnedMobileIds) {
      const mob = state.creatures.get(mobId);
      if (mob) {
        mob.health = 0;
        state.creatures.delete(mobId);
      }
    }
    enemyBaseState.delete(baseId);
  }
}
