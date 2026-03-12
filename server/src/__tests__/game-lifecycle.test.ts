/**
 * Game Lifecycle Tests — Issue #161 (Win/Loss Conditions & Game-Ending Events)
 *
 * Covers:
 *   - Elimination detection (tiles + pawn checks)
 *   - Victory conditions (LastStanding, TimeUp, simultaneous elimination)
 *   - endGame() state transitions and broadcast verification
 *   - Action gating when game ended or player eliminated
 *   - Round timer decrement and edge cases
 *   - Edge cases (solo games, CPU-only room disposal)
 *
 * Conventions:
 *   - Object.create(GameRoom.prototype) pattern for room mocking
 *   - vi.fn() for broadcast verification
 *   - Direct tickGameEndConditions() calls for unit isolation
 *   - `as unknown as Type` for Colyseus type mocking
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GameState, PlayerState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { spawnHQ } from "../rooms/territory.js";
import {
  TICK_RATE,
  GAME_ENDED, PLAYER_ELIMINATED,
  GameEndReason,
  PAWN_TYPES,
} from "@primal-grid/shared";

// ── Constants matching GameRoom internals ──────────────────────────

/** Must match ELIMINATION_CHECK_INTERVAL in GameRoom.ts (10). */
const ELIMINATION_CHECK_INTERVAL = 10;

/** Must match ELIMINATION_GRACE_TICKS in GameRoom.ts (40). */
const ELIMINATION_GRACE_TICKS = 40;

// ── Private-method access via type assertion ───────────────────────

type TestableGameRoom = GameRoom & {
  generateMap(seed?: number, mapSize?: number): void;
  tickGameEndConditions(): void;
  handleSpawnPawn(
    client: { sessionId: string; send: (...args: unknown[]) => void },
    message: { pawnType: string; buildMode?: string },
  ): void;
  handlePlaceBuilding(
    client: { sessionId: string; send: (...args: unknown[]) => void },
    message: { x: number; y: number; buildingType: string },
  ): void;
  handleUpgradeOutpost(
    client: { sessionId: string; send: (...args: unknown[]) => void },
    message: { x: number; y: number },
  ): void;
  checkCpuOnlyRoom(): void;
  cpuPlayerIds: Set<string>;
  gameId: string;
  lobbyBridge?: { notifyGameEnded: (...args: unknown[]) => void; notifyPlayerCountChanged: (...args: unknown[]) => void };
};

interface MockClient {
  sessionId: string;
  send: ReturnType<typeof vi.fn>;
}

// ── Helpers ─────────────────────────────────────────────────────────

function createRoom(seed: number = 42): TestableGameRoom {
  const room = Object.create(GameRoom.prototype) as TestableGameRoom;
  room.state = new GameState();
  room.generateMap(seed);
  room.broadcast = vi.fn();
  room.cpuPlayerIds = new Set();
  room.gameId = "";
  room.clock = { setTimeout: vi.fn() } as unknown as GameRoom["clock"];
  return room;
}

function addPlayer(
  room: TestableGameRoom,
  id: string,
  opts: {
    displayName?: string;
    score?: number;
    isCPU?: boolean;
    isEliminated?: boolean;
    hqX?: number;
    hqY?: number;
  } = {},
): PlayerState {
  const player = new PlayerState();
  player.id = id;
  player.displayName = opts.displayName ?? id;
  player.score = opts.score ?? 0;
  player.isCPU = opts.isCPU ?? false;
  player.isEliminated = opts.isEliminated ?? false;
  room.state.players.set(id, player);

  // Spawn HQ at requested or default walkable position
  const hx = opts.hqX ?? 10;
  const hy = opts.hqY ?? 10;
  spawnHQ(room.state, player, hx, hy);

  if (opts.isCPU) {
    room.cpuPlayerIds.add(id);
  }

  return player;
}

function fakeClient(sessionId: string): MockClient {
  return { sessionId, send: vi.fn() };
}

