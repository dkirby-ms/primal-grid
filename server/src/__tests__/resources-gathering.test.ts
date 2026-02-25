import { describe, it, expect } from "vitest";
import { GameState, TileState, PlayerState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { TileType, ResourceType, DEFAULT_MAP_SIZE, GATHER } from "@primal-grid/shared";
import type { GatherPayload } from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): any {
  const room = Object.create(GameRoom.prototype) as any;
  room.state = new GameState();
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

/** Read the player's inventory for a given ResourceType value. */
function getPlayerResource(player: any, resType: number): number {
  switch (resType) {
    case ResourceType.Wood: return player.wood;
    case ResourceType.Stone: return player.stone;
    case ResourceType.Fiber: return player.fiber;
    case ResourceType.Berries: return player.berries;
    default: return 0;
  }
}

/** Find first tile matching a biome type with resources. */
function findResourceTile(room: any, biomeType?: number): any | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (tile.resourceAmount > 0) {
      if (biomeType === undefined || tile.type === biomeType) {
        return tile;
      }
    }
  }
  return null;
}

/** Find any tile with no resources (Water or Rock). */
function findBarrenTile(room: any, biomeType: number): any | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (tile.type === biomeType) {
      return tile;
    }
  }
  return null;
}

// ── Tile Resources After Map Gen ────────────────────────────────────

describe("Phase 2.2 — Tile Resources After Map Generation", () => {
  it("Forest tiles can have Wood resources", () => {
    const room = createRoomWithMap(42);
    let foundForestWithWood = false;
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      if (tile.type === TileType.Forest && tile.resourceAmount > 0) {
        expect(tile.resourceType).toBe(ResourceType.Wood);
        foundForestWithWood = true;
      }
    }
    expect(foundForestWithWood).toBe(true);
  });

  it("Grassland tiles can have Fiber or Berries", () => {
    const room = createRoomWithMap(42);
    let foundGrasslandResource = false;
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      if (tile.type === TileType.Grassland && tile.resourceAmount > 0) {
        expect([ResourceType.Fiber, ResourceType.Berries]).toContain(tile.resourceType);
        foundGrasslandResource = true;
      }
    }
    expect(foundGrasslandResource).toBe(true);
  });

  it("Highland tiles can have Stone", () => {
    const room = createRoomWithMap(42);
    let foundHighlandWithStone = false;
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      if (tile.type === TileType.Highland && tile.resourceAmount > 0) {
        expect(tile.resourceType).toBe(ResourceType.Stone);
        foundHighlandWithStone = true;
      }
    }
    expect(foundHighlandWithStone).toBe(true);
  });

  it("Water tiles have no resources", () => {
    const room = createRoomWithMap(42);
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      if (tile.type === TileType.Water) {
        expect(tile.resourceAmount).toBe(0);
      }
    }
  });

  it("Rock tiles have no resources", () => {
    const room = createRoomWithMap(42);
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      if (tile.type === TileType.Rock) {
        expect(tile.resourceAmount).toBe(0);
      }
    }
  });

  it("resource amounts are in 0–10 range", () => {
    const room = createRoomWithMap(42);
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      expect(tile.resourceAmount).toBeGreaterThanOrEqual(0);
      expect(tile.resourceAmount).toBeLessThanOrEqual(10);
    }
  });
});

// ── Gathering Mechanics ─────────────────────────────────────────────

