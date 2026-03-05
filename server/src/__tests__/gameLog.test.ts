import { describe, it, expect, vi } from "vitest";
import { GameState, PlayerState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import {
  TileType, DEFAULT_MAP_SIZE,
  CREATURE_AI, CREATURE_TYPES, TERRITORY,
  PAWN, SPAWN_PAWN,
} from "@primal-grid/shared";
import type { SpawnPawnPayload } from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): any {
  const room = Object.create(GameRoom.prototype) as any;
  room.state = new GameState();
  room.generateMap(seed);
  // Install a spy so we can capture broadcast calls
  room.broadcast = vi.fn();
  return room;
}

function fakeClient(sessionId: string): any {
  return { sessionId, send: vi.fn() };
}

function joinPlayer(room: any, sessionId: string) {
  const client = fakeClient(sessionId);
  room.onJoin(client);
  const player = room.state.players.get(sessionId)!;
  return { client, player };
}

/** Create a pawn_builder CreatureState and add it to the room. */
function addBuilder(
  room: any,
  id: string,
  ownerID: string,
  x: number,
  y: number,
  overrides: Partial<{
    health: number;
    currentState: string;
  }> = {},
): any {
  const creature = new CreatureState();
  creature.id = id;
  creature.creatureType = "pawn_builder";
  creature.x = x;
  creature.y = y;
  creature.health = overrides.health ?? PAWN.BUILDER_HEALTH;
  creature.currentState = overrides.currentState ?? "idle";
  creature.ownerID = ownerID;
  creature.pawnType = "builder";
  creature.targetX = -1;
  creature.targetY = -1;
  creature.buildProgress = 0;
  room.state.creatures.set(id, creature);
  return creature;
}

/** Add a wild creature (carnivore/herbivore). */
function addCreature(
  room: any,
  id: string,
  type: string,
  x: number,
  y: number,
  overrides: Partial<{ health: number; hunger: number; currentState: string }> = {},
): any {
  const creature = new CreatureState();
  creature.id = id;
  creature.creatureType = type;
  creature.x = x;
  creature.y = y;
  const typeDef = (CREATURE_TYPES as Record<string, any>)[type];
  creature.health = overrides.health ?? typeDef.health;
  creature.hunger = overrides.hunger ?? typeDef.hunger;
  creature.currentState = overrides.currentState ?? "idle";
  room.state.creatures.set(id, creature);
  return creature;
}

/** Find a walkable tile anywhere on the map. */
function findWalkableTile(room: any): { x: number; y: number } {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (room.state.isWalkable(tile.x, tile.y)) {
      return { x: tile.x, y: tile.y };
    }
  }
  return { x: 1, y: 1 };
}

/** Find a walkable tile within the player's HQ zone. */
function findWalkableTileInHQ(room: any, player: any): { x: number; y: number } | null {
  const half = Math.floor(TERRITORY.STARTING_SIZE / 2);
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const tx = player.hqX + dx;
      const ty = player.hqY + dy;
      if (room.state.isWalkable(tx, ty)) {
        return { x: tx, y: ty };
      }
    }
  }
  return null;
}

/** Tick creature AI once. */
function tickAI(room: any): void {
  room.state.tick += CREATURE_AI.TICK_INTERVAL;
  if (typeof room.tickCreatureAI === "function") room.tickCreatureAI();
}

/** Tick upkeep system once at the given cycle number. */
function tickUpkeep(room: any, cycle: number): void {
  room.state.tick = PAWN.UPKEEP_INTERVAL_TICKS * cycle;
  if (typeof room.tickPawnUpkeep === "function") {
    room.tickPawnUpkeep();
  } else if (typeof room.tickCreatureAI === "function") {
    room.tickCreatureAI();
  }
}

/** Collect all broadcast calls matching a given message type. */
function getLogBroadcasts(room: any, logType?: string): any[] {
  return room.broadcast.mock.calls
    .filter((call: any[]) => call[0] === "game_log")
    .map((call: any[]) => call[1])
    .filter((payload: any) => !logType || payload?.type === logType);
}

/** Collect all client.send calls matching "game_log". */
function getClientLogs(client: any, logType?: string): any[] {
  return client.send.mock.calls
    .filter((call: any[]) => call[0] === "game_log")
    .map((call: any[]) => call[1])
    .filter((payload: any) => !logType || payload?.type === logType);
}

// ═════════════════════════════════════════════════════════════════════
// Game Log — Server Event Broadcasting
// ═════════════════════════════════════════════════════════════════════