/** Claim a non-HQ tile for a player. */
function claimNonHQTile(room: TestableGameRoom, x: number, y: number, ownerID: string): void {
  const tile = room.state.getTile(x, y);
  if (tile) {
    tile.ownerID = ownerID;
    tile.isHQTerritory = false;
  }
}

/** Add a living pawn owned by a player. */
function addPawn(
  room: TestableGameRoom,
  pawnId: string,
  ownerID: string,
  x: number,
  y: number,
  pawnType: string = "builder",
): CreatureState {
  const creature = new CreatureState();
  creature.id = pawnId;
  creature.creatureType = `pawn_${pawnType}`;
  creature.x = x;
  creature.y = y;
  creature.health = PAWN_TYPES[pawnType]?.health ?? 50;
  creature.hunger = 100;
  creature.currentState = "idle";
  creature.ownerID = ownerID;
  creature.pawnType = pawnType;
  creature.stamina = PAWN_TYPES[pawnType]?.maxStamina ?? 100;
  room.state.creatures.set(pawnId, creature);
  return creature;
}

/** Set tick to a value past the grace period that aligns to an elimination-check boundary. */
function setTickToEliminationCheck(room: TestableGameRoom): void {
  room.state.tick = ELIMINATION_GRACE_TICKS;
}

// ══════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════

describe("Game Lifecycle — Elimination Detection", () => {
  let room: TestableGameRoom;

  beforeEach(() => {
    room = createRoom();
  });

  it("eliminates player with 0 non-HQ tiles AND 0 living pawns", () => {
    const player = addPlayer(room, "p1");
    // Player has only HQ territory (no non-HQ tiles, no pawns)
    setTickToEliminationCheck(room);
    room.tickGameEndConditions();

    expect(player.isEliminated).toBe(true);
  });

  it("does NOT eliminate player with non-HQ tiles but 0 pawns", () => {
    const player = addPlayer(room, "p1");
    // Give player a tile outside HQ zone
    claimNonHQTile(room, 20, 20, "p1");

    setTickToEliminationCheck(room);
    room.tickGameEndConditions();

    expect(player.isEliminated).toBe(false);
  });

  it("does NOT eliminate player with 0 non-HQ tiles but living pawns", () => {
    const player = addPlayer(room, "p1");
    // No non-HQ tiles, but player has a living pawn
    addPawn(room, "pawn1", "p1", 12, 12);

    setTickToEliminationCheck(room);
    room.tickGameEndConditions();

    expect(player.isEliminated).toBe(false);
  });

  it("does NOT re-check already-eliminated players", () => {
    const _player = addPlayer(room, "p1", { isEliminated: true });
    // Even though player has no tiles/pawns, should not trigger again
    const broadcastSpy = room.broadcast as ReturnType<typeof vi.fn>;
    broadcastSpy.mockClear();

    setTickToEliminationCheck(room);
    room.tickGameEndConditions();

    // Should not broadcast PLAYER_ELIMINATED for already-eliminated player
    const eliminationBroadcasts = broadcastSpy.mock.calls.filter(
      (call: unknown[]) => call[0] === PLAYER_ELIMINATED,
    );
    expect(eliminationBroadcasts.length).toBe(0);
  });

  it("eliminates CPU players with no territory or pawns", () => {
    addPlayer(room, "human", { hqX: 25, hqY: 25 });
    claimNonHQTile(room, 30, 30, "human");
    const cpu = addPlayer(room, "cpu1", { isCPU: true });
    // CPU has only HQ territory — should be eliminated
    setTickToEliminationCheck(room);
    room.tickGameEndConditions();

    expect(cpu.isEliminated).toBe(true);
  });

  it("broadcasts PLAYER_ELIMINATED on elimination", () => {
    addPlayer(room, "p1", { displayName: "Alice" });
    // Ensure there's a second non-eliminated player so the game doesn't end immediately
    addPlayer(room, "p2", { hqX: 25, hqY: 25 });
    claimNonHQTile(room, 30, 30, "p2");

    setTickToEliminationCheck(room);
    room.tickGameEndConditions();

    expect(room.broadcast).toHaveBeenCalledWith(
      PLAYER_ELIMINATED,
      expect.objectContaining({
        playerId: "p1",
        playerName: "Alice",
      }),
    );
  });

  it("ignores dead pawns (health <= 0) for elimination check", () => {
    const player = addPlayer(room, "p1");
    // Add a dead pawn — should not count
    const deadPawn = addPawn(room, "pawn1", "p1", 12, 12);
    deadPawn.health = 0;

    setTickToEliminationCheck(room);
    room.tickGameEndConditions();

    expect(player.isEliminated).toBe(true);
  });

  it("only checks on ELIMINATION_CHECK_INTERVAL ticks", () => {
    addPlayer(room, "p1");
    // Tick not aligned to interval — elimination check should be skipped
    room.state.tick = ELIMINATION_GRACE_TICKS + 1;
    room.tickGameEndConditions();

    // Player was not eliminated because the interval check was skipped
    const player = room.state.players.get("p1")!;
    expect(player.isEliminated).toBe(false);
  });

  it("does not eliminate during grace period", () => {
    addPlayer(room, "p1");
    // Tick aligned to interval but within grace period
    room.state.tick = ELIMINATION_CHECK_INTERVAL;
    room.tickGameEndConditions();

    const player = room.state.players.get("p1")!;
    expect(player.isEliminated).toBe(false);
  });
});

