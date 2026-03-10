import { describe, it, expect } from "vitest";
import {
  serializePlayerState,
  deserializePlayerState,
} from "../persistence/playerStateSerde.js";
import { PlayerState } from "../rooms/GameState.js";

// ── Helpers ─────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<Record<string, unknown>> = {}): PlayerState {
  const p = new PlayerState();
  p.displayName = (overrides.displayName as string) ?? "TestPlayer";
  p.wood = (overrides.wood as number) ?? 50;
  p.stone = (overrides.stone as number) ?? 30;
  p.score = (overrides.score as number) ?? 100;
  p.level = (overrides.level as number) ?? 3;
  p.xp = (overrides.xp as number) ?? 250;
  return p;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Player State Serialization", () => {
  describe("serializePlayerState", () => {
    it("produces valid JSON string", () => {
      const player = makePlayer();
      const json = serializePlayerState(player);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it("preserves all fields in the serialized output", () => {
      const player = makePlayer({
        displayName: "Rex",
        wood: 77,
        stone: 44,
        score: 999,
        level: 5,
        xp: 500,
      });
      const json = serializePlayerState(player);
      const parsed = JSON.parse(json) as Record<string, unknown>;
      expect(parsed.displayName).toBe("Rex");
      expect(parsed.wood).toBe(77);
      expect(parsed.stone).toBe(44);
      expect(parsed.score).toBe(999);
      expect(parsed.level).toBe(5);
      expect(parsed.xp).toBe(500);
    });

    it("handles zero values without loss", () => {
      const player = makePlayer({ wood: 0, stone: 0, score: 0, level: 1, xp: 0 });
      const json = serializePlayerState(player);
      const parsed = JSON.parse(json) as Record<string, unknown>;
      expect(parsed.wood).toBe(0);
      expect(parsed.stone).toBe(0);
      expect(parsed.score).toBe(0);
      expect(parsed.xp).toBe(0);
    });

    it("handles empty displayName", () => {
      const player = makePlayer({ displayName: "" });
      const json = serializePlayerState(player);
      const parsed = JSON.parse(json) as Record<string, unknown>;
      expect(parsed.displayName).toBe("");
    });

    it("handles unicode displayName", () => {
      const player = makePlayer({ displayName: "🦖DinoKing🦕" });
      const json = serializePlayerState(player);
      const parsed = JSON.parse(json) as Record<string, unknown>;
      expect(parsed.displayName).toBe("🦖DinoKing🦕");
    });
  });

  describe("deserializePlayerState", () => {
    it("round-trips through serialize → deserialize", () => {
      const player = makePlayer({ displayName: "RoundTrip", wood: 42, stone: 13 });
      const json = serializePlayerState(player);
      const result = deserializePlayerState(json);

      expect(result).not.toBeNull();
      expect(result!.displayName).toBe("RoundTrip");
      expect(result!.wood).toBe(42);
      expect(result!.stone).toBe(13);
      expect(result!.score).toBe(100);
      expect(result!.level).toBe(3);
      expect(result!.xp).toBe(250);
    });

    it("returns null for invalid JSON", () => {
      expect(deserializePlayerState("not json at all")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(deserializePlayerState("")).toBeNull();
    });

    it("returns null when wood is missing (not a number)", () => {
      const json = JSON.stringify({ stone: 5, displayName: "X" });
      expect(deserializePlayerState(json)).toBeNull();
    });

    it("returns null when stone is missing (not a number)", () => {
      const json = JSON.stringify({ wood: 5, displayName: "X" });
      expect(deserializePlayerState(json)).toBeNull();
    });

    it("defaults displayName to empty string when missing", () => {
      const json = JSON.stringify({ wood: 10, stone: 5 });
      const result = deserializePlayerState(json);
      expect(result).not.toBeNull();
      expect(result!.displayName).toBe("");
    });

    it("defaults score to 0 when missing", () => {
      const json = JSON.stringify({ wood: 10, stone: 5 });
      const result = deserializePlayerState(json);
      expect(result).not.toBeNull();
      expect(result!.score).toBe(0);
    });

    it("defaults level to 1 when missing", () => {
      const json = JSON.stringify({ wood: 10, stone: 5 });
      const result = deserializePlayerState(json);
      expect(result).not.toBeNull();
      expect(result!.level).toBe(1);
    });

    it("defaults xp to 0 when missing", () => {
      const json = JSON.stringify({ wood: 10, stone: 5 });
      const result = deserializePlayerState(json);
      expect(result).not.toBeNull();
      expect(result!.xp).toBe(0);
    });

    it("rejects array input", () => {
      expect(deserializePlayerState("[]")).toBeNull();
    });

    it("rejects numeric input", () => {
      expect(deserializePlayerState("42")).toBeNull();
    });

    it("rejects null JSON", () => {
      expect(deserializePlayerState("null")).toBeNull();
    });
  });
});
