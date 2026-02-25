// --- Message type constants ---

export const MOVE = "move" as const;
export const GATHER = "gather" as const;

// --- Message payload interfaces ---

export interface MovePayload {
  /** Target tile X coordinate. */
  x: number;
  /** Target tile Y coordinate. */
  y: number;
}

export interface GatherPayload {
  /** Tile X coordinate to gather from. */
  x: number;
  /** Tile Y coordinate to gather from. */
  y: number;
}
