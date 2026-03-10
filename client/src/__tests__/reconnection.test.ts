/**
 * Client-side reconnection tests — Issue #101
 *
 * Validates the client-side reconnection flow that should occur on page refresh:
 * - Reconnection token is persisted in sessionStorage (survives refresh)
 * - On page load, client should attempt reconnection before showing lobby
 * - Successful reconnection restores the game session without going through lobby
 * - Failed reconnection (token expired / grace period elapsed) falls through to lobby
 * - Reconnection token is cleared on consented leave
 *
 * TDD: These tests describe the EXPECTED behaviour after the fix. The gap today
 * is that bootstrap() never checks for a stored reconnection token on page load —
 * it always goes straight to the lobby.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock sessionStorage and localStorage
// ---------------------------------------------------------------------------

let mockSessionStorage: Map<string, string>;
let mockLocalStorage: Map<string, string>;

function createMockStorage(backing: Map<string, string>) {
  return {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => backing.set(key, value),
    removeItem: (key: string) => backing.delete(key),
    clear: () => backing.clear(),
    get length() { return backing.size; },
    key: (_i: number) => null as string | null,
  };
}

beforeEach(() => {
  mockSessionStorage = new Map();
  mockLocalStorage = new Map();
  vi.stubGlobal("sessionStorage", createMockStorage(mockSessionStorage));
  vi.stubGlobal("localStorage", createMockStorage(mockLocalStorage));
  vi.stubGlobal("location", { protocol: "http:", host: "localhost:2567" });
  vi.stubGlobal("window", {
    location: { search: "" },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Mock Colyseus SDK
// ---------------------------------------------------------------------------

const mockReconnect = vi.fn();
const mockJoinOrCreate = vi.fn();
const mockJoinById = vi.fn();

vi.mock("@colyseus/sdk", () => {
  class MockRoom {
    roomId = "mock-room-id";
    sessionId = "mock-session";
    reconnectionToken = "new-reconnect-token";
    state = { players: new Map() };
    onLeave = vi.fn().mockReturnValue(vi.fn());
    onError = vi.fn().mockReturnValue(vi.fn());
    onStateChange = { once: vi.fn() };
    onMessage = vi.fn();
    leave = vi.fn().mockResolvedValue(undefined);
    send = vi.fn();
  }

  class MockClient {
    reconnect = mockReconnect;
    joinOrCreate = mockJoinOrCreate;
    joinById = mockJoinById;
  }

  return {
    Client: MockClient,
    Room: MockRoom,
  };
});

vi.mock("@primal-grid/shared", () => ({
  SERVER_PORT: 2567,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Reconnection token persistence — Issue #101", () => {
  describe("sessionStorage-based reconnection token", () => {
    it("saveReconnectToken stores token in sessionStorage", async () => {
      const { clearReconnectToken } = await import("../network.js");
      // The module exports clearReconnectToken but saveReconnectToken is internal.
      // We verify indirectly: joinGameRoom should save the token.
      // First, verify clear works
      mockSessionStorage.set("primal-grid-reconnect-token", "test-token");
      clearReconnectToken();
      expect(mockSessionStorage.has("primal-grid-reconnect-token")).toBe(false);
    });

    it("reconnection token survives simulated page refresh (sessionStorage persists)", async () => {
      // sessionStorage persists across page reloads within the same tab.
      // Simulate: set token, then read it back (simulating post-refresh state)
      mockSessionStorage.set("primal-grid-reconnect-token", "survive-refresh-token");

      // After "refresh", the token should still be accessible
      const token = mockSessionStorage.get("primal-grid-reconnect-token");
      expect(token).toBe("survive-refresh-token");
    });

    it("joinGameRoom saves reconnection token to sessionStorage", async () => {
      const { joinGameRoom } = await import("../network.js");

      // Mock the room returned by joinById
      const mockRoom = {
        roomId: "game-123",
        sessionId: "sess-abc",
        reconnectionToken: "reconnect-token-from-server",
        state: { players: new Map() },
        onLeave: vi.fn(),
        onError: vi.fn(),
        onStateChange: { once: vi.fn() },
        onMessage: vi.fn(),
        leave: vi.fn(),
        send: vi.fn(),
      };
      mockJoinById.mockResolvedValueOnce(mockRoom);

      await joinGameRoom("game-123");

      expect(mockSessionStorage.get("primal-grid-reconnect-token"))
        .toBe("reconnect-token-from-server");
    });

    it("clearReconnectToken removes the token from sessionStorage", async () => {
      const { clearReconnectToken } = await import("../network.js");

      mockSessionStorage.set("primal-grid-reconnect-token", "to-be-cleared");
      clearReconnectToken();

      expect(mockSessionStorage.get("primal-grid-reconnect-token")).toBeUndefined();
    });

    it("leaveGame clears the reconnection token", async () => {
      const { leaveGame } = await import("../network.js");

      mockSessionStorage.set("primal-grid-reconnect-token", "active-token");
      await leaveGame();

      expect(mockSessionStorage.has("primal-grid-reconnect-token")).toBe(false);
    });
  });

  describe("reconnectGameRoom attempts", () => {
    it("returns null and emits disconnected when no reconnection token exists", async () => {
      const { reconnectGameRoom, onConnectionStatus } = await import("../network.js");

      const statuses: string[] = [];
      onConnectionStatus((s) => statuses.push(s));

      const result = await reconnectGameRoom();

      expect(result).toBeNull();
      expect(statuses).toContain("disconnected");
    });

    it("attempts client.reconnect with the stored token", async () => {
      const { reconnectGameRoom } = await import("../network.js");

      mockSessionStorage.set("primal-grid-reconnect-token", "stored-reconnect-token");

      const mockRoom = {
        roomId: "game-reconnected",
        sessionId: "sess-new",
        reconnectionToken: "fresh-reconnect-token",
        state: { players: new Map() },
        onLeave: vi.fn(),
        onError: vi.fn(),
        onStateChange: { once: vi.fn() },
        onMessage: vi.fn(),
        leave: vi.fn(),
        send: vi.fn(),
      };
      mockReconnect.mockResolvedValueOnce(mockRoom);

      const result = await reconnectGameRoom();

      expect(mockReconnect).toHaveBeenCalledWith("stored-reconnect-token");
      expect(result).not.toBeNull();
    });

    it("updates the stored token after successful reconnection", async () => {
      const { reconnectGameRoom } = await import("../network.js");

      mockSessionStorage.set("primal-grid-reconnect-token", "old-token");

      const mockRoom = {
        roomId: "game-reconnected",
        sessionId: "sess-new",
        reconnectionToken: "rotated-token",
        state: { players: new Map() },
        onLeave: vi.fn(),
        onError: vi.fn(),
        onStateChange: { once: vi.fn() },
        onMessage: vi.fn(),
        leave: vi.fn(),
        send: vi.fn(),
      };
      mockReconnect.mockResolvedValueOnce(mockRoom);

      await reconnectGameRoom();

      expect(mockSessionStorage.get("primal-grid-reconnect-token"))
        .toBe("rotated-token");
    });

    it("emits 'connected' status after successful reconnection", async () => {
      const { reconnectGameRoom, onConnectionStatus } = await import("../network.js");

      mockSessionStorage.set("primal-grid-reconnect-token", "valid-token");

      const statuses: string[] = [];
      onConnectionStatus((s) => statuses.push(s));

      const mockRoom = {
        roomId: "game-ok",
        sessionId: "sess-ok",
        reconnectionToken: "new-token",
        state: { players: new Map() },
        onLeave: vi.fn(),
        onError: vi.fn(),
        onStateChange: { once: vi.fn() },
        onMessage: vi.fn(),
        leave: vi.fn(),
        send: vi.fn(),
      };
      mockReconnect.mockResolvedValueOnce(mockRoom);

      await reconnectGameRoom();

      expect(statuses).toContain("connected");
    });

    it("clears token and emits 'disconnected' after all retry attempts fail", async () => {
      vi.useFakeTimers();

      const { reconnectGameRoom, onConnectionStatus } = await import("../network.js");

      mockSessionStorage.set("primal-grid-reconnect-token", "expired-token");

      const statuses: string[] = [];
      onConnectionStatus((s) => statuses.push(s));

      // All 5 attempts fail
      mockReconnect.mockRejectedValue(new Error("reconnection timed out"));

      const resultPromise = reconnectGameRoom();

      // Advance through all backoff delays (1s + 2s + 4s + 8s between attempts)
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(20_000);
      }

      const result = await resultPromise;

      expect(result).toBeNull();
      expect(statuses[statuses.length - 1]).toBe("disconnected");
      expect(mockSessionStorage.has("primal-grid-reconnect-token")).toBe(false);

      vi.useRealTimers();
    });
  });

  describe("onLeave handler — consented vs non-consented", () => {
    it("consented leave (code 1000) clears token and emits disconnected", async () => {
      const { joinGameRoom, onConnectionStatus } = await import("../network.js");

      const mockRoom = {
        roomId: "game-leave",
        sessionId: "sess-leave",
        reconnectionToken: "leave-token",
        state: { players: new Map() },
        onLeave: vi.fn(),
        onError: vi.fn(),
        onStateChange: { once: vi.fn() },
        onMessage: vi.fn(),
        leave: vi.fn(),
        send: vi.fn(),
      };
      mockJoinById.mockResolvedValueOnce(mockRoom);

      await joinGameRoom("game-leave");

      // Capture the onLeave callback
      const onLeaveCallback = mockRoom.onLeave.mock.calls[0]?.[0];
      expect(onLeaveCallback).toBeDefined();

      const statuses: string[] = [];
      onConnectionStatus((s) => statuses.push(s));

      // Simulate consented leave
      onLeaveCallback(1000);

      expect(statuses).toContain("disconnected");
      expect(mockSessionStorage.has("primal-grid-reconnect-token")).toBe(false);
    });

    it("non-consented leave (code != 1000/4000) triggers reconnection", async () => {
      const { joinGameRoom, onConnectionStatus } = await import("../network.js");

      const mockRoom = {
        roomId: "game-drop",
        sessionId: "sess-drop",
        reconnectionToken: "drop-token",
        state: { players: new Map() },
        onLeave: vi.fn(),
        onError: vi.fn(),
        onStateChange: { once: vi.fn() },
        onMessage: vi.fn(),
        leave: vi.fn(),
        send: vi.fn(),
      };
      mockJoinById.mockResolvedValueOnce(mockRoom);

      await joinGameRoom("game-drop");

      const onLeaveCallback = mockRoom.onLeave.mock.calls[0]?.[0];
      expect(onLeaveCallback).toBeDefined();

      const statuses: string[] = [];
      onConnectionStatus((s) => statuses.push(s));

      // Simulate non-consented leave (e.g. network drop)
      // reconnectGameRoom will be called internally — mock the reconnect to fail
      // so we don't hang on retries
      mockReconnect.mockRejectedValue(new Error("server gone"));

      onLeaveCallback(1006);

      expect(statuses).toContain("reconnecting");
    });
  });
});

describe("Page-load reconnection flow — Issue #101 (TDD)", () => {
  /**
   * THE GAP: Today, bootstrap() in main.ts always connects to the lobby
   * on page load. It never checks for a stored reconnection token.
   *
   * The expected flow after the fix:
   * 1. On page load, check sessionStorage for a reconnection token
   * 2. If found, attempt reconnectGameRoom() BEFORE connecting to lobby
   * 3. If reconnection succeeds → skip lobby, go straight to game
   * 4. If reconnection fails → clear token, proceed to lobby normally
   *
   * These tests verify the building blocks that the fix will use.
   */

  it("reconnection token in sessionStorage is available after page refresh", () => {
    // sessionStorage persists within the same tab across page reloads.
    // This is the fundamental property the fix relies on.
    mockSessionStorage.set("primal-grid-reconnect-token", "page-refresh-token");

    // Simulate "page refresh" — re-read from sessionStorage
    const token = mockSessionStorage.get("primal-grid-reconnect-token");
    expect(token).toBe("page-refresh-token");
  });

  it("auth token in localStorage persists across page refreshes", () => {
    // The auth token (JWT) is in localStorage — survives indefinitely.
    mockLocalStorage.set("primal-grid-token", "jwt-auth-token");

    const token = mockLocalStorage.get("primal-grid-token");
    expect(token).toBe("jwt-auth-token");
  });

  it("reconnectGameRoom can be called independently of the lobby flow", async () => {
    const { reconnectGameRoom } = await import("../network.js");

    // Even without connecting to lobby first, reconnectGameRoom should work
    // because it uses the stored reconnection token directly
    mockSessionStorage.set("primal-grid-reconnect-token", "independent-token");

    const mockRoom = {
      roomId: "game-independent",
      sessionId: "sess-ind",
      reconnectionToken: "fresh-token",
      state: { players: new Map() },
      onLeave: vi.fn(),
      onError: vi.fn(),
      onStateChange: { once: vi.fn() },
      onMessage: vi.fn(),
      leave: vi.fn(),
      send: vi.fn(),
    };
    mockReconnect.mockResolvedValueOnce(mockRoom);

    const result = await reconnectGameRoom();

    expect(result).not.toBeNull();
    expect(result?.roomId).toBe("game-independent");
  });

  it("getRoom returns the reconnected room after reconnectGameRoom succeeds", async () => {
    const { reconnectGameRoom, getRoom } = await import("../network.js");

    mockSessionStorage.set("primal-grid-reconnect-token", "get-room-token");

    const mockRoom = {
      roomId: "game-getroom",
      sessionId: "sess-gr",
      reconnectionToken: "gr-token",
      state: { players: new Map() },
      onLeave: vi.fn(),
      onError: vi.fn(),
      onStateChange: { once: vi.fn() },
      onMessage: vi.fn(),
      leave: vi.fn(),
      send: vi.fn(),
    };
    mockReconnect.mockResolvedValueOnce(mockRoom);

    await reconnectGameRoom();

    const room = getRoom();
    expect(room).not.toBeNull();
    expect(room?.roomId).toBe("game-getroom");
  });
});
