import { describe, it, expect, vi } from "vitest";
import { GameState, PlayerState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { SET_NAME } from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

interface MockClient {
  sessionId: string;
  send: (...args: unknown[]) => void;
}

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

function joinPlayer(room: GameRoom, sessionId: string) {
  const client = fakeClient(sessionId);
  room.onJoin(client);
  const player = room.state.players.get(sessionId)!;
  return { client, player };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Player Display Names", () => {
  // ── PlayerState field ───────────────────────────────────────────

  describe("PlayerState.displayName field", () => {
    it("defaults to empty string", () => {
      const player = new PlayerState();
      expect(player.displayName).toBe("");
    });

    it("can be set and read back", () => {
      const player = new PlayerState();
      player.displayName = "Rex";
      expect(player.displayName).toBe("Rex");
    });
  });

  // ── set_name message handler ────────────────────────────────────

  describe("set_name handler", () => {
    it("accepts a valid name and stores it on PlayerState", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");

      room.handleSetName(client, { name: "DinoTamer" });
      expect(player.displayName).toBe("DinoTamer");
    });

    it("rejects empty string — displayName stays unchanged", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");
      player.displayName = "OldName";

      room.handleSetName(client, { name: "" });
      expect(player.displayName).toBe("OldName");
    });

    it("rejects whitespace-only string — displayName stays unchanged", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");
      player.displayName = "OldName";

      room.handleSetName(client, { name: "   " });
      expect(player.displayName).toBe("OldName");
    });

    it("truncates name over 20 characters to 20", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");

      const longName = "A".repeat(25);
      room.handleSetName(client, { name: longName });
      expect(player.displayName).toBe("A".repeat(20));
      expect(player.displayName.length).toBe(20);
    });

    it("trims leading and trailing whitespace", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");

      room.handleSetName(client, { name: "  RaptorKing  " });
      expect(player.displayName).toBe("RaptorKing");
    });

    it("allows exactly 20 characters without truncation", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");

      const exactName = "X".repeat(20);
      room.handleSetName(client, { name: exactName });
      expect(player.displayName).toBe(exactName);
    });

    it("multiple set_name calls update the name each time", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");

      room.handleSetName(client, { name: "First" });
      expect(player.displayName).toBe("First");

      room.handleSetName(client, { name: "Second" });
      expect(player.displayName).toBe("Second");

      room.handleSetName(client, { name: "Third" });
      expect(player.displayName).toBe("Third");
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────

  describe("edge cases", () => {
    it("accepts name with emoji characters", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");

      room.handleSetName(client, { name: "🦖Dino🦕" });
      expect(player.displayName).toBe("🦖Dino🦕");
    });

    it("accepts name with unicode characters", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");

      room.handleSetName(client, { name: "Ñoño" });
      expect(player.displayName).toBe("Ñoño");
    });

    it("rejects name that is only spaces (tab + spaces)", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");
      player.displayName = "Keeper";

      room.handleSetName(client, { name: "\t   " });
      expect(player.displayName).toBe("Keeper");
    });

    it("trims then truncates — whitespace doesn't count toward 20 char limit", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");

      // 18 chars + padding spaces = should trim first, then no truncation needed
      const name = "  AbcDefGhiJklMnop  ";
      room.handleSetName(client, { name });
      expect(player.displayName).toBe("AbcDefGhiJklMnop");
    });

    it("name with interior spaces is preserved", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");

      room.handleSetName(client, { name: "Rex The Great" });
      expect(player.displayName).toBe("Rex The Great");
    });
  });

  // ── SET_NAME constant ───────────────────────────────────────────

  describe("SET_NAME message constant", () => {
    it("is exported and equals 'set_name'", () => {
      expect(SET_NAME).toBe("set_name");
    });
  });
});