describe("Game Log Events", () => {

  // ── 1. Builder spawn → "spawn" event ────────────────────────────

  describe("builder spawn events", () => {
    it("spawning a builder sends game_log spawn event", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");

      player.wood = PAWN.BUILDER_COST_WOOD;
      player.stone = PAWN.BUILDER_COST_STONE;

      room.handleSpawnPawn(client, { pawnType: "builder" } as SpawnPawnPayload);

      // Verify the builder was actually spawned (state precondition)
      let builderCount = 0;
      room.state.creatures.forEach((c: any) => {
        if (c.creatureType === "pawn_builder" && c.ownerID === "p1") builderCount++;
      });
      expect(builderCount).toBe(1);

      // Verify game_log broadcast with type "spawn"
      // TODO: This assertion will pass once Pemulis lands the game_log broadcast in handleSpawnPawn
      const spawnLogs = getLogBroadcasts(room, "spawn");
      expect(spawnLogs.length).toBeGreaterThanOrEqual(1);
      expect(spawnLogs[0]).toMatchObject({
        type: "spawn",
        message: expect.any(String),
      });
    });
  });

  // ── 2. Builder killed by carnivore → "death" event ──────────────

  describe("builder killed by carnivore", () => {
    it("builder killed by carnivore sends game_log death event", () => {
      const room = createRoomWithMap(42);
      joinPlayer(room, "p1");

      // Place builder on unowned tile so carnivore can reach it
      const pos = findWalkableTile(room);
      addBuilder(room, "b-prey", "p1", pos.x, pos.y, { health: 1 });
      const builderTile = room.state.getTile(pos.x, pos.y);
      if (builderTile) builderTile.ownerID = "";

      // Place carnivore adjacent on unowned tile
      const cx = pos.x + 1 < DEFAULT_MAP_SIZE ? pos.x + 1 : pos.x - 1;
      const carnTile = room.state.getTile(cx, pos.y);
      if (carnTile) carnTile.ownerID = "";
      addCreature(room, "c-hunter", "carnivore", cx, pos.y, {
        hunger: 10,
        currentState: "hunt",
      });

      // Tick AI until builder dies
      for (let i = 0; i < 20; i++) {
        tickAI(room);
        if (!room.state.creatures.has("b-prey")) break;
      }

      // Verify the builder is dead (state precondition)
      expect(room.state.creatures.has("b-prey")).toBe(false);

      // Verify game_log broadcast with type "death"
      // TODO: This assertion will pass once Pemulis lands death event broadcasting in creature AI
      const deathLogs = getLogBroadcasts(room, "death");
      expect(deathLogs.length).toBeGreaterThanOrEqual(1);
      const deathLog = deathLogs.find((l: any) =>
        l.message.toLowerCase().includes("killed") ||
        l.message.toLowerCase().includes("died") ||
        l.message.toLowerCase().includes("slain")
      );
      expect(deathLog).toBeDefined();
    });
  });

  // ── 3. Upkeep damage → "upkeep" event ───────────────────────────

  describe("builder upkeep warning", () => {
    it("builder upkeep damage sends game_log upkeep event", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");

      player.wood = 0;
      const pos = findWalkableTile(room);
      addBuilder(room, "b-hungry", "p1", pos.x, pos.y, {
        health: PAWN.BUILDER_HEALTH,
      });

      const healthBefore = PAWN.BUILDER_HEALTH;
      tickUpkeep(room, 1);

      // Verify state precondition: builder took upkeep damage
      const builder = room.state.creatures.get("b-hungry");
      expect(builder).toBeDefined();
      expect(builder!.health).toBeLessThan(healthBefore);

      // Verify game_log broadcast with type "upkeep"
      // TODO: This assertion will pass once Pemulis lands upkeep event broadcasting in tickPawnUpkeep
      const upkeepLogs = getLogBroadcasts(room, "upkeep");
      expect(upkeepLogs.length).toBeGreaterThanOrEqual(1);
      expect(upkeepLogs[0]).toMatchObject({
        type: "upkeep",
        message: expect.any(String),
      });
    });
  });

  // ── 4. Builder death from upkeep → "death" event ────────────────

  describe("builder death from upkeep", () => {
    it("builder death from upkeep sends game_log death event", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");

      player.wood = 0;
      const pos = findWalkableTile(room);
      // Health less than UPKEEP_DAMAGE so one tick kills it
      addBuilder(room, "b-starve", "p1", pos.x, pos.y, {
        health: PAWN.UPKEEP_DAMAGE - 1,
      });

      tickUpkeep(room, 1);

      // Verify state precondition: builder is dead
      expect(room.state.creatures.has("b-starve")).toBe(false);

      // Verify game_log broadcast with type "death"
      // TODO: This assertion will pass once Pemulis lands death event broadcasting in tickPawnUpkeep
      const deathLogs = getLogBroadcasts(room, "death");
      expect(deathLogs.length).toBeGreaterThanOrEqual(1);
      expect(deathLogs[0]).toMatchObject({
        type: "death",
        message: expect.any(String),
      });
    });
  });

  // ── 5. Player join → "info" event (sent to joining client) ──────

  describe("player join info event", () => {
    it("player joining sends game_log info event to that client", () => {
      const room = createRoomWithMap(42);
      const client = fakeClient("p-new");

      room.onJoin(client);

      // Verify state precondition: player was added
      expect(room.state.players.has("p-new")).toBe(true);

      // Verify info event sent to the joining client (not broadcast)
      // TODO: This assertion will pass once Pemulis lands the join info event in onJoin
      const infoLogs = getClientLogs(client, "info");
      expect(infoLogs.length).toBeGreaterThanOrEqual(1);
      expect(infoLogs[0]).toMatchObject({
        type: "info",
        message: expect.any(String),
      });
    });
  });
});
