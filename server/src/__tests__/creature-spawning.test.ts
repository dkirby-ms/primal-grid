import { describe, it, expect } from "vitest";
import { GameState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { TileType, CREATURE_TYPES, DEFAULT_MAP_SIZE } from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithCreatures(seed?: number): any {
  const room = Object.create(GameRoom.prototype) as any;
  room.state = new GameState();
  room.generateMap(seed);
  room.spawnCreatures();
  return room;
}

// ── Creature Spawning ───────────────────────────────────────────────

describe("Phase 2.4 — Creature Spawning", () => {
  it("creatures are spawned after map generation", () => {
    const room = createRoomWithCreatures(42);
    expect(room.state.creatures).toBeDefined();
    expect(room.state.creatures.size).toBeGreaterThan(0);
  });

  it("creature count is reasonable (~48 for 64×64 map)", () => {
    const room = createRoomWithCreatures(42);
    const count = room.state.creatures.size;
    // Target ~48 (32 herbivores + 16 carnivores), allow generous range
    expect(count).toBeGreaterThanOrEqual(20);
    expect(count).toBeLessThanOrEqual(80);
  });

  it("all creatures spawn on walkable tiles", () => {
    const room = createRoomWithCreatures(42);
    room.state.creatures.forEach((creature: any) => {
      expect(room.state.isWalkable(creature.x, creature.y)).toBe(true);
    });
  });

  it("most creatures spawn on unique tiles (low collision rate)", () => {
    const room = createRoomWithCreatures(42);
    const positions = new Set<string>();
    let total = 0;
    room.state.creatures.forEach((creature: any) => {
      positions.add(`${creature.x},${creature.y}`);
      total++;
    });
    // With 48 creatures on a 64×64 map, occasional overlaps are acceptable
    expect(positions.size).toBeGreaterThan(total * 0.9);
  });

  it("creatures spawn in their preferred biomes", () => {
    const room = createRoomWithCreatures(42);
    const typeMap = CREATURE_TYPES as Record<string, any>;
    room.state.creatures.forEach((creature: any) => {
      const typeInfo = typeMap[creature.creatureType];
      expect(typeInfo).toBeDefined();
      const tile = room.state.getTile(creature.x, creature.y);
      expect(tile).toBeDefined();
      expect(typeInfo.preferredBiomes).toContain(tile!.type);
    });
  });

  it("all creatures start at full health", () => {
    const room = createRoomWithCreatures(42);
    const typeMap = CREATURE_TYPES as Record<string, any>;
    room.state.creatures.forEach((creature: any) => {
      const typeInfo = typeMap[creature.creatureType];
      expect(creature.health).toBe(typeInfo.health);
    });
  });

  it("all creatures start at full hunger", () => {
    const room = createRoomWithCreatures(42);
    const typeMap = CREATURE_TYPES as Record<string, any>;
    room.state.creatures.forEach((creature: any) => {
      const typeInfo = typeMap[creature.creatureType];
      expect(creature.hunger).toBe(typeInfo.hunger);
    });
  });
});

// ── CreatureState Schema ────────────────────────────────────────────

describe("Phase 2.4 — CreatureState Schema", () => {
  it("creatures have required schema fields", () => {
    const room = createRoomWithCreatures(42);
    room.state.creatures.forEach((creature: any) => {
      expect(creature.id).toBeDefined();
      expect(typeof creature.id).toBe("string");
      expect(creature.creatureType).toBeDefined();
      expect(typeof creature.creatureType).toBe("string");
      expect(typeof creature.x).toBe("number");
      expect(typeof creature.y).toBe("number");
      expect(typeof creature.health).toBe("number");
      expect(typeof creature.hunger).toBe("number");
      expect(creature.currentState).toBeDefined();
      expect(typeof creature.currentState).toBe("string");
    });
  });

  it("creature positions are within map bounds", () => {
    const room = createRoomWithCreatures(42);
    room.state.creatures.forEach((creature: any) => {
      expect(creature.x).toBeGreaterThanOrEqual(0);
      expect(creature.x).toBeLessThan(DEFAULT_MAP_SIZE);
      expect(creature.y).toBeGreaterThanOrEqual(0);
      expect(creature.y).toBeLessThan(DEFAULT_MAP_SIZE);
    });
  });

  it("creature types reference valid CREATURE_TYPES keys", () => {
    const room = createRoomWithCreatures(42);
    const validKeys = Object.keys(CREATURE_TYPES);
    room.state.creatures.forEach((creature: any) => {
      expect(validKeys).toContain(creature.creatureType);
    });
  });
});