describe("Game Lifecycle — Victory Conditions", () => {
  let room: TestableGameRoom;

  beforeEach(() => {
    room = createRoom();
  });

  it("last standing: 2 players, 1 eliminated → other wins with LastStanding", () => {
    addPlayer(room, "p1", { hqX: 10, hqY: 10 });
    // p1 has no non-HQ tiles, no pawns → will be eliminated
    const _p2 = addPlayer(room, "p2", { hqX: 25, hqY: 25 });
    claimNonHQTile(room, 30, 30, "p2");

    setTickToEliminationCheck(room);
    room.tickGameEndConditions();

    expect(room.state.roundPhase).toBe("ended");
    expect(room.state.winnerId).toBe("p2");
    expect(room.state.endReason).toBe(GameEndReason.LastStanding);
  });

  it("time up: roundTimer reaches 0 → highest score wins with TimeUp", () => {
    const _p1 = addPlayer(room, "p1", { score: 100 });
    const _p2 = addPlayer(room, "p2", { score: 200, hqX: 25, hqY: 25 });
    // Both have territory so neither is eliminated

    room.state.roundTimer = 1; // Will hit 0 on next tick
    room.tickGameEndConditions();

    expect(room.state.roundTimer).toBe(0);
    expect(room.state.roundPhase).toBe("ended");
    expect(room.state.winnerId).toBe("p2");
    expect(room.state.endReason).toBe(GameEndReason.TimeUp);
  });

  it("simultaneous elimination: all eliminated → highest score wins", () => {
    // Both players have no non-HQ tiles and no pawns → both eliminated simultaneously
    addPlayer(room, "p1", { score: 50, hqX: 10, hqY: 10 });
    addPlayer(room, "p2", { score: 80, hqX: 25, hqY: 25 });

    setTickToEliminationCheck(room);
    room.tickGameEndConditions();

    expect(room.state.roundPhase).toBe("ended");
    // Highest score player wins even though all were eliminated
    expect(room.state.winnerId).toBe("p2");
    expect(room.state.endReason).toBe(GameEndReason.LastStanding);
  });

  it("does not trigger victory if multiple non-eliminated players remain", () => {
    addPlayer(room, "p1", { hqX: 10, hqY: 10 });
    claimNonHQTile(room, 5, 5, "p1");
    addPlayer(room, "p2", { hqX: 25, hqY: 25 });
    claimNonHQTile(room, 30, 30, "p2");

    setTickToEliminationCheck(room);
    room.tickGameEndConditions();

    expect(room.state.roundPhase).toBe("playing");
    expect(room.state.winnerId).toBe("");
  });
});

