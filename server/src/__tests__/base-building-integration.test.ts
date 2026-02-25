import { describe, it, expect } from "vitest";
import { GameState, PlayerState, StructureState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { tickCreatureAI } from "../rooms/creatureAI.js";
import {
  TileType, ResourceType, ItemType,
  RECIPES, FARM, CREATURE_AI,
  DEFAULT_MAP_SIZE,
} from "@primal-grid/shared";
import type { CraftPayload, PlacePayload, GatherPayload, FarmHarvestPayload } from "@primal-grid/shared";

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

function findAdjacentPairWithBiome(
  room: any, targetBiome: number,
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

function findResourceTileOfType(room: any, resType: number): any | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (tile.resourceType === resType && tile.resourceAmount > 0 && room.state.isWalkable(tile.x, tile.y)) {
      return tile;
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

describe("Phase 3 Integration — Gather → Craft → Place → Verify", () => {
  it("full loop: gather resources → craft wall → place wall → walkability blocked", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentWalkablePair(room);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "loop-builder", pair.player.x, pair.player.y);

    // Give player enough resources for a wall (wood:5, stone:2)
    giveResources(player, { wood: 5, stone: 2 });

    // Step 1: Craft wall
    room.handleCraft(client, { recipeId: "wall" } as CraftPayload);
    expect(player.walls).toBe(1);
    expect(player.wood).toBe(0);
    expect(player.stone).toBe(0);

    // Step 2: Place wall on adjacent tile
    room.handlePlace(client, {
      itemType: ItemType.Wall,
      x: pair.target.x,
      y: pair.target.y,
    } as PlacePayload);

    expect(player.walls).toBe(0);
    expect(room.state.structures.size).toBe(1);

    // Step 3: Verify walkability is blocked
    expect(room.state.isWalkable(pair.target.x, pair.target.y)).toBe(false);
  });

  it("full loop: gather → craft farm → place → growth ticks → harvest → berries gained", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentPairWithBiome(room, TileType.Grassland);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "farm-loop", pair.player.x, pair.player.y);

    // Give enough resources for farm_plot (wood:4, fiber:2)
    giveResources(player, { wood: 4, fiber: 2 });

    // Step 1: Craft farm plot
    room.handleCraft(client, { recipeId: "farm_plot" } as CraftPayload);
    expect(player.farmPlots).toBe(1);

    // Step 2: Place farm plot
    room.handlePlace(client, {
      itemType: ItemType.FarmPlot,
      x: pair.target.x,
      y: pair.target.y,
    } as PlacePayload);
    expect(player.farmPlots).toBe(0);
    expect(room.state.structures.size).toBe(1);

    // Step 3: Tick until crop is ready
    let farm: any = null;
    room.state.structures.forEach((s: any) => {
      if (s.structureType === ItemType.FarmPlot) farm = s;
    });
    expect(farm).not.toBeNull();

    // Tick many times to grow the farm
    for (let i = 0; i < 500; i++) {
      room.state.tick += 1;
      if (typeof room.tickFarms === "function") room.tickFarms();
      if (farm.cropReady) break;
    }

    expect(farm.cropReady).toBe(true);

    // Step 4: Harvest
    const berriesBefore = player.berries;
    room.handleFarmHarvest(client, {
      x: pair.target.x,
      y: pair.target.y,
    } as FarmHarvestPayload);

    expect(player.berries).toBeGreaterThan(berriesBefore);
    expect(farm.growthProgress).toBe(0);
    expect(farm.cropReady).toBe(false);
  });
});

