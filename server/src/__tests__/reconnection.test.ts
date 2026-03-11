/**
 * Reconnection lifecycle tests for GameRoom.
 * Validates onDrop / onReconnect / onLeave behaviour and multi-tab guard.
 * Issue #101 — Browser refresh drops user session.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GameState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import type { Client } from "colyseus";

const RECONNECT_GRACE_SECONDS = 60;

interface MockClient {
  sessionId: string;
  send: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
  view?: unknown;
}

/** Properties on Colyseus Room that are mocked in tests. */
interface RoomTestInternals {
  allowReconnection: ReturnType<typeof vi.fn>;
  broadcast: ReturnType<typeof vi.fn>;
  clock: { setTimeout: (fn: () => void) => { clear: () => void } };
  authProvider?: {
    validateToken: ReturnType<typeof vi.fn>;
  };
  sessionUserMap?: Map<string, string>;
  clients?: unknown[];
}

/** Cast a mock client to the Colyseus Client type expected by Room methods. */
function asClient(mock: MockClient): Client {
  return mock as unknown as Client;
}

/** Cast a room to access internal Colyseus Room properties. */
function roomInternals(room: GameRoom): RoomTestInternals {
  return room as unknown as RoomTestInternals;
}

/** Create a GameRoom with generated map and stubbed Colyseus Room methods. */
function createRoom(): GameRoom {
  const room = Object.create(GameRoom.prototype) as GameRoom;
  room.state = new GameState();
  room.generateMap();
  const internals = roomInternals(room);
  internals.allowReconnection = vi.fn().mockResolvedValue(undefined);
  internals.broadcast = vi.fn();
  internals.clock = {
    setTimeout: (fn: () => void) => { fn(); return { clear: () => {} }; },
  };
  room.playerViews = new Map();
  return room;
}

