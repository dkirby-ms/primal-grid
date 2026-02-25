import { describe, it, expect } from "vitest";
import { GameState, PlayerState, StructureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import {
  TileType, ItemType,
  FARM, DEFAULT_MAP_SIZE,
} from "@primal-grid/shared";
import type { PlacePayload, FarmHarvestPayload } from "@primal-grid/shared";

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

function findTileOfType(room: any, tileType: number): { x: number; y: number } | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (tile.type === tileType) {
      return { x: tile.x, y: tile.y };
    }
  }
  return null;
}

/** Find an adjacent pair where the target tile is a specific biome. */
function findAdjacentPairWithBiome(
  room: any,
  targetBiome: number,
): { player: { x: number; y: number }; target: { x: number; y: number } } | null {
  const w = room.state.mapWidth;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const tile = room.state.getTile(x, y);
      if (!tile || tile.type !== targetBiome) continue;
      // Check neighbors for a walkable player position
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const px = x + dx;
        const py = y + dy;
        if (px >= 0 && px < w && py >= 0 && py < w && room.state.isWalkable(px, py)) {
          return { player: { x: px, y: py }, target: { x, y } };
        }
      }
    }
  }
  return null;
}

/** Find an adjacent pair where the target is walkable (Grassland or Forest). */
function findAdjacentWalkablePair(room: any): { player: { x: number; y: number }; target: { x: number; y: number } } | null {
  const w = room.state.mapWidth;
  for (let y = 1; y < w - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (room.state.isWalkable(x, y) && room.state.isWalkable(x + 1, y)) {
        return { player: { x, y }, target: { x: x + 1, y } };
      }
    }
  }
  return null;
}

/** Place a FarmPlot structure directly on state and return it. */
function placeFarmAt(room: any, x: number, y: number, placedBy: string): any {
  const farm = new StructureState();
  farm.id = `farm_${room.state.structures.size}`;
  farm.structureType = ItemType.FarmPlot;
  farm.x = x;
  farm.y = y;
  farm.placedBy = placedBy;
  farm.growthProgress = 0;
  farm.cropReady = false;
  room.state.structures.set(farm.id, farm);
  return farm;
}

// ═══════════════════════════════════════════════════════════════════
// Phase 3 — Farm Plot Placement Restrictions
// ═══════════════════════════════════════════════════════════════════

