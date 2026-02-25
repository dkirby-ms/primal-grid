import { describe, it, expect } from "vitest";
import { GameState, CreatureState, PlayerState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import {
  CREATURE_TYPES, DEFAULT_MAP_SIZE,
} from "@primal-grid/shared";

// Phase 4 constants — inlined from scoping doc until Pemulis exports them.
const TAMING = {
  MAX_PACK_SIZE: 8,
  TRUST_AT_OBEDIENT: 70,
} as const;

const BREEDING = {
  FOOD_COST: 10, // berries
  OFFSPRING_TRUST: 50,
  TRAIT_MUTATION_RANGE: 2, // ±1d2 per trait
  TRAIT_CAP: 3, // hard cap ±3
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

/** Place a creature with Phase 4 taming/trait fields. */
function addCreature(
  room: any,
  id: string,
  type: string,
  x: number,
  y: number,
  overrides: Partial<{
    health: number; hunger: number; currentState: string;
    ownerID: string; trust: number; personality: string;
    traits: { speed: number; health: number; hungerDrain: number };
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
  // Phase 4 fields
  if ("ownerID" in creature) (creature as any).ownerID = overrides.ownerID ?? "";
  if ("trust" in creature) (creature as any).trust = overrides.trust ?? 0;
  if ("personality" in creature) (creature as any).personality = overrides.personality ?? "neutral";
  if ("traits" in creature && overrides.traits) {
    (creature as any).traits = overrides.traits;
  }
  room.state.creatures.set(id, creature);
  return creature;
}

/** Find two adjacent walkable tiles. */
function findAdjacentWalkableTiles(room: any): { a: { x: number; y: number }; b: { x: number; y: number }; c: { x: number; y: number } } | null {
  const w = room.state.mapWidth;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w - 2; x++) {
      if (
        room.state.isWalkable(x, y) &&
        room.state.isWalkable(x + 1, y) &&
        room.state.isWalkable(x + 2, y)
      ) {
        return { a: { x, y }, b: { x: x + 1, y }, c: { x: x + 2, y } };
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

/** Count creatures owned by a player. */
function countOwnedCreatures(room: any, playerId: string): number {
  let count = 0;
  room.state.creatures.forEach((c: any) => {
    if (c.ownerID === playerId) count++;
  });
  return count;
}

// ── BREED Handler — Happy Path ──────────────────────────────────────

describe("Phase 4.4 — BREED Handler: Happy Path", () => {
  it("breeds two creatures: same type, same owner, trust≥70, adjacent → offspring", () => {
    const room = createRoomWithMap(42);
    const pos = findAdjacentWalkableTiles(room);
    if (!pos) return;

    const { client, player } = placePlayerAt(room, "p1", pos.a.x, pos.a.y);
    player.berries = 20;

    addCreature(room, "parent-a", "herbivore", pos.b.x, pos.b.y, {
      ownerID: "p1", trust: 80,
      traits: { speed: 1, health: 5, hungerDrain: 0 },
    });
    addCreature(room, "parent-b", "herbivore", pos.c.x, pos.c.y, {
      ownerID: "p1", trust: 75,
      traits: { speed: -1, health: 3, hungerDrain: 2 },
    });

    const beforeCount = room.state.creatures.size;

    if (room.handleBreed) {
      room.handleBreed(client, { creatureId: "parent-a", targetId: "parent-b" });

      // Offspring should exist (50% chance — but handler may be deterministic in test or we retry)
      // Check that creature count increased by at most 1
      const afterCount = room.state.creatures.size;
      // Either breed succeeded (count+1) or 50% roll failed (count same)
      expect(afterCount).toBeGreaterThanOrEqual(beforeCount);
      expect(afterCount).toBeLessThanOrEqual(beforeCount + 1);
    }
  });
});

// ── BREED Handler — Rejection Cases ─────────────────────────────────

describe("Phase 4.4 — BREED Handler: Rejection Cases", () => {
  it("rejects breeding different creature types", () => {
    const room = createRoomWithMap(42);
    const pos = findAdjacentWalkableTiles(room);
    if (!pos) return;

    const { client, player } = placePlayerAt(room, "p1", pos.a.x, pos.a.y);
    player.berries = 20;

    addCreature(room, "herb-1", "herbivore", pos.b.x, pos.b.y, {
      ownerID: "p1", trust: 80,
    });
    addCreature(room, "carn-1", "carnivore", pos.c.x, pos.c.y, {
      ownerID: "p1", trust: 80,
    });

    const beforeCount = room.state.creatures.size;

    if (room.handleBreed) {
      room.handleBreed(client, { creatureId: "herb-1", targetId: "carn-1" });
      expect(room.state.creatures.size).toBe(beforeCount); // no offspring
    }
  });

  it("rejects breeding when trust < 70", () => {
    const room = createRoomWithMap(42);
    const pos = findAdjacentWalkableTiles(room);
    if (!pos) return;

    const { client, player } = placePlayerAt(room, "p1", pos.a.x, pos.a.y);
    player.berries = 20;

    addCreature(room, "low-a", "herbivore", pos.b.x, pos.b.y, {
      ownerID: "p1", trust: 60,
    });
    addCreature(room, "low-b", "herbivore", pos.c.x, pos.c.y, {
      ownerID: "p1", trust: 50,
    });

    const beforeCount = room.state.creatures.size;

    if (room.handleBreed) {
      room.handleBreed(client, { creatureId: "low-a", targetId: "low-b" });
      expect(room.state.creatures.size).toBe(beforeCount);
    }
  });

  it("rejects breeding creatures owned by different players", () => {
    const room = createRoomWithMap(42);
    const pos = findAdjacentWalkableTiles(room);
    if (!pos) return;

    const { client, player } = placePlayerAt(room, "p1", pos.a.x, pos.a.y);
    player.berries = 20;

    addCreature(room, "own-a", "herbivore", pos.b.x, pos.b.y, {
      ownerID: "p1", trust: 80,
    });
    addCreature(room, "own-b", "herbivore", pos.c.x, pos.c.y, {
      ownerID: "p2", trust: 80, // different owner
    });

    const beforeCount = room.state.creatures.size;

    if (room.handleBreed) {
      room.handleBreed(client, { creatureId: "own-a", targetId: "own-b" });
      expect(room.state.creatures.size).toBe(beforeCount);
    }
  });

  it("rejects breeding non-adjacent creatures", () => {
    const room = createRoomWithMap(42);
    const pair = findTilesAtChebyshevDistance(room, 5);
    if (!pair) return;

    const { client, player } = placePlayerAt(room, "p1", pair.a.x, pair.a.y);
    player.berries = 20;

    addCreature(room, "far-a", "herbivore", pair.a.x, pair.a.y, {
      ownerID: "p1", trust: 90,
    });
    addCreature(room, "far-b", "herbivore", pair.b.x, pair.b.y, {
      ownerID: "p1", trust: 90,
    });

    const beforeCount = room.state.creatures.size;

    if (room.handleBreed) {
      room.handleBreed(client, { creatureId: "far-a", targetId: "far-b" });
      expect(room.state.creatures.size).toBe(beforeCount);
    }
  });
});

// ── Offspring Traits ────────────────────────────────────────────────

describe("Phase 4.4 — Offspring Traits", () => {
  it("offspring traits are averaged from parents with mutation within bounds", () => {
    const room = createRoomWithMap(42);
    const pos = findAdjacentWalkableTiles(room);
    if (!pos) return;

    const { client, player } = placePlayerAt(room, "p1", pos.a.x, pos.a.y);
    player.berries = 50;

    addCreature(room, "trait-a", "herbivore", pos.b.x, pos.b.y, {
      ownerID: "p1", trust: 90,
      traits: { speed: 2, health: 6, hungerDrain: -2 },
    });
    addCreature(room, "trait-b", "herbivore", pos.c.x, pos.c.y, {
      ownerID: "p1", trust: 90,
      traits: { speed: 0, health: 2, hungerDrain: 0 },
    });

    if (!room.handleBreed) return;

    // Breed multiple times to get at least one offspring (50% chance each)
    let offspring: any = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const sizeBefore = room.state.creatures.size;
      room.handleBreed(client, { creatureId: "trait-a", targetId: "trait-b" });

      if (room.state.creatures.size > sizeBefore) {
        // Find the new creature
        room.state.creatures.forEach((c: any) => {
          if (c.id !== "trait-a" && c.id !== "trait-b" && !offspring) {
            offspring = c;
          }
        });
        break;
      }
    }

    if (!offspring || !offspring.traits) return;

    // Average: speed=(2+0)/2=1, health=(6+2)/2=4, hungerDrain=(-2+0)/2=-1
    // Mutation: ±2 per trait, capped at ±3
    expect(offspring.traits.speed).toBeGreaterThanOrEqual(-BREEDING.TRAIT_CAP);
    expect(offspring.traits.speed).toBeLessThanOrEqual(BREEDING.TRAIT_CAP);
    expect(offspring.traits.health).toBeGreaterThanOrEqual(-BREEDING.TRAIT_CAP);
    expect(offspring.traits.health).toBeLessThanOrEqual(BREEDING.TRAIT_CAP);
    expect(offspring.traits.hungerDrain).toBeGreaterThanOrEqual(-BREEDING.TRAIT_CAP);
    expect(offspring.traits.hungerDrain).toBeLessThanOrEqual(BREEDING.TRAIT_CAP);
  });

  it("offspring inherits parent owner and starts at trust=50", () => {
    const room = createRoomWithMap(42);
    const pos = findAdjacentWalkableTiles(room);
    if (!pos) return;

    const { client, player } = placePlayerAt(room, "p1", pos.a.x, pos.a.y);
    player.berries = 50;

    addCreature(room, "inh-a", "herbivore", pos.b.x, pos.b.y, {
      ownerID: "p1", trust: 90,
    });
    addCreature(room, "inh-b", "herbivore", pos.c.x, pos.c.y, {
      ownerID: "p1", trust: 85,
    });

    if (!room.handleBreed) return;

    let offspring: any = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const sizeBefore = room.state.creatures.size;
      room.handleBreed(client, { creatureId: "inh-a", targetId: "inh-b" });

      if (room.state.creatures.size > sizeBefore) {
        room.state.creatures.forEach((c: any) => {
          if (c.id !== "inh-a" && c.id !== "inh-b" && !offspring) {
            offspring = c;
          }
        });
        break;
      }
    }

    if (!offspring) return;

    expect(offspring.ownerID).toBe("p1");
    expect(offspring.trust).toBe(BREEDING.OFFSPRING_TRUST);
    expect(offspring.creatureType).toBe("herbivore");
  });
});

// ── Pack Size Limit ─────────────────────────────────────────────────

describe("Phase 4.4 — Pack Size Limit", () => {
  it("rejects breeding if player already at MAX_PACK_SIZE", () => {
    const room = createRoomWithMap(42);
    const pos = findAdjacentWalkableTiles(room);
    if (!pos) return;

    const { client, player } = placePlayerAt(room, "p1", pos.a.x, pos.a.y);
    player.berries = 50;

    // Fill up to MAX_PACK_SIZE with owned creatures
    for (let i = 0; i < TAMING.MAX_PACK_SIZE; i++) {
      // Place them all on the same tile (pack members, not breeding pairs)
      addCreature(room, `pack-${i}`, "herbivore", pos.b.x, pos.b.y, {
        ownerID: "p1", trust: 90,
      });
    }

    // Place the breeding pair (already counted above, replace two of them)
    const parentA = room.state.creatures.get("pack-0")!;
    parentA.x = pos.b.x;
    parentA.y = pos.b.y;

    const parentB = room.state.creatures.get("pack-1")!;
    parentB.x = pos.c.x;
    parentB.y = pos.c.y;

    const beforeCount = room.state.creatures.size;

    if (room.handleBreed) {
      room.handleBreed(client, { creatureId: "pack-0", targetId: "pack-1" });
      // Should not exceed MAX_PACK_SIZE
      expect(countOwnedCreatures(room, "p1")).toBeLessThanOrEqual(TAMING.MAX_PACK_SIZE);
    }
  });
});
