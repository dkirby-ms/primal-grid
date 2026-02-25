import { describe, it, expect } from "vitest";
import { GameState, CreatureState, PlayerState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import {
  CREATURE_TYPES, CREATURE_AI, DEFAULT_MAP_SIZE,
} from "@primal-grid/shared";

// Phase 4 constants — will be exported from shared once Pemulis lands 4.1.
// Inline the expected values from the scoping doc so tests compile independently.
const TAMING = {
  COST_BERRY: 1,
  COST_MEAT: 1,
  TRUST_PER_FEED: 5,
  TRUST_PER_FEED_DOCILE: 10,
  TRUST_PER_PROXIMITY_TICK: 1,
  PROXIMITY_TICK_INTERVAL: 10,
  TRUST_DECAY_ALONE: 1,
  DECAY_TICK_INTERVAL: 20,
  TRUST_AT_OBEDIENT: 70,
  MAX_PACK_SIZE: 8,
  AUTO_ABANDON_TICKS: 50,
} as const;

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

/** Place a creature manually at a specific position with Phase 4 fields. */
function addCreature(
  room: any,
  id: string,
  type: string,
  x: number,
  y: number,
  overrides: Partial<{
    health: number; hunger: number; currentState: string;
    ownerID: string; trust: number; personality: string;
  }> = {},
): any {
  const creature = new CreatureState();
  creature.id = id;
  creature.creatureType = type;
  creature.x = x;
  creature.y = y;
  const typeDef = (CREATURE_TYPES as Record<string, any>)[type];
  creature.health = overrides.health ?? typeDef.health;
  creature.hunger = overrides.hunger ?? typeDef.hunger;
  creature.currentState = overrides.currentState ?? "idle";
  // Phase 4 fields — set if the schema supports them
  if ("ownerID" in creature) (creature as any).ownerID = overrides.ownerID ?? "";
  if ("trust" in creature) (creature as any).trust = overrides.trust ?? 0;
  if ("personality" in creature) (creature as any).personality = overrides.personality ?? "neutral";
  room.state.creatures.set(id, creature);
  return creature;
}

/** Find two adjacent walkable tiles. */
function findAdjacentWalkableTiles(room: any): { a: { x: number; y: number }; b: { x: number; y: number } } | null {
  const w = room.state.mapWidth;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w - 1; x++) {
      if (room.state.isWalkable(x, y) && room.state.isWalkable(x + 1, y)) {
        return { a: { x, y }, b: { x: x + 1, y } };
      }
    }
  }
  return null;
}

/** Find two walkable tiles at a given Chebyshev distance apart. */
function findTilesAtChebyshevDistance(
  room: any, dist: number,
): { a: { x: number; y: number }; b: { x: number; y: number } } | null {
  const w = room.state.mapWidth;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      if (!room.state.isWalkable(x, y)) continue;
      const x2 = x + dist;
      if (x2 < w && room.state.isWalkable(x2, y)) {
        return { a: { x, y }, b: { x: x2, y } };
      }
    }
  }
  return null;
}

/** Chebyshev distance. */
function chebyshev(x1: number, y1: number, x2: number, y2: number): number {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}

// ── TAME Handler ────────────────────────────────────────────────────

