import type { AttackerTracker } from "./attackerAI.js";

const attackCooldowns = new Map<string, number>();
const tileAttackCooldowns = new Map<string, number>();

export function getAttackCooldown(creatureId: string): number {
  return attackCooldowns.get(creatureId) ?? 0;
}

export function setAttackCooldown(creatureId: string, tick: number): void {
  attackCooldowns.set(creatureId, tick);
}

export function getTileAttackCooldown(creatureId: string): number {
  return tileAttackCooldowns.get(creatureId) ?? 0;
}

export function setTileAttackCooldown(creatureId: string, tick: number): void {
  tileAttackCooldowns.set(creatureId, tick);
}

export function clearCombatTracking(
  creatureId: string,
  attackerState?: Map<string, AttackerTracker>,
): void {
  attackCooldowns.delete(creatureId);
  tileAttackCooldowns.delete(creatureId);
  attackerState?.delete(creatureId);
}
