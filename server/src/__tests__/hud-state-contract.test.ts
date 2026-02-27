import { describe, it, expect } from "vitest";
import { GameState, PlayerState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { tickCreatureAI } from "../rooms/creatureAI.js";
import {
  TAMING, CREATURE_TYPES,
  CREATURE_SPAWN, RESOURCE_REGEN, DEFAULT_MAP_SIZE,
  ResourceType, ItemType, RECIPES, TERRITORY,
} from "@primal-grid/shared";
import type { CraftPayload } from "@primal-grid/shared";

/**
 * Phase A — HUD State Contract Tests
 *
 * These tests verify that all state fields consumed by the HUD
 * are correctly populated and stay within valid ranges during
 * gameplay. Updated for the colony commander pivot.
 */

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): any {
  const room = Object.create(GameRoom.prototype) as any;
  room.state = new GameState();
  room.nextStructureId = 0;
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

function giveResources(player: any, resources: Partial<Record<string, number>>) {
  for (const [key, val] of Object.entries(resources)) {
    (player as any)[key] = val;
  }
}

function addCreature(
  room: any, id: string, type: string,
  x: number, y: number,
  overrides: Partial<{
    health: number; hunger: number; ownerID: string;
    trust: number; personality: string; currentState: string;
    speed: number; lastBredTick: number;
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
  creature.ownerID = overrides.ownerID ?? "";
  creature.trust = overrides.trust ?? 0;
  creature.personality = overrides.personality ?? "neutral";
  creature.speed = overrides.speed ?? 0;
  creature.lastBredTick = overrides.lastBredTick ?? 0;
  room.state.creatures.set(id, creature);
  return creature;
}

function findOwnedWalkableTile(room: any, playerId: string): { x: number; y: number } | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (tile.ownerID === playerId && room.state.isWalkable(tile.x, tile.y)) {
      let hasStructure = false;
      room.state.structures.forEach((s: any) => {
        if (s.x === tile.x && s.y === tile.y) hasStructure = true;
      });
      if (!hasStructure) return { x: tile.x, y: tile.y };
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

  describe("inventory fields present and non-negative", () => {
    const INVENTORY_FIELDS = ["wood", "stone", "fiber", "berries"];
    const CRAFTED_FIELDS = ["workbenches", "farmPlots", "turrets"];

    it("new player has all crafted fields initialized to 0", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");
      for (const field of CRAFTED_FIELDS) {
        expect((player as any)[field]).toBe(0);
      }
    });

    it("inventory stays non-negative after crafting consumes resources", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");
      giveResources(player, { wood: 100, stone: 100, fiber: 100, berries: 100 });
      if (room.handleCraft) {
        room.handleCraft(client, { recipeId: "workbench" } as CraftPayload);
      }
      for (const field of INVENTORY_FIELDS) {
        expect((player as any)[field]).toBeGreaterThanOrEqual(0);
      }
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

    it("tamed creature has ownerID and trust visible to HUD", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "owner1");
      player.berries = 10;

      const pos = findOwnedWalkableTile(room, "owner1");
      expect(pos).not.toBeNull();

      addCreature(room, "c1", "herbivore", pos!.x, pos!.y);
      room.handleTame(client, { creatureId: "c1" });
      const c = room.state.creatures.get("c1");
      expect(c.ownerID).toBe("owner1");
      expect(typeof c.trust).toBe("number");
      expect(c.trust).toBeGreaterThanOrEqual(0);
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

  describe("multiplayer HUD isolation", () => {
    it("two players have independent inventory after crafting", () => {
      const room = createRoomWithMap(42);
      const { client: c1, player: p1 } = joinPlayer(room, "p1");
      const { client: c2, player: p2 } = joinPlayer(room, "p2");
      giveResources(p1, { wood: 100, stone: 100 });
      room.handleCraft(c1, { recipeId: "workbench" } as CraftPayload);
      // p1 crafted, p2 did not
      expect(p1.workbenches).toBe(1);
      expect(p2.workbenches).toBe(0);
    });

    it("taming one creature does not affect another player's creature count", () => {
      const room = createRoomWithMap(42);
      const { client: c1, player: p1 } = joinPlayer(room, "p1");
      const { client: c2, player: p2 } = joinPlayer(room, "p2");
      p1.berries = 10;
      p2.berries = 10;

      const posA = findOwnedWalkableTile(room, "p1");
      if (!posA) return;

      addCreature(room, "h1", "herbivore", posA.x, posA.y);
      room.handleTame(c1, { creatureId: "h1" });

      let p1Owned = 0, p2Owned = 0;
      room.state.creatures.forEach((c: any) => {
        if (c.ownerID === "p1") p1Owned++;
        if (c.ownerID === "p2") p2Owned++;
      });
      expect(p1Owned).toBe(2); // 1 tamed + 1 worker
      expect(p2Owned).toBe(1); // 1 worker
    });
  });

  describe("state values after full gameplay sequence", () => {
    it("all HUD-bound fields valid after craft→tame sequence", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");

      // Give enough to craft
      giveResources(player, { wood: 50, stone: 50, fiber: 50, berries: 50 });

      // Craft a workbench
      if (room.handleCraft) {
        room.handleCraft(client, { recipeId: "workbench" } as CraftPayload);
      }

      // Tame a creature
      const pos = findOwnedWalkableTile(room, "p1");
      if (pos) {
        addCreature(room, "c1", "herbivore", pos.x, pos.y);
        room.handleTame(client, { creatureId: "c1" });
      }

      // Verify all HUD-bound fields
      expect(player.wood).toBeGreaterThanOrEqual(0);
      expect(player.stone).toBeGreaterThanOrEqual(0);
      expect(player.fiber).toBeGreaterThanOrEqual(0);
      expect(player.berries).toBeGreaterThanOrEqual(0);
      expect(typeof player.workbenches).toBe("number");
      expect(typeof player.farmPlots).toBe("number");
      expect(typeof player.turrets).toBe("number");
      expect(player.score).toBeGreaterThan(0);
      expect(player.hqX).toBeGreaterThanOrEqual(0);
      expect(player.hqY).toBeGreaterThanOrEqual(0);
    });
  });
});