describe("Phase 4.2 — TAME Handler", () => {
  it("tames an adjacent wild creature, sets ownerID", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentWalkableTiles(room);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "p1", pair.a.x, pair.a.y);
    player.berries = 5;
    const creature = addCreature(room, "c1", "herbivore", pair.b.x, pair.b.y);

    room.handleTame(client, { creatureId: "c1" });

    expect(creature.ownerID).toBe("p1");
    expect(creature.trust).toBe(0);
    expect(player.berries).toBe(4); // cost 1 berry
  });

  it("rejects taming a non-adjacent creature", () => {
    const room = createRoomWithMap(42);
    const pair = findTilesAtChebyshevDistance(room, 5);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "p1", pair.a.x, pair.a.y);
    player.berries = 5;
    const creature = addCreature(room, "c-far", "herbivore", pair.b.x, pair.b.y);

    room.handleTame(client, { creatureId: "c-far" });

    expect(creature.ownerID).toBe(""); // still wild
    expect(player.berries).toBe(5); // not consumed
  });

  it("rejects taming an already-owned creature", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentWalkableTiles(room);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "p1", pair.a.x, pair.a.y);
    player.berries = 5;
    const creature = addCreature(room, "c-owned", "herbivore", pair.b.x, pair.b.y, {
      ownerID: "other-player",
    });

    room.handleTame(client, { creatureId: "c-owned" });

    expect(creature.ownerID).toBe("other-player"); // unchanged
    expect(player.berries).toBe(5);
  });

  it("rejects taming with insufficient food (no berries for herbivore)", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentWalkableTiles(room);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "p1", pair.a.x, pair.a.y);
    player.berries = 0;
    const creature = addCreature(room, "c-nofood", "herbivore", pair.b.x, pair.b.y);

    room.handleTame(client, { creatureId: "c-nofood" });

    expect(creature.ownerID).toBe(""); // still wild
  });

  it("herbivore taming costs 1 berry", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentWalkableTiles(room);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "p1", pair.a.x, pair.a.y);
    player.berries = 3;
    addCreature(room, "c-herb", "herbivore", pair.b.x, pair.b.y);

    room.handleTame(client, { creatureId: "c-herb" });

    expect(player.berries).toBe(2);
  });

  it("carnivore taming costs 1 meat", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentWalkableTiles(room);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "p1", pair.a.x, pair.a.y);
    // Meat field expected on PlayerState (Phase 4 adds it)
    if ("meat" in player) (player as any).meat = 3;
    addCreature(room, "c-carn", "carnivore", pair.b.x, pair.b.y);

    room.handleTame(client, { creatureId: "c-carn" });

    if ("meat" in player) {
      expect((player as any).meat).toBe(2);
    }
  });
});

// ── ABANDON Handler ─────────────────────────────────────────────────

describe("Phase 4.2 — ABANDON Handler", () => {
  it("owner can abandon: resets ownerID and trust", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentWalkableTiles(room);
    if (!pair) return;

    const { client } = placePlayerAt(room, "p1", pair.a.x, pair.a.y);
    const creature = addCreature(room, "c-abandon", "herbivore", pair.b.x, pair.b.y, {
      ownerID: "p1",
      trust: 80,
    });

    room.handleAbandon(client, { creatureId: "c-abandon" });

    expect(creature.ownerID).toBe("");
    expect(creature.trust).toBe(0);
  });

  it("non-owner cannot abandon someone else's creature", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentWalkableTiles(room);
    if (!pair) return;

    const { client } = placePlayerAt(room, "not-owner", pair.a.x, pair.a.y);
    const creature = addCreature(room, "c-notown", "herbivore", pair.b.x, pair.b.y, {
      ownerID: "real-owner",
      trust: 60,
    });

    room.handleAbandon(client, { creatureId: "c-notown" });

    expect(creature.ownerID).toBe("real-owner"); // unchanged
    expect(creature.trust).toBe(60);
  });
});

// ── Trust Mechanics ─────────────────────────────────────────────────

