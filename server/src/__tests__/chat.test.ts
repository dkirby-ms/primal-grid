import { describe, it, expect, vi, beforeEach } from "vitest";
import { GameState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { CHAT, CHAT_MAX_LENGTH } from "@primal-grid/shared";
import type { ChatPayload, ChatBroadcastPayload } from "@primal-grid/shared";

// ── Test types ──────────────────────────────────────────────────────

interface MockClient {
  sessionId: string;
  send: ReturnType<typeof vi.fn>;
}

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): GameRoom {
  const room = Object.create(GameRoom.prototype) as GameRoom;
  room.state = new GameState();
  room.generateMap(seed);
  room.broadcast = vi.fn();
  return room;
}

function fakeClient(sessionId: string): MockClient {
  return { sessionId, send: vi.fn() };
}

function joinPlayer(room: GameRoom, sessionId: string, displayName?: string) {
  const client = fakeClient(sessionId);
  room.onJoin(client);
  const player = room.state.players.get(sessionId)!;
  if (displayName) player.displayName = displayName;
  return { client, player };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Chat message handler", () => {
  let room: GameRoom;

  beforeEach(() => {
    room = createRoomWithMap(42);
  });

  // ── 1. Valid message broadcast ──────────────────────────────────

  describe("valid message broadcast", () => {
    it("broadcasts a valid chat message to all clients", () => {
      const { client } = joinPlayer(room, "p1", "DinoTamer");

      room.handleChat(client, { text: "Hello everyone!" });

      expect(room.broadcast).toHaveBeenCalledOnce();
      expect(room.broadcast).toHaveBeenCalledWith(
        CHAT,
        expect.objectContaining({
          sender: "DinoTamer",
          text: "Hello everyone!",
        }),
      );
    });

    it("broadcasts to all clients when multiple players are in the room", () => {
      joinPlayer(room, "p1", "Alice");
      const { client: client2 } = joinPlayer(room, "p2", "Bob");

      room.handleChat(client2, { text: "Hey Alice!" });

      expect(room.broadcast).toHaveBeenCalledWith(
        CHAT,
        expect.objectContaining({
          sender: "Bob",
          text: "Hey Alice!",
        }),
      );
    });
  });

  // ── 2. Empty text rejection ────────────────────────────────────

  describe("empty text rejection", () => {
    it("does not broadcast an empty string", () => {
      const { client } = joinPlayer(room, "p1", "DinoTamer");

      room.handleChat(client, { text: "" });

      expect(room.broadcast).not.toHaveBeenCalled();
    });

    it("does not broadcast whitespace-only text", () => {
      const { client } = joinPlayer(room, "p1", "DinoTamer");

      room.handleChat(client, { text: "   " });

      expect(room.broadcast).not.toHaveBeenCalled();
    });

    it("does not broadcast when text is not a string", () => {
      const { client } = joinPlayer(room, "p1", "DinoTamer");

      room.handleChat(client, { text: 123 as unknown as string });

      expect(room.broadcast).not.toHaveBeenCalled();
    });

    it("ignores messages from unknown clients (no player in state)", () => {
      const ghost = fakeClient("unknown-session");

      room.handleChat(ghost, { text: "Hello?" });

      expect(room.broadcast).not.toHaveBeenCalled();
    });
  });

  // ── 3. Max length enforcement ──────────────────────────────────

  describe("max length enforcement", () => {
    it("allows messages at exactly the max length", () => {
      const { client } = joinPlayer(room, "p1", "DinoTamer");
      const maxText = "a".repeat(CHAT_MAX_LENGTH);

      room.handleChat(client, { text: maxText });

      expect(room.broadcast).toHaveBeenCalledOnce();
      const payload = (room.broadcast as ReturnType<typeof vi.fn>).mock
        .calls[0][1] as ChatBroadcastPayload;
      expect(payload.text).toHaveLength(CHAT_MAX_LENGTH);
    });

    it("truncates messages exceeding the max length", () => {
      const { client } = joinPlayer(room, "p1", "DinoTamer");
      const longText = "x".repeat(CHAT_MAX_LENGTH + 50);

      room.handleChat(client, { text: longText });

      expect(room.broadcast).toHaveBeenCalledOnce();
      const payload = (room.broadcast as ReturnType<typeof vi.fn>).mock
        .calls[0][1] as ChatBroadcastPayload;
      expect(payload.text).toHaveLength(CHAT_MAX_LENGTH);
      expect(payload.text).toBe("x".repeat(CHAT_MAX_LENGTH));
    });

    it("CHAT_MAX_LENGTH constant equals 200", () => {
      expect(CHAT_MAX_LENGTH).toBe(200);
    });
  });

  // ── 4. HTML sanitization ───────────────────────────────────────

  describe("HTML tag stripping", () => {
    it("strips simple HTML tags from the message", () => {
      const { client } = joinPlayer(room, "p1", "DinoTamer");

      room.handleChat(client, { text: "<b>bold</b> text" });

      const payload = (room.broadcast as ReturnType<typeof vi.fn>).mock
        .calls[0][1] as ChatBroadcastPayload;
      expect(payload.text).toBe("bold text");
    });

    it("strips script tags", () => {
      const { client } = joinPlayer(room, "p1", "DinoTamer");

      room.handleChat(client, {
        text: '<script>alert("xss")</script>hello',
      });

      const payload = (room.broadcast as ReturnType<typeof vi.fn>).mock
        .calls[0][1] as ChatBroadcastPayload;
      expect(payload.text).toBe('alert("xss")hello');
    });

    it("strips nested/multiple HTML tags", () => {
      const { client } = joinPlayer(room, "p1", "DinoTamer");

      room.handleChat(client, {
        text: "<div><span>nested</span></div>",
      });

      const payload = (room.broadcast as ReturnType<typeof vi.fn>).mock
        .calls[0][1] as ChatBroadcastPayload;
      expect(payload.text).toBe("nested");
    });

    it("rejects messages that become empty after HTML stripping", () => {
      const { client } = joinPlayer(room, "p1", "DinoTamer");

      room.handleChat(client, { text: "<br><hr>" });

      expect(room.broadcast).not.toHaveBeenCalled();
    });

    it("strips self-closing tags", () => {
      const { client } = joinPlayer(room, "p1", "DinoTamer");

      room.handleChat(client, { text: "hello<br/>world" });

      const payload = (room.broadcast as ReturnType<typeof vi.fn>).mock
        .calls[0][1] as ChatBroadcastPayload;
      expect(payload.text).toBe("helloworld");
    });
  });

  // ── 5. Sender name from displayName ────────────────────────────

  describe("sender name resolution", () => {
    it("uses the player's displayName as sender", () => {
      const { client } = joinPlayer(room, "p1", "RexHunter");

      room.handleChat(client, { text: "rawr" });

      const payload = (room.broadcast as ReturnType<typeof vi.fn>).mock
        .calls[0][1] as ChatBroadcastPayload;
      expect(payload.sender).toBe("RexHunter");
    });

    it('falls back to "Unknown" when displayName is empty', () => {
      const { client } = joinPlayer(room, "p1");
      // displayName defaults to "" — no name set

      room.handleChat(client, { text: "who am I?" });

      const payload = (room.broadcast as ReturnType<typeof vi.fn>).mock
        .calls[0][1] as ChatBroadcastPayload;
      expect(payload.sender).toBe("Unknown");
    });

    it("reflects updated displayName after name change", () => {
      const { client, player } = joinPlayer(room, "p1", "OldName");
      player.displayName = "NewName";

      room.handleChat(client, { text: "name changed" });

      const payload = (room.broadcast as ReturnType<typeof vi.fn>).mock
        .calls[0][1] as ChatBroadcastPayload;
      expect(payload.sender).toBe("NewName");
    });
  });

  // ── 6. Timestamp included ─────────────────────────────────────

  describe("timestamp", () => {
    it("includes a numeric timestamp in the broadcast", () => {
      const { client } = joinPlayer(room, "p1", "DinoTamer");

      room.handleChat(client, { text: "time check" });

      const payload = (room.broadcast as ReturnType<typeof vi.fn>).mock
        .calls[0][1] as ChatBroadcastPayload;
      expect(payload.timestamp).toBeTypeOf("number");
    });

    it("timestamp is close to Date.now()", () => {
      const { client } = joinPlayer(room, "p1", "DinoTamer");
      const before = Date.now();

      room.handleChat(client, { text: "timing" });

      const after = Date.now();
      const payload = (room.broadcast as ReturnType<typeof vi.fn>).mock
        .calls[0][1] as ChatBroadcastPayload;
      expect(payload.timestamp).toBeGreaterThanOrEqual(before);
      expect(payload.timestamp).toBeLessThanOrEqual(after);
    });
  });
});
