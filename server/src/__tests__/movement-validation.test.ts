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

/** Find a walkable tile with a walkable neighbor in the interior. */
function findWalkablePair(state: GameState): { x: number; y: number; nx: number; ny: number } {
  for (let y = 1; y < state.mapHeight - 1; y++) {
    for (let x = 1; x < state.mapWidth - 1; x++) {
      if (state.isWalkable(x, y) && state.isWalkable(x + 1, y)) {
        return { x, y, nx: x + 1, ny: y };
      }
    }
  }
  throw new Error("No adjacent walkable pair found");
}

/** Find a non-walkable tile adjacent to a walkable tile. */
function findNonWalkableEdge(state: GameState): { wx: number; wy: number; dx: number; dy: number } | undefined {
  for (let y = 0; y < state.mapHeight; y++) {
    for (let x = 0; x < state.mapWidth; x++) {
      if (!state.isWalkable(x, y)) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (state.isWalkable(x + dx, y + dy)) {
            return { wx: x + dx, wy: y + dy, dx: -dx, dy: -dy };
          }
        }
      }
    }
  }
  return undefined;
}

describe("Movement Validation", () => {
  describe("valid moves", () => {
    it("move to adjacent walkable tile → position updates", () => {
      const room = createRoom();
      const pair = findWalkablePair(room.state);
      const { client, player } = placePlayerAt(room, "mover", pair.x, pair.y);

      room.handleMove(client, { dx: 1, dy: 0 });
      expect(player.x).toBe(pair.x + 1);
      expect(player.y).toBe(pair.y);
    });

    it("move left", () => {
      const room = createRoom();
      const pair = findWalkablePair(room.state);
      const { client, player } = placePlayerAt(room, "m", pair.nx, pair.ny);
      room.handleMove(client, { dx: -1, dy: 0 });
      expect(player.x).toBe(pair.x);
    });

    it("move up", () => {
      const room = createRoom();
      // Find vertically adjacent walkable pair
      for (let y = 1; y < room.state.mapHeight - 1; y++) {
        for (let x = 1; x < room.state.mapWidth - 1; x++) {
          if (room.state.isWalkable(x, y) && room.state.isWalkable(x, y - 1)) {
            const { client, player } = placePlayerAt(room, "m", x, y);
            room.handleMove(client, { dx: 0, dy: -1 });
            expect(player.y).toBe(y - 1);
            return;
          }
        }
      }
    });

    it("move down", () => {
      const room = createRoom();
      for (let y = 1; y < room.state.mapHeight - 1; y++) {
        for (let x = 1; x < room.state.mapWidth - 1; x++) {
          if (room.state.isWalkable(x, y) && room.state.isWalkable(x, y + 1)) {
            const { client, player } = placePlayerAt(room, "m", x, y);
            room.handleMove(client, { dx: 0, dy: 1 });
            expect(player.y).toBe(y + 1);
            return;
          }
        }
      }
    });

    it("diagonal move → works if target is walkable", () => {
      const room = createRoom();
      for (let y = 1; y < room.state.mapHeight - 1; y++) {
        for (let x = 1; x < room.state.mapWidth - 1; x++) {
          if (room.state.isWalkable(x, y) && room.state.isWalkable(x + 1, y + 1)) {
            const { client, player } = placePlayerAt(room, "diag", x, y);
            room.handleMove(client, { dx: 1, dy: 1 });
            expect(player.x).toBe(x + 1);
            expect(player.y).toBe(y + 1);
            return;
          }
        }
      }
    });
  });

  describe("boundary rejection", () => {
    it("move out of bounds (past left edge) → position unchanged", () => {
      const room = createRoom();
      // Find walkable tile at x=0
      for (let y = 0; y < room.state.mapHeight; y++) {
        if (room.state.isWalkable(0, y)) {
          const { client, player } = placePlayerAt(room, "edge-l", 0, y);
          room.handleMove(client, { dx: -1, dy: 0 });
          expect(player.x).toBe(0);
          return;
        }
      }
      // If no walkable tile at x=0, place and force position
      const { client, player } = placePlayerAt(room, "edge-l", 0, 0);
      player.x = 0;
      room.handleMove(client, { dx: -1, dy: 0 });
      expect(player.x).toBe(0);
    });

    it("move out of bounds (past top edge) → position unchanged", () => {
      const room = createRoom();
      for (let x = 0; x < room.state.mapWidth; x++) {
        if (room.state.isWalkable(x, 0)) {
          const { client, player } = placePlayerAt(room, "edge-t", x, 0);
          room.handleMove(client, { dx: 0, dy: -1 });
          expect(player.y).toBe(0);
          return;
        }
      }
    });

    it("move out of bounds (past right edge) → position unchanged", () => {
      const room = createRoom();
      const lastX = DEFAULT_MAP_SIZE - 1;
      for (let y = 0; y < room.state.mapHeight; y++) {
        if (room.state.isWalkable(lastX, y)) {
          const { client, player } = placePlayerAt(room, "edge-r", lastX, y);
          room.handleMove(client, { dx: 1, dy: 0 });
          expect(player.x).toBe(lastX);
          return;
        }
      }
    });

    it("move out of bounds (past bottom edge) → position unchanged", () => {
      const room = createRoom();
      const lastY = DEFAULT_MAP_SIZE - 1;
      for (let x = 0; x < room.state.mapWidth; x++) {
        if (room.state.isWalkable(x, lastY)) {
          const { client, player } = placePlayerAt(room, "edge-b", x, lastY);
          room.handleMove(client, { dx: 0, dy: 1 });
          expect(player.y).toBe(lastY);
          return;
        }
      }
    });
  });

  describe("terrain rejection", () => {
    it("move to non-walkable tile → position unchanged", () => {
      const room = createRoom();
      const edge = findNonWalkableEdge(room.state);
      expect(edge).toBeDefined();
      const { client, player } = placePlayerAt(room, "blocked", edge!.wx, edge!.wy);
      room.handleMove(client, { dx: edge!.dx, dy: edge!.dy });
      expect(player.x).toBe(edge!.wx);
      expect(player.y).toBe(edge!.wy);
    });

    it("move to walkable biome tile → position updates", () => {
      const room = createRoom();
      const pair = findWalkablePair(room.state);
      const { client, player } = placePlayerAt(room, "walker", pair.x, pair.y);
      room.handleMove(client, { dx: 1, dy: 0 });
      expect(player.x).toBe(pair.x + 1);
    });
  });

  describe("invalid input rejection", () => {
    it("dx/dy values > 1 → rejected", () => {
      const room = createRoom();
      const pair = findWalkablePair(room.state);
      const { client, player } = placePlayerAt(room, "cheat1", pair.x, pair.y);
      room.handleMove(client, { dx: 2, dy: 0 });
      expect(player.x).toBe(pair.x);
    });

    it("dx/dy values < -1 → rejected", () => {
      const room = createRoom();
      const pair = findWalkablePair(room.state);
      const { client, player } = placePlayerAt(room, "cheat2", pair.x, pair.y);
      room.handleMove(client, { dx: 0, dy: -2 });
      expect(player.y).toBe(pair.y);
    });

    it("large dx/dy values → rejected", () => {
      const room = createRoom();
      const pair = findWalkablePair(room.state);
      const { client, player } = placePlayerAt(room, "cheat3", pair.x, pair.y);
      room.handleMove(client, { dx: 10, dy: 10 });
      expect(player.x).toBe(pair.x);
      expect(player.y).toBe(pair.y);
    });

    it("dx=0, dy=0 (no movement) → position unchanged", () => {
      const room = createRoom();
      const pair = findWalkablePair(room.state);
      const { client, player } = placePlayerAt(room, "still", pair.x, pair.y);
      room.handleMove(client, { dx: 0, dy: 0 });
      expect(player.x).toBe(pair.x);
      expect(player.y).toBe(pair.y);
    });

    it("non-integer dx/dy → rejected", () => {
      const room = createRoom();
      const pair = findWalkablePair(room.state);
      const { client, player } = placePlayerAt(room, "float", pair.x, pair.y);
      room.handleMove(client, { dx: 0.5, dy: 0 });
      expect(player.x).toBe(pair.x);
    });

    it("unknown client sessionId → no crash", () => {
      const room = createRoom();
      const ghostClient = fakeClient("ghost");
      room.handleMove(ghostClient, { dx: 1, dy: 0 });
    });
  });

  describe("multi-player movement", () => {
    it("move to occupied tile → still works (tiles can hold multiple players)", () => {
      const room = createRoom();
      const pair = findWalkablePair(room.state);
      const { client: clientA, player: playerA } = placePlayerAt(room, "A", pair.x, pair.y);
      const { client: clientB, player: playerB } = placePlayerAt(room, "B", pair.nx, pair.ny);

      room.handleMove(clientB, { dx: -1, dy: 0 });
      expect(playerB.x).toBe(pair.x);
      expect(playerB.y).toBe(pair.y);
      expect(playerA.x).toBe(playerB.x);
      expect(playerA.y).toBe(playerB.y);
    });

    it("Player A moves → Player B state unaffected", () => {
      const room = createRoom();
      const pair = findWalkablePair(room.state);
      const { client: clientA, player: playerA } = placePlayerAt(room, "A2", pair.x, pair.y);

      // Find another walkable tile far away for B
      let bx = pair.x + 5, by = pair.y + 5;
      for (let y = pair.y + 3; y < room.state.mapHeight; y++) {
        for (let x = pair.x + 3; x < room.state.mapWidth; x++) {
          if (room.state.isWalkable(x, y)) { bx = x; by = y; y = room.state.mapHeight; break; }
        }
      }
      const { client: clientB, player: playerB } = placePlayerAt(room, "B2", bx, by);

      room.handleMove(clientA, { dx: 1, dy: 0 });
      expect(playerA.x).toBe(pair.x + 1);
      expect(playerB.x).toBe(bx);
      expect(playerB.y).toBe(by);
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
      expect(room.state.isWalkable(p1!.x, p1!.y)).toBe(true);
      expect(room.state.isWalkable(p2!.x, p2!.y)).toBe(true);
    });

    it("Player A moves → state reflects new position visible to all", () => {
      const room = createRoom();
      room.onJoin(fakeClient("vis-A"));
      room.onJoin(fakeClient("vis-B"));

      const playerA = room.state.players.get("vis-A")!;
      const pair = findWalkablePair(room.state);
      playerA.x = pair.x;
      playerA.y = pair.y;

      room.handleMove(fakeClient("vis-A"), { dx: 1, dy: 0 });

      const updatedA = room.state.players.get("vis-A")!;
      expect(updatedA.x).toBe(pair.x + 1);
      expect(updatedA.y).toBe(pair.y);
    });
  });
});
