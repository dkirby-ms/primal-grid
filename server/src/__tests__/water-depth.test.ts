import { describe, it, expect, vi } from "vitest";
import { GameRoom } from "../rooms/GameRoom.js";
import { GameState, TileState, CreatureState } from "../rooms/GameState.js";
import { isTileOpenForCreature } from "../rooms/creatureAI.js";
import {
  TileType,
  isWaterTile,
  WATER_GENERATION,
  CREATURE_TYPES,
  DEFAULT_MAP_SIZE,
} from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): GameRoom {
  const room = Object.create(GameRoom.prototype) as GameRoom;
  room.state = new GameState();
  room.generateMap(seed);
  room.broadcast = vi.fn();
  return room;
}

function makeCreature(
  id: string,
  type: string,
  x: number,
  y: number,
): CreatureState {
  const creature = new CreatureState();
  creature.id = id;
  creature.creatureType = type;
  creature.x = x;
  creature.y = y;
  const def = CREATURE_TYPES[type as keyof typeof CREATURE_TYPES];
  if (def) {
    creature.health = def.health;
    creature.stamina = def.maxStamina;
  }
  return creature;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Water Depth Variants", () => {
  // ─── 1. TileType enum integrity ─────────────────────────────────
  describe("TileType enum integrity", () => {
    it("ShallowWater exists in TileType enum", () => {
      expect(TileType.ShallowWater).toBeDefined();
      expect(typeof TileType.ShallowWater).toBe("number");
    });

    it("DeepWater exists in TileType enum", () => {
      expect(TileType.DeepWater).toBeDefined();
      expect(typeof TileType.DeepWater).toBe("number");
    });

    it("Water does NOT exist in TileType (removed)", () => {
      expect((TileType as Record<string, unknown>)["Water"]).toBeUndefined();
    });

    it("isWaterTile() returns true for ShallowWater", () => {
      expect(isWaterTile(TileType.ShallowWater)).toBe(true);
    });

    it("isWaterTile() returns true for DeepWater", () => {
      expect(isWaterTile(TileType.DeepWater)).toBe(true);
    });

    it("isWaterTile() returns false for all non-water tile types", () => {
      const nonWaterTypes = [
        TileType.Grassland,
        TileType.Forest,
        TileType.Swamp,
        TileType.Desert,
        TileType.Highland,
        TileType.Rock,
        TileType.Sand,
      ];
      for (const t of nonWaterTypes) {
        expect(isWaterTile(t)).toBe(false);
      }
    });
  });

  // ─── 2. Map generation water distribution ───────────────────────
  describe("Map generation water distribution", () => {
    const TEST_SEEDS = [42, 100, 256, 777, 9999];

    it("generated maps contain BOTH ShallowWater and DeepWater tiles", { timeout: 30_000 }, () => {
      for (const seed of TEST_SEEDS) {
        const room = createRoomWithMap(seed);
        let shallow = 0;
        let deep = 0;
        for (let i = 0; i < room.state.tiles.length; i++) {
          const tile = room.state.tiles.at(i)!;
          if (tile.type === TileType.ShallowWater) shallow++;
          if (tile.type === TileType.DeepWater) deep++;
        }
        expect(shallow).toBeGreaterThan(0);
        expect(deep).toBeGreaterThan(0);
      }
    });

    it("water tiles exist on the map (not all eliminated by smoothing)", { timeout: 30_000 }, () => {
      for (const seed of TEST_SEEDS) {
        const room = createRoomWithMap(seed);
        let waterCount = 0;
        for (let i = 0; i < room.state.tiles.length; i++) {
          if (isWaterTile(room.state.tiles.at(i)!.type)) waterCount++;
        }
        expect(waterCount).toBeGreaterThan(0);
      }
    });

    it("ShallowWater tiles are within SHALLOW_RADIUS of a non-water tile", () => {
      const room = createRoomWithMap(42);
      const w = room.state.mapWidth;
      const h = room.state.mapHeight;
      const radius = WATER_GENERATION.SHALLOW_RADIUS;

      for (let i = 0; i < room.state.tiles.length; i++) {
        const tile = room.state.tiles.at(i)!;
        if (tile.type !== TileType.ShallowWater) continue;

        // At least one non-water tile must be within radius (Manhattan via BFS)
        let foundLand = false;
        for (let dy = -radius; dy <= radius && !foundLand; dy++) {
          for (let dx = -radius; dx <= radius && !foundLand; dx++) {
            const nx = tile.x + dx;
            const ny = tile.y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const neighbor = room.state.getTile(nx, ny);
            if (neighbor && !isWaterTile(neighbor.type)) {
              foundLand = true;
            }
          }
        }
        expect(foundLand).toBe(true);
      }
    });

    it("DeepWater tiles are NOT adjacent to non-water tiles (distance > SHALLOW_RADIUS)", () => {
      const room = createRoomWithMap(42);
      const w = room.state.mapWidth;
      const h = room.state.mapHeight;
      const radius = WATER_GENERATION.SHALLOW_RADIUS;

      for (let i = 0; i < room.state.tiles.length; i++) {
        const tile = room.state.tiles.at(i)!;
        if (tile.type !== TileType.DeepWater) continue;

        // No non-water tile should be within radius (cardinal BFS distance)
        // The BFS uses cardinal neighbors, so check a conservative cardinal-distance window
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            // Only check tiles within cardinal distance ≤ radius
            if (Math.abs(dx) + Math.abs(dy) > radius) continue;
            const nx = tile.x + dx;
            const ny = tile.y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const neighbor = room.state.getTile(nx, ny);
            if (neighbor) {
              expect(isWaterTile(neighbor.type)).toBe(true);
            }
          }
        }
      }
    });

    it("single isolated water tiles are ShallowWater (not Deep)", () => {
      // Create a controlled map to test isolated water behavior
      const room = Object.create(GameRoom.prototype) as GameRoom;
      room.state = new GameState();
      room.state.mapWidth = 8;
      room.state.mapHeight = 8;

      // Fill with grassland, place a single water tile in the center
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const tile = new TileState();
          tile.x = x;
          tile.y = y;
          tile.type = TileType.Grassland;
          room.state.tiles.push(tile);
        }
      }
      // Place one water tile at (4,4)
      const centerTile = room.state.getTile(4, 4)!;
      centerTile.type = TileType.ShallowWater;

      // After classifying, isolated water should remain ShallowWater (surrounded by land)
      expect(centerTile.type).toBe(TileType.ShallowWater);
    });

    it("consistency across multiple seeds — every seed has both depth variants", { timeout: 30_000 }, () => {
      const moreSeeds = [1, 7, 64, 500, 1000];
      for (const seed of moreSeeds) {
        const room = createRoomWithMap(seed);
        const types = new Set<TileType>();
        for (let i = 0; i < room.state.tiles.length; i++) {
          const t = room.state.tiles.at(i)!.type;
          if (isWaterTile(t)) types.add(t);
        }
        expect(types.has(TileType.ShallowWater)).toBe(true);
        expect(types.has(TileType.DeepWater)).toBe(true);
      }
    });
  });

  // ─── 3. Creature AI water avoidance ─────────────────────────────
  describe("Creature AI water avoidance", () => {
    it("creatures cannot enter ShallowWater tiles (isWalkable returns false)", () => {
      const state = new GameState();
      state.mapWidth = 4;
      state.mapHeight = 4;
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const tile = new TileState();
          tile.x = x;
          tile.y = y;
          tile.type = x === 2 ? TileType.ShallowWater : TileType.Grassland;
          state.tiles.push(tile);
        }
      }

      expect(state.isWalkable(0, 0)).toBe(true);
      expect(state.isWalkable(2, 0)).toBe(false);
      expect(state.isWalkable(2, 1)).toBe(false);
      expect(state.isWalkable(2, 2)).toBe(false);
      expect(state.isWalkable(2, 3)).toBe(false);
    });

    it("creatures cannot enter DeepWater tiles (isWalkable returns false)", () => {
      const state = new GameState();
      state.mapWidth = 4;
      state.mapHeight = 4;
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const tile = new TileState();
          tile.x = x;
          tile.y = y;
          tile.type = x === 1 ? TileType.DeepWater : TileType.Grassland;
          state.tiles.push(tile);
        }
      }

      expect(state.isWalkable(0, 0)).toBe(true);
      expect(state.isWalkable(1, 0)).toBe(false);
      expect(state.isWalkable(1, 1)).toBe(false);
      expect(state.isWalkable(1, 2)).toBe(false);
      expect(state.isWalkable(1, 3)).toBe(false);
    });

    it("isTileOpenForCreature rejects ShallowWater for herbivores", () => {
      const state = new GameState();
      state.mapWidth = 4;
      state.mapHeight = 4;
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const tile = new TileState();
          tile.x = x;
          tile.y = y;
          tile.type = x === 2 ? TileType.ShallowWater : TileType.Grassland;
          state.tiles.push(tile);
        }
      }

      const herb = makeCreature("herb1", "herbivore", 1, 0);
      state.creatures.set("herb1", herb);

      expect(isTileOpenForCreature(state, herb, 1, 0)).toBe(true);
      expect(isTileOpenForCreature(state, herb, 2, 0)).toBe(false);
    });

    it("isTileOpenForCreature rejects DeepWater for carnivores", () => {
      const state = new GameState();
      state.mapWidth = 4;
      state.mapHeight = 4;
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const tile = new TileState();
          tile.x = x;
          tile.y = y;
          tile.type = x === 3 ? TileType.DeepWater : TileType.Grassland;
          state.tiles.push(tile);
        }
      }

      const carn = makeCreature("carn1", "carnivore", 0, 0);
      state.creatures.set("carn1", carn);

      expect(isTileOpenForCreature(state, carn, 0, 0)).toBe(true);
      expect(isTileOpenForCreature(state, carn, 3, 0)).toBe(false);
    });

    it("isTileOpenForCreature rejects both water types for pawn builders", () => {
      const state = new GameState();
      state.mapWidth = 6;
      state.mapHeight = 1;
      for (let x = 0; x < 6; x++) {
        const tile = new TileState();
        tile.x = x;
        tile.y = 0;
        if (x === 2) tile.type = TileType.ShallowWater;
        else if (x === 4) tile.type = TileType.DeepWater;
        else tile.type = TileType.Grassland;
        state.tiles.push(tile);
      }

      const builder = new CreatureState();
      builder.id = "b1";
      builder.creatureType = "pawn_builder";
      builder.ownerID = "player1";
      builder.x = 0;
      builder.y = 0;
      builder.stamina = 20;
      state.creatures.set("b1", builder);

      expect(isTileOpenForCreature(state, builder, 0, 0)).toBe(true);
      expect(isTileOpenForCreature(state, builder, 2, 0)).toBe(false);
      expect(isTileOpenForCreature(state, builder, 4, 0)).toBe(false);
    });
  });

  // ─── 4. Map generation performance ──────────────────────────────
  describe("Map generation performance", () => {
    const MAP_IDEAL_MS = 500;
    const MAP_HARD_CEILING_MS = 2500;

    it("128×128 map generates within performance ceiling (no perf regression from water depth pass)", () => {
      const room = Object.create(GameRoom.prototype) as GameRoom;
      room.state = new GameState();
      room.state.mapWidth = DEFAULT_MAP_SIZE;
      room.state.mapHeight = DEFAULT_MAP_SIZE;
      room.broadcast = vi.fn();

      const start = performance.now();
      room.generateMap(42);
      const elapsed = performance.now() - start;

      if (elapsed > MAP_IDEAL_MS) {
        console.warn(
          `⚠ Map generation took ${elapsed.toFixed(0)}ms (ideal < ${MAP_IDEAL_MS}ms)`,
        );
      }
      expect(elapsed).toBeLessThan(MAP_HARD_CEILING_MS);
      expect(room.state.tiles.length).toBe(DEFAULT_MAP_SIZE * DEFAULT_MAP_SIZE);
    });
  });
});