describe("Phase 2.2 — Gathering", () => {
  it("player on a resource tile can gather (amount decrements, inventory increments)", () => {
    const room = createRoomWithMap(42);
    const tile = findResourceTile(room);
    expect(tile).not.toBeNull();

    const { client, player } = placePlayerAt(room, "gatherer", tile.x, tile.y);
    const prevAmount = tile.resourceAmount;
    const resType = tile.resourceType;

    room.handleGather(client, { x: tile.x, y: tile.y } as GatherPayload);

    expect(tile.resourceAmount).toBe(prevAmount - 1);
    // Inventory is stored as flat fields on PlayerState
    const inventoryCount = getPlayerResource(player, resType);
    expect(inventoryCount).toBe(1);
  });

  it("player NOT adjacent to resource tile cannot gather", () => {
    const room = createRoomWithMap(42);
    const tile = findResourceTile(room);
    expect(tile).not.toBeNull();

    // Place player far from the resource tile
    const farX = (tile.x + 5) % DEFAULT_MAP_SIZE;
    const farY = (tile.y + 5) % DEFAULT_MAP_SIZE;
    const { client } = placePlayerAt(room, "far-player", farX, farY);
    const prevAmount = tile.resourceAmount;

    room.handleGather(client, { x: tile.x, y: tile.y } as GatherPayload);

    // Resource should be unchanged
    expect(tile.resourceAmount).toBe(prevAmount);
  });

  it("gathering depleted tile (amount=0) fails gracefully", () => {
    const room = createRoomWithMap(42);
    const tile = findResourceTile(room);
    expect(tile).not.toBeNull();

    const { client, player } = placePlayerAt(room, "depleted-test", tile.x, tile.y);
    // Deplete the tile
    tile.resourceAmount = 0;

    room.handleGather(client, { x: tile.x, y: tile.y } as GatherPayload);

    // Should stay at 0, no error thrown
    expect(tile.resourceAmount).toBe(0);
  });

  it("player inventory tracks each resource type separately", () => {
    const room = createRoomWithMap(42);

    // Find tiles with different resource types
    const woodTile = findResourceTile(room, TileType.Forest);
    const grassTile = findResourceTile(room, TileType.Grassland);

    // Skip if we can't find both resource types on this seed
    if (!woodTile || !grassTile) return;

    const { client, player } = placePlayerAt(room, "multi-gather", woodTile.x, woodTile.y);

    // Gather wood
    room.handleGather(client, { x: woodTile.x, y: woodTile.y } as GatherPayload);

    // Move to grassland tile and gather
    player.x = grassTile.x;
    player.y = grassTile.y;
    room.handleGather(client, { x: grassTile.x, y: grassTile.y } as GatherPayload);

    // Inventory tracked as flat fields — wood should be 1
    expect(player.wood).toBe(1);
    // Grassland gives Fiber or Berries — one of them should be 1
    const grassResource = grassTile.resourceType;
    const grassCount = getPlayerResource(player, grassResource);
    expect(grassCount).toBe(1);
    // The two resource types are different
    expect(grassResource).not.toBe(ResourceType.Wood);
  });
});

// ── Resource Regeneration ───────────────────────────────────────────

describe("Phase 2.2 — Resource Regeneration", () => {
  it("depleted tiles regenerate over time (after N ticks)", () => {
    const room = createRoomWithMap(42);
    const tile = findResourceTile(room);
    expect(tile).not.toBeNull();

    // Deplete the tile fully (resourceType = -1 signals depletion)
    tile.resourceAmount = 0;
    tile.resourceType = -1;

    // Simulate enough ticks for regeneration (INTERVAL_TICKS = 80)
    for (let i = 0; i < 200; i++) {
      room.state.tick += 1;
      room.tickResourceRegen();
    }

    expect(tile.resourceAmount).toBeGreaterThan(0);
  });

  it("regeneration respects max amount (capped at 10)", () => {
    const room = createRoomWithMap(42);
    const tile = findResourceTile(room);
    expect(tile).not.toBeNull();

    // Partially deplete (keep resourceType so regen tops it up)
    tile.resourceAmount = 1;

    for (let i = 0; i < 1000; i++) {
      room.state.tick += 1;
      room.tickResourceRegen();
    }

    expect(tile.resourceAmount).toBeGreaterThan(0);
    expect(tile.resourceAmount).toBeLessThanOrEqual(10);
  });
});
