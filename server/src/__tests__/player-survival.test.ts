import { describe, it, expect } from "vitest";
import { GameState, PlayerState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import {
  ResourceType, TileType,
  PLAYER_SURVIVAL, GATHER,
} from "@primal-grid/shared";
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

/** Find a walkable tile of a given type. */
function findTileOfType(room: any, tileType: number): { x: number; y: number } | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (tile.type === tileType) return { x: tile.x, y: tile.y };
  }
  return null;
}

/** Find a tile with berries. */
function findBerryTile(room: any): any | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (tile.resourceType === ResourceType.Berries && tile.resourceAmount > 0) {
      return tile;
    }
  }
  return null;
}

// ── Initial Values ──────────────────────────────────────────────────

describe("Phase 2.3 — Player Survival: Initial Values", () => {
  it("PlayerState starts with hunger = 100", () => {
    const player = new PlayerState();
    expect(player.hunger).toBe(PLAYER_SURVIVAL.MAX_HUNGER);
  });

  it("PlayerState starts with health = 100", () => {
    const player = new PlayerState();
    expect(player.health).toBe(PLAYER_SURVIVAL.MAX_HEALTH);
  });

  it("joined player has full hunger and health", () => {
    const room = createRoomWithMap(42);
    const client = fakeClient("survival-init");
    room.onJoin(client);
    const player = room.state.players.get("survival-init")!;
    expect(player.hunger).toBe(PLAYER_SURVIVAL.MAX_HUNGER);
    expect(player.health).toBe(PLAYER_SURVIVAL.MAX_HEALTH);
  });
});

// ── Hunger Depletion ────────────────────────────────────────────────

describe("Phase 2.3 — Player Survival: Hunger Depletion", () => {
  it("hunger decreases after HUNGER_TICK_INTERVAL ticks", () => {
    const room = createRoomWithMap(42);
    const { player } = placePlayerAt(room, "hunger-test", 5, 5);
    const startHunger = player.hunger;

    // Simulate exactly HUNGER_TICK_INTERVAL ticks
    for (let i = 0; i < PLAYER_SURVIVAL.HUNGER_TICK_INTERVAL; i++) {
      room.state.tick += 1;
      room.tickPlayerSurvival();
    }

    expect(player.hunger).toBe(startHunger - PLAYER_SURVIVAL.HUNGER_DRAIN);
  });

  it("hunger does NOT decrease before interval elapses", () => {
    const room = createRoomWithMap(42);
    const { player } = placePlayerAt(room, "hunger-wait", 5, 5);
    const startHunger = player.hunger;

    // Simulate one tick short of the interval
    for (let i = 0; i < PLAYER_SURVIVAL.HUNGER_TICK_INTERVAL - 1; i++) {
      room.state.tick += 1;
      room.tickPlayerSurvival();
    }

    expect(player.hunger).toBe(startHunger);
  });

  it("hunger never goes below 0", () => {
    const room = createRoomWithMap(42);
    const { player } = placePlayerAt(room, "hunger-floor", 5, 5);
    player.hunger = 1;

    // Simulate enough ticks to try to push hunger below 0
    for (let i = 0; i < PLAYER_SURVIVAL.HUNGER_TICK_INTERVAL * 5; i++) {
      room.state.tick += 1;
      room.tickPlayerSurvival();
    }

    expect(player.hunger).toBe(0);
    expect(player.hunger).toBeGreaterThanOrEqual(0);
  });

  it("hunger depletes over multiple intervals", () => {
    const room = createRoomWithMap(42);
    const { player } = placePlayerAt(room, "hunger-multi", 5, 5);
    const intervals = 5;

    for (let i = 0; i < PLAYER_SURVIVAL.HUNGER_TICK_INTERVAL * intervals; i++) {
      room.state.tick += 1;
      room.tickPlayerSurvival();
    }

    expect(player.hunger).toBe(
      PLAYER_SURVIVAL.MAX_HUNGER - PLAYER_SURVIVAL.HUNGER_DRAIN * intervals,
    );
  });
});

