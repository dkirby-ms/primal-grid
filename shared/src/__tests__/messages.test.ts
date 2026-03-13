import { describe, it, expect } from "vitest";
import { SPAWN_PAWN, UPGRADE_OUTPOST } from "../messages.js";
import type { SpawnPawnPayload, UpgradeOutpostPayload } from "../messages.js";

describe("message types", () => {
  it("exports SPAWN_PAWN as 'spawn_pawn'", () => {
    expect(SPAWN_PAWN).toBe("spawn_pawn");
  });

  it("exports UPGRADE_OUTPOST as 'upgrade_outpost'", () => {
    expect(UPGRADE_OUTPOST).toBe("upgrade_outpost");
  });

  it("SpawnPawnPayload shape is usable", () => {
    const payload: SpawnPawnPayload = { pawnType: "builder" };
    expect(payload.pawnType).toBe("builder");
  });

  it("UpgradeOutpostPayload shape is usable", () => {
    const payload: UpgradeOutpostPayload = { x: 12, y: 9 };
    expect(payload).toEqual({ x: 12, y: 9 });
  });
});
