import type { PlayerState } from "../rooms/GameState.js";

/**
 * Defines what parts of player state get persisted across sessions.
 * Kept separate from Colyseus schema to avoid coupling persistence to network sync.
 */
export interface SerializedPlayerState {
  displayName: string;
  wood: number;
  stone: number;
  food: number;
  score: number;
  level: number;
  xp: number;
}

/** Extract persistable fields from a Colyseus PlayerState. */
export function serializePlayerState(player: PlayerState): string {
  const data: SerializedPlayerState = {
    displayName: player.displayName,
    wood: player.wood,
    stone: player.stone,
    food: Math.max(0, player.food),
    score: player.score,
    level: player.level,
    xp: player.xp,
  };
  return JSON.stringify(data);
}

/** Parse a saved player state JSON string. Returns null if invalid. */
export function deserializePlayerState(json: string): SerializedPlayerState | null {
  try {
    const data = JSON.parse(json) as Record<string, unknown>;
    if (typeof data.wood !== "number" || typeof data.stone !== "number") {
      return null;
    }
    return {
      displayName: typeof data.displayName === "string" ? data.displayName : "",
      wood: data.wood,
      stone: data.stone,
      food: typeof data.food === "number" ? Math.max(0, data.food) : 0,
      score: typeof data.score === "number" ? data.score : 0,
      level: typeof data.level === "number" ? data.level : 1,
      xp: typeof data.xp === "number" ? data.xp : 0,
    };
  } catch {
    return null;
  }
}
