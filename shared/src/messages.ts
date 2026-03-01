// --- Message type constants ---

export const PLACE_SHAPE = "place_shape" as const;

// --- Message payload interfaces ---

export interface PlaceShapePayload {
  shapeId: string;
  x: number;
  y: number;
  rotation: number;
}
