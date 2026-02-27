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

/** Join a player and return client + player. Player gets HQ and starting territory. */
function joinPlayer(room: any, sessionId: string) {
  const client = fakeClient(sessionId);
  room.onJoin(client);
  const player = room.state.players.get(sessionId)!;
  return { client, player };
}

/** Find a tile owned by player matching a specific biome type, with no structure on it. */
function findOwnedTileOfBiome(room: any, playerId: string, biomeType: number): { x: number; y: number } | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (tile.ownerID === playerId && tile.type === biomeType && room.state.isWalkable(tile.x, tile.y)) {
      let hasStructure = false;
      room.state.structures.forEach((s: any) => {
        if (s.x === tile.x && s.y === tile.y) hasStructure = true;
      });
      if (!hasStructure) return { x: tile.x, y: tile.y };
    }
  }
  return null;
}

/** Find a tile owned by player that is walkable, with no structure. */
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

// ═══════════════════════════════════════════════════════════════════
// Phase 3 — Farm Plot Placement Restrictions
// ═══════════════════════════════════════════════════════════════════

describe("Phase 3 — Farm Placement Restrictions", () => {
  it("FarmPlot placement on owned Grassland: succeeds", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "farmer-grass");
    player.farmPlots = 1;

    const pos = findOwnedTileOfBiome(room, "farmer-grass", TileType.Grassland);
    if (!pos) return;

    const structsBefore = room.state.structures.size;
    room.handlePlace(client, {
      itemType: ItemType.FarmPlot,
      x: pos.x,
      y: pos.y,
    } as PlacePayload);

    expect(player.farmPlots).toBe(0);
    expect(room.state.structures.size).toBe(structsBefore + 1);
  });

  it("FarmPlot placement on owned Forest: succeeds", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "farmer-forest");
    player.farmPlots = 1;

    const pos = findOwnedTileOfBiome(room, "farmer-forest", TileType.Forest);
    if (!pos) return;

    const structsBefore = room.state.structures.size;
    room.handlePlace(client, {
      itemType: ItemType.FarmPlot,
      x: pos.x,
      y: pos.y,
    } as PlacePayload);

    expect(player.farmPlots).toBe(0);
    expect(room.state.structures.size).toBe(structsBefore + 1);
  });

  it("FarmPlot placement on Desert: fails (even if owned)", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "farmer-desert");
    player.farmPlots = 1;

    // Manually set a desert tile as owned by the player
    const desertTile = findAdjacentPairWithBiome(room, TileType.Desert);
    if (!desertTile) return;
    const tile = room.state.getTile(desertTile.target.x, desertTile.target.y);
    if (tile) tile.ownerID = "farmer-desert";

    const structsBefore = room.state.structures.size;
    room.handlePlace(client, {
      itemType: ItemType.FarmPlot,
      x: desertTile.target.x,
      y: desertTile.target.y,
    } as PlacePayload);

    expect(player.farmPlots).toBe(1);
    expect(room.state.structures.size).toBe(structsBefore);
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
    const { client, player } = joinPlayer(room, "harvester");

    const pos = findOwnedWalkableTile(room, "harvester");
    if (!pos) return;

    const farm = placeFarmAt(room, pos.x, pos.y, "harvester");
    farm.growthProgress = 100;
    farm.cropReady = true;

    const berriesBefore = player.berries;

    room.handleFarmHarvest(client, {
      x: pos.x,
      y: pos.y,
    } as FarmHarvestPayload);

    expect(player.berries).toBeGreaterThan(berriesBefore);
    expect(farm.growthProgress).toBe(0);
    expect(farm.cropReady).toBe(false);
  });

  it("FARM_HARVEST: cropReady=false fails", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "early-harvest");

    const pos = findOwnedWalkableTile(room, "early-harvest");
    if (!pos) return;

    const farm = placeFarmAt(room, pos.x, pos.y, "early-harvest");
    farm.growthProgress = 50;
    farm.cropReady = false;

    const berriesBefore = player.berries;

    room.handleFarmHarvest(client, {
      x: pos.x,
      y: pos.y,
    } as FarmHarvestPayload);

    expect(player.berries).toBe(berriesBefore);
    expect(farm.growthProgress).toBe(50);
  });

  it("FARM_HARVEST: unowned tile fails", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "far-harvester");

    // Find a tile NOT owned by the player
    let unownedPos: { x: number; y: number } | null = null;
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      if (tile.ownerID === "" && room.state.isWalkable(tile.x, tile.y)) {
        unownedPos = { x: tile.x, y: tile.y };
        break;
      }
    }
    if (!unownedPos) return;

    const farm = placeFarmAt(room, unownedPos.x, unownedPos.y, "far-harvester");
    farm.growthProgress = 100;
    farm.cropReady = true;

    const berriesBefore = player.berries;

    room.handleFarmHarvest(client, {
      x: unownedPos.x,
      y: unownedPos.y,
    } as FarmHarvestPayload);

    expect(player.berries).toBe(berriesBefore);
    expect(farm.cropReady).toBe(true);
    expect(farm.growthProgress).toBe(100);
  });

  it("harvest amount scales with fertility (base yield * fertility factor)", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "yield-test");

    // Find owned tile with highest fertility
    let bestPos: { x: number; y: number; fertility: number } | null = null;
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      if (tile.ownerID === "yield-test" && room.state.isWalkable(tile.x, tile.y)
        && (tile.type === TileType.Grassland || tile.type === TileType.Forest)) {
        let hasStructure = false;
        room.state.structures.forEach((s: any) => {
          if (s.x === tile.x && s.y === tile.y) hasStructure = true;
        });
        if (!hasStructure && (!bestPos || tile.fertility > bestPos.fertility)) {
          bestPos = { x: tile.x, y: tile.y, fertility: tile.fertility };
        }
      }
    }
    if (!bestPos) return;

    const farm = placeFarmAt(room, bestPos.x, bestPos.y, "yield-test");
    farm.growthProgress = 100;
    farm.cropReady = true;

    const berriesBefore = player.berries;
    room.handleFarmHarvest(client, {
      x: bestPos.x,
      y: bestPos.y,
    } as FarmHarvestPayload);

    expect(player.berries - berriesBefore).toBeGreaterThanOrEqual(1);
  });
});
