import { describe, it, expect } from "vitest";
import { CRAFT, ASSIGN_PAWN } from "../messages.js";
import type { CraftPayload, AssignPawnPayload } from "../messages.js";

describe("message types", () => {
  it("exports CRAFT as 'craft'", () => {
    expect(CRAFT).toBe("craft");
  });

  it("exports ASSIGN_PAWN as 'assign_pawn'", () => {
    expect(ASSIGN_PAWN).toBe("assign_pawn");
  });

  it("CraftPayload shape is usable", () => {
    const payload: CraftPayload = { recipeId: "workbench" };
    expect(payload.recipeId).toBe("workbench");
  });

  it("AssignPawnPayload shape is usable", () => {
    const payload: AssignPawnPayload = { creatureId: "c1", command: "guard", zoneX: 3, zoneY: 4 };
    expect(payload.creatureId).toBe("c1");
    expect(payload.command).toBe("guard");
  });
});
