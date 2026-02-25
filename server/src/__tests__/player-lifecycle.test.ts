import { describe, it, expect } from "vitest";
import { GameState, PlayerState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { TileType, DEFAULT_MAP_SIZE } from "@primal-grid/shared";

/** Create a room-like object with generated map for lifecycle testing. */
function createRoom(): any {
  const room = Object.create(GameRoom.prototype) as any;
  room.state = new GameState();
  room.generateMap();
  return room;
}

/** Create a fake Client with a given sessionId. */
function fakeClient(sessionId: string): any {
  return { sessionId };
}

describe("Player Lifecycle", () => {
  it("player joins → appears in room state with valid position", () => {
    const room = createRoom();
    const client = fakeClient("player-1");
    room.onJoin(client);

    const player = room.state.players.get("player-1");
    expect(player).toBeDefined();
    expect(player!.id).toBe("player-1");
    expect(player!.x).toBeGreaterThanOrEqual(0);
    expect(player!.x).toBeLessThan(DEFAULT_MAP_SIZE);
    expect(player!.y).toBeGreaterThanOrEqual(0);
    expect(player!.y).toBeLessThan(DEFAULT_MAP_SIZE);
  });

  it("player position is on a walkable tile (not water, not rock)", () => {
    const room = createRoom();
    const client = fakeClient("player-spawn");
    room.onJoin(client);

    const player = room.state.players.get("player-spawn");
    expect(player).toBeDefined();
    expect(room.state.isWalkable(player!.x, player!.y)).toBe(true);

    // Verify the tile is specifically not water or rock
    const tile = room.state.getTile(player!.x, player!.y);
    expect(tile).toBeDefined();
    expect(tile!.type).not.toBe(TileType.Water);
    expect(tile!.type).not.toBe(TileType.Rock);
  });

  it("player has a color assigned (not default white)", () => {
    const room = createRoom();
    const client = fakeClient("player-color");
    room.onJoin(client);

    const player = room.state.players.get("player-color");
    expect(player).toBeDefined();
    expect(player!.color).toBeDefined();
    expect(player!.color).not.toBe("#ffffff");
    expect(player!.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("second player joins → both visible in state", () => {
    const room = createRoom();
    room.onJoin(fakeClient("alice"));
    room.onJoin(fakeClient("bob"));

    expect(room.state.players.size).toBe(2);
    expect(room.state.players.get("alice")).toBeDefined();
    expect(room.state.players.get("bob")).toBeDefined();
    expect(room.state.players.get("alice")!.id).toBe("alice");
    expect(room.state.players.get("bob")!.id).toBe("bob");
  });

  it("two players get different colors", () => {
    const room = createRoom();
    room.onJoin(fakeClient("p1"));
    room.onJoin(fakeClient("p2"));

    const p1 = room.state.players.get("p1")!;
    const p2 = room.state.players.get("p2")!;
    expect(p1.color).not.toBe(p2.color);
  });

  it("player leaves → removed from state", () => {
    const room = createRoom();
    const client = fakeClient("leaving");
    room.onJoin(client);
    expect(room.state.players.get("leaving")).toBeDefined();

    room.onLeave(client, true);
    expect(room.state.players.get("leaving")).toBeUndefined();
    expect(room.state.players.size).toBe(0);
  });

  it("other players remain when one leaves", () => {
    const room = createRoom();
    const alice = fakeClient("alice");
    const bob = fakeClient("bob");
    const charlie = fakeClient("charlie");

    room.onJoin(alice);
    room.onJoin(bob);
    room.onJoin(charlie);
    expect(room.state.players.size).toBe(3);

    room.onLeave(bob, false);
    expect(room.state.players.size).toBe(2);
    expect(room.state.players.get("alice")).toBeDefined();
    expect(room.state.players.get("bob")).toBeUndefined();
    expect(room.state.players.get("charlie")).toBeDefined();
  });

  it("player spawn is deterministically walkable across multiple joins", () => {
    const room = createRoom();
    // Join 10 players — all should land on walkable tiles
    for (let i = 0; i < 10; i++) {
      room.onJoin(fakeClient(`stress-${i}`));
    }
    expect(room.state.players.size).toBe(10);
    room.state.players.forEach((player: PlayerState) => {
      expect(room.state.isWalkable(player.x, player.y)).toBe(true);
    });
  });
});
