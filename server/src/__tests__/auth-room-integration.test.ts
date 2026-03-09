import { describe, it, expect, vi } from "vitest";
import { GameRoom } from "../rooms/GameRoom.js";
import { GameState, PlayerState } from "../rooms/GameState.js";
import type { AuthProvider, LoginResult, TokenValidationResult } from "../auth/AuthProvider.js";
import type { PlayerStateRepository, SavedPlayerState } from "../persistence/PlayerStateRepository.js";
import { serializePlayerState } from "../persistence/playerStateSerde.js";

// ── Helpers ─────────────────────────────────────────────────────────

type TestableGameRoom = GameRoom & {
  generateMap(seed?: number): void;
  authProvider?: AuthProvider;
  playerStateRepo?: PlayerStateRepository;
  sessionUserMap: Map<string, string>;
};

interface MockClient {
  sessionId: string;
  send: ReturnType<typeof vi.fn>;
  view?: unknown;
}

function fakeClient(sessionId: string): MockClient {
  return { sessionId, send: vi.fn() };
}

function createRoomWithMap(seed = 42): TestableGameRoom {
  const room = Object.create(GameRoom.prototype) as TestableGameRoom;
  room.state = new GameState();
  // Initialize private fields that Object.create skips
  room.sessionUserMap = new Map<string, string>();
  room.playerViews = new Map();
  room.generateMap(seed);
  room.broadcast = vi.fn();
  return room;
}

function mockAuthProvider(overrides: {
  validateResult?: TokenValidationResult;
  loginResult?: LoginResult;
} = {}): AuthProvider {
  return {
    register: vi.fn().mockResolvedValue({ success: true }),
    login: vi.fn().mockResolvedValue(overrides.loginResult ?? { success: true }),
    createGuestSession: vi.fn().mockResolvedValue({ success: true }),
    upgradeGuest: vi.fn().mockResolvedValue({ success: true }),
    validateToken: vi.fn().mockResolvedValue(
      overrides.validateResult ?? { valid: false, error: "No token" }
    ),
  };
}