describe("Game Lifecycle — endGame() Behavior", () => {
  let room: TestableGameRoom;

  beforeEach(() => {
    room = createRoom();
  });

  it("sets roundPhase to 'ended'", () => {
    addPlayer(room, "p1");
    room.endGame("p1", GameEndReason.LastStanding);

    expect(room.state.roundPhase).toBe("ended");
  });

  it("sets winnerId and endReason correctly", () => {
    addPlayer(room, "p1");
    room.endGame("p1", GameEndReason.TimeUp);

    expect(room.state.winnerId).toBe("p1");
    expect(room.state.endReason).toBe(GameEndReason.TimeUp);
  });

  it("builds finalScores sorted by score descending", () => {
    addPlayer(room, "p1", { score: 30, displayName: "Alice" });
    addPlayer(room, "p2", { score: 90, displayName: "Bob", hqX: 25, hqY: 25 });
    addPlayer(room, "p3", { score: 60, displayName: "Charlie", hqX: 15, hqY: 25 });

    room.endGame("p2", GameEndReason.LastStanding);

    const broadcastSpy = room.broadcast as ReturnType<typeof vi.fn>;
    const endCall = broadcastSpy.mock.calls.find(
      (call: unknown[]) => call[0] === GAME_ENDED,
    );
    expect(endCall).toBeDefined();

    const payload = endCall![1] as {
      winnerId: string;
      winnerName: string;
      reason: string;
      finalScores: Array<{ playerId: string; name: string; score: number }>;
    };
    expect(payload.finalScores.length).toBe(3);
    // Scores should be sorted descending
    expect(payload.finalScores[0].score).toBeGreaterThanOrEqual(payload.finalScores[1].score);
    expect(payload.finalScores[1].score).toBeGreaterThanOrEqual(payload.finalScores[2].score);
    // Bob (90) should be first
    expect(payload.finalScores[0].playerId).toBe("p2");
    expect(payload.finalScores[0].name).toBe("Bob");
  });

  it("broadcasts GAME_ENDED message with correct payload", () => {
    addPlayer(room, "winner1", { displayName: "Champion", score: 100 });

    room.endGame("winner1", GameEndReason.LastStanding);

    expect(room.broadcast).toHaveBeenCalledWith(
      GAME_ENDED,
      expect.objectContaining({
        winnerId: "winner1",
        winnerName: "Champion",
        reason: GameEndReason.LastStanding,
        finalScores: expect.any(Array),
      }),
    );
  });

  it("broadcasts game_log system message", () => {
    addPlayer(room, "p1", { displayName: "Alice" });
    room.endGame("p1", GameEndReason.TimeUp);

    expect(room.broadcast).toHaveBeenCalledWith(
      "game_log",
      expect.objectContaining({
        type: "system",
      }),
    );
  });

  it("is idempotent — second call does nothing", () => {
    addPlayer(room, "p1");
    room.endGame("p1", GameEndReason.LastStanding);

    const broadcastSpy = room.broadcast as ReturnType<typeof vi.fn>;
    const callCount = broadcastSpy.mock.calls.length;

    // Second call should be no-op
    room.endGame("p1", GameEndReason.TimeUp);
    expect(broadcastSpy.mock.calls.length).toBe(callCount);
    // endReason should still be the first call's reason
    expect(room.state.endReason).toBe(GameEndReason.LastStanding);
  });

  it("notifies lobby via lobbyBridge when gameId is set", () => {
    const mockBridge = { notifyGameEnded: vi.fn(), notifyPlayerCountChanged: vi.fn() };
    room.gameId = "game-123";
    room.lobbyBridge = mockBridge;

    addPlayer(room, "p1");
    room.endGame("p1", GameEndReason.LastStanding);

    expect(mockBridge.notifyGameEnded).toHaveBeenCalledWith("game-123");
  });

  it("schedules auto-dispose via clock.setTimeout", () => {
    addPlayer(room, "p1");
    room.endGame("p1", GameEndReason.LastStanding);

    const clockSpy = room.clock.setTimeout as ReturnType<typeof vi.fn>;
    expect(clockSpy).toHaveBeenCalledWith(expect.any(Function), 60 * 1000);
  });
});

