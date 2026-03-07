import { GameState, CreatureState } from "./GameState.js";
import {
  COMBAT, ENEMY_MOBILE_TYPES, ENEMY_BASE_TYPES, PAWN_TYPES,
  isEnemyBase, isEnemyMobile, isPlayerPawn,
} from "@primal-grid/shared";
import type { Room } from "colyseus";
import { onBaseDestroyed } from "./enemyBaseAI.js";
import type { EnemyBaseTracker } from "./enemyBaseAI.js";

/** Per-creature combat cooldown tracking (server-side, not synced). */
const attackCooldowns = new Map<string, number>();
const tileAttackCooldowns = new Map<string, number>();

/**
 * Resolve all combat interactions for this tick.
 * Runs every COMBAT.COMBAT_TICK_INTERVAL ticks.
 *
 * Combat rules:
 * - Adjacency-based (Manhattan distance ≤ 1)
 * - Symmetric simultaneous damage between hostile pairs
 * - Enemy mobiles attack player tiles (shapeHP reduction)
 * - Dead creatures removed after all damage applied
 */
export function tickCombat(
  state: GameState,
  room: Room,
  enemyBaseState: Map<string, EnemyBaseTracker>,
): void {
  if (state.tick % COMBAT.COMBAT_TICK_INTERVAL !== 0) return;

  const toRemove: string[] = [];
  const damagePairs = new Set<string>(); // Track pairs to avoid double-processing

  // Phase 1: Creature-vs-creature combat
  state.creatures.forEach((creature) => {
    if (creature.health <= 0) return;
    const dmg = getCreatureDamage(creature);
    if (dmg <= 0) return;

    // Check cooldown
    const lastAttack = attackCooldowns.get(creature.id) ?? 0;
    if (state.tick - lastAttack < COMBAT.ATTACK_COOLDOWN_TICKS) return;

    // Find adjacent hostile target
    const target = findAdjacentHostile(creature, state);
    if (!target) return;

    const pairKey = [creature.id, target.id].sort().join(":");
    if (damagePairs.has(pairKey)) return;
    damagePairs.add(pairKey);

    // Simultaneous damage
    const targetDmg = getCreatureDamage(target);
    target.health -= dmg;
    if (targetDmg > 0) {
      creature.health -= targetDmg;
      attackCooldowns.set(target.id, state.tick);
    }
    attackCooldowns.set(creature.id, state.tick);
  });

  // Phase 2: Enemy mobile tile damage
  state.creatures.forEach((creature) => {
    if (creature.health <= 0) return;
    if (!isEnemyMobile(creature.creatureType)) return;
    if (creature.currentState !== "attacking_tile") return;

    const mobileDef = ENEMY_MOBILE_TYPES[creature.creatureType];
    if (!mobileDef) return;

    const lastTileAttack = tileAttackCooldowns.get(creature.id) ?? 0;
    if (state.tick - lastTileAttack < COMBAT.TILE_ATTACK_COOLDOWN_TICKS) return;

    const tile = state.getTile(creature.targetX, creature.targetY);
    if (!tile || tile.ownerID === "" || tile.isHQTerritory) return;

    tile.shapeHP -= mobileDef.tileDamage;
    tileAttackCooldowns.set(creature.id, state.tick);

    if (tile.shapeHP <= 0) {
      tile.ownerID = "";
      tile.structureType = "";
      tile.shapeHP = 0;
      // Mobile should seek next target
      creature.currentState = "seek_territory";
      creature.targetX = -1;
      creature.targetY = -1;
    }
  });

  // Phase 3: Death and cleanup
  state.creatures.forEach((creature) => {
    if (creature.health <= 0) {
      toRemove.push(creature.id);
    }
  });

  for (const id of toRemove) {
    const creature = state.creatures.get(id);
    if (!creature) continue;

    if (isEnemyBase(creature.creatureType)) {
      // Base destroyed — despawn mobiles and award resources
      const baseDef = ENEMY_BASE_TYPES[creature.creatureType];
      onBaseDestroyed(id, state, enemyBaseState);

      // Award resources to nearest player (attacker who dealt the killing blow)
      if (baseDef) {
        const killer = findNearestPlayerPawn(creature, state);
        if (killer) {
          const player = state.players.get(killer.ownerID);
          if (player) {
            player.wood += baseDef.reward.wood;
            player.stone += baseDef.reward.stone;
            room.broadcast?.("game_log", {
              message: `${baseDef.name} destroyed! +${baseDef.reward.wood}W +${baseDef.reward.stone}S`,
              type: "combat",
            });
          }
        }
      }
    }

    if (isPlayerPawn(creature.creatureType)) {
      room.broadcast?.("game_log", {
        message: `${creature.pawnType} pawn destroyed`,
        type: "death",
      });
    }

    // Clean up cooldown tracking
    attackCooldowns.delete(id);
    tileAttackCooldowns.delete(id);

    state.creatures.delete(id);
  }
}

/** Get the damage value for a creature. */
function getCreatureDamage(creature: CreatureState): number {
  const mobileDef = ENEMY_MOBILE_TYPES[creature.creatureType];
  if (mobileDef) return mobileDef.damage;

  const pawnDef = PAWN_TYPES[creature.pawnType];
  if (pawnDef) return pawnDef.damage;

  return 0;
}

/** Find an adjacent hostile creature (Manhattan dist ≤ 1). */
function findAdjacentHostile(creature: CreatureState, state: GameState): CreatureState | null {
  let nearest: CreatureState | null = null;
  let bestDist = Infinity;

  state.creatures.forEach((other) => {
    if (other.id === creature.id || other.health <= 0) return;
    if (!areHostile(creature, other)) return;

    const dist = Math.abs(creature.x - other.x) + Math.abs(creature.y - other.y);
    if (dist <= 1 && dist < bestDist) {
      bestDist = dist;
      nearest = other;
    }
  });

  return nearest;
}

/** Check if two creatures are hostile to each other. */
function areHostile(a: CreatureState, b: CreatureState): boolean {
  // Enemy mobile vs player pawn
  if (isEnemyMobile(a.creatureType) && isPlayerPawn(b.creatureType)) return true;
  if (isPlayerPawn(a.creatureType) && isEnemyMobile(b.creatureType)) return true;

  // Player attacker vs enemy base
  if (a.pawnType === "attacker" && isEnemyBase(b.creatureType)) return true;
  if (isEnemyBase(a.creatureType) && b.pawnType === "attacker") return true;

  // Defender vs carnivore (defenders protect against wildlife)
  if (a.pawnType === "defender" && b.creatureType === "carnivore") return true;
  if (a.creatureType === "carnivore" && b.pawnType === "defender") return true;

  return false;
}

/** Find nearest player pawn adjacent to a creature (for reward attribution). */
function findNearestPlayerPawn(target: CreatureState, state: GameState): CreatureState | null {
  let nearest: CreatureState | null = null;
  let bestDist = Infinity;

  state.creatures.forEach((other) => {
    if (!isPlayerPawn(other.creatureType) || other.ownerID === "") return;
    const dist = Math.abs(target.x - other.x) + Math.abs(target.y - other.y);
    if (dist <= 2 && dist < bestDist) {
      bestDist = dist;
      nearest = other;
    }
  });

  return nearest;
}