function mockPlayerStateRepo(savedState: SavedPlayerState | null = null): PlayerStateRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(savedState),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("GameRoom Auth Integration", () => {
  // ── onJoin without auth ───────────────────────────────────────────

  describe("onJoin without auth configured", () => {
    it("player joins without auth — no crash, no user mapping", async () => {
      const room = createRoomWithMap();
      const client = fakeClient("anon-1");

      await room.onJoin(client);

      const player = room.state.players.get("anon-1");
      expect(player).toBeDefined();
      expect(player!.id).toBe("anon-1");
    });

    it("player joins with token but no authProvider — token is ignored", async () => {
      const room = createRoomWithMap();
      const client = fakeClient("anon-2");

      await room.onJoin(client, { token: "some.jwt.token" });

      expect(room.state.players.get("anon-2")).toBeDefined();
    });
  });

  // ── onJoin with auth ──────────────────────────────────────────────

  describe("onJoin with auth configured", () => {
    it("validates token and creates player on successful auth", async () => {
      const room = createRoomWithMap();
      room.authProvider = mockAuthProvider({
        validateResult: {
          valid: true,
          user: { id: "user-abc", username: "alice", isGuest: false },
        },
      });
      room.playerStateRepo = mockPlayerStateRepo();

      const client = fakeClient("session-1");
      await room.onJoin(client, { token: "valid.jwt.token" });

      expect(room.authProvider.validateToken).toHaveBeenCalledWith("valid.jwt.token");
      expect(room.state.players.get("session-1")).toBeDefined();
    });

    it("player joins even with invalid token (unauthenticated)", async () => {
      const room = createRoomWithMap();
      room.authProvider = mockAuthProvider({
        validateResult: { valid: false, error: "Expired" },
      });

      const client = fakeClient("session-2");
      await room.onJoin(client, { token: "bad.token" });

      expect(room.state.players.get("session-2")).toBeDefined();
    });

    it("player joins without token when auth is configured", async () => {
      const room = createRoomWithMap();
      room.authProvider = mockAuthProvider();

      const client = fakeClient("session-3");
      await room.onJoin(client);

      expect(room.state.players.get("session-3")).toBeDefined();
      expect(room.authProvider.validateToken).not.toHaveBeenCalled();
    });
  });

  // ── State Restoration ─────────────────────────────────────────────

  describe("state restoration on join", () => {
    it("restores saved player state on authenticated join", async () => {
      const savedPlayer = new PlayerState();
      savedPlayer.displayName = "SavedRex";
      savedPlayer.score = 500;
      savedPlayer.level = 5;
      savedPlayer.xp = 250;
      savedPlayer.wood = 99;
      savedPlayer.stone = 88;
      const serialized = serializePlayerState(savedPlayer);

      const room = createRoomWithMap();
      room.authProvider = mockAuthProvider({
        validateResult: {
          valid: true,
          user: { id: "user-restore", username: "rex", isGuest: false },
        },
      });
      room.playerStateRepo = mockPlayerStateRepo({
        userId: "user-restore",
        displayName: "SavedRex",
        gameState: serialized,
        savedAt: new Date().toISOString(),
      });

      const client = fakeClient("session-restore");
      await room.onJoin(client, { token: "valid.token" });

      const player = room.state.players.get("session-restore")!;
      expect(player.displayName).toBe("SavedRex");
      // Score includes restored value + HQ territory tiles claimed on join
      expect(player.score).toBeGreaterThanOrEqual(500);
      expect(player.level).toBe(5);
      expect(player.xp).toBe(250);
    });

    it("creates fresh player when no saved state exists", async () => {
      const room = createRoomWithMap();
      room.authProvider = mockAuthProvider({
        validateResult: {
          valid: true,
          user: { id: "user-fresh", username: "newbie", isGuest: false },
        },
      });
      room.playerStateRepo = mockPlayerStateRepo(null);

      const client = fakeClient("session-fresh");
      await room.onJoin(client, { token: "valid.token" });

      const player = room.state.players.get("session-fresh")!;
      expect(player.displayName).toBe("");
      expect(player.level).toBe(1);
    });

    it("handles corrupt saved gameState gracefully", async () => {
      const room = createRoomWithMap();
      room.authProvider = mockAuthProvider({
        validateResult: {
          valid: true,
          user: { id: "user-corrupt", username: "corrupt", isGuest: false },
        },
      });
      room.playerStateRepo = mockPlayerStateRepo({
        userId: "user-corrupt",
        displayName: "Corrupt",
        gameState: "not valid json {{{",
        savedAt: new Date().toISOString(),
      });

      const client = fakeClient("session-corrupt");
      // Should not throw — falls back to fresh player
      await expect(room.onJoin(client, { token: "valid.token" })).resolves.toBeUndefined();
      expect(room.state.players.get("session-corrupt")).toBeDefined();
    });
  });

  // ── onLeave with persistence ──────────────────────────────────────

  describe("onLeave with persistence", () => {
    it("saves player state on disconnect for authenticated users", async () => {
      const room = createRoomWithMap();
      const authProvider = mockAuthProvider({
        validateResult: {
          valid: true,
          user: { id: "user-save", username: "saver", isGuest: false },
        },
      });
      const repo = mockPlayerStateRepo();
      room.authProvider = authProvider;
      room.playerStateRepo = repo;

      const client = fakeClient("session-save");
      await room.onJoin(client, { token: "valid.token" });

      // Give the player some resources
      const player = room.state.players.get("session-save")!;
      player.wood = 100;
      player.stone = 50;
      player.displayName = "SaveMe";

      room.onLeave(client, 1000);

      // save is called asynchronously
      expect(repo.save).toHaveBeenCalledWith(
        "user-save",
        "SaveMe",
        expect.any(String)
      );
    });

    it("does not save for unauthenticated players", async () => {
      const room = createRoomWithMap();
      const repo = mockPlayerStateRepo();
      room.playerStateRepo = repo;

      const client = fakeClient("anon-leave");
      await room.onJoin(client);

      room.onLeave(client, 1000);

      expect(repo.save).not.toHaveBeenCalled();
    });

    it("removes player from state on leave", async () => {
      const room = createRoomWithMap();
      room.authProvider = mockAuthProvider({
        validateResult: {
          valid: true,
          user: { id: "user-gone", username: "leaver", isGuest: false },
        },
      });
      room.playerStateRepo = mockPlayerStateRepo();

      const client = fakeClient("session-gone");
      await room.onJoin(client, { token: "valid.token" });
      expect(room.state.players.get("session-gone")).toBeDefined();

      room.onLeave(client, 1000);
      expect(room.state.players.get("session-gone")).toBeUndefined();
    });
  });

  // ── Multiple Players ──────────────────────────────────────────────

  describe("multiple players with auth", () => {
    it("handles mix of authenticated and anonymous players", async () => {
      const room = createRoomWithMap();
      room.authProvider = mockAuthProvider({
        validateResult: {
          valid: true,
          user: { id: "user-auth", username: "authed", isGuest: false },
        },
      });
      room.playerStateRepo = mockPlayerStateRepo();

      const authClient = fakeClient("auth-session");
      const anonClient = fakeClient("anon-session");

      await room.onJoin(authClient, { token: "valid.token" });
      await room.onJoin(anonClient); // no token

      expect(room.state.players.size).toBe(2);
      expect(room.state.players.get("auth-session")).toBeDefined();
      expect(room.state.players.get("anon-session")).toBeDefined();
    });

    it("only saves authenticated player on leave, not anonymous", async () => {
      const room = createRoomWithMap();
      room.authProvider = mockAuthProvider({
        validateResult: {
          valid: true,
          user: { id: "user-only", username: "onlyme", isGuest: false },
        },
      });
      const repo = mockPlayerStateRepo();
      room.playerStateRepo = repo;

      const authClient = fakeClient("auth-client");
      const anonClient = fakeClient("anon-client");

      await room.onJoin(authClient, { token: "valid.token" });
      await room.onJoin(anonClient);

      room.onLeave(anonClient, 1000);
      expect(repo.save).not.toHaveBeenCalled();

      room.onLeave(authClient, 1000);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });
  });

  // ── Guest Players ─────────────────────────────────────────────────

  describe("guest player auth", () => {
    it("guest token is validated and state is saved on leave", async () => {
      const room = createRoomWithMap();
      room.authProvider = mockAuthProvider({
        validateResult: {
          valid: true,
          user: { id: "guest-123", username: "Guest_abc", isGuest: true },
        },
      });
      const repo = mockPlayerStateRepo();
      room.playerStateRepo = repo;

      const client = fakeClient("guest-session");
      await room.onJoin(client, { token: "guest.token" });

      const player = room.state.players.get("guest-session")!;
      player.displayName = "GuestPlayer";

      room.onLeave(client, 1000);

      expect(repo.save).toHaveBeenCalledWith(
        "guest-123",
        "GuestPlayer",
        expect.any(String)
      );
    });
  });
});
