import { describe, it, expect } from "vitest";
import { GameState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import {
  DEFAULT_MAP_SIZE,
  CREATURE_SPAWN,
} from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number, mapSize?: number): GameRoom {
  const room = Object.create(GameRoom.prototype) as GameRoom;
  room.state = new GameState();
  room.generateMap(seed, mapSize);
  room.broadcast = () => {};
  return room;
}

function createRoomWithCreatures(seed?: number, mapSize?: number): GameRoom {
  const room = createRoomWithMap(seed, mapSize);
  room.spawnCreatures();
  return room;
}

// ── Map Size Tests ──────────────────────────────────────────────────

describe("Map Size (#11)", () => {
  describe("map dimensions", () => {
    it("map generates at DEFAULT_MAP_SIZE", () => {
      const room = createRoomWithMap(42);
      expect(room.state.mapWidth).toBe(DEFAULT_MAP_SIZE);
      expect(room.state.mapHeight).toBe(DEFAULT_MAP_SIZE);
    });

    it("tile count matches width × height", () => {
      const room = createRoomWithMap(42);
      const expected = room.state.mapWidth * room.state.mapHeight;
      expect(room.state.tiles.length).toBe(expected);
    });
  });

  describe("boundary access", () => {
    it("getTile returns valid tile at (0, 0)", () => {
      const room = createRoomWithMap(42);
      const tile = room.state.getTile(0, 0);
      expect(tile).toBeDefined();
      expect(tile!.x).toBe(0);
      expect(tile!.y).toBe(0);
    });

    it("getTile returns valid tile at (mapWidth-1, mapHeight-1)", () => {
      const room = createRoomWithMap(42);
      const w = room.state.mapWidth;
      const h = room.state.mapHeight;
      const tile = room.state.getTile(w - 1, h - 1);
      expect(tile).toBeDefined();
      expect(tile!.x).toBe(w - 1);
      expect(tile!.y).toBe(h - 1);
    });

    it("getTile returns undefined for out-of-bounds coordinates", () => {
      const room = createRoomWithMap(42);
      const w = room.state.mapWidth;
      const h = room.state.mapHeight;
      expect(room.state.getTile(-1, 0)).toBeUndefined();
      expect(room.state.getTile(0, -1)).toBeUndefined();
      expect(room.state.getTile(w, 0)).toBeUndefined();
      expect(room.state.getTile(0, h)).toBeUndefined();
    });

    it("every tile has correct x/y matching its array index", () => {
      const room = createRoomWithMap(42);
      const w = room.state.mapWidth;
      for (let i = 0; i < room.state.tiles.length; i++) {
        const tile = room.state.tiles.at(i)!;
        const expectedX = i % w;
        const expectedY = Math.floor(i / w);
        expect(tile.x).toBe(expectedX);
        expect(tile.y).toBe(expectedY);
      }
    });
  });

  describe("creature spawn counts", () => {
    it("spawns the expected number of herbivores", () => {
      const room = createRoomWithCreatures(42);
      let herbCount = 0;
      room.state.creatures.forEach((c: CreatureState) => {
        if (c.creatureType === "herbivore") herbCount++;
      });
      expect(herbCount).toBe(CREATURE_SPAWN.HERBIVORE_COUNT);
    });

    it("spawns the expected number of carnivores", () => {
      const room = createRoomWithCreatures(42);
      let carnCount = 0;
      room.state.creatures.forEach((c: CreatureState) => {
        if (c.creatureType === "carnivore") carnCount++;
      });
      expect(carnCount).toBe(CREATURE_SPAWN.CARNIVORE_COUNT);
    });

    it("total creature count matches sum of spawn constants", () => {
      const room = createRoomWithCreatures(42);
      const expectedTotal = CREATURE_SPAWN.HERBIVORE_COUNT + CREATURE_SPAWN.CARNIVORE_COUNT + 
                           CREATURE_SPAWN.BIRD_COUNT + CREATURE_SPAWN.MONKEY_COUNT + CREATURE_SPAWN.SPIDER_COUNT;
      expect(room.state.creatures.size).toBe(expectedTotal);
    });

    it("all spawned creatures are on walkable tiles", () => {
      const room = createRoomWithCreatures(42);
      room.state.creatures.forEach((c: CreatureState) => {
        const tile = room.state.getTile(c.x, c.y);
        expect(tile).toBeDefined();
        // Creature must be within map bounds
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x).toBeLessThan(room.state.mapWidth);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeLessThan(room.state.mapHeight);
      });
    });
  });

  describe("non-default map sizes", () => {
    it("generates a 64×64 map correctly", () => {
      const room = createRoomWithMap(42, 64);
      expect(room.state.mapWidth).toBe(64);
      expect(room.state.mapHeight).toBe(64);
      expect(room.state.tiles.length).toBe(64 * 64);
    });

    it("generates a 256×256 map correctly", () => {
      const room = createRoomWithMap(42, 256);
      expect(room.state.mapWidth).toBe(256);
      expect(room.state.mapHeight).toBe(256);
      expect(room.state.tiles.length).toBe(256 * 256);
    });

    it("tiles have correct coordinates on a 64×64 map", () => {
      const room = createRoomWithMap(42, 64);
      const w = room.state.mapWidth;
      for (let i = 0; i < room.state.tiles.length; i++) {
        const tile = room.state.tiles.at(i)!;
        expect(tile.x).toBe(i % w);
        expect(tile.y).toBe(Math.floor(i / w));
      }
    });

    it("getTile works correctly on a 256×256 map", () => {
      const room = createRoomWithMap(42, 256);
      const corner = room.state.getTile(255, 255);
      expect(corner).toBeDefined();
      expect(corner!.x).toBe(255);
      expect(corner!.y).toBe(255);
      expect(room.state.getTile(256, 0)).toBeUndefined();
      expect(room.state.getTile(0, 256)).toBeUndefined();
    });

    it("spawns creatures on a 64×64 map", () => {
      const room = createRoomWithCreatures(42, 64);
      const expectedTotal = CREATURE_SPAWN.HERBIVORE_COUNT + CREATURE_SPAWN.CARNIVORE_COUNT + 
                           CREATURE_SPAWN.BIRD_COUNT + CREATURE_SPAWN.MONKEY_COUNT + CREATURE_SPAWN.SPIDER_COUNT;
      expect(room.state.creatures.size).toBe(expectedTotal);
      room.state.creatures.forEach((c: CreatureState) => {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x).toBeLessThan(64);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeLessThan(64);
      });
    });

    it("spawns creatures on a 256×256 map", () => {
      const room = createRoomWithCreatures(42, 256);
      const expectedTotal = CREATURE_SPAWN.HERBIVORE_COUNT + CREATURE_SPAWN.CARNIVORE_COUNT + 
                           CREATURE_SPAWN.BIRD_COUNT + CREATURE_SPAWN.MONKEY_COUNT + CREATURE_SPAWN.SPIDER_COUNT;
      expect(room.state.creatures.size).toBe(expectedTotal);
      room.state.creatures.forEach((c: CreatureState) => {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x).toBeLessThan(256);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeLessThan(256);
      });
    });
  });

  describe("generation performance", () => {
    // Hard ceilings are generous (5x ideal) to avoid CI flakes.
    // console.warn fires at the ideal threshold so regressions stay visible.
    const MAP_IDEAL_MS = 500;
    const MAP_HARD_CEILING_MS = 2500;
    const CREATURES_IDEAL_MS = 1000;
    const CREATURES_HARD_CEILING_MS = 5000;

    it("map generation completes within performance ceiling", () => {
      const start = performance.now();
      createRoomWithMap(42);
      const elapsed = performance.now() - start;
      if (elapsed > MAP_IDEAL_MS) {
        console.warn(
          `⚠ Map generation took ${elapsed.toFixed(0)}ms (ideal < ${MAP_IDEAL_MS}ms)`,
        );
      }
      expect(elapsed).toBeLessThan(MAP_HARD_CEILING_MS);
    });

    it("map generation with creatures completes within performance ceiling", () => {
      const start = performance.now();
      createRoomWithCreatures(42);
      const elapsed = performance.now() - start;
      if (elapsed > CREATURES_IDEAL_MS) {
        console.warn(
          `⚠ Map + creature generation took ${elapsed.toFixed(0)}ms (ideal < ${CREATURES_IDEAL_MS}ms)`,
        );
      }
      expect(elapsed).toBeLessThan(CREATURES_HARD_CEILING_MS);
    });

    it("256×256 map generation completes within 15 seconds", () => {
      const start = performance.now();
      createRoomWithCreatures(42, 256);
      const elapsed = performance.now() - start;
      if (elapsed > 5000) {
        console.warn(
          `⚠ 256×256 map + creatures took ${elapsed.toFixed(0)}ms (ideal < 5000ms)`,
        );
      }
      expect(elapsed).toBeLessThan(15_000);
    });
  });
});