describe("Phase 3 Integration — Tool Bonus Loop", () => {
  it("craft axe → gather wood → verify +1 yield", () => {
    const room = createRoomWithMap(42);
    const woodTile = findResourceTileOfType(room, ResourceType.Wood);
    if (!woodTile) return;

    const { client, player } = placePlayerAt(room, "axe-loop", woodTile.x, woodTile.y);

    // Give resources for axe (wood:3, stone:1)
    giveResources(player, { wood: 3, stone: 1 });

    // Craft axe
    room.handleCraft(client, { recipeId: "axe" } as CraftPayload);
    expect(player.axes).toBe(1);
    expect(player.wood).toBe(0);

    // Gather wood with axe — should get +1 bonus = 2
    room.handleGather(client, { x: woodTile.x, y: woodTile.y } as GatherPayload);

    expect(player.wood).toBe(2);
  });

  it("craft pickaxe → gather stone → verify +1 yield", () => {
    const room = createRoomWithMap(42);
    const stoneTile = findResourceTileOfType(room, ResourceType.Stone);
    if (!stoneTile) return;

    const { client, player } = placePlayerAt(room, "pick-loop", stoneTile.x, stoneTile.y);

    // Give resources for pickaxe (wood:2, stone:3)
    giveResources(player, { wood: 2, stone: 3 });

    // Craft pickaxe
    room.handleCraft(client, { recipeId: "pickaxe" } as CraftPayload);
    expect(player.pickaxes).toBe(1);
    expect(player.stone).toBe(0);

    // Gather stone with pickaxe — should get +1 bonus = 2
    room.handleGather(client, { x: stoneTile.x, y: stoneTile.y } as GatherPayload);

    expect(player.stone).toBe(2);
  });
});

describe("Phase 3 Integration — Ecosystem Stability with Structures", () => {
  it("structures on map, creatures still function, no crashes", () => {
    const room = createRoomWithMap(42);
    room.spawnCreatures();

    // Place several structures
    const w = room.state.mapWidth;
    let placed = 0;
    for (let y = 1; y < w - 1 && placed < 5; y++) {
      for (let x = 1; x < w - 1 && placed < 5; x++) {
        if (room.state.isWalkable(x, y)) {
          const wall = new StructureState();
          wall.id = `stability_wall_${placed}`;
          wall.structureType = ItemType.Wall;
          wall.x = x;
          wall.y = y;
          wall.placedBy = "test";
          room.state.structures.set(wall.id, wall);
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

  it("creature cannot move to tile with Wall", () => {
    const room = createRoomWithMap(42);
    room.state.creatures.clear();

    const pair = findAdjacentWalkablePair(room);
    if (!pair) return;

    // Place a wall at target
    const wall = new StructureState();
    wall.id = "blocker_wall";
    wall.structureType = ItemType.Wall;
    wall.x = pair.target.x;
    wall.y = pair.target.y;
    wall.placedBy = "test";
    room.state.structures.set(wall.id, wall);

    // Place herbivore next to wall
    const creature = new CreatureState();
    creature.id = "wall_avoider";
    creature.creatureType = "herbivore";
    creature.x = pair.player.x;
    creature.y = pair.player.y;
    creature.health = 100;
    creature.hunger = 100;
    creature.currentState = "wander";
    room.state.creatures.set(creature.id, creature);

    // Run AI ticks — creature must never land on wall tile
    for (let i = 0; i < 50; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      tickCreatureAI(room.state);
      const c = room.state.creatures.get("wall_avoider");
      if (c) {
        const onWall = c.x === pair.target.x && c.y === pair.target.y;
        expect(onWall).toBe(false);
      }
    }
  });

  it("multiple structures don't break player movement", () => {
    const room = createRoomWithMap(42);

    // Place 3 walls
    let wallCount = 0;
    for (let y = 5; y < 8; y++) {
      for (let x = 5; x < 8 && wallCount < 3; x++) {
        if (room.state.isWalkable(x, y)) {
          const wall = new StructureState();
          wall.id = `mv_wall_${wallCount}`;
          wall.structureType = ItemType.Wall;
          wall.x = x;
          wall.y = y;
          wall.placedBy = "test";
          room.state.structures.set(wall.id, wall);
          wallCount++;
        }
      }
    }

    // Player should still spawn and move on non-wall tiles
    const client = fakeClient("move-test");
    room.onJoin(client);
    const player = room.state.players.get("move-test")!;

    // Player should be on a walkable tile
    expect(room.state.isWalkable(player.x, player.y)).toBe(true);
  });
});
