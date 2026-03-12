/**
 * Pre-Game Lobby Flow Tests — Issue #4 (Lobby Improvements)
 *
 * Covers:
 *   - Game creation with deferred room creation (waiting status)
 *   - Join/leave/ready mechanics in the waiting phase
 *   - Host-only start with Colyseus room creation
 *   - Guard/rejection tests (non-host start, full game, etc.)
 *   - Leave/disconnect cleanup
 *   - Edge cases (solo start, multiple games, double-join prevention)
 *
 * Conventions:
 *   - Object.create(LobbyRoom.prototype) pattern for room mocking
 *   - vi.fn() for broadcast/send verification
 *   - Direct private method calls for unit isolation
 *   - `as unknown as Type` for Colyseus type mocking
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { LobbyState, LobbyPlayer } from "../rooms/LobbyState.js";
import {
  GAME_JOINED, GAME_STARTED, GAME_PLAYERS,
  GAME_UPDATED, GAME_REMOVED, LOBBY_ERROR,
  LOBBY_DEFAULTS,
} from "@primal-grid/shared";
import type { CreateGamePayload, PreGamePlayerInfo } from "@primal-grid/shared";

// ── Colyseus mock (hoisted before LobbyRoom import) ────────────────

const { mockCreateRoom } = vi.hoisted(() => ({
  mockCreateRoom: vi.fn(),
}));

vi.mock("colyseus", () => ({
  Room: class {},
  matchMaker: { createRoom: mockCreateRoom },
}));

// Must import AFTER vi.mock so the mock is active
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
const { LobbyRoom } = await import("../rooms/LobbyRoom.js");

// ── Private-method access via type assertion ───────────────────────

interface LobbySession {
  userId: string;
  displayName: string;
  isGuest: boolean;
}

type TestableLobbyRoom = InstanceType<typeof LobbyRoom> & {
  sessions: Map<string, LobbySession>;
  gameRoomIds: Map<string, string>;
  waitingPlayers: Map<string, Map<string, PreGamePlayerInfo>>;
  pendingGameOptions: Map<string, Record<string, unknown>>;
  handleCreateGame(client: MockClient, payload: CreateGamePayload): Promise<void>;
  handleJoinGame(client: MockClient, payload: { gameId: string }): Promise<void>;
  handleLeaveGame(client: MockClient): void;
  handleStartGame(client: MockClient): Promise<void>;
  handleSetReady(client: MockClient, payload: { ready: boolean }): void;
  broadcastGamePlayers(gameId: string): void;
  sendError(client: MockClient, message: string): void;
  onLeave(client: MockClient): void;
  onGameEnded(gameId: string): void;
  broadcast: ReturnType<typeof vi.fn>;
  clients: MockClient[];
};

interface MockClient {
  sessionId: string;
  send: ReturnType<typeof vi.fn>;
}

// ── Helpers ─────────────────────────────────────────────────────────

function createLobbyRoom(): TestableLobbyRoom {
  const room = Object.create(LobbyRoom.prototype) as TestableLobbyRoom;
  room.state = new LobbyState();
  room.sessions = new Map();
  room.gameRoomIds = new Map();
  room.waitingPlayers = new Map();
  room.pendingGameOptions = new Map();
  room.broadcast = vi.fn();
  room.clients = [];
  return room;
}

function fakeClient(sessionId: string): MockClient {
  return { sessionId, send: vi.fn() };
}

function registerPlayer(
  room: TestableLobbyRoom,
  client: MockClient,
  opts: { userId?: string; displayName?: string; isGuest?: boolean } = {},
): void {
  const userId = opts.userId ?? client.sessionId;
  const displayName = opts.displayName ?? `Player_${client.sessionId}`;
  const isGuest = opts.isGuest ?? true;

  room.sessions.set(client.sessionId, { userId, displayName, isGuest });

  const lobbyPlayer = new LobbyPlayer();
  lobbyPlayer.userId = userId;
  lobbyPlayer.displayName = displayName;
  lobbyPlayer.isGuest = isGuest;
  room.state.players.set(client.sessionId, lobbyPlayer);
}

function addToClients(room: TestableLobbyRoom, client: MockClient): void {
  room.clients.push(client);
}

async function createGame(
  room: TestableLobbyRoom,
  client: MockClient,
  payload: Partial<CreateGamePayload> = {},
): Promise<string> {
  await room.handleCreateGame(client as unknown as MockClient, {
    name: payload.name ?? "Test Game",
    maxPlayers: payload.maxPlayers ?? 4,
    mapSize: payload.mapSize ?? 64,
    mapSeed: payload.mapSeed ?? 42,
    cpuPlayers: payload.cpuPlayers ?? 0,
    gameDuration: payload.gameDuration ?? 10,
  });

  const joinedCall = client.send.mock.calls.find(
    (call: unknown[]) => call[0] === GAME_JOINED,
  );
  return joinedCall ? (joinedCall[1] as { gameId: string }).gameId : "";
}

// ══════════════════════════════════════════════════════════════════════
// Core Flow
// ══════════════════════════════════════════════════════════════════════

describe("Pre-Game Lobby — Core Flow", () => {
  let room: TestableLobbyRoom;
  let host: MockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    room = createLobbyRoom();
    host = fakeClient("host-sess");
    registerPlayer(room, host, { userId: "host-uid", displayName: "HostPlayer" });
    addToClients(room, host);
    mockCreateRoom.mockResolvedValue({ roomId: "game-room-123" });
  });

  it("creates game in 'waiting' status with NO GameRoom created", async () => {
    const gameId = await createGame(room, host);

    const entry = room.state.games.get(gameId);
    expect(entry).toBeDefined();
    expect(entry!.status).toBe("waiting");
    expect(entry!.name).toBe("Test Game");
    expect(entry!.hostId).toBe("host-uid");
    expect(entry!.playerCount).toBe(1);

    expect(mockCreateRoom).not.toHaveBeenCalled();

    const playerMap = room.waitingPlayers.get(gameId);
    expect(playerMap).toBeDefined();
    expect(playerMap!.size).toBe(1);
    expect(playerMap!.get("host-sess")).toEqual({
      userId: "host-uid",
      displayName: "HostPlayer",
      isReady: false,
    });

    expect(room.pendingGameOptions.has(gameId)).toBe(true);
  });

  it("sends GAME_JOINED to creator with gameId (no roomId)", async () => {
    const gameId = await createGame(room, host);

    const call = host.send.mock.calls.find((c: unknown[]) => c[0] === GAME_JOINED);
    expect(call).toBeDefined();
    expect(call![1]).toEqual({ gameId });
  });

  it("join waiting game adds player, broadcasts GAME_PLAYERS", async () => {
    const gameId = await createGame(room, host);

    const joiner = fakeClient("join-sess");
    registerPlayer(room, joiner, { userId: "join-uid", displayName: "Joiner" });
    addToClients(room, joiner);

    await room.handleJoinGame(joiner as unknown as MockClient, { gameId });

    // Player added
    const pm = room.waitingPlayers.get(gameId)!;
    expect(pm.size).toBe(2);
    expect(pm.has("join-sess")).toBe(true);

    // Joiner received GAME_JOINED
    expect(joiner.send.mock.calls.find((c: unknown[]) => c[0] === GAME_JOINED)).toBeDefined();

    // GAME_PLAYERS sent to participants
    const hostGP = host.send.mock.calls.filter((c: unknown[]) => c[0] === GAME_PLAYERS);
    const joinerGP = joiner.send.mock.calls.filter((c: unknown[]) => c[0] === GAME_PLAYERS);
    expect(hostGP.length + joinerGP.length).toBeGreaterThan(0);

    // Player count
    expect(room.state.games.get(gameId)!.playerCount).toBe(2);
  });

  it("set ready toggles state and broadcasts GAME_PLAYERS", async () => {
    const gameId = await createGame(room, host);
    host.send.mockClear();

    room.handleSetReady(host as unknown as MockClient, { ready: true });

    const pm = room.waitingPlayers.get(gameId)!;
    expect(pm.get("host-sess")!.isReady).toBe(true);

    expect(host.send.mock.calls.filter((c: unknown[]) => c[0] === GAME_PLAYERS).length)
      .toBeGreaterThan(0);

    // Toggle off
    room.handleSetReady(host as unknown as MockClient, { ready: false });
    expect(pm.get("host-sess")!.isReady).toBe(false);
  });

  it("start game creates GameRoom, sends GAME_STARTED, sets in_progress", async () => {
    const gameId = await createGame(room, host);
    host.send.mockClear();

    await room.handleStartGame(host as unknown as MockClient);

    expect(mockCreateRoom).toHaveBeenCalledWith(
      "game",
      expect.objectContaining({ gameId, mapSize: 64, seed: 42, maxPlayers: 4, hostId: "host-uid" }),
    );

    expect(room.state.games.get(gameId)!.status).toBe("in_progress");

    const sc = host.send.mock.calls.find((c: unknown[]) => c[0] === GAME_STARTED);
    expect(sc).toBeDefined();
    expect(sc![1]).toEqual({ gameId, roomId: "game-room-123" });

    expect(room.waitingPlayers.has(gameId)).toBe(false);
    expect(room.pendingGameOptions.has(gameId)).toBe(false);
  });

  it("full flow: create → join → ready → start → all transitions correct", async () => {
    const gameId = await createGame(room, host);

    const joiner = fakeClient("join-sess");
    registerPlayer(room, joiner, { userId: "join-uid", displayName: "Joiner" });
    addToClients(room, joiner);

    await room.handleJoinGame(joiner as unknown as MockClient, { gameId });
    expect(room.waitingPlayers.get(gameId)!.size).toBe(2);

    room.handleSetReady(host as unknown as MockClient, { ready: true });
    room.handleSetReady(joiner as unknown as MockClient, { ready: true });
    expect(room.waitingPlayers.get(gameId)!.get("host-sess")!.isReady).toBe(true);
    expect(room.waitingPlayers.get(gameId)!.get("join-sess")!.isReady).toBe(true);

    await room.handleStartGame(host as unknown as MockClient);

    expect(host.send.mock.calls.find((c: unknown[]) => c[0] === GAME_STARTED)).toBeDefined();
    expect(joiner.send.mock.calls.find((c: unknown[]) => c[0] === GAME_STARTED)).toBeDefined();

    expect(room.state.games.get(gameId)!.status).toBe("in_progress");
    expect(mockCreateRoom).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Rejection Guards
// ══════════════════════════════════════════════════════════════════════

describe("Pre-Game Lobby — Rejection Guards", () => {
  let room: TestableLobbyRoom;
  let host: MockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    room = createLobbyRoom();
    host = fakeClient("host-sess");
    registerPlayer(room, host, { userId: "host-uid", displayName: "HostPlayer" });
    addToClients(room, host);
    mockCreateRoom.mockResolvedValue({ roomId: "game-room-123" });
  });

  it("non-host cannot start game", async () => {
    const gameId = await createGame(room, host);

    const joiner = fakeClient("join-sess");
    registerPlayer(room, joiner, { userId: "join-uid", displayName: "Joiner" });
    addToClients(room, joiner);
    await room.handleJoinGame(joiner as unknown as MockClient, { gameId });

    joiner.send.mockClear();
    await room.handleStartGame(joiner as unknown as MockClient);

    const err = joiner.send.mock.calls.find((c: unknown[]) => c[0] === LOBBY_ERROR);
    expect(err).toBeDefined();
    expect(err![1]).toEqual({ message: "Only the host can start" });
    expect(mockCreateRoom).not.toHaveBeenCalled();
  });

  it("cannot join in_progress game", async () => {
    const gameId = await createGame(room, host);
    await room.handleStartGame(host as unknown as MockClient);

    const joiner = fakeClient("join-sess");
    registerPlayer(room, joiner, { userId: "join-uid", displayName: "Joiner" });
    joiner.send.mockClear();

    await room.handleJoinGame(joiner as unknown as MockClient, { gameId });

    const err = joiner.send.mock.calls.find((c: unknown[]) => c[0] === LOBBY_ERROR);
    expect(err).toBeDefined();
    expect(err![1]).toEqual({ message: "Game already started" });
  });

  it("cannot join full game", async () => {
    const gameId = await createGame(room, host, { maxPlayers: 1 });

    const joiner = fakeClient("join-sess");
    registerPlayer(room, joiner, { userId: "join-uid", displayName: "Joiner" });
    await room.handleJoinGame(joiner as unknown as MockClient, { gameId });

    const err = joiner.send.mock.calls.find((c: unknown[]) => c[0] === LOBBY_ERROR);
    expect(err).toBeDefined();
    expect(err![1]).toEqual({ message: "Game is full" });
  });

  it("cannot start when not in a game", async () => {
    host.send.mockClear();
    await room.handleStartGame(host as unknown as MockClient);

    const err = host.send.mock.calls.find((c: unknown[]) => c[0] === LOBBY_ERROR);
    expect(err).toBeDefined();
    expect(err![1]).toEqual({ message: "Not in a game" });
  });

  it("set_ready silently ignored on started game", async () => {
    await createGame(room, host);
    await room.handleStartGame(host as unknown as MockClient);

    host.send.mockClear();
    room.handleSetReady(host as unknown as MockClient, { ready: true });

    expect(host.send.mock.calls.filter((c: unknown[]) => c[0] === GAME_PLAYERS).length).toBe(0);
  });

  it("cannot join nonexistent game", async () => {
    const joiner = fakeClient("join-sess");
    registerPlayer(room, joiner, { userId: "join-uid", displayName: "Joiner" });

    await room.handleJoinGame(joiner as unknown as MockClient, { gameId: "nope" });

    const err = joiner.send.mock.calls.find((c: unknown[]) => c[0] === LOBBY_ERROR);
    expect(err).toBeDefined();
    expect(err![1]).toEqual({ message: "Game not found" });
  });

  it("unauthenticated client cannot create game", async () => {
    const unknown = fakeClient("no-session");
    await room.handleCreateGame(unknown as unknown as MockClient, { name: "Bad" });

    const err = unknown.send.mock.calls.find((c: unknown[]) => c[0] === LOBBY_ERROR);
    expect(err).toBeDefined();
    expect(err![1]).toEqual({ message: "Not authenticated" });
  });

  it("empty game name rejected", async () => {
    host.send.mockClear();
    await room.handleCreateGame(host as unknown as MockClient, { name: "" });

    const err = host.send.mock.calls.find((c: unknown[]) => c[0] === LOBBY_ERROR);
    expect(err).toBeDefined();
    expect(err![1]).toEqual({ message: "Game name is required" });
  });

  it("cannot create second game while in one", async () => {
    await createGame(room, host);
    host.send.mockClear();
    await room.handleCreateGame(host as unknown as MockClient, { name: "Second" });

    const err = host.send.mock.calls.find((c: unknown[]) => c[0] === LOBBY_ERROR);
    expect(err).toBeDefined();
    expect(err![1]).toEqual({ message: "Already in a game" });
  });

  it("cannot join second game while in one", async () => {
    const _gameId1 = await createGame(room, host);

    const host2 = fakeClient("host2-sess");
    registerPlayer(room, host2, { userId: "host2-uid", displayName: "Host2" });
    addToClients(room, host2);
    const gameId2 = await createGame(room, host2, { name: "Game 2" });

    host.send.mockClear();
    await room.handleJoinGame(host as unknown as MockClient, { gameId: gameId2 });

    const err = host.send.mock.calls.find((c: unknown[]) => c[0] === LOBBY_ERROR);
    expect(err).toBeDefined();
    expect(err![1]).toEqual({ message: "Already in a game" });
  });
});

// ══════════════════════════════════════════════════════════════════════
// Leave & Cleanup
// ══════════════════════════════════════════════════════════════════════

describe("Pre-Game Lobby — Leave & Cleanup", () => {
  let room: TestableLobbyRoom;
  let host: MockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    room = createLobbyRoom();
    host = fakeClient("host-sess");
    registerPlayer(room, host, { userId: "host-uid", displayName: "HostPlayer" });
    addToClients(room, host);
    mockCreateRoom.mockResolvedValue({ roomId: "game-room-123" });
  });

  it("player leaves: removed from waiting list, count updated, GAME_UPDATED broadcast", async () => {
    const gameId = await createGame(room, host);

    const joiner = fakeClient("join-sess");
    registerPlayer(room, joiner, { userId: "join-uid", displayName: "Joiner" });
    addToClients(room, joiner);
    await room.handleJoinGame(joiner as unknown as MockClient, { gameId });

    room.broadcast.mockClear();
    room.handleLeaveGame(joiner as unknown as MockClient);

    const pm = room.waitingPlayers.get(gameId)!;
    expect(pm.size).toBe(1);
    expect(pm.has("join-sess")).toBe(false);
    expect(room.state.games.get(gameId)!.playerCount).toBe(1);
    expect(room.broadcast).toHaveBeenCalledWith(GAME_UPDATED, expect.anything());
    expect(room.state.players.get("join-sess")!.activeGameId).toBe("");
  });

  it("host leaves empty waiting game: game removed entirely", async () => {
    const gameId = await createGame(room, host);
    room.broadcast.mockClear();

    room.handleLeaveGame(host as unknown as MockClient);

    expect(room.state.games.has(gameId)).toBe(false);
    expect(room.waitingPlayers.has(gameId)).toBe(false);
    expect(room.pendingGameOptions.has(gameId)).toBe(false);
    expect(room.broadcast).toHaveBeenCalledWith(GAME_REMOVED, { gameId });
  });

  it("host leaves with others: game stays, count decremented", async () => {
    const gameId = await createGame(room, host);

    const joiner = fakeClient("join-sess");
    registerPlayer(room, joiner, { userId: "join-uid", displayName: "Joiner" });
    addToClients(room, joiner);
    await room.handleJoinGame(joiner as unknown as MockClient, { gameId });

    room.broadcast.mockClear();
    room.handleLeaveGame(host as unknown as MockClient);

    expect(room.state.games.has(gameId)).toBe(true);
    expect(room.state.games.get(gameId)!.playerCount).toBe(1);

    const pm = room.waitingPlayers.get(gameId)!;
    expect(pm.has("host-sess")).toBe(false);
    expect(pm.has("join-sess")).toBe(true);
  });

  it("disconnect (onLeave) cleans up waiting game membership", async () => {
    const gameId = await createGame(room, host);

    const joiner = fakeClient("join-sess");
    registerPlayer(room, joiner, { userId: "join-uid", displayName: "Joiner" });
    addToClients(room, joiner);
    await room.handleJoinGame(joiner as unknown as MockClient, { gameId });

    room.onLeave(joiner as unknown as MockClient);

    const pm = room.waitingPlayers.get(gameId)!;
    expect(pm.has("join-sess")).toBe(false);
    expect(room.sessions.has("join-sess")).toBe(false);
    expect(room.state.players.has("join-sess")).toBe(false);
  });

  it("host disconnect from empty game: game removed entirely", async () => {
    const gameId = await createGame(room, host);
    room.broadcast.mockClear();

    room.onLeave(host as unknown as MockClient);

    expect(room.state.games.has(gameId)).toBe(false);
    expect(room.waitingPlayers.has(gameId)).toBe(false);
    expect(room.pendingGameOptions.has(gameId)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Edge Cases
// ══════════════════════════════════════════════════════════════════════

describe("Pre-Game Lobby — Edge Cases", () => {
  let room: TestableLobbyRoom;
  let host: MockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    room = createLobbyRoom();
    host = fakeClient("host-sess");
    registerPlayer(room, host, { userId: "host-uid", displayName: "HostPlayer" });
    addToClients(room, host);
    mockCreateRoom.mockResolvedValue({ roomId: "solo-room" });
  });

  it("create then immediately start (solo) works", async () => {
    const gameId = await createGame(room, host);
    host.send.mockClear();

    await room.handleStartGame(host as unknown as MockClient);

    expect(mockCreateRoom).toHaveBeenCalledTimes(1);
    expect(room.state.games.get(gameId)!.status).toBe("in_progress");
    expect(host.send.mock.calls.find((c: unknown[]) => c[0] === GAME_STARTED)).toBeDefined();
  });

  it("multiple games have independent waiting player lists", async () => {
    const host2 = fakeClient("host2-sess");
    registerPlayer(room, host2, { userId: "host2-uid", displayName: "Host2" });
    addToClients(room, host2);

    const gid1 = await createGame(room, host, { name: "Game 1" });
    const gid2 = await createGame(room, host2, { name: "Game 2" });

    expect(gid1).not.toBe(gid2);
    expect(room.waitingPlayers.get(gid1)!.size).toBe(1);
    expect(room.waitingPlayers.get(gid2)!.size).toBe(1);
    expect(room.waitingPlayers.get(gid1)!.has("host-sess")).toBe(true);
    expect(room.waitingPlayers.get(gid2)!.has("host2-sess")).toBe(true);
  });

  it("same player cannot join two different games", async () => {
    await createGame(room, host, { name: "Game 1" });

    const host2 = fakeClient("host2-sess");
    registerPlayer(room, host2, { userId: "host2-uid", displayName: "Host2" });
    addToClients(room, host2);
    const gid2 = await createGame(room, host2, { name: "Game 2" });

    host.send.mockClear();
    await room.handleJoinGame(host as unknown as MockClient, { gameId: gid2 });

    const err = host.send.mock.calls.find((c: unknown[]) => c[0] === LOBBY_ERROR);
    expect(err).toBeDefined();
    expect(err![1]).toEqual({ message: "Already in a game" });
  });

  it("maxPlayers clamped to LOBBY_DEFAULTS.MAX_PLAYERS", async () => {
    const gameId = await createGame(room, host, { maxPlayers: 100 });
    expect(room.state.games.get(gameId)!.maxPlayers).toBe(LOBBY_DEFAULTS.MAX_PLAYERS);
  });

  it("game name truncated to MAX_GAME_NAME_LENGTH", async () => {
    const long = "A".repeat(100);
    const gameId = await createGame(room, host, { name: long });
    expect(room.state.games.get(gameId)!.name.length).toBeLessThanOrEqual(
      LOBBY_DEFAULTS.MAX_GAME_NAME_LENGTH,
    );
  });

  it("GAME_UPDATED broadcast on game create and player join", async () => {
    room.broadcast.mockClear();
    const gameId = await createGame(room, host);

    expect(room.broadcast.mock.calls.filter((c: unknown[]) => c[0] === GAME_UPDATED).length)
      .toBeGreaterThan(0);

    const joiner = fakeClient("join-sess");
    registerPlayer(room, joiner, { userId: "join-uid", displayName: "Joiner" });
    addToClients(room, joiner);
    room.broadcast.mockClear();

    await room.handleJoinGame(joiner as unknown as MockClient, { gameId });

    expect(room.broadcast.mock.calls.filter((c: unknown[]) => c[0] === GAME_UPDATED).length)
      .toBeGreaterThan(0);
  });

  it("matchMaker failure sends error and game stays in waiting", async () => {
    mockCreateRoom.mockRejectedValueOnce(new Error("Room creation failed"));

    const gameId = await createGame(room, host);
    host.send.mockClear();

    await room.handleStartGame(host as unknown as MockClient);

    const err = host.send.mock.calls.find((c: unknown[]) => c[0] === LOBBY_ERROR);
    expect(err).toBeDefined();
    expect(err![1]).toEqual({ message: "Failed to create game room. Please try again." });
    expect(room.state.games.get(gameId)!.status).toBe("waiting");
  });

  it("onGameEnded removes game and broadcasts GAME_REMOVED", async () => {
    const gameId = await createGame(room, host);
    await room.handleStartGame(host as unknown as MockClient);
    room.broadcast.mockClear();

    room.onGameEnded(gameId);

    expect(room.state.games.has(gameId)).toBe(false);
    expect(room.broadcast).toHaveBeenCalledWith(GAME_REMOVED, { gameId });
  });

  it("can create new game after leaving previous one", async () => {
    const gid1 = await createGame(room, host);
    room.handleLeaveGame(host as unknown as MockClient);

    host.send.mockClear();
    const gid2 = await createGame(room, host, { name: "New Game" });

    expect(gid2).toBeTruthy();
    expect(gid2).not.toBe(gid1);
    expect(room.state.games.has(gid2)).toBe(true);
  });

  it("gameDuration stored in pending options and lobby entry", async () => {
    const gameId = await createGame(room, host, { gameDuration: 20 });
    const entry = room.state.games.get(gameId);
    expect(entry!.gameDuration).toBe(20);

    const opts = room.pendingGameOptions.get(gameId) as Record<string, unknown>;
    expect(opts.gameDuration).toBe(20);
  });

  it("cpuPlayers stored in pending options", async () => {
    const gameId = await createGame(room, host, { cpuPlayers: 3 });
    const opts = room.pendingGameOptions.get(gameId) as Record<string, unknown>;
    expect(opts.cpuPlayers).toBe(3);
  });

  it("lobby player activeGameId set on create and cleared on leave", async () => {
    const gameId = await createGame(room, host);
    expect(room.state.players.get("host-sess")!.activeGameId).toBe(gameId);

    room.handleLeaveGame(host as unknown as MockClient);
    expect(room.state.players.get("host-sess")!.activeGameId).toBe("");
  });
});
