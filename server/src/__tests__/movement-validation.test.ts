import { describe, it, expect } from "vitest";
import { GameState, TileState, PlayerState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { TileType, DEFAULT_MAP_SIZE } from "@primal-grid/shared";

/** Create a room-like object with generated map for movement testing. */
function createRoom(): any {
  const room = Object.create(GameRoom.prototype) as any;
  room.state = new GameState();
  room.generateMap();
  return room;
}

/** Create a fake Client. */
function fakeClient(sessionId: string): any {
  return { sessionId };
}

/** Place a player at a specific known position. */
function placePlayerAt(room: any, sessionId: string, x: number, y: number) {
  const client = fakeClient(sessionId);
  room.onJoin(client);
  const player = room.state.players.get(sessionId)!;
  player.x = x;
  player.y = y;
  return { client, player };
}

describe("Movement Validation", () => {
  describe("valid moves", () => {
    it("move to adjacent walkable tile → position updates", () => {
      const room = createRoom();
      // Place at (15, 15) — open grass area
      const { client, player } = placePlayerAt(room, "mover", 15, 15);
      expect(room.state.isWalkable(16, 15)).toBe(true);

      room.handleMove(client, { dx: 1, dy: 0 });
      expect(player.x).toBe(16);
      expect(player.y).toBe(15);
    });

    it("move left", () => {
      const room = createRoom();
      const { client, player } = placePlayerAt(room, "m", 15, 15);
      room.handleMove(client, { dx: -1, dy: 0 });
      expect(player.x).toBe(14);
      expect(player.y).toBe(15);
    });

    it("move up", () => {
      const room = createRoom();
      const { client, player } = placePlayerAt(room, "m", 15, 15);
      room.handleMove(client, { dx: 0, dy: -1 });
      expect(player.x).toBe(15);
      expect(player.y).toBe(14);
    });

    it("move down", () => {
      const room = createRoom();
      const { client, player } = placePlayerAt(room, "m", 15, 15);
      room.handleMove(client, { dx: 0, dy: 1 });
      expect(player.x).toBe(15);
      expect(player.y).toBe(16);
    });

    it("diagonal move (dx=1, dy=1) → works if target is walkable", () => {
      const room = createRoom();
      const { client, player } = placePlayerAt(room, "diag", 15, 15);
      expect(room.state.isWalkable(16, 16)).toBe(true);

      room.handleMove(client, { dx: 1, dy: 1 });
      expect(player.x).toBe(16);
      expect(player.y).toBe(16);
    });

    it("diagonal move (dx=-1, dy=-1) → works if target is walkable", () => {
      const room = createRoom();
      const { client, player } = placePlayerAt(room, "diag2", 15, 15);
      room.handleMove(client, { dx: -1, dy: -1 });
      expect(player.x).toBe(14);
      expect(player.y).toBe(14);
    });
  });

  describe("boundary rejection", () => {
    it("move out of bounds (past left edge) → position unchanged", () => {
      const room = createRoom();
      const { client, player } = placePlayerAt(room, "edge-l", 0, 15);
      room.handleMove(client, { dx: -1, dy: 0 });
      expect(player.x).toBe(0);
      expect(player.y).toBe(15);
    });

    it("move out of bounds (past top edge) → position unchanged", () => {
      const room = createRoom();
      const { client, player } = placePlayerAt(room, "edge-t", 15, 0);
      room.handleMove(client, { dx: 0, dy: -1 });
      expect(player.x).toBe(15);
      expect(player.y).toBe(0);
    });

    it("move out of bounds (past right edge) → position unchanged", () => {
      const room = createRoom();
      const { client, player } = placePlayerAt(room, "edge-r", DEFAULT_MAP_SIZE - 1, 15);
      room.handleMove(client, { dx: 1, dy: 0 });
      expect(player.x).toBe(DEFAULT_MAP_SIZE - 1);
      expect(player.y).toBe(15);
    });

    it("move out of bounds (past bottom edge) → position unchanged", () => {
      const room = createRoom();
      const { client, player } = placePlayerAt(room, "edge-b", 15, DEFAULT_MAP_SIZE - 1);
      room.handleMove(client, { dx: 0, dy: 1 });
      expect(player.x).toBe(15);
      expect(player.y).toBe(DEFAULT_MAP_SIZE - 1);
    });
  });

  describe("terrain rejection", () => {
    it("move to water tile → position unchanged", () => {
      const room = createRoom();
      // (6,6) is water; place player next to it at a walkable spot
      // (3,6) is sand (walkable), (4,6) is water
      // Actually let's find an adjacent walkable tile next to water
      // Water is at x=4..8, y=4..8. Tile (3,6) is sand (x>=3,<=9,y>=3,<=9)
      // Let's place at (3,5) which is sand, and try to move into (4,5) which is water
      expect(room.state.getTile(4, 5)!.type).toBe(TileType.Water);
      expect(room.state.isWalkable(3, 5)).toBe(true);

      const { client, player } = placePlayerAt(room, "swim", 3, 5);
      room.handleMove(client, { dx: 1, dy: 0 });
      expect(player.x).toBe(3);
      expect(player.y).toBe(5);
    });

    it("move to rock tile → position unchanged", () => {
      const room = createRoom();
      // Rock is at x=22..26, y=22..26. Tile (21,22) should be grass (walkable)
      expect(room.state.getTile(22, 22)!.type).toBe(TileType.Rock);
      expect(room.state.isWalkable(21, 22)).toBe(true);

      const { client, player } = placePlayerAt(room, "climber", 21, 22);
      room.handleMove(client, { dx: 1, dy: 0 });
      expect(player.x).toBe(21);
      expect(player.y).toBe(22);
    });

    it("move to sand tile → position updates (sand is walkable)", () => {
      const room = createRoom();
      // (3,3) is sand
      expect(room.state.getTile(3, 3)!.type).toBe(TileType.Sand);
      expect(room.state.isWalkable(2, 3)).toBe(true);

      const { client, player } = placePlayerAt(room, "sandy", 2, 3);
      room.handleMove(client, { dx: 1, dy: 0 });
      expect(player.x).toBe(3);
      expect(player.y).toBe(3);
    });
  });

  describe("invalid input rejection", () => {
    it("dx/dy values > 1 → rejected", () => {
      const room = createRoom();
      const { client, player } = placePlayerAt(room, "cheat1", 15, 15);
      room.handleMove(client, { dx: 2, dy: 0 });
      expect(player.x).toBe(15);
      expect(player.y).toBe(15);
    });

    it("dx/dy values < -1 → rejected", () => {
      const room = createRoom();
      const { client, player } = placePlayerAt(room, "cheat2", 15, 15);
      room.handleMove(client, { dx: 0, dy: -2 });
      expect(player.x).toBe(15);
      expect(player.y).toBe(15);
    });

    it("large dx/dy values → rejected", () => {
      const room = createRoom();
      const { client, player } = placePlayerAt(room, "cheat3", 15, 15);
      room.handleMove(client, { dx: 10, dy: 10 });
      expect(player.x).toBe(15);
      expect(player.y).toBe(15);
    });

    it("dx=0, dy=0 (no movement) → position unchanged", () => {
      const room = createRoom();
      const { client, player } = placePlayerAt(room, "still", 15, 15);
      room.handleMove(client, { dx: 0, dy: 0 });
      expect(player.x).toBe(15);
      expect(player.y).toBe(15);
    });

    it("non-integer dx/dy → rejected", () => {
      const room = createRoom();
      const { client, player } = placePlayerAt(room, "float", 15, 15);
      room.handleMove(client, { dx: 0.5, dy: 0 });
      expect(player.x).toBe(15);
      expect(player.y).toBe(15);
    });

    it("unknown client sessionId → no crash", () => {
      const room = createRoom();
      const ghostClient = fakeClient("ghost");
      // handleMove with a client that never joined — should silently return
      room.handleMove(ghostClient, { dx: 1, dy: 0 });
      // No crash means pass
    });
  });

  describe("multi-player movement", () => {
    it("move to occupied tile → still works (tiles can hold multiple players)", () => {
      const room = createRoom();
      const { client: clientA, player: playerA } = placePlayerAt(room, "A", 15, 15);
      const { client: clientB, player: playerB } = placePlayerAt(room, "B", 16, 15);

      // Move B to same tile as A
      room.handleMove(clientB, { dx: -1, dy: 0 });
      expect(playerB.x).toBe(15);
      expect(playerB.y).toBe(15);
      // Both players at same position
      expect(playerA.x).toBe(playerB.x);
      expect(playerA.y).toBe(playerB.y);
    });

    it("Player A moves → Player B state unaffected", () => {
      const room = createRoom();
      const { client: clientA, player: playerA } = placePlayerAt(room, "A2", 15, 15);
      const { client: clientB, player: playerB } = placePlayerAt(room, "B2", 20, 20);

      const bX = playerB.x;
      const bY = playerB.y;

      room.handleMove(clientA, { dx: 1, dy: 0 });
      expect(playerA.x).toBe(16);
      expect(playerB.x).toBe(bX);
      expect(playerB.y).toBe(bY);
    });

    it("two players join same room → both see each other in state", () => {
      const room = createRoom();
      room.onJoin(fakeClient("see-1"));
      room.onJoin(fakeClient("see-2"));

      expect(room.state.players.size).toBe(2);
      const p1 = room.state.players.get("see-1");
      const p2 = room.state.players.get("see-2");
      expect(p1).toBeDefined();
      expect(p2).toBeDefined();
      // Both have valid positions
      expect(room.state.isWalkable(p1!.x, p1!.y)).toBe(true);
      expect(room.state.isWalkable(p2!.x, p2!.y)).toBe(true);
    });

    it("Player A moves → state reflects new position visible to all", () => {
      const room = createRoom();
      room.onJoin(fakeClient("vis-A"));
      room.onJoin(fakeClient("vis-B"));

      const playerA = room.state.players.get("vis-A")!;
      playerA.x = 15;
      playerA.y = 15;

      room.handleMove(fakeClient("vis-A"), { dx: 1, dy: 0 });

      // Re-fetch from state (as another client would see it)
      const updatedA = room.state.players.get("vis-A")!;
      expect(updatedA.x).toBe(16);
      expect(updatedA.y).toBe(15);
    });
  });
});