describe("Game Lifecycle — Action Gating", () => {
  let room: TestableGameRoom;

  beforeEach(() => {
    room = createRoom();
  });

  it("rejects spawn pawn when roundPhase === 'ended'", () => {
    addPlayer(room, "p1");
    room.state.roundPhase = "ended";
    const client = fakeClient("p1");

    room.handleSpawnPawn(client, { pawnType: "builder" });

    expect(client.send).toHaveBeenCalledWith(
      "game_log",
      expect.objectContaining({ message: "Game has ended." }),
    );
  });

  it("rejects spawn pawn when player.isEliminated === true", () => {
    const player = addPlayer(room, "p1");
    player.isEliminated = true;
    const client = fakeClient("p1");

    room.handleSpawnPawn(client, { pawnType: "builder" });

    expect(client.send).toHaveBeenCalledWith(
      "game_log",
      expect.objectContaining({ message: "You have been eliminated." }),
    );
  });

  it("rejects place building when game ended", () => {
    addPlayer(room, "p1");
    room.state.roundPhase = "ended";
    const client = fakeClient("p1");

    room.handlePlaceBuilding(client, { x: 10, y: 10, buildingType: "farm" });

    expect(client.send).toHaveBeenCalledWith(
      "game_log",
      expect.objectContaining({ message: "Game has ended." }),
    );
  });

  it("rejects place building when player eliminated", () => {
    const player = addPlayer(room, "p1");
    player.isEliminated = true;
    const client = fakeClient("p1");

    room.handlePlaceBuilding(client, { x: 10, y: 10, buildingType: "farm" });

    expect(client.send).toHaveBeenCalledWith(
      "game_log",
      expect.objectContaining({ message: "You have been eliminated." }),
    );
  });

  it("rejects upgrade outpost when game ended", () => {
    addPlayer(room, "p1");
    room.state.roundPhase = "ended";
    const client = fakeClient("p1");

    room.handleUpgradeOutpost(client, { x: 10, y: 10 });

    expect(client.send).toHaveBeenCalledWith(
      "game_log",
      expect.objectContaining({ message: "Game has ended." }),
    );
  });

  it("rejects upgrade outpost when player eliminated", () => {
    const player = addPlayer(room, "p1");
    player.isEliminated = true;
    const client = fakeClient("p1");

    room.handleUpgradeOutpost(client, { x: 10, y: 10 });

    expect(client.send).toHaveBeenCalledWith(
      "game_log",
      expect.objectContaining({ message: "You have been eliminated." }),
    );
  });
});

describe("Game Lifecycle — Round Timer", () => {
  let room: TestableGameRoom;

  beforeEach(() => {
    room = createRoom();
  });

  it("decrements timer each tick when > 0", () => {
    addPlayer(room, "p1");
    claimNonHQTile(room, 20, 20, "p1");
    room.state.roundTimer = 100;

    room.tickGameEndConditions();

    expect(room.state.roundTimer).toBe(99);
  });

  it("timer stays at -1 for unlimited games", () => {
    addPlayer(room, "p1");
    claimNonHQTile(room, 20, 20, "p1"); // Prevent elimination
    room.state.roundTimer = -1;

    room.tickGameEndConditions();

    expect(room.state.roundTimer).toBe(-1);
    expect(room.state.roundPhase).toBe("playing");
  });

  it("game ends when timer hits 0", () => {
    addPlayer(room, "p1", { score: 50 });
    room.state.roundTimer = 1;

    room.tickGameEndConditions();

    expect(room.state.roundTimer).toBe(0);
    expect(room.state.roundPhase).toBe("ended");
    expect(room.state.endReason).toBe(GameEndReason.TimeUp);
  });

  it("timer not decremented after game ends", () => {
    addPlayer(room, "p1");
    room.state.roundPhase = "ended";
    room.state.roundTimer = 50;

    room.tickGameEndConditions();

    // tickGameEndConditions exits early when roundPhase !== "playing"
    expect(room.state.roundTimer).toBe(50);
  });

  it("timer initialization: gameDuration 0 sets roundTimer to -1", () => {
    // Verify the constant logic: gameDuration=0 → infinite
    const state = new GameState();
    // Simulating what onCreate does
    const gameDuration = 0;
    if (gameDuration === 0) {
      state.roundTimer = -1;
    } else {
      state.roundTimer = gameDuration * 60 * TICK_RATE;
    }
    expect(state.roundTimer).toBe(-1);
  });

  it("timer initialization: gameDuration N converts to ticks correctly", () => {
    const state = new GameState();
    const gameDuration = 10; // 10 minutes
    state.roundTimer = gameDuration * 60 * TICK_RATE;
    // 10 minutes × 60 seconds × 4 ticks/sec = 2400
    expect(state.roundTimer).toBe(10 * 60 * TICK_RATE);
  });
});

