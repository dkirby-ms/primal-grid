import { describe, it, expect } from "vitest";
import { GameRoom } from "../rooms/GameRoom.js";

describe("GameRoom", () => {
  it("can be imported and is a class", () => {
    expect(GameRoom).toBeDefined();
    expect(typeof GameRoom).toBe("function");
  });
});
