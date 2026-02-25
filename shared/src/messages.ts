// --- Message type constants ---

export const MOVE = "move" as const;
export const GATHER = "gather" as const;
export const EAT = "eat" as const;

// --- Message payload interfaces ---

/** Direction-based movement: -1, 0, or 1 per axis. */
export interface MovePayload {
  /** Horizontal direction (-1 = left, 0 = none, 1 = right). */
  dx: number;
  /** Vertical direction (-1 = up, 0 = none, 1 = down). */
  dy: number;
}

/** Alias for move message sent from client to server. */
export type MoveMessage = MovePayload;

export interface GatherPayload {
  /** Tile X coordinate to gather from. */
  x: number;
  /** Tile Y coordinate to gather from. */
  y: number;
}
