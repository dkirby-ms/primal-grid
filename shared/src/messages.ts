// --- Message type constants ---

export const SPAWN_PAWN = "spawn_pawn" as const;
export const SET_NAME = "set_name" as const;
export const GAME_LOG = "game_log" as const;
export const CHAT = "chat" as const;

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
 * - error → 🔴 red (auth/connection errors)
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
  | "info"
  | "error";

export interface GameLogPayload {
  message: string;
  type: GameLogCategory;
}

/** Max allowed length for a single chat message. */
export const CHAT_MAX_LENGTH = 200;

/** Payload sent by the client to the server when sending a chat message. */
export interface ChatPayload {
  text: string;
}

/** Payload broadcast by the server to all clients for a chat message. */
export interface ChatBroadcastPayload {
  sender: string;
  text: string;
  timestamp: number;
}
