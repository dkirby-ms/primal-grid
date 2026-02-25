import { describe, it, expect } from "vitest";
import { GameState, PlayerState, StructureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import {
  TileType, ResourceType, ItemType,
  RECIPES, canCraft, getItemField,
  DEFAULT_MAP_SIZE,
} from "@primal-grid/shared";
import type { CraftPayload, GatherPayload } from "@primal-grid/shared";

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

/** Find a walkable tile on the map. */
function findWalkableTile(room: any, tileType?: number): { x: number; y: number } {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (room.state.isWalkable(tile.x, tile.y)) {
      if (tileType === undefined || tile.type === tileType) {
        return { x: tile.x, y: tile.y };
      }
    }
  }
  return { x: 1, y: 1 };
}

/** Find a resource tile with a specific resource type. */
function findResourceTileOfType(room: any, resType: number): any | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (tile.resourceType === resType && tile.resourceAmount > 0 && room.state.isWalkable(tile.x, tile.y)) {
      return tile;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// Phase 3 — Craft Handler Tests
// ═══════════════════════════════════════════════════════════════════

describe("Phase 3 — Crafting: Successful Craft", () => {
  it("successful craft: resources decremented, item incremented", () => {
    const room = createRoomWithMap(42);
    const pos = findWalkableTile(room);
    const { client, player } = placePlayerAt(room, "crafter", pos.x, pos.y);

    // Give enough for a wall (wood:5, stone:2)
    giveResources(player, { wood: 10, stone: 5 });

    room.handleCraft(client, { recipeId: "wall" } as CraftPayload);

    expect(player.wood).toBe(5); // 10 - 5
    expect(player.stone).toBe(3); // 5 - 2
    expect(player.walls).toBe(1);
  });

  it("crafting axe produces exactly 1 axe", () => {
    const room = createRoomWithMap(42);
    const pos = findWalkableTile(room);
    const { client, player } = placePlayerAt(room, "axe-crafter", pos.x, pos.y);

    // Axe: wood:3, stone:1
    giveResources(player, { wood: 3, stone: 1 });
    room.handleCraft(client, { recipeId: "axe" } as CraftPayload);

    expect(player.axes).toBe(1);
    expect(player.wood).toBe(0);
    expect(player.stone).toBe(0);
  });

  it("crafting pickaxe produces exactly 1 pickaxe", () => {
    const room = createRoomWithMap(42);
    const pos = findWalkableTile(room);
    const { client, player } = placePlayerAt(room, "pick-crafter", pos.x, pos.y);

    // Pickaxe: wood:2, stone:3
    giveResources(player, { wood: 2, stone: 3 });
    room.handleCraft(client, { recipeId: "pickaxe" } as CraftPayload);

    expect(player.pickaxes).toBe(1);
    expect(player.wood).toBe(0);
    expect(player.stone).toBe(0);
  });

  it("crafting farm_plot produces exactly 1 farmPlot", () => {
    const room = createRoomWithMap(42);
    const pos = findWalkableTile(room);
    const { client, player } = placePlayerAt(room, "farm-crafter", pos.x, pos.y);

    // FarmPlot: wood:4, fiber:2
    giveResources(player, { wood: 4, fiber: 2 });
    room.handleCraft(client, { recipeId: "farm_plot" } as CraftPayload);

    expect(player.farmPlots).toBe(1);
    expect(player.wood).toBe(0);
    expect(player.fiber).toBe(0);
  });
});

describe("Phase 3 — Crafting: Failure Cases", () => {
  it("insufficient resources: nothing changes", () => {
    const room = createRoomWithMap(42);
    const pos = findWalkableTile(room);
    const { client, player } = placePlayerAt(room, "poor-crafter", pos.x, pos.y);

    giveResources(player, { wood: 1, stone: 0 });

    room.handleCraft(client, { recipeId: "wall" } as CraftPayload);

    // Resources unchanged, no item produced
    expect(player.wood).toBe(1);
    expect(player.stone).toBe(0);
    expect(player.walls).toBe(0);
  });

  it("invalid recipe ID: no crash, no state change", () => {
    const room = createRoomWithMap(42);
    const pos = findWalkableTile(room);
    const { client, player } = placePlayerAt(room, "bad-recipe", pos.x, pos.y);

    giveResources(player, { wood: 99, stone: 99, fiber: 99, berries: 99 });

    expect(() => {
      room.handleCraft(client, { recipeId: "nonexistent" } as CraftPayload);
    }).not.toThrow();

    expect(player.wood).toBe(99);
    expect(player.walls).toBe(0);
  });

  it("zero resources: craft fails cleanly", () => {
    const room = createRoomWithMap(42);
    const pos = findWalkableTile(room);
    const { client, player } = placePlayerAt(room, "zero-res", pos.x, pos.y);

    room.handleCraft(client, { recipeId: "wall" } as CraftPayload);

    expect(player.walls).toBe(0);
  });
});

describe("Phase 3 — Tool Bonus on GATHER", () => {
  it("Axe gives +1 Wood on GATHER from Wood tile", () => {
    const room = createRoomWithMap(42);
    const woodTile = findResourceTileOfType(room, ResourceType.Wood);
    if (!woodTile) return;

    const { client, player } = placePlayerAt(room, "axe-gatherer", woodTile.x, woodTile.y);
    player.axes = 1;

    const prevAmount = woodTile.resourceAmount;
    room.handleGather(client, { x: woodTile.x, y: woodTile.y } as GatherPayload);

    // With axe bonus, player gets 2 wood instead of 1
    expect(player.wood).toBe(2);
  });

  it("Pickaxe gives +1 Stone on GATHER from Stone tile", () => {
    const room = createRoomWithMap(42);
    const stoneTile = findResourceTileOfType(room, ResourceType.Stone);
    if (!stoneTile) return;

    const { client, player } = placePlayerAt(room, "pick-gatherer", stoneTile.x, stoneTile.y);
    player.pickaxes = 1;

    room.handleGather(client, { x: stoneTile.x, y: stoneTile.y } as GatherPayload);

    // With pickaxe bonus, player gets 2 stone instead of 1
    expect(player.stone).toBe(2);
  });

  it("no tool = baseline gather yield (1 resource)", () => {
    const room = createRoomWithMap(42);
    const woodTile = findResourceTileOfType(room, ResourceType.Wood);
    if (!woodTile) return;

    const { client, player } = placePlayerAt(room, "no-tool", woodTile.x, woodTile.y);

    room.handleGather(client, { x: woodTile.x, y: woodTile.y } as GatherPayload);

    // Without tool, player gets exactly 1
    expect(player.wood).toBe(1);
  });

  it("Axe does NOT bonus non-Wood resources", () => {
    const room = createRoomWithMap(42);
    const stoneTile = findResourceTileOfType(room, ResourceType.Stone);
    if (!stoneTile) return;

    const { client, player } = placePlayerAt(room, "axe-stone", stoneTile.x, stoneTile.y);
    player.axes = 1;

    room.handleGather(client, { x: stoneTile.x, y: stoneTile.y } as GatherPayload);

    // Axe should not give bonus to stone gathering
    expect(player.stone).toBe(1);
  });

  it("Pickaxe does NOT bonus non-Stone resources", () => {
    const room = createRoomWithMap(42);
    const woodTile = findResourceTileOfType(room, ResourceType.Wood);
    if (!woodTile) return;

    const { client, player } = placePlayerAt(room, "pick-wood", woodTile.x, woodTile.y);
    player.pickaxes = 1;

    room.handleGather(client, { x: woodTile.x, y: woodTile.y } as GatherPayload);

    // Pickaxe should not give bonus to wood gathering
    expect(player.wood).toBe(1);
  });
});
