import { describe, it, expect } from "vitest";
import { GameState, PlayerState, StructureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import {
  TileType, ResourceType, ItemType,
  RECIPES, canCraft, getItemField,
  DEFAULT_MAP_SIZE, TERRITORY,
} from "@primal-grid/shared";
import type { CraftPayload } from "@primal-grid/shared";

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

/** Join a player and return client + player. Player gets HQ and starting resources. */
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

// ═══════════════════════════════════════════════════════════════════
// Phase 3 — Craft Handler Tests
// ═══════════════════════════════════════════════════════════════════

describe("Phase 3 — Crafting: Successful Craft", () => {
  it("successful craft: resources decremented, item incremented", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "crafter");

    // Give enough for a wall (wood:5, stone:2)
    giveResources(player, { wood: 10, stone: 5 });

    room.handleCraft(client, { recipeId: "wall" } as CraftPayload);

    expect(player.wood).toBe(5); // 10 - 5
    expect(player.stone).toBe(3); // 5 - 2
    expect(player.walls).toBe(1);
  });

  it("crafting farm_plot produces exactly 1 farmPlot", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "farm-crafter");

    // FarmPlot: wood:4, fiber:2
    giveResources(player, { wood: 4, fiber: 2 });
    room.handleCraft(client, { recipeId: "farm_plot" } as CraftPayload);

    expect(player.farmPlots).toBe(1);
    expect(player.wood).toBe(0);
    expect(player.fiber).toBe(0);
  });

  it("crafting turret produces exactly 1 turret", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "turret-crafter");

    giveResources(player, { wood: 5, stone: 5 });
    room.handleCraft(client, { recipeId: "turret" } as CraftPayload);

    expect(player.turrets).toBe(1);
    expect(player.wood).toBe(0);
    expect(player.stone).toBe(0);
  });
});

describe("Phase 3 — Crafting: Failure Cases", () => {
  it("insufficient resources: nothing changes", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "poor-crafter");

    giveResources(player, { wood: 1, stone: 0 });

    room.handleCraft(client, { recipeId: "wall" } as CraftPayload);

    // Resources unchanged, no item produced
    expect(player.wood).toBe(1);
    expect(player.stone).toBe(0);
    expect(player.walls).toBe(0);
  });

  it("invalid recipe ID: no crash, no state change", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "bad-recipe");

    giveResources(player, { wood: 99, stone: 99, fiber: 99, berries: 99 });

    expect(() => {
      room.handleCraft(client, { recipeId: "nonexistent" } as CraftPayload);
    }).not.toThrow();

    expect(player.wood).toBe(99);
    expect(player.walls).toBe(0);
  });

  it("zero resources: craft fails cleanly", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "zero-res");

    // Reset resources to 0
    giveResources(player, { wood: 0, stone: 0, fiber: 0, berries: 0 });

    room.handleCraft(client, { recipeId: "wall" } as CraftPayload);

    expect(player.walls).toBe(0);
  });
});
