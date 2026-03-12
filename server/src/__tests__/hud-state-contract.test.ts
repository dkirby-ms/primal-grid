import { describe, it, expect } from "vitest";
import { GameState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { tickCreatureAI } from "../rooms/creatureAI.js";
import type { Client, Room } from "colyseus";
import {
  CREATURE_TYPES,
  CREATURE_SPAWN,
  TERRITORY,
} from "@primal-grid/shared";
import type { CreatureTypeDef } from "@primal-grid/shared";

/**
 * Phase A — HUD State Contract Tests
 *
 * These tests verify that all state fields consumed by the HUD
 * are correctly populated and stay within valid ranges during
 * gameplay. Updated for the colony commander pivot (shapes-only build mode).
 */

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): GameRoom {
  const room = Object.create(GameRoom.prototype) as GameRoom;
  room.state = new GameState();
  room.generateMap(seed);
  room.broadcast = () => {};
  return room;
}

function fakeClient(sessionId: string): Client {
  return { sessionId, send: () => {} };
}

/** Join a player and return client + player. */
function joinPlayer(room: GameRoom, sessionId: string) {
  const client = fakeClient(sessionId);
  room.onJoin(client);
  const player = room.state.players.get(sessionId)!;
  return { client, player };
}

function addCreature(
  room: GameRoom, id: string, type: string,
  x: number, y: number,
  overrides: Partial<{
    health: number; hunger: number;
    currentState: string;
  }> = {},
): CreatureState {
  const creature = new CreatureState();
  creature.id = id;
  creature.creatureType = type;
  creature.x = x;
  creature.y = y;
  const typeDef = (CREATURE_TYPES as Record<string, CreatureTypeDef>)[type];
  creature.health = overrides.health ?? typeDef.health;
  creature.hunger = overrides.hunger ?? typeDef.hunger;
  creature.currentState = overrides.currentState ?? "idle";
  creature.stamina = typeDef.maxStamina;
  room.state.creatures.set(id, creature);
  return creature;
}

function findOwnedWalkableTile(room: GameRoom, playerId: string): { x: number; y: number } | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (tile.ownerID === playerId && room.state.isWalkable(tile.x, tile.y)) {
      return { x: tile.x, y: tile.y };
    }
  }
  return null;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Phase A — HUD State Contract", () => {

  describe("player starting state", () => {
    it("new player has starting resources from TERRITORY config", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");
      expect(player.wood).toBe(TERRITORY.STARTING_WOOD);
      expect(player.stone).toBe(TERRITORY.STARTING_STONE);
    });

    it("new player has HQ position and positive score", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");
      expect(player.hqX).toBeGreaterThanOrEqual(0);
      expect(player.hqY).toBeGreaterThanOrEqual(0);
      expect(player.score).toBeGreaterThan(0);
    });
  });

  describe("creature state fields for HUD display", () => {
    it("spawned creatures have valid creatureType for HUD counting", () => {
      const room = createRoomWithMap(42);
      room.spawnCreatures();
      let herbCount = 0;
      let carnCount = 0;
      let birdCount = 0;
      let monkeyCount = 0;
      let spiderCount = 0;
      room.state.creatures.forEach((c: CreatureState) => {
        expect(["herbivore", "carnivore", "bird", "monkey", "spider"]).toContain(c.creatureType);
        if (c.creatureType === "herbivore") herbCount++;
        else if (c.creatureType === "carnivore") carnCount++;
        else if (c.creatureType === "bird") birdCount++;
        else if (c.creatureType === "monkey") monkeyCount++;
        else if (c.creatureType === "spider") spiderCount++;
      });
      expect(herbCount).toBe(CREATURE_SPAWN.HERBIVORE_COUNT);
      expect(carnCount).toBe(CREATURE_SPAWN.CARNIVORE_COUNT);
      expect(birdCount).toBe(CREATURE_SPAWN.BIRD_COUNT);
      expect(monkeyCount).toBe(CREATURE_SPAWN.MONKEY_COUNT);
      expect(spiderCount).toBe(CREATURE_SPAWN.SPIDER_COUNT);
    });

    it("wild creatures have basic state visible to HUD", () => {
      const room = createRoomWithMap(42);
      joinPlayer(room, "owner1");
      const pos = findOwnedWalkableTile(room, "owner1");
      if (!pos) return;

      addCreature(room, "c1", "herbivore", pos.x, pos.y);
      const c = room.state.creatures.get("c1");
      expect(c).toBeDefined();
      expect(c.creatureType).toBe("herbivore");
      expect(typeof c.health).toBe("number");
      expect(typeof c.hunger).toBe("number");
    });

    it("creature health and hunger stay in sane ranges after AI ticks", () => {
      const room = createRoomWithMap(42);
      room.spawnCreatures();
      for (let t = 0; t < 100; t++) {
        room.state.tick = t;
        tickCreatureAI(room.state, room as Room);
      }
      room.state.creatures.forEach((c: CreatureState) => {
        expect(c.health).toBeGreaterThanOrEqual(0);
        expect(c.hunger).toBeGreaterThanOrEqual(0);
        expect(typeof c.creatureType).toBe("string");
      });
    });
  });

  describe("state values after join", () => {
    it("all HUD-bound fields valid after joining", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");

      expect(player.wood).toBeGreaterThanOrEqual(0);
      expect(player.stone).toBeGreaterThanOrEqual(0);
      expect(player.score).toBeGreaterThan(0);
      expect(player.hqX).toBeGreaterThanOrEqual(0);
      expect(player.hqY).toBeGreaterThanOrEqual(0);
    });
  });
});
