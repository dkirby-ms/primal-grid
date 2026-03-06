import { describe, it, expect } from "vitest";
import { ResourceType } from "../types.js";
describe("Resource Type Enum", () => {
    it("has Wood type", () => {
        expect(ResourceType.Wood).toBeDefined();
        expect(typeof ResourceType.Wood).toBe("number");
    });
    it("has Stone type", () => {
        expect(ResourceType.Stone).toBeDefined();
        expect(typeof ResourceType.Stone).toBe("number");
    });
    it("Wood and Stone have distinct values", () => {
        const values = new Set([
            ResourceType.Wood,
            ResourceType.Stone,
        ]);
        expect(values.size).toBe(2);
    });
});
//# sourceMappingURL=resource-types.test.js.map