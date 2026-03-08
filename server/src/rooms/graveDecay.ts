import { GameState } from "./GameState.js";
import { GRAVE_MARKER, isGraveMarker } from "@primal-grid/shared";

/**
 * Remove grave markers that have exceeded their decay lifetime.
 * Called every tick from the game loop.
 */
export function tickGraveDecay(state: GameState, currentTick: number): void {
  const toRemove: string[] = [];

  state.creatures.forEach((creature) => {
    if (!isGraveMarker(creature.creatureType)) return;
    if (currentTick - creature.spawnTick >= GRAVE_MARKER.DECAY_TICKS) {
      toRemove.push(creature.id);
    }
  });

  for (const id of toRemove) {
    state.creatures.delete(id);
  }
}
