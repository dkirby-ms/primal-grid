import { describe, it, expect, vi } from "vitest";
import { GameState, PlayerState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { evaluateCpuDecision, tickCpuPlayers } from "../rooms/cpuPlayerAI.js";
import {
  PAWN_TYPES, CPU_PLAYER, TERRITORY,
} from "@primal-grid/shared";
import { spawnHQ } from "../rooms/territory.js";

// ─── Test helpers ──────────────────────────────────────────────

function createRoomWithMap(seed?: number): GameRoom {
  const room = Object.create(GameRoom.prototype) as GameRoom;
  room.state = new GameState();
  (room as unknown as { generateMap: (s?: number) => void }).generateMap(seed ?? 42);
  room.broadcast = vi.fn();
  room.cpuPlayerIds = new Set<string>();
  // Initialize fields tests may touch
  (room as unknown as Record<string, unknown>).playerViews = new Map();
  (room as unknown as Record<string, unknown>).sessionUserMap = new Map();
  return room;
}

function addPlayerWithHQ(room: GameRoom, playerId: string, resources?: { wood: number; stone: number }): PlayerState {
  const player = new PlayerState();
  player.id = playerId;
  player.displayName = `Player_${playerId}`;
  player.color = "#ffffff";
  room.state.players.set(playerId, player);

  // Find HQ location and spawn
  const hqPos = findValidHQPos(room);
  spawnHQ(room.state, player, hqPos.x, hqPos.y);

  if (resources) {
    player.wood = resources.wood;
    player.stone = resources.stone;
  }
  return player;
}

function findValidHQPos(room: GameRoom): { x: number; y: number } {
  const w = room.state.mapWidth;
  const h = room.state.mapHeight;
  const half = Math.floor(TERRITORY.STARTING_SIZE / 2);
  for (let y = half; y < h - half; y++) {
    for (let x = half; x < w - half; x++) {
      if (room.state.isWalkable(x, y)) return { x, y };
    }
  }
  return { x: half, y: half };
}

function addEnemyMobile(room: GameRoom, id: string, x: number, y: number): CreatureState {
  const creature = new CreatureState();
  creature.id = id;
  creature.creatureType = "enemy_raider";
  creature.x = x;
  creature.y = y;
  creature.health = 40;
  creature.currentState = "idle";
  room.state.creatures.set(id, creature);
  return creature;
}

// ─── evaluateCpuDecision tests ─────────────────────────────────

describe("evaluateCpuDecision", () => {
  it("returns null when player cannot afford any pawn", () => {
    const room = createRoomWithMap();
    const player = addPlayerWithHQ(room, "cpu_0", { wood: 0, stone: 0 });

    const decision = evaluateCpuDecision(room.state, player, "cpu_0");
    expect(decision).toBeNull();
  });

  it("spawns a builder first when no pawns exist and resources allow", () => {
    const room = createRoomWithMap();
    const builderDef = PAWN_TYPES["builder"];
    const player = addPlayerWithHQ(room, "cpu_0", {
      wood: builderDef.cost.wood,
      stone: builderDef.cost.stone,
    });

    const decision = evaluateCpuDecision(room.state, player, "cpu_0");
    expect(decision).not.toBeNull();
    expect(decision!.pawnType).toBe("builder");
    expect(decision!.buildMode).toBe("outpost");
  });

  it("prioritizes defender when threats are nearby and affordable", () => {
    const room = createRoomWithMap();
    const defenderDef = PAWN_TYPES["defender"];
    const player = addPlayerWithHQ(room, "cpu_0", {
      wood: defenderDef.cost.wood,
      stone: defenderDef.cost.stone,
    });

    // Place enemy mobile near HQ
    addEnemyMobile(room, "raider_1", player.hqX + 5, player.hqY);

    const decision = evaluateCpuDecision(room.state, player, "cpu_0");
    expect(decision).not.toBeNull();
    expect(decision!.pawnType).toBe("defender");
  });

  it("spawns attacker when base needs are met", () => {
    const room = createRoomWithMap();
    const player = addPlayerWithHQ(room, "cpu_0", { wood: 200, stone: 200 });

    // Simulate having builder and defender already
    const builder = new CreatureState();
    builder.id = "b1";
    builder.creatureType = "pawn_builder";
    builder.ownerID = "cpu_0";
    builder.pawnType = "builder";
    builder.x = player.hqX;
    builder.y = player.hqY;
    room.state.creatures.set("b1", builder);

    const builder2 = new CreatureState();
    builder2.id = "b2";
    builder2.creatureType = "pawn_builder";
    builder2.ownerID = "cpu_0";
    builder2.pawnType = "builder";
    builder2.x = player.hqX;
    builder2.y = player.hqY;
    room.state.creatures.set("b2", builder2);

    const defender = new CreatureState();
    defender.id = "d1";
    defender.creatureType = "pawn_defender";
    defender.ownerID = "cpu_0";
    defender.pawnType = "defender";
    defender.x = player.hqX;
    defender.y = player.hqY;
    room.state.creatures.set("d1", defender);

    const decision = evaluateCpuDecision(room.state, player, "cpu_0");
    expect(decision).not.toBeNull();
    expect(decision!.pawnType).toBe("attacker");
  });
});

// ─── tickCpuPlayers tests ──────────────────────────────────────

describe("tickCpuPlayers", () => {
  it("only evaluates on TICK_INTERVAL boundaries", () => {
    const room = createRoomWithMap();
    addPlayerWithHQ(room, "cpu_0", { wood: 100, stone: 100 });
    const cpuIds = new Set(["cpu_0"]);
    const spawnFn = vi.fn();

    // Off-interval tick — should not call spawnFn
    room.state.tick = CPU_PLAYER.TICK_INTERVAL + 1;
    tickCpuPlayers(room.state, cpuIds, room as unknown as import("colyseus").Room, spawnFn);
    expect(spawnFn).not.toHaveBeenCalled();

    // On-interval tick — should evaluate
    room.state.tick = CPU_PLAYER.TICK_INTERVAL * 2;
    tickCpuPlayers(room.state, cpuIds, room as unknown as import("colyseus").Room, spawnFn);
    expect(spawnFn).toHaveBeenCalled();
  });

  it("calls spawnPawnForCpu when decision is made", () => {
    const room = createRoomWithMap();
    const builderDef = PAWN_TYPES["builder"];
    addPlayerWithHQ(room, "cpu_0", {
      wood: builderDef.cost.wood,
      stone: builderDef.cost.stone,
    });
    const cpuIds = new Set(["cpu_0"]);
    const spawnFn = vi.fn();

    room.state.tick = CPU_PLAYER.TICK_INTERVAL;
    tickCpuPlayers(room.state, cpuIds, room as unknown as import("colyseus").Room, spawnFn);
    expect(spawnFn).toHaveBeenCalledWith("cpu_0", "builder", "outpost");
  });
});

// ─── GameRoom CPU integration tests ────────────────────────────

describe("GameRoom CPU player integration", () => {
  it("creates CPU players in onCreate when cpuPlayers option is set", () => {
    const room = createRoomWithMap();
    // Manually invoke the spawnCpuPlayer method to test
    const spawnCpu = (room as unknown as { spawnCpuPlayer: (i: number) => void }).spawnCpuPlayer.bind(room);
    spawnCpu(0);

    expect(room.cpuPlayerIds.has("cpu_0")).toBe(true);
    const cpuPlayer = room.state.players.get("cpu_0");
    expect(cpuPlayer).toBeDefined();
    expect(cpuPlayer!.displayName).toBe("Atlas");
    expect(cpuPlayer!.hqX).toBeGreaterThanOrEqual(0);
    expect(cpuPlayer!.hqY).toBeGreaterThanOrEqual(0);
  });

  it("CPU players get structure income like human players", () => {
    const room = createRoomWithMap();
    const spawnCpu = (room as unknown as { spawnCpuPlayer: (i: number) => void }).spawnCpuPlayer.bind(room);
    spawnCpu(0);

    const cpuPlayer = room.state.players.get("cpu_0")!;
    const woodBefore = cpuPlayer.wood;
    const stoneBefore = cpuPlayer.stone;

    // Run tickStructureIncome at the right tick
    room.state.tick = 40; // STRUCTURE_INCOME.INTERVAL_TICKS
    const tickIncome = (room as unknown as { tickStructureIncome: () => void }).tickStructureIncome.bind(room);
    tickIncome();

    // CPU player should have received HQ income
    expect(cpuPlayer.wood).toBeGreaterThan(woodBefore);
    expect(cpuPlayer.stone).toBeGreaterThan(stoneBefore);
  });

  it("spawnPawnCore spawns a pawn for a CPU player", () => {
    const room = createRoomWithMap();
    const spawnCpu = (room as unknown as { spawnCpuPlayer: (i: number) => void }).spawnCpuPlayer.bind(room);
    spawnCpu(0);

    const cpuPlayer = room.state.players.get("cpu_0")!;
    cpuPlayer.wood = 100;
    cpuPlayer.stone = 100;

    const creature = room.spawnPawnCore("cpu_0", cpuPlayer, "builder", "outpost");
    expect(creature).not.toBeNull();
    expect(creature!.ownerID).toBe("cpu_0");
    expect(creature!.pawnType).toBe("builder");
    expect(creature!.buildMode).toBe("outpost");
  });

  it("spawnPawnCore returns null when resources insufficient", () => {
    const room = createRoomWithMap();
    const spawnCpu = (room as unknown as { spawnCpuPlayer: (i: number) => void }).spawnCpuPlayer.bind(room);
    spawnCpu(0);

    const cpuPlayer = room.state.players.get("cpu_0")!;
    cpuPlayer.wood = 0;
    cpuPlayer.stone = 0;

    const creature = room.spawnPawnCore("cpu_0", cpuPlayer, "builder", "outpost");
    expect(creature).toBeNull();
  });

  it("spawnPawnCore respects pawn cap", () => {
    const room = createRoomWithMap();
    const spawnCpu = (room as unknown as { spawnCpuPlayer: (i: number) => void }).spawnCpuPlayer.bind(room);
    spawnCpu(0);

    const cpuPlayer = room.state.players.get("cpu_0")!;
    cpuPlayer.wood = 1000;
    cpuPlayer.stone = 1000;

    // Fill up to maxCount builders
    const maxBuilders = PAWN_TYPES["builder"].maxCount;
    for (let i = 0; i < maxBuilders; i++) {
      const result = room.spawnPawnCore("cpu_0", cpuPlayer, "builder", "outpost");
      expect(result).not.toBeNull();
    }

    // Next spawn should fail — at cap
    const overflow = room.spawnPawnCore("cpu_0", cpuPlayer, "builder", "outpost");
    expect(overflow).toBeNull();
  });

  it("checkCpuOnlyRoom disposes when only CPU players remain", () => {
    const room = createRoomWithMap();
    room.disconnect = vi.fn();

    const spawnCpu = (room as unknown as { spawnCpuPlayer: (i: number) => void }).spawnCpuPlayer.bind(room);
    spawnCpu(0);
    spawnCpu(1);

    // Add a human player
    const humanPlayer = new PlayerState();
    humanPlayer.id = "human_1";
    room.state.players.set("human_1", humanPlayer);

    // Remove human
    room.state.players.delete("human_1");

    const checkCpuOnly = (room as unknown as { checkCpuOnlyRoom: () => void }).checkCpuOnlyRoom.bind(room);
    checkCpuOnly();

    expect(room.disconnect).toHaveBeenCalled();
  });

  it("checkCpuOnlyRoom does NOT dispose when human players remain", () => {
    const room = createRoomWithMap();
    room.disconnect = vi.fn();

    const spawnCpu = (room as unknown as { spawnCpuPlayer: (i: number) => void }).spawnCpuPlayer.bind(room);
    spawnCpu(0);

    // Human still present
    const humanPlayer = new PlayerState();
    humanPlayer.id = "human_1";
    room.state.players.set("human_1", humanPlayer);

    const checkCpuOnly = (room as unknown as { checkCpuOnlyRoom: () => void }).checkCpuOnlyRoom.bind(room);
    checkCpuOnly();

    expect(room.disconnect).not.toHaveBeenCalled();
  });

  it("checkCpuOnlyRoom is no-op when there are no CPU players", () => {
    const room = createRoomWithMap();
    room.disconnect = vi.fn();

    const humanPlayer = new PlayerState();
    humanPlayer.id = "human_1";
    room.state.players.set("human_1", humanPlayer);

    const checkCpuOnly = (room as unknown as { checkCpuOnlyRoom: () => void }).checkCpuOnlyRoom.bind(room);
    checkCpuOnly();

    expect(room.disconnect).not.toHaveBeenCalled();
  });

  it("CPU player names follow the defined order", () => {
    const room = createRoomWithMap();
    const spawnCpu = (room as unknown as { spawnCpuPlayer: (i: number) => void }).spawnCpuPlayer.bind(room);

    spawnCpu(0);
    spawnCpu(1);
    spawnCpu(2);

    expect(room.state.players.get("cpu_0")!.displayName).toBe("Atlas");
    expect(room.state.players.get("cpu_1")!.displayName).toBe("Borealis");
    expect(room.state.players.get("cpu_2")!.displayName).toBe("Cypher");
  });

  it("CPU session IDs use the defined prefix", () => {
    const room = createRoomWithMap();
    const spawnCpu = (room as unknown as { spawnCpuPlayer: (i: number) => void }).spawnCpuPlayer.bind(room);
    spawnCpu(3);

    expect(room.cpuPlayerIds.has("cpu_3")).toBe(true);
    expect(room.state.players.has("cpu_3")).toBe(true);
  });
});

// ─── CPU_PLAYER constants tests ────────────────────────────────

describe("CPU_PLAYER constants", () => {
  it("has valid tick interval", () => {
    expect(CPU_PLAYER.TICK_INTERVAL).toBeGreaterThan(0);
  });

  it("has valid max count", () => {
    expect(CPU_PLAYER.MAX_COUNT).toBe(7);
  });

  it("has enough names for MAX_COUNT", () => {
    expect(CPU_PLAYER.NAMES.length).toBeGreaterThanOrEqual(CPU_PLAYER.MAX_COUNT);
  });

  it("session prefix matches expected pattern", () => {
    expect(CPU_PLAYER.SESSION_PREFIX).toBe("cpu_");
  });
});
