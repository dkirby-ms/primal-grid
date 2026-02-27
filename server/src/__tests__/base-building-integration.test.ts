import { describe, it, expect } from "vitest";
import { GameState, PlayerState, StructureState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { tickCreatureAI } from "../rooms/creatureAI.js";
import {
  TileType, ResourceType, ItemType,
  RECIPES, FARM, CREATURE_AI,
  DEFAULT_MAP_SIZE,
} from "@primal-grid/shared";
import type { CraftPayload, PlacePayload, FarmHarvestPayload } from "@primal-grid/shared";

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

function giveResources(player: any, resources: Partial<Record<string, number>>) {
  for (const [key, val] of Object.entries(resources)) {
    (player as any)[key] = val;
  }
}

/** Find a tile owned by the player that is walkable and has no structure. */
function findOwnedWalkableTile(room: any, playerId: string, biome?: number): { x: number; y: number } | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (tile.ownerID === playerId && room.state.isWalkable(tile.x, tile.y)) {
      if (biome !== undefined && tile.type !== biome) continue;
      let hasStructure = false;
      room.state.structures.forEach((s: any) => {
        if (s.x === tile.x && s.y === tile.y) hasStructure = true;
      });
      if (!hasStructure) return { x: tile.x, y: tile.y };
    }
  }
  return null;
}

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

function simulateTick(room: any): void {
  room.state.tick += 1;
  if (typeof room.tickResourceRegen === "function") room.tickResourceRegen();
  if (typeof room.tickCreatureAI === "function") room.tickCreatureAI();
  if (typeof room.tickCreatureRespawn === "function") room.tickCreatureRespawn();
  if (typeof room.tickFarms === "function") room.tickFarms();
}

// ═══════════════════════════════════════════════════════════════════
// Phase 3.7 — Base Building Integration Tests
// ═══════════════════════════════════════════════════════════════════

describe("Phase 3 Integration — Craft → Place → Verify", () => {
  it("full loop: craft workbench → place on owned tile → walkability blocked", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "loop-builder");

    // Give player enough resources for a workbench (wood:5, stone:3)
    giveResources(player, { wood: 5, stone: 3 });

    // Step 1: Craft workbench
    room.handleCraft(client, { recipeId: "workbench" } as CraftPayload);
    expect(player.workbenches).toBe(1);
    expect(player.wood).toBe(0);
    expect(player.stone).toBe(0);

    // Step 2: Place workbench on owned tile
    const pos = findOwnedWalkableTile(room, "loop-builder");
    if (!pos) return;

    room.handlePlace(client, {
      itemType: ItemType.Workbench,
      x: pos.x,
      y: pos.y,
    } as PlacePayload);

    expect(player.workbenches).toBe(0);
    expect(room.state.isWalkable(pos.x, pos.y)).toBe(false);
  });

  it("full loop: craft farm → place on owned Grassland → growth ticks → harvest → berries gained", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "farm-loop");

    // Give enough resources for farm_plot (wood:4, fiber:2)
    giveResources(player, { wood: 4, fiber: 2 });

    // Step 1: Craft farm plot
    room.handleCraft(client, { recipeId: "farm_plot" } as CraftPayload);
    expect(player.farmPlots).toBe(1);

    // Step 2: Place farm plot on owned Grassland
    const pos = findOwnedWalkableTile(room, "farm-loop", TileType.Grassland)
      || findOwnedWalkableTile(room, "farm-loop", TileType.Forest);
    if (!pos) return;

    const structsBefore = room.state.structures.size;
    room.handlePlace(client, {
      itemType: ItemType.FarmPlot,
      x: pos.x,
      y: pos.y,
    } as PlacePayload);
    expect(player.farmPlots).toBe(0);
    expect(room.state.structures.size).toBe(structsBefore + 1);

    // Step 3: Tick until crop is ready
    let farm: any = null;
    room.state.structures.forEach((s: any) => {
      if (s.structureType === ItemType.FarmPlot && s.x === pos.x && s.y === pos.y) farm = s;
    });
    expect(farm).not.toBeNull();

    for (let i = 0; i < 500; i++) {
      room.state.tick += 1;
      if (typeof room.tickFarms === "function") room.tickFarms();
      if (farm.cropReady) break;
    }

    expect(farm.cropReady).toBe(true);

    // Step 4: Harvest
    const berriesBefore = player.berries;
    room.handleFarmHarvest(client, {
      x: pos.x,
      y: pos.y,
    } as FarmHarvestPayload);

    expect(player.berries).toBeGreaterThan(berriesBefore);
    expect(farm.growthProgress).toBe(0);
    expect(farm.cropReady).toBe(false);
  });
});

describe("Phase 3 Integration — Ecosystem Stability with Structures", () => {
  it("structures on map, creatures still function, no crashes", () => {
    const room = createRoomWithMap(42);
    room.spawnCreatures();

    // Place several workbench structures
    const w = room.state.mapWidth;
    let placed = 0;
    for (let y = 1; y < w - 1 && placed < 5; y++) {
      for (let x = 1; x < w - 1 && placed < 5; x++) {
        if (room.state.isWalkable(x, y)) {
          const wb = new StructureState();
          wb.id = `stability_wb_${placed}`;
          wb.structureType = ItemType.Workbench;
          wb.x = x;
          wb.y = y;
          wb.placedBy = "test";
          room.state.structures.set(wb.id, wb);
          placed++;
        }
      }
    }
    expect(placed).toBeGreaterThan(0);

    // Run 200 ticks — should not crash
    expect(() => {
      for (let i = 0; i < 200; i++) {
        simulateTick(room);
      }
    }).not.toThrow();

    // Creatures should still exist (respawn kicks in)
    expect(room.state.creatures.size).toBeGreaterThan(0);
  });

  it("creature cannot move to tile with Workbench", () => {
    const room = createRoomWithMap(42);
    room.state.creatures.clear();

    const pair = findAdjacentWalkablePair(room);
    if (!pair) return;

    // Place a workbench at target
    const wb = new StructureState();
    wb.id = "blocker_wb";
    wb.structureType = ItemType.Workbench;
    wb.x = pair.target.x;
    wb.y = pair.target.y;
    wb.placedBy = "test";
    room.state.structures.set(wb.id, wb);

    // Place herbivore next to workbench
    const creature = new CreatureState();
    creature.id = "wb_avoider";
    creature.creatureType = "herbivore";
    creature.x = pair.player.x;
    creature.y = pair.player.y;
    creature.health = 100;
    creature.hunger = 100;
    creature.currentState = "wander";
    room.state.creatures.set(creature.id, creature);

    // Run AI ticks — creature must never land on workbench tile
    for (let i = 0; i < 50; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      tickCreatureAI(room.state);
      const c = room.state.creatures.get("wb_avoider");
      if (c) {
        const onWB = c.x === pair.target.x && c.y === pair.target.y;
        expect(onWB).toBe(false);
      }
    }
  });
});
