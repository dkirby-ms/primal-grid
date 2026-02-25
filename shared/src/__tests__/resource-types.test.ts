import { describe, it, expect } from "vitest";
import { ResourceType } from "../types.js";

describe("Phase 2.2 — Resource Type Enum", () => {
  it("has Wood type", () => {
    expect(ResourceType.Wood).toBeDefined();
    expect(typeof ResourceType.Wood).toBe("number");
  });

  it("has Stone type", () => {
    expect(ResourceType.Stone).toBeDefined();
    expect(typeof ResourceType.Stone).toBe("number");
  });

  it("has Fiber type", () => {
    expect(ResourceType.Fiber).toBeDefined();
    expect(typeof ResourceType.Fiber).toBe("number");
  });

  it("has Berries type", () => {
    expect(ResourceType.Berries).toBeDefined();
    expect(typeof ResourceType.Berries).toBe("number");
  });

  it("all four resource types have distinct values", () => {
    const values = new Set([
      ResourceType.Wood,
      ResourceType.Stone,
      ResourceType.Fiber,
      ResourceType.Berries,
    ]);
    expect(values.size).toBe(4);
  });
});
