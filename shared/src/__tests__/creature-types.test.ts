import { describe, it, expect } from "vitest";
import { CREATURE_TYPES } from "@primal-grid/shared";

describe("Phase 2.4 — Creature Type Definitions", () => {
  it("CREATURE_TYPES is defined and non-empty", () => {
    expect(CREATURE_TYPES).toBeDefined();
    const types = Object.values(CREATURE_TYPES);
    expect(types.length).toBeGreaterThanOrEqual(2);
  });

  it("has at least one herbivore definition", () => {
    const keys = Object.keys(CREATURE_TYPES);
    const types = Object.values(CREATURE_TYPES) as any[];
    const hasHerbivore = keys.some((k) => k.toLowerCase().includes("herbivore")) ||
      types.some((t) => t.diet === "herbivore" || t.name?.toLowerCase().includes("herbivore"));
    expect(hasHerbivore).toBe(true);
  });

  it("has at least one carnivore definition", () => {
    const keys = Object.keys(CREATURE_TYPES);
    const types = Object.values(CREATURE_TYPES) as any[];
    const hasCarnivore = keys.some((k) => k.toLowerCase().includes("carnivore")) ||
      types.some((t) => t.diet === "carnivore" || t.name?.toLowerCase().includes("carnivore"));
    expect(hasCarnivore).toBe(true);
  });

  it("all creature types have a name string", () => {
    for (const creature of Object.values(CREATURE_TYPES) as any[]) {
      expect(typeof creature.name).toBe("string");
      expect(creature.name.length).toBeGreaterThan(0);
    }
  });

  it("all creature types have positive health", () => {
    for (const creature of Object.values(CREATURE_TYPES) as any[]) {
      expect(creature.health).toBeGreaterThan(0);
    }
  });

  it("all creature types have positive hunger", () => {
    for (const creature of Object.values(CREATURE_TYPES) as any[]) {
      expect(creature.hunger).toBeGreaterThan(0);
    }
  });

  it("all creature types have a speed value", () => {
    for (const creature of Object.values(CREATURE_TYPES) as any[]) {
      expect(creature.speed).toBeGreaterThan(0);
    }
  });

  it("all wild creature types have a positive detection radius", () => {
    for (const creature of Object.values(CREATURE_TYPES) as any[]) {
      if (creature.minPopulation === 0) continue;
      expect(creature.detectionRadius).toBeGreaterThan(0);
    }
  });

  it("all wild creature types have a non-empty preferredBiomes array", () => {
    for (const creature of Object.values(CREATURE_TYPES) as any[]) {
      if (creature.minPopulation === 0) continue;
      expect(Array.isArray(creature.preferredBiomes)).toBe(true);
      expect(creature.preferredBiomes.length).toBeGreaterThan(0);
    }
  });

  it("all creature types have a color string", () => {
    for (const creature of Object.values(CREATURE_TYPES) as any[]) {
      expect(typeof creature.color).toBe("string");
      expect(creature.color.length).toBeGreaterThan(0);
    }
  });
});
