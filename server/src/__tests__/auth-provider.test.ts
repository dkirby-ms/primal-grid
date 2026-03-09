import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LocalAuthProvider } from "../auth/LocalAuthProvider.js";
import { SqliteUserRepository } from "../persistence/SqliteUserRepository.js";
import fs from "fs";
import path from "path";
import os from "os";
import jwt from "jsonwebtoken";

// ── Helpers ─────────────────────────────────────────────────────────

const JWT_SECRET = "test-secret-key-for-unit-tests";
let provider: LocalAuthProvider;
let userRepo: SqliteUserRepository;
let dbPath: string;

function freshProvider(tokenExpiry = 86400): LocalAuthProvider {
  dbPath = path.join(os.tmpdir(), `test-auth-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  userRepo = new SqliteUserRepository(dbPath);
  return new LocalAuthProvider(userRepo, JWT_SECRET, tokenExpiry);
}

interface TestJwtPayload {
  sub: string;
  username: string;
  isGuest: boolean;
  iat: number;
  exp: number;
}

function decodeToken(token: string): TestJwtPayload {
  return jwt.verify(token, JWT_SECRET) as TestJwtPayload;
}

// ── Setup / Teardown ────────────────────────────────────────────────

beforeEach(() => {
  provider = freshProvider();
});

afterEach(() => {
  userRepo.close();
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  try { fs.unlinkSync(dbPath); } catch { /* may not exist */ }
});

// ── Tests ───────────────────────────────────────────────────────────

describe("LocalAuthProvider", () => {
  // ── Registration ──────────────────────────────────────────────────

  describe("register", () => {
    it("registers a new user successfully", async () => {
      const result = await provider.register("testuser", "password123");
      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user!.username).toBe("testuser");
      expect(result.user!.isGuest).toBe(false);
    });

    it("normalizes username to lowercase", async () => {
      const result = await provider.register("TestUser", "password123");
      expect(result.success).toBe(true);
      expect(result.user!.username).toBe("testuser");
    });

    it("trims whitespace from username", async () => {
      const result = await provider.register("  spaced  ", "password123");
      expect(result.success).toBe(true);
      expect(result.user!.username).toBe("spaced");
    });

    it("rejects username shorter than 3 characters", async () => {
      const result = await provider.register("ab", "password123");
      expect(result.success).toBe(false);
      expect(result.error).toContain("3-20 characters");
    });

    it("rejects username longer than 20 characters", async () => {
      const result = await provider.register("a".repeat(21), "password123");
      expect(result.success).toBe(false);
      expect(result.error).toContain("3-20 characters");
    });

    it("accepts username of exactly 3 characters", async () => {
      const result = await provider.register("abc", "password123");
      expect(result.success).toBe(true);
    });

    it("accepts username of exactly 20 characters", async () => {
      const result = await provider.register("a".repeat(20), "password123");
      expect(result.success).toBe(true);
    });

    it("rejects password shorter than 6 characters", async () => {
      const result = await provider.register("testuser", "12345");
      expect(result.success).toBe(false);
      expect(result.error).toContain("at least 6 characters");
    });

    it("accepts password of exactly 6 characters", async () => {
      const result = await provider.register("sixpw", "123456");
      expect(result.success).toBe(true);
    });

    it("rejects duplicate username", async () => {
      await provider.register("dupeuser", "password123");
      const result = await provider.register("dupeuser", "otherpassword");
      expect(result.success).toBe(false);
      expect(result.error).toContain("already taken");
    });

    it("rejects duplicate username case-insensitively", async () => {
      await provider.register("CaseUser", "password123");
      const result = await provider.register("caseuser", "otherpassword");
      expect(result.success).toBe(false);
      expect(result.error).toContain("already taken");
    });

    it("hashes password (not stored in plaintext)", async () => {
      await provider.register("hashcheck", "mysecretpw");
      const stored = await userRepo.findByUsername("hashcheck");
      expect(stored).not.toBeNull();
      expect(stored!.passwordHash).not.toBe("mysecretpw");
      expect(stored!.passwordHash.length).toBeGreaterThan(20);
    });
  });

  // ── Login ─────────────────────────────────────────────────────────

  describe("login", () => {
    it("logs in with correct credentials", async () => {
      await provider.register("loginuser", "password123");
      const result = await provider.login("loginuser", "password123");
      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user!.username).toBe("loginuser");
      expect(result.token).toBeDefined();
      expect(result.token!.accessToken).toBeDefined();
      expect(result.token!.expiresIn).toBe(86400);
    });

    it("normalizes username for login", async () => {
      await provider.register("NormalUser", "password123");
      const result = await provider.login("  normaluser  ", "password123");
      expect(result.success).toBe(true);
    });

    it("rejects wrong password", async () => {
      await provider.register("wrongpw", "correctpw");
      const result = await provider.login("wrongpw", "incorrectpw");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid credentials");
    });

    it("rejects nonexistent username", async () => {
      const result = await provider.login("nobody", "password123");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid credentials");
    });

    it("does not reveal whether username or password was wrong", async () => {
      await provider.register("exists", "password123");
      const wrongUser = await provider.login("notexists", "password123");
      const wrongPw = await provider.login("exists", "wrongpassword");
      // Same error message for both — no username enumeration
      expect(wrongUser.error).toBe(wrongPw.error);
    });

    it("issues a valid JWT on successful login", async () => {
      await provider.register("jwttest", "password123");
      const result = await provider.login("jwttest", "password123");
      const decoded = decodeToken(result.token!.accessToken);

      expect(decoded.sub).toBe(result.user!.id);
      expect(decoded.username).toBe("jwttest");
      expect(decoded.isGuest).toBe(false);
      expect(decoded.exp - decoded.iat).toBe(86400);
    });
  });

  // ── Guest Sessions ────────────────────────────────────────────────

  describe("createGuestSession", () => {
    it("creates a guest session with token", async () => {
      const result = await provider.createGuestSession();
      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user!.isGuest).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.token!.accessToken).toBeDefined();
    });

    it("generates unique guest usernames", async () => {
      const g1 = await provider.createGuestSession();
      const g2 = await provider.createGuestSession();
      expect(g1.user!.username).not.toBe(g2.user!.username);
    });

    it("guest JWT has isGuest=true in payload", async () => {
      const result = await provider.createGuestSession();
      const decoded = decodeToken(result.token!.accessToken);
      expect(decoded.isGuest).toBe(true);
    });

    it("guest user is stored in the database", async () => {
      const result = await provider.createGuestSession();
      const stored = await userRepo.findById(result.user!.id);
      expect(stored).not.toBeNull();
      expect(stored!.isGuest).toBe(true);
    });
  });

  // ── Guest Upgrade ─────────────────────────────────────────────────

  describe("upgradeGuest", () => {
    it("upgrades a guest to a full account", async () => {
      const guest = await provider.createGuestSession();
      const result = await provider.upgradeGuest(guest.user!.id, "newname", "newpassword");

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user!.username).toBe("newname");
      expect(result.user!.isGuest).toBe(false);
    });

    it("upgraded account can log in with new credentials", async () => {
      const guest = await provider.createGuestSession();
      await provider.upgradeGuest(guest.user!.id, "upgraded", "mypassword");

      const login = await provider.login("upgraded", "mypassword");
      expect(login.success).toBe(true);
      expect(login.user!.isGuest).toBe(false);
    });

    it("rejects upgrade with short username", async () => {
      const guest = await provider.createGuestSession();
      const result = await provider.upgradeGuest(guest.user!.id, "ab", "password123");
      expect(result.success).toBe(false);
      expect(result.error).toContain("3-20 characters");
    });

    it("rejects upgrade with short password", async () => {
      const guest = await provider.createGuestSession();
      const result = await provider.upgradeGuest(guest.user!.id, "validname", "12345");
      expect(result.success).toBe(false);
      expect(result.error).toContain("at least 6 characters");
    });

    it("rejects upgrade if username is already taken", async () => {
      await provider.register("takenname", "password123");
      const guest = await provider.createGuestSession();
      const result = await provider.upgradeGuest(guest.user!.id, "takenname", "password123");
      expect(result.success).toBe(false);
      expect(result.error).toContain("already taken");
    });

    it("rejects upgrade for nonexistent guest ID", async () => {
      const result = await provider.upgradeGuest("fake-id", "newname", "password123");
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("rejects upgrade for non-guest account", async () => {
      await provider.register("regular", "password123");
      const user = await userRepo.findByUsername("regular");
      const result = await provider.upgradeGuest(user!.id, "newname", "password123");
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  // ── Token Validation ──────────────────────────────────────────────

  describe("validateToken", () => {
    it("validates a freshly-issued token", async () => {
      await provider.register("tokenuser", "password123");
      const login = await provider.login("tokenuser", "password123");
      const result = await provider.validateToken(login.token!.accessToken);

      expect(result.valid).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user!.username).toBe("tokenuser");
      expect(result.user!.isGuest).toBe(false);
    });

    it("rejects a tampered token", async () => {
      await provider.register("tampered", "password123");
      const login = await provider.login("tampered", "password123");
      const tampered = login.token!.accessToken + "tampered";
      const result = await provider.validateToken(tampered);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("rejects a token signed with a different secret", async () => {
      const payload = { sub: "fake-id", username: "fake", isGuest: false };
      const wrongToken = jwt.sign(payload, "wrong-secret", { expiresIn: 3600 });
      const result = await provider.validateToken(wrongToken);

      expect(result.valid).toBe(false);
    });

    it("rejects an expired token", async () => {
      // Create provider with 1-second expiry
      const shortProvider = freshProvider(1);
      await shortProvider.register("expiring", "password123");
      const login = await shortProvider.login("expiring", "password123");

      // Wait for token to expire
      await new Promise((r) => setTimeout(r, 1500));

      const result = await shortProvider.validateToken(login.token!.accessToken);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid or expired");
    });

    it("rejects completely malformed token", async () => {
      const result = await provider.validateToken("not.a.jwt");
      expect(result.valid).toBe(false);
    });

    it("rejects empty string token", async () => {
      const result = await provider.validateToken("");
      expect(result.valid).toBe(false);
    });

    it("validates guest session token", async () => {
      const guest = await provider.createGuestSession();
      const result = await provider.validateToken(guest.token!.accessToken);

      expect(result.valid).toBe(true);
      expect(result.user!.isGuest).toBe(true);
    });

    it("extracts correct user ID from token", async () => {
      await provider.register("idcheck", "password123");
      const login = await provider.login("idcheck", "password123");
      const result = await provider.validateToken(login.token!.accessToken);

      expect(result.user!.id).toBe(login.user!.id);
    });
  });

  // ── Token Expiry Configuration ────────────────────────────────────

  describe("token expiry", () => {
    it("respects custom token expiry setting", async () => {
      const customProvider = freshProvider(3600); // 1 hour
      await customProvider.register("expirytest", "password123");
      const login = await customProvider.login("expirytest", "password123");

      expect(login.token!.expiresIn).toBe(3600);
      const decoded = decodeToken(login.token!.accessToken);
      expect(decoded.exp - decoded.iat).toBe(3600);
    });
  });

  // ── Password Edge Cases ───────────────────────────────────────────

  describe("password edge cases", () => {
    it("handles very long password", async () => {
      const longPw = "p".repeat(200);
      const result = await provider.register("longpw", longPw);
      expect(result.success).toBe(true);

      const login = await provider.login("longpw", longPw);
      expect(login.success).toBe(true);
    });

    it("handles unicode password", async () => {
      const result = await provider.register("unicodepw", "パスワード123");
      expect(result.success).toBe(true);

      const login = await provider.login("unicodepw", "パスワード123");
      expect(login.success).toBe(true);
    });

    it("handles password with special characters", async () => {
      const specialPw = "p@$$w0rd!#%^&*()";
      const result = await provider.register("specialpw", specialPw);
      expect(result.success).toBe(true);

      const login = await provider.login("specialpw", specialPw);
      expect(login.success).toBe(true);
    });

    it("distinguishes between similar passwords", async () => {
      await provider.register("similarpw", "password1");
      const result = await provider.login("similarpw", "password2");
      expect(result.success).toBe(false);
    });
  });

  // ── Security: Credential Safety ───────────────────────────────────

  describe("security", () => {
    it("register result does not leak password hash", async () => {
      const result = await provider.register("secureuser", "password123");
      const resultStr = JSON.stringify(result);
      expect(resultStr).not.toContain("password123");
    });

    it("login result does not leak password hash", async () => {
      await provider.register("securelogin", "password123");
      const result = await provider.login("securelogin", "password123");
      const resultStr = JSON.stringify(result);
      expect(resultStr).not.toContain("password123");
    });

    it("failed login does not reveal whether user exists", async () => {
      const noUser = await provider.login("nonexistent", "password123");
      await provider.register("existing", "password123");
      const wrongPw = await provider.login("existing", "wrongpassword");
      expect(noUser.error).toBe(wrongPw.error);
    });
  });
});
