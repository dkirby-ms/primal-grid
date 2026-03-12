/**
 * Map Size Room Creation — Bug #126
 *
 * Non-default map sizes (other than 128×128) cause room creation to
 * time out. These tests verify that map generation succeeds for all
 * reasonable sizes and completes within acceptable time limits.
 *
 * ⚠️ Anticipatory: written before the fix lands. May need adjustment
 * once Gately/Pemulis implement their patches.
 */
import { describe, it, expect, vi } from "vitest";
import { GameState, TileState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { generateProceduralMap } from "../rooms/mapGenerator.js";
import {
  DEFAULT_MAP_SIZE,
  DEFAULT_MAP_SEED,
  CREATURE_SPAWN,
} from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithSize(size: number, seed: number = 42): GameRoom {
  const room = Object.create(GameRoom.prototype) as GameRoom;
  room.state = new GameState();
  room.generateMap(seed, size);
  room.broadcast = vi.fn();
  room.playerViews = new Map();
  return room;
}

function createRoomWithCreatures(size: number, seed: number = 42): GameRoom {
  const room = createRoomWithSize(size, seed);
  room.spawnCreatures();
  return room;
}

// ── Map Size Tests ──────────────────────────────────────────────────

describe("Map Size Room Creation — Bug #126", () => {

  // ── 1. Map generation for multiple sizes ──────────────────────

  describe("generation at various map sizes", () => {
    const sizes = [32, 64, 96, 128, 192, 256];

    for (const size of sizes) {
      it(`generates a ${size}×${size} map without error`, () => {
        const room = createRoomWithSize(size);
        expect(room.state.mapWidth).toBe(size);
        expect(room.state.mapHeight).toBe(size);
        expect(room.state.tiles.length).toBe(size * size);
      });
    }

    it("default size (128) works via generateMap with no args", () => {
      const room = Object.create(GameRoom.prototype) as GameRoom;
      room.state = new GameState();
      room.generateMap();
      room.broadcast = vi.fn();
      room.playerViews = new Map();
      expect(room.state.mapWidth).toBe(DEFAULT_MAP_SIZE);
      expect(room.state.mapHeight).toBe(DEFAULT_MAP_SIZE);
    });
  });

  // ── 2. Tile correctness at different sizes ────────────────────

  describe("tile integrity at non-default sizes", () => {
    const sizes = [64, 128, 256];

    for (const size of sizes) {
      it(`every tile has correct x/y for ${size}×${size}`, () => {
        const room = createRoomWithSize(size);
        const w = room.state.mapWidth;
        for (let i = 0; i < room.state.tiles.length; i++) {
          const tile = room.state.tiles.at(i)!;
          expect(tile.x).toBe(i % w);
          expect(tile.y).toBe(Math.floor(i / w));
        }
      });

      it(`getTile boundary access works for ${size}×${size}`, () => {
        const room = createRoomWithSize(size);
        expect(room.state.getTile(0, 0)).toBeDefined();
        expect(room.state.getTile(size - 1, size - 1)).toBeDefined();
        expect(room.state.getTile(size, 0)).toBeUndefined();
        expect(room.state.getTile(0, size)).toBeUndefined();
        expect(room.state.getTile(-1, 0)).toBeUndefined();
      });
    }
  });

  // ── 3. Creature spawning at different sizes ───────────────────

  describe("creature spawning at different sizes", () => {
    // Skip very small maps where there may not be enough walkable tiles
    const sizes = [64, 128, 256];

    for (const size of sizes) {
      it(`spawns correct creature count on ${size}×${size} map`, () => {
        const room = createRoomWithCreatures(size);
        const expectedTotal = CREATURE_SPAWN.HERBIVORE_COUNT + CREATURE_SPAWN.CARNIVORE_COUNT + 
                             CREATURE_SPAWN.BIRD_COUNT + CREATURE_SPAWN.MONKEY_COUNT + CREATURE_SPAWN.SPIDER_COUNT;
        expect(room.state.creatures.size).toBe(expectedTotal);
      });

      it(`all creatures spawn in bounds on ${size}×${size} map`, () => {
        const room = createRoomWithCreatures(size);
        room.state.creatures.forEach((c: CreatureState) => {
          expect(c.x).toBeGreaterThanOrEqual(0);
          expect(c.x).toBeLessThan(size);
          expect(c.y).toBeGreaterThanOrEqual(0);
          expect(c.y).toBeLessThan(size);
        });
      });
    }
  });

  // ── 4. Performance at various sizes ───────────────────────────

  describe("generation performance across sizes", () => {
    // Time budgets: scale quadratically with map area.
    // 128×128 baseline: ~500ms ideal, 2500ms hard ceiling.
    // Scale linearly from tile count ratio.
    const baseTiles = 128 * 128;
    const baseIdealMs = 500;
    const baseCeilingMs = 2500;

    const perfSizes = [
      { size: 32, label: "32×32 (tiny)" },
      { size: 64, label: "64×64 (small)" },
      { size: 128, label: "128×128 (default)" },
      { size: 256, label: "256×256 (large)" },
    ];

    for (const { size, label } of perfSizes) {
      it(`map generation ${label} completes within scaled ceiling`, () => {
        const tiles = size * size;
        const scale = tiles / baseTiles;
        const ceiling = Math.max(baseCeilingMs * scale, 1000); // minimum 1s ceiling
        const ideal = Math.max(baseIdealMs * scale, 200);

        const start = performance.now();
        createRoomWithSize(size);
        const elapsed = performance.now() - start;

        if (elapsed > ideal) {
          console.warn(
            `⚠ Map generation (${label}) took ${elapsed.toFixed(0)}ms (ideal < ${ideal.toFixed(0)}ms)`,
          );
        }
        expect(elapsed).toBeLessThan(ceiling);
      });
    }

    for (const { size, label } of perfSizes) {
      it(`map + creatures ${label} completes within scaled ceiling`, () => {
        const tiles = size * size;
        const scale = tiles / baseTiles;
        const ceiling = Math.max(5000 * scale, 2000); // generous for creatures
        const ideal = Math.max(1000 * scale, 500);

        const start = performance.now();
        createRoomWithCreatures(size);
        const elapsed = performance.now() - start;

        if (elapsed > ideal) {
          console.warn(
            `⚠ Map + creatures (${label}) took ${elapsed.toFixed(0)}ms (ideal < ${ideal.toFixed(0)}ms)`,
          );
        }
        expect(elapsed).toBeLessThan(ceiling);
      });
    }
  });

  // ── 5. Direct generateProceduralMap for non-square/edge cases ─

  describe("generateProceduralMap edge cases", () => {
    it("generates 1×1 map without crash", () => {
      const state = new GameState();
      generateProceduralMap(state, 42, 1, 1);
      expect(state.tiles.length).toBe(1);
      expect(state.mapWidth).toBe(1);
      expect(state.mapHeight).toBe(1);
      const tile = state.tiles.at(0)!;
      expect(tile.x).toBe(0);
      expect(tile.y).toBe(0);
    });

    it("generates 16×16 map without crash", () => {
      const state = new GameState();
      generateProceduralMap(state, 42, 16, 16);
      expect(state.tiles.length).toBe(256);
      expect(state.mapWidth).toBe(16);
      expect(state.mapHeight).toBe(16);
    });

    it("generates 512×512 map without crash", () => {
      const state = new GameState();
      const start = performance.now();
      generateProceduralMap(state, 42, 512, 512);
      const elapsed = performance.now() - start;

      expect(state.tiles.length).toBe(512 * 512);
      expect(state.mapWidth).toBe(512);

      // 512×512 = 16× the tiles of 128×128. Should still finish in <40s.
      expect(elapsed).toBeLessThan(40000);
    });
  });

  // ── 6. Determinism across sizes ───────────────────────────────

  describe("deterministic generation", () => {
    const sizes = [64, 128, 256];

    for (const size of sizes) {
      it(`same seed produces identical ${size}×${size} map`, () => {
        const seed = 12345;
        const room1 = createRoomWithSize(size, seed);
        const room2 = createRoomWithSize(size, seed);

        expect(room1.state.tiles.length).toBe(room2.state.tiles.length);

        // Spot-check tiles at start, middle, end
        const checkIndices = [0, Math.floor(size * size / 2), size * size - 1];
        for (const idx of checkIndices) {
          const t1 = room1.state.tiles.at(idx)!;
          const t2 = room2.state.tiles.at(idx)!;
          expect(t1.type).toBe(t2.type);
          expect(t1.x).toBe(t2.x);
          expect(t1.y).toBe(t2.y);
          expect(t1.fertility).toBe(t2.fertility);
          expect(t1.resourceType).toBe(t2.resourceType);
        }
      });
    }
  });

  // ── 7. mapWidth/mapHeight consistency ─────────────────────────

  describe("state dimensions match requested size", () => {
    const sizes = [32, 64, 96, 128, 192, 256];

    for (const size of sizes) {
      it(`mapWidth and mapHeight are ${size} for ${size}×${size} request`, () => {
        const state = new GameState();
        generateProceduralMap(state, DEFAULT_MAP_SEED, size, size);
        expect(state.mapWidth).toBe(size);
        expect(state.mapHeight).toBe(size);
      });
    }
  });

  // ── 8. Different seeds at same size produce different maps ────

  describe("seed variation", () => {
    it("different seeds at 64×64 produce different terrain", () => {
      const room1 = createRoomWithSize(64, 1);
      const room2 = createRoomWithSize(64, 99999);

      // At least some tiles should differ in biome type
      let differences = 0;
      for (let i = 0; i < room1.state.tiles.length; i++) {
        if (room1.state.tiles.at(i)!.type !== room2.state.tiles.at(i)!.type) {
          differences++;
        }
      }
      expect(differences).toBeGreaterThan(0);
    });
  });

  // ── 9. onCreate-style room creation with mapSize option ───────

  describe("room creation with mapSize option (onCreate path)", () => {
    // This tests the actual code path that Bug #126 hits:
    // GameRoom.onCreate reads options.mapSize and passes it to generateMap.
    // We can't call onCreate directly (needs Colyseus runtime), but we
    // can verify the generateMap(seed, mapSize) path works for all sizes.

    const sizes = [64, 128, 256];

    for (const size of sizes) {
      it(`generateMap(seed, ${size}) succeeds like onCreate would call it`, () => {
        const room = Object.create(GameRoom.prototype) as GameRoom;
        room.state = new GameState();
        room.broadcast = vi.fn();
        room.playerViews = new Map();

        // This is the exact call from onCreate line 79
        room.generateMap(DEFAULT_MAP_SEED, size);

        expect(room.state.mapWidth).toBe(size);
        expect(room.state.mapHeight).toBe(size);
        expect(room.state.tiles.length).toBe(size * size);
      });
    }
  });
});
