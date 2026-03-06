import { describe, it, expect } from "vitest";
import { SPAWN_PAWN } from "../messages.js";
describe("message types", () => {
    it("exports SPAWN_PAWN as 'spawn_pawn'", () => {
        expect(SPAWN_PAWN).toBe("spawn_pawn");
    });
    it("SpawnPawnPayload shape is usable", () => {
        const payload = { pawnType: "builder" };
        expect(payload.pawnType).toBe("builder");
    });
});
//# sourceMappingURL=messages.test.js.map