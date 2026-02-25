import { describe, it, expect } from "vitest";
import { MOVE, GATHER } from "../messages.js";
import type { MovePayload, GatherPayload } from "../messages.js";

describe("message types", () => {
  it("exports MOVE as 'move'", () => {
    expect(MOVE).toBe("move");
  });

  it("exports GATHER as 'gather'", () => {
    expect(GATHER).toBe("gather");
  });

  it("MovePayload shape is usable", () => {
    const payload: MovePayload = { x: 1, y: 2 };
    expect(payload.x).toBe(1);
    expect(payload.y).toBe(2);
  });

  it("GatherPayload shape is usable", () => {
    const payload: GatherPayload = { x: 5, y: 10 };
    expect(payload.x).toBe(5);
    expect(payload.y).toBe(10);
  });
});
