import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqlitePlayerStateRepository } from "../persistence/SqlitePlayerStateRepository.js";
import fs from "fs";
import path from "path";
import os from "os";

// ── Helpers ─────────────────────────────────────────────────────────

let repo: SqlitePlayerStateRepository;
let dbPath: string;

function freshRepo(): SqlitePlayerStateRepository {
  dbPath = path.join(os.tmpdir(), `test-pstate-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  return new SqlitePlayerStateRepository(dbPath);
}

// ── Setup / Teardown ────────────────────────────────────────────────

beforeEach(() => {
  repo = freshRepo();
});

afterEach(() => {
  repo.close();
  try { fs.unlinkSync(dbPath); } catch { /* may not exist */ }
});

// ── Tests ───────────────────────────────────────────────────────────

describe("SqlitePlayerStateRepository", () => {
  describe("save + load", () => {
    it("saves and loads player state", async () => {
      const gameState = JSON.stringify({ wood: 50, stone: 30, score: 100 });
      await repo.save("user-1", "Rex", gameState);

      const loaded = await repo.load("user-1");
      expect(loaded).not.toBeNull();
      expect(loaded!.userId).toBe("user-1");
      expect(loaded!.displayName).toBe("Rex");
      expect(loaded!.gameState).toBe(gameState);
      expect(loaded!.savedAt).toBeDefined();
    });

    it("returns null for nonexistent user", async () => {
      const loaded = await repo.load("no-such-user");
      expect(loaded).toBeNull();
    });

    it("upserts — second save overwrites first", async () => {
      await repo.save("user-1", "OldName", '{"wood":10,"stone":5}');
      await repo.save("user-1", "NewName", '{"wood":99,"stone":88}');

      const loaded = await repo.load("user-1");
      expect(loaded).not.toBeNull();
      expect(loaded!.displayName).toBe("NewName");
      expect(loaded!.gameState).toBe('{"wood":99,"stone":88}');
    });

    it("updates savedAt on upsert", async () => {
      await repo.save("user-1", "Name", '{"wood":1,"stone":1}');
      const first = await repo.load("user-1");

      // Small delay to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 10));

      await repo.save("user-1", "Name", '{"wood":2,"stone":2}');
      const second = await repo.load("user-1");

      expect(first!.savedAt).not.toBe(second!.savedAt);
    });
  });

  describe("delete", () => {
    it("removes saved state", async () => {
      await repo.save("user-del", "Del", '{"wood":1,"stone":1}');
      expect(await repo.load("user-del")).not.toBeNull();

      await repo.delete("user-del");
      expect(await repo.load("user-del")).toBeNull();
    });

    it("no-ops for nonexistent user", async () => {
      await expect(repo.delete("no-user")).resolves.toBeUndefined();
    });
  });

  describe("multiple users", () => {
    it("stores state independently per user", async () => {
      await repo.save("user-a", "Alice", '{"wood":10,"stone":10}');
      await repo.save("user-b", "Bob", '{"wood":99,"stone":99}');

      const alice = await repo.load("user-a");
      const bob = await repo.load("user-b");

      expect(alice!.displayName).toBe("Alice");
      expect(bob!.displayName).toBe("Bob");
      expect(alice!.gameState).not.toBe(bob!.gameState);
    });

    it("deleting one user does not affect another", async () => {
      await repo.save("user-x", "X", '{"wood":1,"stone":1}');
      await repo.save("user-y", "Y", '{"wood":2,"stone":2}');

      await repo.delete("user-x");

      expect(await repo.load("user-x")).toBeNull();
      expect(await repo.load("user-y")).not.toBeNull();
    });
  });

  describe("edge cases", () => {
    it("handles empty gameState JSON", async () => {
      await repo.save("empty-state", "Empty", "{}");
      const loaded = await repo.load("empty-state");
      expect(loaded!.gameState).toBe("{}");
    });

    it("handles large gameState payload", async () => {
      const largeState = JSON.stringify({ data: "x".repeat(10000) });
      await repo.save("big-state", "Big", largeState);
      const loaded = await repo.load("big-state");
      expect(loaded!.gameState).toBe(largeState);
    });

    it("handles unicode display name", async () => {
      await repo.save("unicode-user", "🦖Rex🦕", '{"wood":1,"stone":1}');
      const loaded = await repo.load("unicode-user");
      expect(loaded!.displayName).toBe("🦖Rex🦕");
    });
  });
});