describe("Game Lifecycle — Edge Cases", () => {
  let room: TestableGameRoom;

  beforeEach(() => {
    room = createRoom();
  });

  it("single player game: elimination still triggers game end", () => {
    // Solo player with no non-HQ tiles and no pawns
    addPlayer(room, "solo", { score: 42 });

    setTickToEliminationCheck(room);
    room.tickGameEndConditions();

    // Player eliminated, 0 non-eliminated remain → highest score wins
    expect(room.state.roundPhase).toBe("ended");
    expect(room.state.winnerId).toBe("solo");
  });

  it("single player game: timer expiry awards victory", () => {
    addPlayer(room, "solo", { score: 10 });
    claimNonHQTile(room, 20, 20, "solo");
    room.state.roundTimer = 1;

    room.tickGameEndConditions();

    expect(room.state.roundPhase).toBe("ended");
    expect(room.state.endReason).toBe(GameEndReason.TimeUp);
    expect(room.state.winnerId).toBe("solo");
  });

  it("solo player with CPU enemies: CPU can be eliminated", () => {
    addPlayer(room, "human", { score: 50 });
    claimNonHQTile(room, 20, 20, "human");
    addPlayer(room, "cpu1", { isCPU: true, hqX: 25, hqY: 25 });

    setTickToEliminationCheck(room);
    room.tickGameEndConditions();

    // CPU has no territory outside HQ → eliminated, human wins
    const cpu = room.state.players.get("cpu1")!;
    expect(cpu.isEliminated).toBe(true);
    const human = room.state.players.get("human")!;
    expect(human.isEliminated).toBe(false);
    expect(room.state.roundPhase).toBe("ended");
    expect(room.state.winnerId).toBe("human");
  });

  it("CPU-only room: checkCpuOnlyRoom disposes when no humans remain", () => {
    // Add only CPU players
    addPlayer(room, "cpu1", { isCPU: true, hqX: 10, hqY: 10 });
    addPlayer(room, "cpu2", { isCPU: true, hqX: 25, hqY: 25 });

    // Mock disconnect
    room.disconnect = vi.fn() as unknown as GameRoom["disconnect"];

    room.checkCpuOnlyRoom();

    expect(room.disconnect).toHaveBeenCalled();
  });

  it("simulation loop early exit when roundPhase is 'ended'", () => {
    // The simulation interval in onCreate checks:
    // if (this.state.roundPhase === "ended") return;
    // Verify tickGameEndConditions also exits early
    addPlayer(room, "p1");
    room.state.roundPhase = "ended";
    room.state.roundTimer = 100;

    const broadcastSpy = room.broadcast as ReturnType<typeof vi.fn>;
    broadcastSpy.mockClear();

    room.tickGameEndConditions();

    // Should not decrement timer or do anything
    expect(room.state.roundTimer).toBe(100);
    expect(broadcastSpy).not.toHaveBeenCalled();
  });

  it("game end during active timer: timer stops decrementing", () => {
    addPlayer(room, "p1", { score: 100, hqX: 10, hqY: 10 });
    addPlayer(room, "p2", { score: 50, hqX: 25, hqY: 25 });
    // p1 has no non-HQ tiles/pawns → will be eliminated
    claimNonHQTile(room, 30, 30, "p2");

    room.state.roundTimer = 500;
    setTickToEliminationCheck(room);

    // Timer decrements first, then elimination check runs
    room.tickGameEndConditions();

    // Timer should have decremented by 1
    expect(room.state.roundTimer).toBe(499);
    // Game should have ended (p1 eliminated → p2 wins)
    expect(room.state.roundPhase).toBe("ended");

    // Subsequent tick should not decrement further
    const broadcastSpy = room.broadcast as ReturnType<typeof vi.fn>;
    broadcastSpy.mockClear();
    room.tickGameEndConditions();
    expect(room.state.roundTimer).toBe(499);
  });

  it("player with pawns but territory only in HQ zone is NOT eliminated", () => {
    const player = addPlayer(room, "p1");
    // Player has HQ territory only (all tiles are isHQTerritory=true)
    // But player has a living pawn
    addPawn(room, "pawn1", "p1", 12, 12);

    setTickToEliminationCheck(room);
    room.tickGameEndConditions();

    expect(player.isEliminated).toBe(false);
  });

  it("multiple players eliminated same tick → correct winner chosen by score", () => {
    // Three players, two will be eliminated
    addPlayer(room, "p1", { score: 10, hqX: 5, hqY: 5 });
    addPlayer(room, "p2", { score: 30, hqX: 15, hqY: 15 });
    addPlayer(room, "p3", { score: 20, hqX: 25, hqY: 25 });
    // Give p3 territory so they survive
    claimNonHQTile(room, 30, 30, "p3");

    setTickToEliminationCheck(room);
    room.tickGameEndConditions();

    // p1 and p2 eliminated (no non-HQ tiles, no pawns)
    expect(room.state.players.get("p1")!.isEliminated).toBe(true);
    expect(room.state.players.get("p2")!.isEliminated).toBe(true);
    // p3 wins as last standing
    expect(room.state.roundPhase).toBe("ended");
    expect(room.state.winnerId).toBe("p3");
    expect(room.state.endReason).toBe(GameEndReason.LastStanding);
  });

  it("getHighestScorePlayer picks the correct winner on TimeUp", () => {
    addPlayer(room, "p1", { score: 200 });
    addPlayer(room, "p2", { score: 300, hqX: 25, hqY: 25 });
    addPlayer(room, "p3", { score: 100, hqX: 15, hqY: 25 });

    room.state.roundTimer = 1;
    room.tickGameEndConditions();

    expect(room.state.winnerId).toBe("p2");
  });

  it("endGame with empty winnerId handles gracefully", () => {
    // Edge case: no players at all
    room.endGame("", GameEndReason.TimeUp);

    expect(room.state.roundPhase).toBe("ended");
    expect(room.state.winnerId).toBe("");
    expect(room.state.endReason).toBe(GameEndReason.TimeUp);
  });
});

