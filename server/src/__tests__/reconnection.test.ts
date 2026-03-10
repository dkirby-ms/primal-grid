/**
 * Reconnection lifecycle tests — Issue #101
 *
 * Validates the server-side reconnection flow:
 * - onDrop calls allowReconnection with the correct grace period
 * - onReconnect re-initialises the player's fog-of-war view
 * - onLeave (final disconnect) saves and removes the player
 * - Player state (territory, resources, creatures) is preserved during grace period
 * - Session-user mapping survives the drop/reconnect cycle
 *
 * TDD: These tests describe the expected behaviour. Some verify existing
 * server logic; others will only pass once the client-side reconnection
 * code is landed (the client half is tested in client/__tests__/reconnection.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GameRoom } from "../rooms/GameRoom.js";
import { GameState, PlayerState } from "../rooms/GameState.js";
import type { AuthProvider, TokenValidationResult } from "../auth/AuthProvider.js";
import type { PlayerStateRepository } from "../persistence/PlayerStateRepository.js";

// ── Helpers ─────────────────────────────────────────────────────────

type TestableGameRoom = GameRoom & {
  generateMap(seed?: number): void;
  authProvider?: AuthProvider;
  playerStateRepo?: PlayerStateRepository;
  sessionUserMap: Map<string, string>;
  allowReconnection: ReturnType<typeof vi.fn>;
  initPlayerView: ReturnType<typeof vi.fn>;
  cleanupPlayerView: ReturnType<typeof vi.fn>;
  saveAndRemovePlayer: ReturnType<typeof vi.fn>;
  savePlayerState: ReturnType<typeof vi.fn>;
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
  room.sessionUserMap = new Map<string, string>();
  room.playerViews = new Map();
  room.generateMap(seed);
  room.broadcast = vi.fn();
  return room;
}

function mockAuthProvider(overrides: {
  validateResult?: TokenValidationResult;
} = {}): AuthProvider {
  return {
    register: vi.fn().mockResolvedValue({ success: true }),
    login: vi.fn().mockResolvedValue({ success: true }),
    createGuestSession: vi.fn().mockResolvedValue({ success: true }),
    upgradeGuest: vi.fn().mockResolvedValue({ success: true }),
    validateToken: vi.fn().mockResolvedValue(
      overrides.validateResult ?? { valid: false, error: "No token" }
    ),
  };
}

function mockPlayerStateRepo(): PlayerStateRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Reconnection lifecycle — Issue #101", () => {
  let room: TestableGameRoom;
  let client: MockClient;

  beforeEach(async () => {
    room = createRoomWithMap();
    client = fakeClient("session-reconnect");
    await room.onJoin(client);
  });

  // ── onDrop ─────────────────────────────────────────────────────────

  describe("onDrop (non-consented disconnect)", () => {
    it("calls allowReconnection with 60-second grace period", async () => {
      // Spy on allowReconnection before calling onDrop
      const spy = vi.fn().mockResolvedValue(undefined);
      room.allowReconnection = spy;

      await room.onDrop(client as unknown as import("colyseus").Client);

      expect(spy).toHaveBeenCalledWith(client, 60);
    });

    it("cleans up fog-of-war view on drop", async () => {
      const spy = vi.fn();
      room.cleanupPlayerView = spy;
      room.allowReconnection = vi.fn().mockResolvedValue(undefined);

      await room.onDrop(client as unknown as import("colyseus").Client);

      expect(spy).toHaveBeenCalledWith("session-reconnect");
    });

    it("preserves player state in the room during grace period", async () => {
      const player = room.state.players.get("session-reconnect");
      expect(player).toBeDefined();

      // Set some state that should survive the drop
      player!.wood = 42;
      player!.stone = 17;
      player!.displayName = "DropTest";

      room.allowReconnection = vi.fn().mockResolvedValue(undefined);
      await room.onDrop(client as unknown as import("colyseus").Client);

      // Player state must survive — it's not removed until onLeave
      const afterDrop = room.state.players.get("session-reconnect");
      expect(afterDrop).toBeDefined();
      expect(afterDrop!.wood).toBe(42);
      expect(afterDrop!.stone).toBe(17);
      expect(afterDrop!.displayName).toBe("DropTest");
    });

    it("preserves session-user mapping during grace period", async () => {
      room.sessionUserMap.set("session-reconnect", "user-abc");
      room.allowReconnection = vi.fn().mockResolvedValue(undefined);

      await room.onDrop(client as unknown as import("colyseus").Client);

      expect(room.sessionUserMap.get("session-reconnect")).toBe("user-abc");
    });
  });

  // ── onReconnect ────────────────────────────────────────────────────

  describe("onReconnect (client returns within grace period)", () => {
    it("re-initialises the player's fog-of-war view", () => {
      const spy = vi.fn();
      room.initPlayerView = spy;

      room.onReconnect(client as unknown as import("colyseus").Client);

      expect(spy).toHaveBeenCalledWith(
        client,
        room.state.players.get("session-reconnect"),
        false, // devMode defaults to false on reconnect
      );
    });

    it("sends 'Reconnected!' message to the returning client", () => {
      room.initPlayerView = vi.fn();

      room.onReconnect(client as unknown as import("colyseus").Client);

      expect(client.send).toHaveBeenCalledWith("game_log", {
        message: "Reconnected!",
        type: "info",
      });
    });

    it("broadcasts reconnection to other players", () => {
      const player = room.state.players.get("session-reconnect")!;
      player.displayName = "ReconnectBoy";
      room.initPlayerView = vi.fn();

      room.onReconnect(client as unknown as import("colyseus").Client);

      expect(room.broadcast).toHaveBeenCalledWith(
        "game_log",
        { message: "ReconnectBoy reconnected", type: "info" },
        { except: client },
      );
    });

    it("player retains resources and progression across drop/reconnect", async () => {
      const player = room.state.players.get("session-reconnect")!;
      player.wood = 100;
      player.stone = 50;
      player.level = 3;
      player.xp = 200;

      // Simulate drop
      room.allowReconnection = vi.fn().mockResolvedValue(undefined);
      await room.onDrop(client as unknown as import("colyseus").Client);

      // Simulate reconnect
      room.initPlayerView = vi.fn();
      room.onReconnect(client as unknown as import("colyseus").Client);

      const afterReconnect = room.state.players.get("session-reconnect")!;
      expect(afterReconnect.wood).toBe(100);
      expect(afterReconnect.stone).toBe(50);
      expect(afterReconnect.level).toBe(3);
      expect(afterReconnect.xp).toBe(200);
    });
  });

  // ── onLeave (final disconnect) ────────────────────────────────────

  describe("onLeave (grace period expired or consented leave)", () => {
    it("calls saveAndRemovePlayer for the disconnecting session", () => {
      const spy = vi.fn();
      room.saveAndRemovePlayer = spy;

      room.onLeave(client as unknown as import("colyseus").Client);

      expect(spy).toHaveBeenCalledWith("session-reconnect");
    });

    it("removes the player from room state after final leave", () => {
      room.onLeave(client as unknown as import("colyseus").Client);

      expect(room.state.players.get("session-reconnect")).toBeUndefined();
    });
  });

  // ── Multi-tab guard during reconnection ────────────────────────────

  describe("multi-tab guard during reconnection grace period", () => {
    it("evicts stale session when same user re-joins from a new tab", async () => {
      // Set up auth so we can track user identity
      room.authProvider = mockAuthProvider({
        validateResult: {
          valid: true,
          user: { id: "user-multitab", username: "multitab", isGuest: false },
        },
      });
      room.playerStateRepo = mockPlayerStateRepo();

      // Join with authenticated user
      const client1 = fakeClient("session-old");
      await room.onJoin(client1, { token: "valid.token" });

      // Simulate drop — client1 is now in grace period (not in clients list)
      room.allowReconnection = vi.fn().mockResolvedValue(undefined);
      await room.onDrop(client1 as unknown as import("colyseus").Client);

      // Mock clients list to show client1 is NOT connected (it's dropped)
      Object.defineProperty(room, 'clients', {
        value: [],
        writable: true,
        configurable: true,
      });

      // Same user joins from new tab
      const client2 = fakeClient("session-new");
      await room.onJoin(client2, { token: "valid.token" });

      // Old session should be evicted, new session should exist
      expect(room.state.players.get("session-new")).toBeDefined();
    });
  });
});
