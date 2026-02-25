import { describe, it, expect } from "vitest";
import { TICK_RATE, DEFAULT_MAP_SIZE, SERVER_PORT } from "../constants.js";

describe("shared constants", () => {
  it("exports TICK_RATE as 4", () => {
    expect(TICK_RATE).toBe(4);
  });

  it("exports DEFAULT_MAP_SIZE as 32", () => {
    expect(DEFAULT_MAP_SIZE).toBe(32);
  });

  it("exports SERVER_PORT as 2567", () => {
    expect(SERVER_PORT).toBe(2567);
  });
});