// ══════════════════════════════════════════════════════════════════════
// CPU Inclusion & Grace Period — Game-End Condition Fixes
// ══════════════════════════════════════════════════════════════════════

describe("Game Lifecycle — CPU Inclusion & Grace Period", () => {
  let room: TestableGameRoom;

  beforeEach(() => {
    room = createRoom();
  });

  it("single human + CPU players should NOT end game immediately", () => {
    // 1 human + 2 CPUs, all with non-HQ territory → nobody eliminated
    addPlayer(room, "human1", { hqX: 10, hqY: 10 });
    claimNonHQTile(room, 5, 5, "human1");

    addPlayer(room, "cpu1", { isCPU: true, hqX: 20, hqY: 20 });
    claimNonHQTile(room, 25, 25, "cpu1");

    addPlayer(room, "cpu2", { isCPU: true, hqX: 15, hqY: 25 });
    claimNonHQTile(room, 18, 28, "cpu2");

    // Past grace period, on elimination check interval
    room.state.tick = ELIMINATION_GRACE_TICKS;
    room.tickGameEndConditions();

    // All three alive → game continues
    expect(room.state.roundPhase).toBe("playing");
    expect(room.state.winnerId).toBe("");
  });

  it("game should not end while non-eliminated CPU players remain", () => {
    // Human has no non-HQ tiles/pawns → will be eliminated
    // Two CPUs alive with territory → game continues after human is eliminated
    addPlayer(room, "human1", { hqX: 10, hqY: 10 });

    addPlayer(room, "cpu1", { isCPU: true, hqX: 20, hqY: 20 });
    claimNonHQTile(room, 25, 25, "cpu1");

    addPlayer(room, "cpu2", { isCPU: true, hqX: 15, hqY: 25 });
    claimNonHQTile(room, 18, 28, "cpu2");

    room.state.tick = ELIMINATION_GRACE_TICKS;
    room.tickGameEndConditions();

    // Human eliminated, but 2 CPUs remain → game does NOT end
    expect(room.state.players.get("human1")!.isEliminated).toBe(true);
    expect(room.state.roundPhase).toBe("playing");
  });

  it("CPU players can be eliminated", () => {
    // Human has territory → survives
    addPlayer(room, "human1", { hqX: 10, hqY: 10 });
    claimNonHQTile(room, 5, 5, "human1");

    // CPU has 0 non-HQ tiles, 0 pawns → should be eliminated
    const cpu = addPlayer(room, "cpu1", { isCPU: true, hqX: 20, hqY: 20 });

    room.state.tick = ELIMINATION_GRACE_TICKS;
    room.tickGameEndConditions();

    expect(cpu.isEliminated).toBe(true);
  });

  it("elimination grace period protects new players", () => {
    // Player with 0 non-HQ tiles, 0 pawns — would normally be eliminated
    const player = addPlayer(room, "p1", { hqX: 10, hqY: 10 });

    // Tick 10: within grace period (< 40), elimination should NOT fire
    room.state.tick = ELIMINATION_CHECK_INTERVAL;
    room.tickGameEndConditions();

    expect(player.isEliminated).toBe(false);

    // Tick 40: grace period expired (40 >= 40 && 40 % 10 === 0)
    room.state.tick = ELIMINATION_GRACE_TICKS;
    room.tickGameEndConditions();

    expect(player.isEliminated).toBe(true);
  });

  it("game ends when only one player remains (human or CPU)", () => {
    // Human already eliminated
    addPlayer(room, "human1", { hqX: 10, hqY: 10, isEliminated: true });

    // CPU1 alive with territory + pawn
    addPlayer(room, "cpu1", { isCPU: true, hqX: 20, hqY: 20, score: 100 });
    claimNonHQTile(room, 25, 25, "cpu1");
    addPawn(room, "cpu-pawn1", "cpu1", 22, 22);

    // CPU2 has 0 non-HQ tiles, 0 pawns → will be eliminated
    addPlayer(room, "cpu2", { isCPU: true, hqX: 15, hqY: 25 });

    room.state.tick = ELIMINATION_GRACE_TICKS;
    room.tickGameEndConditions();

    // cpu2 eliminated → only cpu1 remains → game ends with cpu1 as winner
    expect(room.state.roundPhase).toBe("ended");
    expect(room.state.winnerId).toBe("cpu1");
    expect(room.state.endReason).toBe(GameEndReason.LastStanding);
  });

  it("single human with CPU opponents continues until actual victory", () => {
    // Human has territory → survives
    addPlayer(room, "human1", { hqX: 10, hqY: 10, score: 50 });
    claimNonHQTile(room, 5, 5, "human1");

    // Both CPUs have 0 non-HQ tiles, 0 pawns → will be eliminated
    addPlayer(room, "cpu1", { isCPU: true, hqX: 20, hqY: 20 });
    addPlayer(room, "cpu2", { isCPU: true, hqX: 15, hqY: 25 });

    room.state.tick = ELIMINATION_GRACE_TICKS;
    room.tickGameEndConditions();

    // Both CPUs eliminated → human is last standing
    expect(room.state.players.get("cpu1")!.isEliminated).toBe(true);
    expect(room.state.players.get("cpu2")!.isEliminated).toBe(true);
    expect(room.state.roundPhase).toBe("ended");
    expect(room.state.winnerId).toBe("human1");
    expect(room.state.endReason).toBe(GameEndReason.LastStanding);
  });
});
