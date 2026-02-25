import { describe, it, expect } from "vitest";
import { GameState } from "../rooms/GameState.js";

describe("GameState", () => {
  it("can be instantiated", () => {
    const state = new GameState();
    expect(state).toBeDefined();
  });

  it("initializes tick to 0", () => {
    const state = new GameState();
    expect(state.tick).toBe(0);
  });
});
