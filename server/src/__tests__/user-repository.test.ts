import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteUserRepository } from "../persistence/SqliteUserRepository.js";
import fs from "fs";
import path from "path";
import os from "os";

// ── Helpers ─────────────────────────────────────────────────────────

let repo: SqliteUserRepository;
let dbPath: string;

function freshRepo(): SqliteUserRepository {
  dbPath = path.join(os.tmpdir(), `test-users-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  return new SqliteUserRepository(dbPath);
}

// ── Setup / Teardown ────────────────────────────────────────────────

beforeEach(() => {
  repo = freshRepo();
});

afterEach(() => {
  repo.close();
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  try { fs.unlinkSync(dbPath); } catch { /* may not exist */ }
});

// ── Tests ───────────────────────────────────────────────────────────

describe("SqliteUserRepository", () => {
  describe("createUser", () => {
    it("creates a user and returns it with a generated ID", async () => {
      const user = await repo.createUser("alice", "hashed_pw", false);
      expect(user.id).toBeDefined();
      expect(user.id.length).toBeGreaterThan(0);
      expect(user.username).toBe("alice");
      expect(user.passwordHash).toBe("hashed_pw");
      expect(user.isGuest).toBe(false);
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
    });

    it("creates a guest user with isGuest=true", async () => {
      const user = await repo.createUser("guest_abc", "", true);
      expect(user.isGuest).toBe(true);
      expect(user.passwordHash).toBe("");
    });

    it("generates unique IDs for different users", async () => {
      const u1 = await repo.createUser("user1", "pw1", false);
      const u2 = await repo.createUser("user2", "pw2", false);
      expect(u1.id).not.toBe(u2.id);
    });

    it("throws on duplicate username (unique constraint)", async () => {
      await repo.createUser("dupeuser", "pw", false);
      await expect(repo.createUser("dupeuser", "pw2", false)).rejects.toThrow();
    });
  });

  describe("findById", () => {
    it("returns user when found", async () => {
      const created = await repo.createUser("bob", "pw", false);
      const found = await repo.findById(created.id);
      expect(found).not.toBeNull();
      expect(found!.username).toBe("bob");
    });

    it("returns null when ID does not exist", async () => {
      const found = await repo.findById("nonexistent-id");
      expect(found).toBeNull();
    });
  });

  describe("findByUsername", () => {
    it("returns user when found", async () => {
      await repo.createUser("charlie", "pw", false);
      const found = await repo.findByUsername("charlie");
      expect(found).not.toBeNull();
      expect(found!.username).toBe("charlie");
    });

    it("returns null when username does not exist", async () => {
      const found = await repo.findByUsername("nobody");
      expect(found).toBeNull();
    });

    it("find is case-sensitive (SQLite default)", async () => {
      await repo.createUser("CaseName", "pw", false);
      const found = await repo.findByUsername("casename");
      // SQLite text comparison is case-sensitive by default
      expect(found).toBeNull();
    });
  });

  describe("upgradeGuest", () => {
    it("upgrades a guest account to a full account", async () => {
      const guest = await repo.createUser("guest_xyz", "", true);
      expect(guest.isGuest).toBe(true);

      await repo.upgradeGuest(guest.id, "newname", "new_hash");

      const upgraded = await repo.findById(guest.id);
      expect(upgraded).not.toBeNull();
      expect(upgraded!.username).toBe("newname");
      expect(upgraded!.passwordHash).toBe("new_hash");
      expect(upgraded!.isGuest).toBe(false);
    });

    it("does not upgrade a non-guest account (is_guest = 0 guard)", async () => {
      const regular = await repo.createUser("regular", "pw", false);
      await repo.upgradeGuest(regular.id, "hacked", "hack_hash");

      const unchanged = await repo.findById(regular.id);
      expect(unchanged).not.toBeNull();
      expect(unchanged!.username).toBe("regular");
      expect(unchanged!.isGuest).toBe(false);
    });

    it("no-ops for a nonexistent ID", async () => {
      // Should not throw — just affects 0 rows
      await expect(repo.upgradeGuest("no-such-id", "name", "hash")).resolves.toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("handles empty username gracefully (stored as-is)", async () => {
      const user = await repo.createUser("", "pw", false);
      const found = await repo.findByUsername("");
      expect(found).not.toBeNull();
      expect(found!.id).toBe(user.id);
    });

    it("handles unicode username", async () => {
      const user = await repo.createUser("日本語ユーザー", "pw", false);
      const found = await repo.findByUsername("日本語ユーザー");
      expect(found).not.toBeNull();
      expect(found!.id).toBe(user.id);
    });

    it("handles very long password hash", async () => {
      const longHash = "a".repeat(500);
      const user = await repo.createUser("longhash", longHash, false);
      const found = await repo.findById(user.id);
      expect(found!.passwordHash).toBe(longHash);
    });
  });
});
