import { describe, it, expect } from "vitest";
import { GameState, TileState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { TileType, DEFAULT_MAP_SIZE } from "@primal-grid/shared";

/**
 * Create a room-like object with a seeded procedural map.
 * Uses Object.create to access private methods without full Colyseus server.
 */
function createRoomWithMap(seed?: number): any {
  const room = Object.create(GameRoom.prototype) as any;
  room.state = new GameState();
  room.generateMap(seed);
  return room;
}

function fakeClient(sessionId: string): any {
  return { sessionId };
}

/** Collect all unique TileType values from the map. */
function collectBiomeTypes(room: any): Set<number> {
  const types = new Set<number>();
  for (let i = 0; i < room.state.tiles.length; i++) {
    types.add(room.state.tiles.at(i)!.type);
  }
  return types;
}

const ALL_BIOME_VALUES = new Set([
  TileType.Grassland,
  TileType.Forest,
  TileType.Swamp,
  TileType.Desert,
  TileType.Highland,
  TileType.Water,
  TileType.Rock,
  TileType.Sand,
]);

const NON_WALKABLE = new Set([TileType.Water, TileType.Rock]);

describe("Phase 2.1 — Procedural Map Generation", () => {
  // ── Map size ──────────────────────────────────────────────────────
  describe("map size", () => {
    it("generated map is correct size (32×32 = 1024 tiles)", () => {
      const room = createRoomWithMap(42);
      expect(room.state.tiles.length).toBe(DEFAULT_MAP_SIZE * DEFAULT_MAP_SIZE);
      expect(room.state.tiles.length).toBe(1024);
    });

    it("map dimensions match DEFAULT_MAP_SIZE", () => {
      const room = createRoomWithMap(42);
      expect(room.state.mapWidth).toBe(DEFAULT_MAP_SIZE);
      expect(room.state.mapHeight).toBe(DEFAULT_MAP_SIZE);
    });

    it("tile coordinates are row-major and in bounds", () => {
      const room = createRoomWithMap(42);
      for (let y = 0; y < DEFAULT_MAP_SIZE; y++) {
        for (let x = 0; x < DEFAULT_MAP_SIZE; x++) {
          const idx = y * DEFAULT_MAP_SIZE + x;
          const tile = room.state.tiles.at(idx)!;
          expect(tile.x).toBe(x);
          expect(tile.y).toBe(y);
        }
      }
    });
  });

  // ── Tile validity ─────────────────────────────────────────────────
  describe("tile validity", () => {
    it("all tiles have valid TileType values from the 8-biome set", () => {
      const room = createRoomWithMap(42);
      for (let i = 0; i < room.state.tiles.length; i++) {
        const tile = room.state.tiles.at(i)!;
        expect(ALL_BIOME_VALUES.has(tile.type)).toBe(true);
      }
    });
  });

  // ── Seed reproducibility ──────────────────────────────────────────
  describe("seed reproducibility", () => {
    it("same seed produces identical tile types", () => {
      const room1 = createRoomWithMap(12345);
      const room2 = createRoomWithMap(12345);
      expect(room1.state.tiles.length).toBe(room2.state.tiles.length);
      for (let i = 0; i < room1.state.tiles.length; i++) {
        expect(room1.state.tiles.at(i)!.type).toBe(room2.state.tiles.at(i)!.type);
      }
    });

    it("same seed produces identical fertility and moisture values", () => {
      const room1 = createRoomWithMap(12345);
      const room2 = createRoomWithMap(12345);
      for (let i = 0; i < room1.state.tiles.length; i++) {
        const t1 = room1.state.tiles.at(i)!;
        const t2 = room2.state.tiles.at(i)!;
        expect(t1.fertility).toBe(t2.fertility);
        expect(t1.moisture).toBe(t2.moisture);
      }
    });

    it("different seeds produce different maps", () => {
      const room1 = createRoomWithMap(11111);
      const room2 = createRoomWithMap(99999);
      let differences = 0;
      for (let i = 0; i < room1.state.tiles.length; i++) {
        if (room1.state.tiles.at(i)!.type !== room2.state.tiles.at(i)!.type) {
          differences++;
        }
      }
      expect(differences).toBeGreaterThan(0);
    });
  });

  // ── Biome diversity ───────────────────────────────────────────────
  describe("biome diversity", () => {
    it("map contains at least 3 different biome types (not mono-biome)", () => {
      const room = createRoomWithMap(42);
      const typesFound = collectBiomeTypes(room);
      expect(typesFound.size).toBeGreaterThanOrEqual(3);
    });

    it("Water tiles exist (elevation layer works)", () => {
      const room = createRoomWithMap(42);
      const typesFound = collectBiomeTypes(room);
      expect(typesFound.has(TileType.Water)).toBe(true);
    });

    it("Rock tiles exist (elevation layer works)", () => {
      const room = createRoomWithMap(42);
      const typesFound = collectBiomeTypes(room);
      expect(typesFound.has(TileType.Rock)).toBe(true);
    });
  });

  // ── Tile properties ───────────────────────────────────────────────
  describe("tile properties", () => {
    it("all tiles have fertility in 0–1 range", () => {
      const room = createRoomWithMap(42);
      for (let i = 0; i < room.state.tiles.length; i++) {
        const tile = room.state.tiles.at(i)!;
        expect(tile.fertility).toBeGreaterThanOrEqual(0);
        expect(tile.fertility).toBeLessThanOrEqual(1);
      }
    });

    it("all tiles have moisture in 0–1 range", () => {
      const room = createRoomWithMap(42);
      for (let i = 0; i < room.state.tiles.length; i++) {
        const tile = room.state.tiles.at(i)!;
        expect(tile.moisture).toBeGreaterThanOrEqual(0);
        expect(tile.moisture).toBeLessThanOrEqual(1);
      }
    });

    it("fertility and moisture are numbers (not undefined)", () => {
      const room = createRoomWithMap(42);
      for (let i = 0; i < room.state.tiles.length; i++) {
        const tile = room.state.tiles.at(i)!;
        expect(typeof tile.fertility).toBe("number");
        expect(typeof tile.moisture).toBe("number");
      }
    });
  });

  // ── Walkability ───────────────────────────────────────────────────
  describe("walkability", () => {
    it("Water is not walkable", () => {
      const room = createRoomWithMap(42);
      for (let i = 0; i < room.state.tiles.length; i++) {
        const tile = room.state.tiles.at(i)!;
        if (tile.type === TileType.Water) {
          expect(room.state.isWalkable(tile.x, tile.y)).toBe(false);
        }
      }
    });

    it("Rock is not walkable", () => {
      const room = createRoomWithMap(42);
      for (let i = 0; i < room.state.tiles.length; i++) {
        const tile = room.state.tiles.at(i)!;
        if (tile.type === TileType.Rock) {
          expect(room.state.isWalkable(tile.x, tile.y)).toBe(false);
        }
      }
    });

    it("Grassland is walkable", () => {
      const room = createRoomWithMap(42);
      for (let i = 0; i < room.state.tiles.length; i++) {
        const tile = room.state.tiles.at(i)!;
        if (tile.type === TileType.Grassland) {
          expect(room.state.isWalkable(tile.x, tile.y)).toBe(true);
          return; // at least one found and verified
        }
      }
    });

    it("Forest is walkable", () => {
      const room = createRoomWithMap(42);
      for (let i = 0; i < room.state.tiles.length; i++) {
        const tile = room.state.tiles.at(i)!;
        if (tile.type === TileType.Forest) {
          expect(room.state.isWalkable(tile.x, tile.y)).toBe(true);
          return;
        }
      }
    });

    it("Swamp is walkable", () => {
      const room = createRoomWithMap(42);
      for (let i = 0; i < room.state.tiles.length; i++) {
        const tile = room.state.tiles.at(i)!;
        if (tile.type === TileType.Swamp) {
          expect(room.state.isWalkable(tile.x, tile.y)).toBe(true);
          return;
        }
      }
    });

    it("Desert is walkable", () => {
      const room = createRoomWithMap(42);
      for (let i = 0; i < room.state.tiles.length; i++) {
        const tile = room.state.tiles.at(i)!;
        if (tile.type === TileType.Desert) {
          expect(room.state.isWalkable(tile.x, tile.y)).toBe(true);
          return;
        }
      }
    });

    it("Highland is walkable", () => {
      const room = createRoomWithMap(42);
      for (let i = 0; i < room.state.tiles.length; i++) {
        const tile = room.state.tiles.at(i)!;
        if (tile.type === TileType.Highland) {
          expect(room.state.isWalkable(tile.x, tile.y)).toBe(true);
          return;
        }
      }
    });

    it("Sand is walkable", () => {
      const room = createRoomWithMap(42);
      for (let i = 0; i < room.state.tiles.length; i++) {
        const tile = room.state.tiles.at(i)!;
        if (tile.type === TileType.Sand) {
          expect(room.state.isWalkable(tile.x, tile.y)).toBe(true);
          return;
        }
      }
    });

    it("walkability rule is consistent: only Water and Rock are non-walkable", () => {
      const room = createRoomWithMap(42);
      for (let i = 0; i < room.state.tiles.length; i++) {
        const tile = room.state.tiles.at(i)!;
        const walkable = room.state.isWalkable(tile.x, tile.y);
        if (NON_WALKABLE.has(tile.type)) {
          expect(walkable).toBe(false);
        } else {
          expect(walkable).toBe(true);
        }
      }
    });
  });

  // ── Player spawn ──────────────────────────────────────────────────
  describe("player spawn", () => {
    it("player spawns on a walkable tile", () => {
      const room = createRoomWithMap(42);
      room.onJoin(fakeClient("spawn-test"));
      const player = room.state.players.get("spawn-test")!;
      expect(player).toBeDefined();
      expect(room.state.isWalkable(player.x, player.y)).toBe(true);
    });

    it("player spawn tile is not Water or Rock", () => {
      const room = createRoomWithMap(42);
      room.onJoin(fakeClient("spawn-biome"));
      const player = room.state.players.get("spawn-biome")!;
      const tile = room.state.getTile(player.x, player.y)!;
      expect(tile).toBeDefined();
      expect(tile.type).not.toBe(TileType.Water);
      expect(tile.type).not.toBe(TileType.Rock);
    });

    it("10 players all spawn on walkable tiles (stress test)", () => {
      const room = createRoomWithMap(42);
      for (let i = 0; i < 10; i++) {
        room.onJoin(fakeClient(`stress-${i}`));
      }
      expect(room.state.players.size).toBe(10);
      room.state.players.forEach((player: any) => {
        expect(room.state.isWalkable(player.x, player.y)).toBe(true);
        const tile = room.state.getTile(player.x, player.y)!;
        expect(tile.type).not.toBe(TileType.Water);
        expect(tile.type).not.toBe(TileType.Rock);
      });
    });
  });
});
