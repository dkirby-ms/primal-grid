import { describe, it, expect } from "vitest";
import { CRAFT, CLAIM_TILE, ASSIGN_PAWN } from "../messages.js";
import type { CraftPayload, ClaimTilePayload, AssignPawnPayload } from "../messages.js";

describe("message types", () => {
  it("exports CRAFT as 'craft'", () => {
    expect(CRAFT).toBe("craft");
  });

  it("exports CLAIM_TILE as 'claim_tile'", () => {
    expect(CLAIM_TILE).toBe("claim_tile");
  });

  it("exports ASSIGN_PAWN as 'assign_pawn'", () => {
    expect(ASSIGN_PAWN).toBe("assign_pawn");
  });

  it("CraftPayload shape is usable", () => {
    const payload: CraftPayload = { recipeId: "wall" };
    expect(payload.recipeId).toBe("wall");
  });

  it("ClaimTilePayload shape is usable", () => {
    const payload: ClaimTilePayload = { x: 5, y: 10 };
    expect(payload.x).toBe(5);
    expect(payload.y).toBe(10);
  });

  it("AssignPawnPayload shape is usable", () => {
    const payload: AssignPawnPayload = { creatureId: "c1", command: "guard", zoneX: 3, zoneY: 4 };
    expect(payload.creatureId).toBe("c1");
    expect(payload.command).toBe("guard");
  });
});
