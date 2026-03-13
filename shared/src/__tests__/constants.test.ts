import { describe, it, expect } from "vitest";
import {
  TICK_RATE,
  DEFAULT_MAP_SIZE,
  SERVER_PORT,
  OUTPOST_UPGRADE,
  OUTPOST_UPGRADE_COST_WOOD,
  OUTPOST_UPGRADE_COST_STONE,
  UPGRADED_OUTPOST_RANGE,
  UPGRADED_OUTPOST_DAMAGE,
  UPGRADED_OUTPOST_ATTACK_INTERVAL,
} from "../constants.js";

describe("shared constants", () => {
  it("exports TICK_RATE as 4", () => {
    expect(TICK_RATE).toBe(4);
  });

  it("exports DEFAULT_MAP_SIZE as 128", () => {
    expect(DEFAULT_MAP_SIZE).toBe(128);
  });

  it("exports SERVER_PORT as 2567", () => {
    expect(SERVER_PORT).toBe(2567);
  });

  it("exports outpost upgrade tuning constants", () => {
    expect(OUTPOST_UPGRADE_COST_WOOD).toBe(40);
    expect(OUTPOST_UPGRADE_COST_STONE).toBe(30);
    expect(UPGRADED_OUTPOST_RANGE).toBe(5);
    expect(UPGRADED_OUTPOST_DAMAGE).toBe(12);
    expect(UPGRADED_OUTPOST_ATTACK_INTERVAL).toBe(8);
  });

  it("keeps OUTPOST_UPGRADE compatibility aliases aligned", () => {
    expect(OUTPOST_UPGRADE).toEqual({
      COST_WOOD: OUTPOST_UPGRADE_COST_WOOD,
      COST_STONE: OUTPOST_UPGRADE_COST_STONE,
      ATTACK_RANGE: UPGRADED_OUTPOST_RANGE,
      DAMAGE: UPGRADED_OUTPOST_DAMAGE,
      ATTACK_COOLDOWN_TICKS: UPGRADED_OUTPOST_ATTACK_INTERVAL,
    });
  });
});
