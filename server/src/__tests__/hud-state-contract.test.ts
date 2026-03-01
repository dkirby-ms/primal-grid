import { describe, it, expect } from "vitest";
import { GameState, PlayerState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { tickCreatureAI } from "../rooms/creatureAI.js";
import {
  CREATURE_TYPES,
  CREATURE_SPAWN, RESOURCE_REGEN, DEFAULT_MAP_SIZE,
  TERRITORY,
} from "@primal-grid/shared";

/**
 * Phase A — HUD State Contract Tests
 *
 * These tests verify that all state fields consumed by the HUD
 * are correctly populated and stay within valid ranges during
 * gameplay. Updated for the colony commander pivot (shapes-only build mode).
 */

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): any {
  const room = Object.create(GameRoom.prototype) as any;
  room.state = new GameState();
  room.generateMap(seed);
  return room;
}

function fakeClient(sessionId: string): any {
  return { sessionId };
}

/** Join a player and return client + player. */
function joinPlayer(room: any, sessionId: string) {
  const client = fakeClient(sessionId);
  room.onJoin(client);
  const player = room.state.players.get(sessionId)!;
  return { client, player };
}

function addCreature(
  room: any, id: string, type: string,
  x: number, y: number,
  overrides: Partial<{
    health: number; hunger: number;
    currentState: string;
  }> = {},
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

function findOwnedWalkableTile(room: any, playerId: string): { x: number; y: number } | null {
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
      expect(player.berries).toBe(TERRITORY.STARTING_BERRIES);
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
      room.state.creatures.forEach((c: any) => {
        expect(["herbivore", "carnivore"]).toContain(c.creatureType);
        if (c.creatureType === "herbivore") herbCount++;
        else carnCount++;
      });
      expect(herbCount).toBe(CREATURE_SPAWN.HERBIVORE_COUNT);
      expect(carnCount).toBe(CREATURE_SPAWN.CARNIVORE_COUNT);
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
        tickCreatureAI(room.state);
      }
      room.state.creatures.forEach((c: any) => {
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
      expect(player.fiber).toBeGreaterThanOrEqual(0);
      expect(player.berries).toBeGreaterThanOrEqual(0);
      expect(player.score).toBeGreaterThan(0);
      expect(player.hqX).toBeGreaterThanOrEqual(0);
      expect(player.hqY).toBeGreaterThanOrEqual(0);
    });
  });
});
