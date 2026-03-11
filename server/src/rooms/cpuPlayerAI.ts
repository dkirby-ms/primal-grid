import { GameState, PlayerState, CreatureState } from "./GameState.js";
import {
  PAWN_TYPES, CPU_PLAYER, CREATURE_AI,
  isEnemyMobile,
} from "@primal-grid/shared";
import type { Room } from "colyseus";

/**
 * Priority-based CPU player AI.
 *
 * Evaluated every CPU_PLAYER.TICK_INTERVAL ticks per CPU player.
 * Decision priorities: defend → build → attack → farm → idle.
 *
 * CPU players only make strategic decisions (which pawn to spawn).
 * All tactical behavior is handled by existing pawn AIs (builderAI,
 * defenderAI, attackerAI, explorerAI).
 */

/** Count pawns of a specific type owned by a player. */
function countPawns(
  state: GameState,
  playerId: string,
  pawnType: string,
): number {
  let count = 0;
  state.creatures.forEach((c) => {
    if (c.ownerID === playerId && c.pawnType === pawnType) count++;
  });
  return count;
}

/** Check if hostile enemies are near the player's territory. */
function hasNearbyThreats(
  state: GameState,
  player: PlayerState,
  radius: number,
): boolean {
  let found = false;
  state.creatures.forEach((c) => {
    if (found) return;
    if (!isEnemyMobile(c.creatureType)) return;
    const dist = Math.abs(c.x - player.hqX) + Math.abs(c.y - player.hqY);
    if (dist <= radius) found = true;
  });
  return found;
}

export interface SpawnPawnRequest {
  playerId: string;
  pawnType: "builder" | "defender" | "attacker" | "explorer";
  buildMode?: "outpost" | "farm";
}

/**
 * Evaluate the CPU player's next strategic decision.
 * Returns a spawn request if the CPU decides to spawn a pawn, or null
 * if no action is warranted this tick.
 */
export function evaluateCpuDecision(
  state: GameState,
  player: PlayerState,
  playerId: string,
): SpawnPawnRequest | null {
  const builders = countPawns(state, playerId, "builder");
  const defenders = countPawns(state, playerId, "defender");
  const attackers = countPawns(state, playerId, "attacker");

  // Priority 1: Defend — spawn defenders if threats are nearby and we have few
  const threatRadius = 20;
  if (hasNearbyThreats(state, player, threatRadius) && defenders < PAWN_TYPES["defender"].maxCount) {
    const def = PAWN_TYPES["defender"];
    if (player.wood >= def.cost.wood && player.stone >= def.cost.stone) {
      return { playerId, pawnType: "defender" };
    }
  }

  // Priority 2: Build territory — always want at least 1 builder
  if (builders < 1) {
    const def = PAWN_TYPES["builder"];
    if (player.wood >= def.cost.wood && player.stone >= def.cost.stone) {
      return { playerId, pawnType: "builder", buildMode: "outpost" };
    }
  }

  // Priority 3: Build farms for economy if we have territory but few farms
  // Only if we already have a builder working
  if (builders >= 1 && builders < 2) {
    const def = PAWN_TYPES["builder"];
    if (player.wood >= def.cost.wood && player.stone >= def.cost.stone) {
      return { playerId, pawnType: "builder", buildMode: "farm" };
    }
  }

  // Priority 4: Attack — spawn attackers if we have economy and defense covered
  if (defenders >= 1 && builders >= 1 && attackers < PAWN_TYPES["attacker"].maxCount) {
    const def = PAWN_TYPES["attacker"];
    if (player.wood >= def.cost.wood && player.stone >= def.cost.stone) {
      return { playerId, pawnType: "attacker" };
    }
  }

  // Priority 5: More builders for expansion if affordable
  if (builders < PAWN_TYPES["builder"].maxCount) {
    const def = PAWN_TYPES["builder"];
    if (player.wood >= def.cost.wood * 2 && player.stone >= def.cost.stone * 2) {
      return { playerId, pawnType: "builder", buildMode: "outpost" };
    }
  }

  return null;
}

/**
 * Tick all CPU players. Called from the main game loop.
 * Only evaluates on CPU_PLAYER.TICK_INTERVAL boundaries.
 */
export function tickCpuPlayers(
  state: GameState,
  cpuPlayerIds: Set<string>,
  room: Room,
  spawnPawnForCpu: (playerId: string, pawnType: string, buildMode?: string) => void,
): void {
  if (state.tick % CPU_PLAYER.TICK_INTERVAL !== 0) return;

  for (const playerId of cpuPlayerIds) {
    const player = state.players.get(playerId);
    if (!player) continue;

    const decision = evaluateCpuDecision(state, player, playerId);
    if (decision) {
      spawnPawnForCpu(playerId, decision.pawnType, decision.buildMode);
    }
  }
}