// ── Starvation Damage ───────────────────────────────────────────────

describe("Phase 2.3 — Player Survival: Starvation", () => {
  it("health decreases when hunger is 0 at hunger tick interval", () => {
    const room = createRoomWithMap(42);
    const { player } = placePlayerAt(room, "starve-test", 5, 5);
    player.hunger = 0;
    const startHealth = player.health;

    // Advance to next HUNGER_TICK_INTERVAL boundary
    room.state.tick = PLAYER_SURVIVAL.HUNGER_TICK_INTERVAL;
    room.tickPlayerSurvival();

    expect(player.health).toBeLessThan(startHealth);
  });

  it("health decreases by STARVATION_DAMAGE when starving", () => {
    const room = createRoomWithMap(42);
    const { player } = placePlayerAt(room, "starve-dmg", 5, 5);
    player.hunger = 0;
    player.health = 50;

    // Advance to HUNGER_TICK_INTERVAL boundary so survival tick fires
    room.state.tick = PLAYER_SURVIVAL.HUNGER_TICK_INTERVAL;
    room.tickPlayerSurvival();

    expect(player.health).toBe(50 - PLAYER_SURVIVAL.STARVATION_DAMAGE);
  });

  it("health NEVER goes below HEALTH_FLOOR (no player death — A7)", () => {
    const room = createRoomWithMap(42);
    const { player } = placePlayerAt(room, "no-death", 5, 5);
    player.hunger = 0;
    player.health = PLAYER_SURVIVAL.HEALTH_FLOOR;

    // Tick many times while starving
    for (let i = 0; i < 100; i++) {
      room.state.tick += 1;
      room.tickPlayerSurvival();
    }

    expect(player.health).toBe(PLAYER_SURVIVAL.HEALTH_FLOOR);
    expect(player.health).toBeGreaterThanOrEqual(1);
  });

  it("health does NOT decrease when hunger > 0", () => {
    const room = createRoomWithMap(42);
    const { player } = placePlayerAt(room, "no-starve", 5, 5);
    player.hunger = 50;
    const startHealth = player.health;

    for (let i = 0; i < 20; i++) {
      room.state.tick += 1;
      room.tickPlayerSurvival();
    }

    expect(player.health).toBe(startHealth);
  });

  it("edge: rapid tick processing doesn't skip the health floor", () => {
    const room = createRoomWithMap(42);
    const { player } = placePlayerAt(room, "rapid-tick", 5, 5);
    player.hunger = 0;
    player.health = 3;

    // Simulate many rapid ticks — health should never drop below floor
    for (let i = 0; i < 500; i++) {
      room.state.tick += 1;
      room.tickPlayerSurvival();
      expect(player.health).toBeGreaterThanOrEqual(PLAYER_SURVIVAL.HEALTH_FLOOR);
    }

    expect(player.health).toBe(PLAYER_SURVIVAL.HEALTH_FLOOR);
  });
});

// ── EAT Message ─────────────────────────────────────────────────────