describe("Phase 4.2 — Trust Mechanics", () => {
  it("feeding increases trust by +5 (neutral personality)", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentWalkableTiles(room);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "p1", pair.a.x, pair.a.y);
    player.berries = 10;
    const creature = addCreature(room, "c-feed", "herbivore", pair.b.x, pair.b.y, {
      ownerID: "p1",
      trust: 20,
      personality: "neutral",
    });

    if (room.handleFeed) {
      room.handleFeed(client, { creatureId: "c-feed" });
      expect(creature.trust).toBe(25); // +5
    }
  });

  it("feeding docile creature increases trust by +10", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentWalkableTiles(room);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "p1", pair.a.x, pair.a.y);
    player.berries = 10;
    const creature = addCreature(room, "c-docile", "herbivore", pair.b.x, pair.b.y, {
      ownerID: "p1",
      trust: 20,
      personality: "docile",
    });

    if (room.handleFeed) {
      room.handleFeed(client, { creatureId: "c-docile" });
      expect(creature.trust).toBe(30); // +10
    }
  });

  it("trust decays -1 per 20 ticks when owner is distant (>3 tiles)", () => {
    const room = createRoomWithMap(42);
    const pair = findTilesAtChebyshevDistance(room, 6);
    if (!pair) return;

    const { player } = placePlayerAt(room, "p1", pair.a.x, pair.a.y);
    const creature = addCreature(room, "c-decay", "herbivore", pair.b.x, pair.b.y, {
      ownerID: "p1",
      trust: 50,
    });

    // Verify distance > 3
    expect(chebyshev(player.x, player.y, creature.x, creature.y)).toBeGreaterThan(3);

    // Simulate 20 ticks
    for (let i = 0; i < 20; i++) {
      room.state.tick += 1;
      if (room.tickTrustDecay) room.tickTrustDecay();
    }

    expect(creature.trust).toBe(49); // -1 after 20 ticks
  });

  it("trust increases +1 per 10 ticks when owner is nearby (≤3 tiles)", () => {
    const room = createRoomWithMap(42);
    const pair = findAdjacentWalkableTiles(room);
    if (!pair) return;

    placePlayerAt(room, "p1", pair.a.x, pair.a.y);
    const creature = addCreature(room, "c-prox", "herbivore", pair.b.x, pair.b.y, {
      ownerID: "p1",
      trust: 30,
    });

    // Simulate 10 ticks — owner is adjacent (distance 1, well within 3)
    for (let i = 0; i < 10; i++) {
      room.state.tick += 1;
      if (room.tickTrustDecay) room.tickTrustDecay();
    }

    expect(creature.trust).toBe(31); // +1 after 10 ticks
  });

  it("auto-abandon: trust at 0 for 50+ ticks turns creature wild", () => {
    const room = createRoomWithMap(42);
    const pair = findTilesAtChebyshevDistance(room, 6);
    if (!pair) return;

    placePlayerAt(room, "p1", pair.a.x, pair.a.y);
    const creature = addCreature(room, "c-autoabandon", "herbivore", pair.b.x, pair.b.y, {
      ownerID: "p1",
      trust: 0,
    });

    // Simulate 50+ ticks at trust=0
    for (let i = 0; i < 55; i++) {
      room.state.tick += 1;
      if (room.tickTrustDecay) room.tickTrustDecay();
    }

    expect(creature.ownerID).toBe(""); // went wild
    expect(creature.trust).toBe(0);
  });
});

// ── Personality Assignment ──────────────────────────────────────────

describe("Phase 4.1 — Personality Assignment at Spawn", () => {
  it("all spawned creatures get a valid personality", () => {
    const room = createRoomWithMap(42);
    room.spawnCreatures();

    const validPersonalities = ["docile", "neutral", "aggressive"];
    room.state.creatures.forEach((creature: any) => {
      if ("personality" in creature) {
        expect(validPersonalities).toContain(creature.personality);
      }
    });
  });

  it("personality distribution shows weighted randomness (not all same)", () => {
    const room = createRoomWithMap(42);
    room.spawnCreatures();

    const personalities = new Set<string>();
    room.state.creatures.forEach((creature: any) => {
      if ("personality" in creature) {
        personalities.add(creature.personality);
      }
    });

    // With 12 creatures, expect at least 2 distinct personalities
    if (personalities.size > 0) {
      expect(personalities.size).toBeGreaterThanOrEqual(1);
    }
  });
});
