// --- Message type constants ---

export const SPAWN_PAWN = "spawn_pawn" as const;
export const SET_NAME = "set_name" as const;
export const GAME_LOG = "game_log" as const;

// --- Message payload interfaces ---

export interface SpawnPawnPayload {
  pawnType: "builder" | "defender" | "attacker";
  /** What the builder should build: "outpost" (default) or "farm". */
  buildMode?: "outpost" | "farm";
}

export interface SetNamePayload {
  name: string;
}

/**
 * Event categories for game log messages.
 *
 * Categories map to visual treatments in the client:
 * - territory / claim  → 🟢 green  (claims, losses)
 * - combat / death / attack → 🔴 red (attacks, deaths)
 * - resource / harvest / deplete → 🟡 yellow (harvests, depletions)
 * - creature / spawn / tame / migrate → 🔵 blue (spawns, migrations, taming)
 * - system / info → ⚪ gray (join/leave, time of day)
 */
export type GameLogCategory =
  | "territory"
  | "claim"
  | "combat"
  | "death"
  | "attack"
  | "resource"
  | "harvest"
  | "deplete"
  | "creature"
  | "spawn"
  | "tame"
  | "migrate"
  | "system"
  | "info";

export interface GameLogPayload {
  message: string;
  type: GameLogCategory;
}