describe("Phase 2.3 — Player Survival: EAT", () => {
  it("EAT consumes berries from inventory and restores hunger", () => {
    const room = createRoomWithMap(42);
    const { client, player } = placePlayerAt(room, "eat-test", 5, 5);
    player.berries = 3;
    player.hunger = 50;

    room.handleEat(client);

    expect(player.berries).toBe(2);
    expect(player.hunger).toBe(50 + PLAYER_SURVIVAL.BERRY_HUNGER_RESTORE);
  });

  it("EAT fails gracefully when no berries in inventory", () => {
    const room = createRoomWithMap(42);
    const { client, player } = placePlayerAt(room, "eat-empty", 5, 5);
    player.berries = 0;
    player.hunger = 30;

    room.handleEat(client);

    expect(player.berries).toBe(0);
    expect(player.hunger).toBe(30);
  });

  it("EAT clamps hunger to MAX_HUNGER (100)", () => {
    const room = createRoomWithMap(42);
    const { client, player } = placePlayerAt(room, "eat-clamp", 5, 5);
    player.berries = 5;
    player.hunger = 95;

    room.handleEat(client);

    expect(player.hunger).toBe(PLAYER_SURVIVAL.MAX_HUNGER);
    expect(player.hunger).toBeLessThanOrEqual(100);
  });

  it("EAT at full hunger is a no-op (does not consume berry)", () => {
    const room = createRoomWithMap(42);
    const { client, player } = placePlayerAt(room, "eat-full", 5, 5);
    player.berries = 2;
    player.hunger = PLAYER_SURVIVAL.MAX_HUNGER;

    room.handleEat(client);

    // No berry consumed — player is already full
    expect(player.berries).toBe(2);
    expect(player.hunger).toBe(PLAYER_SURVIVAL.MAX_HUNGER);
  });

  it("multiple EATs deplete berries sequentially", () => {
    const room = createRoomWithMap(42);
    const { client, player } = placePlayerAt(room, "eat-multi", 5, 5);
    player.berries = 3;
    player.hunger = 20;

    room.handleEat(client);
    room.handleEat(client);
    room.handleEat(client);

    expect(player.berries).toBe(0);
    // Hunger: 20 + 20 + 20 = 60, then +20 = 80, all clamped to max
    const expectedHunger = Math.min(
      20 + PLAYER_SURVIVAL.BERRY_HUNGER_RESTORE * 3,
      PLAYER_SURVIVAL.MAX_HUNGER,
    );
    expect(player.hunger).toBe(expectedHunger);
  });

  it("EAT with invalid client (no player) does not crash", () => {
    const room = createRoomWithMap(42);
    const ghostClient = fakeClient("ghost");

    // Should not throw
    expect(() => room.handleEat(ghostClient)).not.toThrow();
  });
});

// ── Integration: Gather → Eat cycle ─────────────────────────────────

describe("Phase 2.3 — Player Survival: Gather + Eat Integration", () => {
  it("player gathers berries then eats to restore hunger", () => {
    const room = createRoomWithMap(42);
    const berryTile = findBerryTile(room);
    if (!berryTile) return; // seed may not have berries — skip

    const { client, player } = placePlayerAt(room, "gather-eat", berryTile.x, berryTile.y);

    // Deplete hunger first
    player.hunger = 30;

    // Gather berries
    room.handleGather(client, { x: berryTile.x, y: berryTile.y } as GatherPayload);
    expect(player.berries).toBeGreaterThanOrEqual(1);

    // Eat
    room.handleEat(client);
    expect(player.hunger).toBe(
      Math.min(30 + PLAYER_SURVIVAL.BERRY_HUNGER_RESTORE, PLAYER_SURVIVAL.MAX_HUNGER),
    );
  });
});

// ── Multi-player survival isolation ─────────────────────────────────

describe("Phase 2.3 — Player Survival: Multi-Player", () => {
  it("hunger/health depletion applies to each player independently", () => {
    const room = createRoomWithMap(42);
    const { player: p1 } = placePlayerAt(room, "p1", 5, 5);
    const { player: p2 } = placePlayerAt(room, "p2", 10, 10);

    p1.hunger = 0; // p1 is starving
    p2.hunger = 100; // p2 is fed

    // Advance through multiple HUNGER_TICK_INTERVAL boundaries
    for (let i = 1; i <= PLAYER_SURVIVAL.HUNGER_TICK_INTERVAL * 3; i++) {
      room.state.tick = i;
      room.tickPlayerSurvival();
    }

    // p1 should have lost health (starving)
    expect(p1.health).toBeLessThan(PLAYER_SURVIVAL.MAX_HEALTH);
    // p2 should be unharmed (well-fed)
    expect(p2.health).toBe(PLAYER_SURVIVAL.MAX_HEALTH);
  });
});
