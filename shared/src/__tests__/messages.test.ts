import { describe, it, expect } from "vitest";
import { PLACE_SHAPE, SPAWN_PAWN } from "../messages.js";
import type { PlaceShapePayload, SpawnPawnPayload } from "../messages.js";

describe("message types", () => {
  it("exports PLACE_SHAPE as 'place_shape'", () => {
    expect(PLACE_SHAPE).toBe("place_shape");
  });

  it("exports SPAWN_PAWN as 'spawn_pawn'", () => {
    expect(SPAWN_PAWN).toBe("spawn_pawn");
  });

  it("PlaceShapePayload shape is usable", () => {
    const payload: PlaceShapePayload = { shapeId: "line3", x: 5, y: 5, rotation: 0 };
    expect(payload.shapeId).toBe("line3");
    expect(payload.x).toBe(5);
  });

  it("SpawnPawnPayload shape is usable", () => {
    const payload: SpawnPawnPayload = { pawnType: "builder" };
    expect(payload.pawnType).toBe("builder");
  });
});
