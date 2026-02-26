import { describe, it, expect } from "vitest";
import { GameState, PlayerState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { tickCreatureAI } from "../rooms/creatureAI.js";
import {
  PLAYER_SURVIVAL, TAMING, CREATURE_TYPES,
  CREATURE_SPAWN, RESOURCE_REGEN, DEFAULT_MAP_SIZE,
  ResourceType, ItemType, RECIPES,
} from "@primal-grid/shared";
import type { GatherPayload, CraftPayload } from "@primal-grid/shared";

/**
 * Phase 4.5.4 — HUD State Contract Tests
 *
 * These tests verify that all state fields consumed by the HUD
 * are correctly populated and stay within valid ranges during
 * gameplay. This is the server-side regression safety net for
 * the HUD redesign: if the HUD reads it, we test it here.
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

function placePlayerAt(room: any, sessionId: string, x: number, y: number) {
  const client = fakeClient(sessionId);
  room.onJoin(client);
  const player = room.state.players.get(sessionId)!;
  player.x = x;
  player.y = y;
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

function findResourceTile(room: any): { x: number; y: number } | null {
  const w = room.state.mapWidth;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const tile = room.state.tiles[idx];
      if (tile && tile.resourceAmount > 0 && room.state.isWalkable(x, y)) {
        return { x, y };
      }
    }
  }
  return null;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Phase 4.5.4 — HUD State Contract", () => {

  describe("player vitals (health & hunger)", () => {
    it("new player starts at MAX_HEALTH and MAX_HUNGER", () => {
      const room = createRoomWithMap(42);
      const { player } = placePlayerAt(room, "p1", 5, 5);
      expect(player.health).toBe(PLAYER_SURVIVAL.MAX_HEALTH);
      expect(player.hunger).toBe(PLAYER_SURVIVAL.MAX_HUNGER);
    });

    it("health stays within [HEALTH_FLOOR, MAX_HEALTH] after starvation ticks", () => {
      const room = createRoomWithMap(42);
      const { player } = placePlayerAt(room, "p1", 5, 5);
      player.hunger = 0;
      for (let i = 0; i < 500; i++) {
        room.state.tick = i * PLAYER_SURVIVAL.HUNGER_TICK_INTERVAL;
        room.tickPlayerSurvival();
      }
      expect(player.health).toBeGreaterThanOrEqual(PLAYER_SURVIVAL.HEALTH_FLOOR);
      expect(player.health).toBeLessThanOrEqual(PLAYER_SURVIVAL.MAX_HEALTH);
    });

    it("hunger stays within [0, MAX_HUNGER] after eating", () => {
      const room = createRoomWithMap(42);
      const { client, player } = placePlayerAt(room, "p1", 5, 5);
      player.hunger = 10;
      player.berries = 99;
      // Eat many times
      for (let i = 0; i < 10; i++) {
        room.handleEat(client);
      }
      expect(player.hunger).toBeGreaterThanOrEqual(0);
      expect(player.hunger).toBeLessThanOrEqual(PLAYER_SURVIVAL.MAX_HUNGER);
    });
  });

  describe("inventory fields present and non-negative", () => {
    const INVENTORY_FIELDS = ["wood", "stone", "fiber", "berries", "meat"];
    const CRAFTED_FIELDS = ["walls", "floors", "axes", "pickaxes", "workbenches", "farmPlots"];

    it("new player has all inventory fields initialized to 0", () => {
      const room = createRoomWithMap(42);
      const { player } = placePlayerAt(room, "p1", 5, 5);
      for (const field of [...INVENTORY_FIELDS, ...CRAFTED_FIELDS]) {
        expect((player as any)[field]).toBe(0);
      }
    });

    it("inventory stays non-negative after gathering", () => {
      const room = createRoomWithMap(42);
      const pos = findResourceTile(room);
      expect(pos).not.toBeNull();
      const { client, player } = placePlayerAt(room, "p1", pos!.x, pos!.y);
      room.handleGather(client, { x: pos!.x, y: pos!.y } as GatherPayload);
      for (const field of INVENTORY_FIELDS) {
        expect((player as any)[field]).toBeGreaterThanOrEqual(0);
      }
    });

    it("inventory stays non-negative after crafting consumes resources", () => {
      const room = createRoomWithMap(42);
      const { client, player } = placePlayerAt(room, "p1", 5, 5);
      giveResources(player, { wood: 100, stone: 100, fiber: 100, berries: 100 });
      // Craft a wall (costs wood + stone)
      if (room.handleCraft) {
        room.handleCraft(client, { recipeId: "wall" } as CraftPayload);
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
      const row = findWalkableRow(room, 2);
      expect(row).not.toBeNull();
      const { client, player } = placePlayerAt(room, "owner1", row![0].x, row![0].y);
      player.berries = 10;
      addCreature(room, "c1", "herbivore", row![1].x, row![1].y);
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
    it("two players have independent inventory after gathering", () => {
      const room = createRoomWithMap(42);
      const pos = findResourceTile(room);
      expect(pos).not.toBeNull();
      const { client: c1, player: p1 } = placePlayerAt(room, "p1", pos!.x, pos!.y);
      const { client: c2, player: p2 } = placePlayerAt(room, "p2", pos!.x, pos!.y);
      room.handleGather(c1, { x: pos!.x, y: pos!.y } as GatherPayload);
      // p1 gathered, p2 did not — inventories must differ
      const p1Total = p1.wood + p1.stone + p1.fiber + p1.berries;
      const p2Total = p2.wood + p2.stone + p2.fiber + p2.berries;
      expect(p1Total).toBeGreaterThan(0);
      expect(p2Total).toBe(0);
    });

    it("two players have independent health and hunger", () => {
      const room = createRoomWithMap(42);
      const { player: p1 } = placePlayerAt(room, "p1", 5, 5);
      const { player: p2 } = placePlayerAt(room, "p2", 6, 6);
      p1.health = 50;
      p1.hunger = 30;
      expect(p2.health).toBe(PLAYER_SURVIVAL.MAX_HEALTH);
      expect(p2.hunger).toBe(PLAYER_SURVIVAL.MAX_HUNGER);
    });

    it("taming one creature does not affect another player's creature count", () => {
      const room = createRoomWithMap(42);
      const row = findWalkableRow(room, 4);
      expect(row).not.toBeNull();
      const { client: c1 } = placePlayerAt(room, "p1", row![0].x, row![0].y);
      const { client: c2 } = placePlayerAt(room, "p2", row![2].x, row![2].y);
      const p1 = room.state.players.get("p1")!;
      const p2 = room.state.players.get("p2")!;
      p1.berries = 10;
      p2.berries = 10;
      addCreature(room, "h1", "herbivore", row![1].x, row![1].y);
      addCreature(room, "h2", "herbivore", row![3].x, row![3].y);
      room.handleTame(c1, { creatureId: "h1" });
      // Count owned creatures per player
      let p1Owned = 0, p2Owned = 0;
      room.state.creatures.forEach((c: any) => {
        if (c.ownerID === "p1") p1Owned++;
        if (c.ownerID === "p2") p2Owned++;
      });
      expect(p1Owned).toBe(1);
      expect(p2Owned).toBe(0);
    });
  });

  describe("state values after full gameplay sequence", () => {
    it("all HUD-bound fields valid after gather→eat→craft→tame sequence", () => {
      const room = createRoomWithMap(42);
      const pos = findResourceTile(room);
      expect(pos).not.toBeNull();
      const { client, player } = placePlayerAt(room, "p1", pos!.x, pos!.y);

      // Gather
      room.handleGather(client, { x: pos!.x, y: pos!.y } as GatherPayload);

      // Give enough to craft and eat
      giveResources(player, { wood: 50, stone: 50, fiber: 50, berries: 50, meat: 10 });

      // Eat
      player.hunger = 40;
      room.handleEat(client);

      // Craft a wall
      if (room.handleCraft) {
        room.handleCraft(client, { recipeId: "wall" } as CraftPayload);
      }

      // Tame a creature
      const row = findWalkableRow(room, 2);
      if (row) {
        player.x = row[0].x;
        player.y = row[0].y;
        addCreature(room, "c1", "herbivore", row[1].x, row[1].y);
        room.handleTame(client, { creatureId: "c1" });
      }

      // Verify all HUD-bound fields
      expect(player.health).toBeGreaterThanOrEqual(0);
      expect(player.health).toBeLessThanOrEqual(PLAYER_SURVIVAL.MAX_HEALTH);
      expect(player.hunger).toBeGreaterThanOrEqual(0);
      expect(player.hunger).toBeLessThanOrEqual(PLAYER_SURVIVAL.MAX_HUNGER);
      expect(player.wood).toBeGreaterThanOrEqual(0);
      expect(player.stone).toBeGreaterThanOrEqual(0);
      expect(player.fiber).toBeGreaterThanOrEqual(0);
      expect(player.berries).toBeGreaterThanOrEqual(0);
      expect(player.meat).toBeGreaterThanOrEqual(0);
      expect(typeof player.walls).toBe("number");
      expect(typeof player.floors).toBe("number");
      expect(typeof player.axes).toBe("number");
      expect(typeof player.pickaxes).toBe("number");
      expect(typeof player.workbenches).toBe("number");
      expect(typeof player.farmPlots).toBe("number");
    });
  });
});

// ── Additional helpers ──────────────────────────────────────────────

function findWalkableRow(room: any, count: number): { x: number; y: number }[] | null {
  const w = room.state.mapWidth;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x <= w - count; x++) {
      let allWalkable = true;
      for (let i = 0; i < count; i++) {
        if (!room.state.isWalkable(x + i, y)) { allWalkable = false; break; }
      }
      if (allWalkable) return Array.from({ length: count }, (_, i) => ({ x: x + i, y }));
    }
  }
  return null;
}