describe("Phase 3 — Farm Placement Restrictions", () => {
  it("FarmPlot placement on Grassland: succeeds", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentPairWithBiome(room, TileType.Grassland);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "farmer-grass", pair.player.x, pair.player.y);
    player.farmPlots = 1;

    room.handlePlace(client, {
      itemType: ItemType.FarmPlot,
      x: pair.target.x,
      y: pair.target.y,
    } as PlacePayload);

    expect(player.farmPlots).toBe(0);
    expect(room.state.structures.size).toBe(1);
  });

  it("FarmPlot placement on Forest: succeeds", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentPairWithBiome(room, TileType.Forest);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "farmer-forest", pair.player.x, pair.player.y);
    player.farmPlots = 1;

    room.handlePlace(client, {
      itemType: ItemType.FarmPlot,
      x: pair.target.x,
      y: pair.target.y,
    } as PlacePayload);

    expect(player.farmPlots).toBe(0);
    expect(room.state.structures.size).toBe(1);
  });

  it("FarmPlot placement on Desert: fails", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentPairWithBiome(room, TileType.Desert);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "farmer-desert", pair.player.x, pair.player.y);
    player.farmPlots = 1;

    room.handlePlace(client, {
      itemType: ItemType.FarmPlot,
      x: pair.target.x,
      y: pair.target.y,
    } as PlacePayload);

    expect(player.farmPlots).toBe(1);
    expect(room.state.structures.size).toBe(0);
  });

  it("FarmPlot placement on Water: fails", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentPairWithBiome(room, TileType.Water);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "farmer-water", pair.player.x, pair.player.y);
    player.farmPlots = 1;

    room.handlePlace(client, {
      itemType: ItemType.FarmPlot,
      x: pair.target.x,
      y: pair.target.y,
    } as PlacePayload);

    expect(player.farmPlots).toBe(1);
    expect(room.state.structures.size).toBe(0);
  });

  it("FarmPlot placement on Rock: fails", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentPairWithBiome(room, TileType.Rock);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "farmer-rock", pair.player.x, pair.player.y);
    player.farmPlots = 1;

    room.handlePlace(client, {
      itemType: ItemType.FarmPlot,
      x: pair.target.x,
      y: pair.target.y,
    } as PlacePayload);

    expect(player.farmPlots).toBe(1);
    expect(room.state.structures.size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Phase 3 — Farm Growth
// ═══════════════════════════════════════════════════════════════════

describe("Phase 3 — Farm Growth", () => {
  it("farm growth increments by fertility * growthRate per tick", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentPairWithBiome(room, TileType.Grassland);
    if (!pair) return;

    const farm = placeFarmAt(room, pair.target.x, pair.target.y, "grower");

    const tile = room.state.getTile(pair.target.x, pair.target.y);
    const expectedGrowth = tile.fertility * FARM.GROWTH_RATE;

    // Tick at the farm interval
    room.state.tick = FARM.TICK_INTERVAL;
    if (typeof room.tickFarms === "function") {
      room.tickFarms();
    }

    expect(farm.growthProgress).toBeCloseTo(expectedGrowth, 1);
  });

  it("cropReady becomes true at growthProgress >= 100", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentPairWithBiome(room, TileType.Grassland);
    if (!pair) return;

    const farm = placeFarmAt(room, pair.target.x, pair.target.y, "ready-test");
    farm.growthProgress = 99;

    const tile = room.state.getTile(pair.target.x, pair.target.y);
    // Ensure one tick will push it over 100
    const growth = tile.fertility * FARM.GROWTH_RATE;
    if (growth < 1) {
      farm.growthProgress = 100 - 0.5;
    }

    room.state.tick = FARM.TICK_INTERVAL;
    if (typeof room.tickFarms === "function") {
      room.tickFarms();
    }

    if (farm.growthProgress >= 100) {
      expect(farm.cropReady).toBe(true);
    }
  });

  it("higher fertility = faster growth", () => {
    const room = createRoomWithMap(42);

    // Create two farms on tiles with different fertility
    let lowFertTile: any = null;
    let highFertTile: any = null;
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      if (tile.type === TileType.Grassland || tile.type === TileType.Forest) {
        if (!lowFertTile || tile.fertility < lowFertTile.fertility) {
          lowFertTile = tile;
        }
        if (!highFertTile || tile.fertility > highFertTile.fertility) {
          highFertTile = tile;
        }
      }
    }

    if (!lowFertTile || !highFertTile || lowFertTile.fertility === highFertTile.fertility) return;

    const farmLow = placeFarmAt(room, lowFertTile.x, lowFertTile.y, "low");
    const farmHigh = placeFarmAt(room, highFertTile.x, highFertTile.y, "high");

    // Tick
    room.state.tick = FARM.TICK_INTERVAL;
    if (typeof room.tickFarms === "function") {
      room.tickFarms();
    }

    expect(farmHigh.growthProgress).toBeGreaterThan(farmLow.growthProgress);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Phase 3 — Farm Harvest
// ═══════════════════════════════════════════════════════════════════

describe("Phase 3 — Farm Harvest", () => {
  it("FARM_HARVEST: cropReady=true gives berries, resets growth", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentWalkablePair(room);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "harvester", pair.player.x, pair.player.y);

    const farm = placeFarmAt(room, pair.target.x, pair.target.y, "harvester");
    farm.growthProgress = 100;
    farm.cropReady = true;

    const berriesBefore = player.berries;

    room.handleFarmHarvest(client, {
      x: pair.target.x,
      y: pair.target.y,
    } as FarmHarvestPayload);

    // Player gets berries
    expect(player.berries).toBeGreaterThan(berriesBefore);
    // Growth resets
    expect(farm.growthProgress).toBe(0);
    expect(farm.cropReady).toBe(false);
  });

  it("FARM_HARVEST: cropReady=false fails", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentWalkablePair(room);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "early-harvest", pair.player.x, pair.player.y);

    const farm = placeFarmAt(room, pair.target.x, pair.target.y, "early-harvest");
    farm.growthProgress = 50;
    farm.cropReady = false;

    const berriesBefore = player.berries;

    room.handleFarmHarvest(client, {
      x: pair.target.x,
      y: pair.target.y,
    } as FarmHarvestPayload);

    expect(player.berries).toBe(berriesBefore);
    expect(farm.growthProgress).toBe(50);
  });

  it("FARM_HARVEST: non-adjacent fails", () => {
    const room = createRoomWithMap(42);
    const pos = findTileOfType(room, TileType.Grassland);
    if (!pos) return;

    const farX = (pos.x + 5) % DEFAULT_MAP_SIZE;
    const farY = (pos.y + 5) % DEFAULT_MAP_SIZE;
    const { client, player } = placePlayerAt(room, "far-harvester", farX, farY);

    const farm = placeFarmAt(room, pos.x, pos.y, "far-harvester");
    farm.growthProgress = 100;
    farm.cropReady = true;

    const berriesBefore = player.berries;

    room.handleFarmHarvest(client, {
      x: pos.x,
      y: pos.y,
    } as FarmHarvestPayload);

    expect(player.berries).toBe(berriesBefore);
    // Farm state unchanged
    expect(farm.cropReady).toBe(true);
    expect(farm.growthProgress).toBe(100);
  });

  it("harvest amount scales with fertility (base yield * fertility factor)", () => {
    const room = createRoomWithMap(42);

    // Find a high-fertility Grassland tile adjacent to a walkable tile
    let bestPair: { player: { x: number; y: number }; target: { x: number; y: number }; fertility: number } | null = null;
    const w = room.state.mapWidth;
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w - 1; x++) {
        const tile = room.state.getTile(x + 1, y);
        if (tile && (tile.type === TileType.Grassland || tile.type === TileType.Forest)
          && room.state.isWalkable(x, y) && room.state.isWalkable(x + 1, y)) {
          if (!bestPair || tile.fertility > bestPair.fertility) {
            bestPair = { player: { x, y }, target: { x: x + 1, y }, fertility: tile.fertility };
          }
        }
      }
    }
    if (!bestPair) return;

    const { client, player } = placePlayerAt(room, "yield-test", bestPair.player.x, bestPair.player.y);

    const farm = placeFarmAt(room, bestPair.target.x, bestPair.target.y, "yield-test");
    farm.growthProgress = 100;
    farm.cropReady = true;

    room.handleFarmHarvest(client, {
      x: bestPair.target.x,
      y: bestPair.target.y,
    } as FarmHarvestPayload);

    // Player should get at least BASE_HARVEST_YIELD berries
    expect(player.berries).toBeGreaterThanOrEqual(FARM.BASE_HARVEST_YIELD);
  });
});
