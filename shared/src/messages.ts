// --- Message type constants ---

export const SPAWN_PAWN = "spawn_pawn" as const;

// --- Message payload interfaces ---

export interface SpawnPawnPayload {
  pawnType: "builder";
  /** What the builder should build: "outpost" (default) or "farm". */
  buildMode?: "outpost" | "farm";
}