function fakeClient(sessionId: string): MockClient {
  return { sessionId, send: vi.fn(), leave: vi.fn() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Server reconnection lifecycle (#101)", () => {
  let room: GameRoom;

  beforeEach(() => {
    room = createRoom();
  });

  // --- onDrop ---

  describe("onDrop", () => {
    it("calls allowReconnection with 60-second grace period", async () => {
      const client = fakeClient("p1");
      await room.onJoin(asClient(client));

      await room.onDrop(asClient(client));

      expect(roomInternals(room).allowReconnection).toHaveBeenCalledWith(
        client,
        RECONNECT_GRACE_SECONDS,
      );
    });

    it("preserves player state (position, resources, territory) during grace period", async () => {
      const client = fakeClient("p1");
      await room.onJoin(asClient(client));

      const before = room.state.players.get("p1")!;
      const snapshot = {
        id: before.id,
        hqX: before.hqX,
        hqY: before.hqY,
        color: before.color,
        wood: before.wood,
        stone: before.stone,
        score: before.score,
      };

      await room.onDrop(asClient(client));

      const after = room.state.players.get("p1");
      expect(after).toBeDefined();
      expect(after!.id).toBe(snapshot.id);
      expect(after!.hqX).toBe(snapshot.hqX);
      expect(after!.hqY).toBe(snapshot.hqY);
      expect(after!.color).toBe(snapshot.color);
      expect(after!.wood).toBe(snapshot.wood);
      expect(after!.stone).toBe(snapshot.stone);
      expect(after!.score).toBe(snapshot.score);
    });

    it("cleans up fog-of-war view immediately on drop", async () => {
      const client = fakeClient("p1");
      await room.onJoin(asClient(client));
      expect(room.playerViews.has("p1")).toBe(true);

      await room.onDrop(asClient(client));

      expect(room.playerViews.has("p1")).toBe(false);
    });

    it("keeps the player in the players collection (slot held)", async () => {
      const client = fakeClient("p1");
      await room.onJoin(asClient(client));

      await room.onDrop(asClient(client));

      expect(room.state.players.has("p1")).toBe(true);
      expect(room.state.players.size).toBe(1);
    });
  });

  // --- onReconnect ---

  describe("onReconnect", () => {
    it("restores fog-of-war view after reconnection", async () => {
      const client = fakeClient("p1");
      await room.onJoin(asClient(client));
      await room.onDrop(asClient(client));
      expect(room.playerViews.has("p1")).toBe(false);

      room.onReconnect(asClient(client));

      expect(room.playerViews.has("p1")).toBe(true);
    });

    it("sends 'Reconnected!' game_log to the client", async () => {
      const client = fakeClient("p1");
      await room.onJoin(asClient(client));
      await room.onDrop(asClient(client));
      client.send.mockClear();

      room.onReconnect(asClient(client));

      expect(client.send).toHaveBeenCalledWith("game_log", {
        message: "Reconnected!",
        type: "info",
      });
    });

    it("broadcasts reconnection to other players", async () => {
      const client = fakeClient("p1");
      await room.onJoin(asClient(client));
      await room.onDrop(asClient(client));

      room.onReconnect(asClient(client));

      expect(roomInternals(room).broadcast).toHaveBeenCalledWith(
        "game_log",
        expect.objectContaining({
          message: expect.stringContaining("reconnected"),
          type: "info",
        }),
        { except: client },
      );
    });

    it("player state remains intact after full drop→reconnect cycle", async () => {
      const client = fakeClient("p1");
      await room.onJoin(asClient(client));
      const originalHqX = room.state.players.get("p1")!.hqX;
      const originalHqY = room.state.players.get("p1")!.hqY;

      await room.onDrop(asClient(client));
      room.onReconnect(asClient(client));

      const player = room.state.players.get("p1");
      expect(player).toBeDefined();
      expect(player!.hqX).toBe(originalHqX);
      expect(player!.hqY).toBe(originalHqY);
    });
  });

  // --- onLeave (grace period expiry) ---

  describe("onLeave (grace period expired)", () => {
    it("removes player from state after grace period", async () => {
      const client = fakeClient("p1");
      await room.onJoin(asClient(client));
      expect(room.state.players.has("p1")).toBe(true);

      await room.onDrop(asClient(client));
      room.onLeave(asClient(client));

      expect(room.state.players.has("p1")).toBe(false);
      expect(room.state.players.size).toBe(0);
    });

    it("cleans up fog-of-war view (idempotent after onDrop)", async () => {
      const client = fakeClient("p1");
      await room.onJoin(asClient(client));
      await room.onDrop(asClient(client));

      room.onLeave(asClient(client));

      expect(room.playerViews.has("p1")).toBe(false);
    });

    it("other players unaffected when one leaves after grace period", async () => {
      const alice = fakeClient("alice");
      const bob = fakeClient("bob");
      await room.onJoin(asClient(alice));
      await room.onJoin(asClient(bob));
      expect(room.state.players.size).toBe(2);

      await room.onDrop(asClient(alice));
      room.onLeave(asClient(alice));

      expect(room.state.players.has("alice")).toBe(false);
      expect(room.state.players.has("bob")).toBe(true);
      expect(room.state.players.size).toBe(1);
    });
  });

  // --- Multi-tab guard ---

  describe("multi-tab guard during grace period", () => {
    function createAuthRoom(): GameRoom {
      const room = createRoom();
      roomInternals(room).authProvider = {
        validateToken: vi.fn().mockResolvedValue({
          valid: true,
          user: { id: "uid-1", username: "testuser" },
        }),
      };
      roomInternals(room).sessionUserMap = new Map<string, string>();
      roomInternals(room).clients = [];
      return room;
    }

    it("evicts stale session when same user joins from a new tab", async () => {
      const authRoom = createAuthRoom();

      const client1 = fakeClient("session-1");
      await authRoom.onJoin(asClient(client1), { token: "jwt-1" });
      expect(authRoom.state.players.has("session-1")).toBe(true);

      // Client drops → enters grace period
      await authRoom.onDrop(asClient(client1));
      expect(authRoom.state.players.has("session-1")).toBe(true);

      // New tab joins with same authenticated user
      const client2 = fakeClient("session-2");
      await authRoom.onJoin(asClient(client2), { token: "jwt-2" });

      // Stale session evicted, new session active
      expect(authRoom.state.players.has("session-1")).toBe(false);
      expect(authRoom.state.players.has("session-2")).toBe(true);
    });
  });
});
