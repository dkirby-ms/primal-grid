// --- Message type constants ---

export const PLACE_SHAPE = "place_shape" as const;
export const SPAWN_PAWN = "spawn_pawn" as const;

// --- Message payload interfaces ---

export interface PlaceShapePayload {
  shapeId: string;
  x: number;
  y: number;
  rotation: number;
}

export interface SpawnPawnPayload {
  pawnType: "builder";
}
