import { describe, it, expect } from "vitest";
import { GameState, CreatureState, PlayerState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { moveToward } from "../rooms/creatureAI.js";
import {
  CREATURE_TYPES, CREATURE_AI, CREATURE_SPAWN, CREATURE_RESPAWN,
  RESOURCE_REGEN, DEFAULT_MAP_SIZE,
  TAMING, BREEDING, ResourceType,
} from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): any {
  const room = Object.create(GameRoom.prototype) as any;
  room.state = new GameState();
  room.generateMap(seed);
  return room;
}

function createRoomWithEcosystem(seed?: number): any {
  const room = createRoomWithMap(seed);
  room.spawnCreatures();
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

/** Place a creature with Phase 4 fields. */
function addCreature(
  room: any,
  id: string,
  type: string,
  x: number,
  y: number,
  overrides: Partial<{
    health: number; hunger: number; currentState: string;
    ownerID: string; trust: number; personality: string;
    speed: number; lastBredTick: number;
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
  creature.ownerID = overrides.ownerID ?? "";
  creature.trust = overrides.trust ?? 0;
  creature.personality = overrides.personality ?? "neutral";
  creature.speed = overrides.speed ?? 0;
  creature.lastBredTick = overrides.lastBredTick ?? 0;
  room.state.creatures.set(id, creature);
  return creature;
}

/** Find N consecutive walkable tiles in a row. */
function findWalkableRow(room: any, count: number): { x: number; y: number }[] | null {
  const w = room.state.mapWidth;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x <= w - count; x++) {
      let allWalkable = true;
      for (let i = 0; i < count; i++) {
        if (!room.state.isWalkable(x + i, y)) { allWalkable = false; break; }
      }
      if (allWalkable) return Array.from({ length: count }, (_, i) => ({ x: x + i, y }));
    }
  }
  return null;
}

/** Find a tile owned by player. */
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

/** Find an unowned walkable tile. */
function findUnownedWalkableTile(room: any): { x: number; y: number } | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (tile.ownerID === "" && room.state.isWalkable(tile.x, tile.y)) {
      return { x: tile.x, y: tile.y };
    }
  }
  return null;
}

/** Run one full simulation tick. */
function simulateTick(room: any): void {
  room.state.tick += 1;
  if (typeof room.tickResourceRegen === "function") room.tickResourceRegen();
  if (typeof room.tickCreatureAI === "function") room.tickCreatureAI();
  if (typeof room.tickCreatureRespawn === "function") room.tickCreatureRespawn();
  if (typeof room.tickTrustDecay === "function") room.tickTrustDecay();
}

/** Count creatures owned by a player. */
function countOwned(room: any, playerId: string): number {
  let count = 0;
  room.state.creatures.forEach((c: any) => {
    if (c.ownerID === playerId) count++;
  });
  return count;
}

function manhattan(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

// ═══════════════════════════════════════════════════════════════════
// 1. Full Taming → Trust Build Cycle (Territory-Based)
// ═══════════════════════════════════════════════════════════════════

describe("Phase 4.8 Integration — Taming → Trust Cycle", () => {
  it("tame creature on territory → build trust via territory ticks", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "p1");
    player.berries = 20;

    const pos = findOwnedWalkableTile(room, "p1");
    if (!pos) return;

    const creature = addCreature(room, "c1", "herbivore", pos.x, pos.y, {
      personality: "docile",
    });

    // Step 1: Tame the creature (costs 1 berry)
    room.handleTame(client, { creatureId: "c1" });
    expect(creature.ownerID).toBe("p1");

    // Step 2: Build trust — creature is on owned tile so trust increases
    const startTrust = creature.trust;

    for (let i = 0; i < 700; i++) {
      room.state.tick += 1;
      room.tickTrustDecay();
    }
    expect(creature.trust).toBeGreaterThanOrEqual(TAMING.TRUST_AT_OBEDIENT);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Breeding Cycle
// ═══════════════════════════════════════════════════════════════════

describe("Phase 4.8 Integration — Breeding Cycle", () => {
  it("tame 2 herbivores → build trust → breed → offspring with inherited traits", () => {
    const room = createRoomWithMap(42);
    const row = findWalkableRow(room, 4);
    if (!row) return;

    const { client, player } = joinPlayer(room, "p1");
    player.berries = 50;

    const parentA = addCreature(room, "pa", "herbivore", row[1].x, row[1].y, {
      ownerID: "p1", trust: 80, speed: 2,
    });
    const parentB = addCreature(room, "pb", "herbivore", row[2].x, row[2].y, {
      ownerID: "p1", trust: 80, speed: -2,
    });

    // Parents must be adjacent for breeding — they're 1 tile apart
    expect(manhattan(parentA.x, parentA.y, parentB.x, parentB.y)).toBe(1);

    // Breed multiple times to overcome 50% chance
    let offspring: any = null;
    const knownIds = new Set(["pa", "pb"]);

    for (let attempt = 0; attempt < 20 && !offspring; attempt++) {
      parentA.lastBredTick = 0;
      parentB.lastBredTick = 0;
      room.state.tick = (attempt + 1) * 200;

      const sizeBefore = room.state.creatures.size;
      room.handleBreed(client, { creatureId: "pa" });

      if (room.state.creatures.size > sizeBefore) {
        room.state.creatures.forEach((c: any) => {
          if (!knownIds.has(c.id) && !offspring) offspring = c;
        });
      }
    }

    expect(offspring).toBeDefined();
    expect(offspring.ownerID).toBe("p1");
    expect(offspring.trust).toBe(BREEDING.OFFSPRING_TRUST);
    expect(offspring.creatureType).toBe("herbivore");
    expect(offspring.speed).toBeGreaterThanOrEqual(-BREEDING.TRAIT_CAP);
    expect(offspring.speed).toBeLessThanOrEqual(BREEDING.TRAIT_CAP);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Ownership Isolation
// ═══════════════════════════════════════════════════════════════════

describe("Phase 4.8 Integration — Ownership Isolation", () => {
  it("Player B cannot tame a creature already owned by Player A", () => {
    const room = createRoomWithMap(42);
    const { client: clientA, player: playerA } = joinPlayer(room, "pA");
    const { client: clientB, player: playerB } = joinPlayer(room, "pB");
    playerA.berries = 5;
    playerB.berries = 5;

    const posA = findOwnedWalkableTile(room, "pA");
    if (!posA) return;

    const creature = addCreature(room, "c-own", "herbivore", posA.x, posA.y);

    // Player A tames (creature on A's territory)
    room.handleTame(clientA, { creatureId: "c-own" });
    expect(creature.ownerID).toBe("pA");

    // Player B tries to tame same creature (already owned)
    room.handleTame(clientB, { creatureId: "c-own" });
    expect(creature.ownerID).toBe("pA"); // unchanged
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Trust Decay → Auto-Abandon (Territory-Based)
// ═══════════════════════════════════════════════════════════════════

describe("Phase 4.8 Integration — Trust Decay → Auto-Abandon", () => {
  it("tamed creature outside territory loses trust, eventually auto-abandons", () => {
    const room = createRoomWithMap(42);
    joinPlayer(room, "p1");

    const unowned = findUnownedWalkableTile(room);
    if (!unowned) return;

    const creature = addCreature(room, "c-decay", "herbivore", unowned.x, unowned.y, {
      ownerID: "p1", trust: 10, personality: "neutral",
    });

    // Simulate many ticks — trust decays when outside territory
    for (let i = 0; i < 350; i++) {
      simulateTick(room);
    }

    // Creature should have auto-abandoned
    expect(creature.ownerID).toBe("");
    expect(creature.trust).toBe(0);
  });

  it("trust decay stops when creature moves to territory", () => {
    const room = createRoomWithMap(42);
    joinPlayer(room, "p1");

    const unowned = findUnownedWalkableTile(room);
    if (!unowned) return;

    const creature = addCreature(room, "c-stop", "herbivore", unowned.x, unowned.y, {
      ownerID: "p1", trust: 30,
    });

    // Decay for 100 ticks outside territory
    for (let i = 0; i < 100; i++) {
      room.state.tick += 1;
      room.tickTrustDecay();
    }
    const trustAfterDecay = creature.trust;
    expect(trustAfterDecay).toBeLessThan(30);

    // Move creature onto owned territory
    const owned = findOwnedWalkableTile(room, "p1");
    if (!owned) return;
    creature.x = owned.x;
    creature.y = owned.y;

    // Now proximity gain kicks in: +1 per 10 ticks
    for (let i = 0; i < 100; i++) {
      room.state.tick += 1;
      room.tickTrustDecay();
    }

    // Trust should have increased from territory proximity
    expect(creature.trust).toBeGreaterThan(trustAfterDecay);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Ecosystem with Tamed Creatures
// ═══════════════════════════════════════════════════════════════════

describe("Phase 4.8 Integration — Ecosystem with Tamed Creatures", () => {
  it("tame several creatures, 200+ ticks, wild populations still sustain", () => {
    const room = createRoomWithEcosystem(42);
    const { client, player } = joinPlayer(room, "p1");
    player.berries = 20;

    // Tame 3 wild herbivores near territory
    let tamed = 0;
    const toTame: string[] = [];
    const owned = findOwnedWalkableTile(room, "p1");
    room.state.creatures.forEach((c: any) => {
      if (c.creatureType === "herbivore" && c.ownerID === "" && tamed < 3) {
        toTame.push(c.id);
        tamed++;
      }
    });

    for (const cId of toTame) {
      const creature = room.state.creatures.get(cId)!;
      // Move creature to owned territory for taming
      if (owned) {
        creature.x = owned.x;
        creature.y = owned.y;
      }
      room.handleTame(client, { creatureId: cId });
    }

    expect(countOwned(room, "p1")).toBe(3);

    // Run 250 ticks — respawning should sustain wild populations
    for (let i = 0; i < 250; i++) {
      simulateTick(room);
    }

    // Wild creatures should still exist via respawning
    const total = room.state.creatures.size;
    expect(total).toBeGreaterThan(3);
  });

  it("tamed creatures don't interfere with respawn thresholds", () => {
    const room = createRoomWithEcosystem(42);
    const { client, player } = joinPlayer(room, "p1");
    player.berries = 20;

    const herbIds: string[] = [];
    room.state.creatures.forEach((c: any) => {
      if (c.creatureType === "herbivore") herbIds.push(c.id);
    });

    // Tame 2
    const owned = findOwnedWalkableTile(room, "p1");
    for (let i = 0; i < Math.min(2, herbIds.length); i++) {
      const c = room.state.creatures.get(herbIds[i])!;
      if (owned) {
        c.x = owned.x;
        c.y = owned.y;
      }
      room.handleTame(client, { creatureId: herbIds[i] });
      c.trust = 80;
    }

    // Kill remaining wild herbivores
    for (let i = 2; i < herbIds.length; i++) {
      room.state.creatures.delete(herbIds[i]);
    }

    // Run respawn ticks
    for (let i = 0; i < 200; i++) {
      simulateTick(room);
    }

    let herbCount = 0;
    room.state.creatures.forEach((c: any) => {
      if (c.creatureType === "herbivore") herbCount++;
    });
    expect(herbCount).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Breeding Edge Cases
// ═══════════════════════════════════════════════════════════════════

describe("Phase 4.8 Integration — Breeding Edge Cases", () => {
  it("breeding different creature types rejected", () => {
    const room = createRoomWithMap(42);
    const row = findWalkableRow(room, 3);
    if (!row) return;

    const { client, player } = joinPlayer(room, "p1");
    player.berries = 20;

    addCreature(room, "herb-x", "herbivore", row[1].x, row[1].y, {
      ownerID: "p1", trust: 80,
    });
    addCreature(room, "carn-x", "carnivore", row[2].x, row[2].y, {
      ownerID: "p1", trust: 80,
    });

    const before = room.state.creatures.size;
    room.handleBreed(client, { creatureId: "herb-x" });
    expect(room.state.creatures.size).toBe(before);
    expect(player.berries).toBe(20);
  });

  it("breeding with trust too low rejected", () => {
    const room = createRoomWithMap(42);
    const row = findWalkableRow(room, 3);
    if (!row) return;

    const { client, player } = joinPlayer(room, "p1");
    player.berries = 20;

    addCreature(room, "low-a", "herbivore", row[1].x, row[1].y, {
      ownerID: "p1", trust: 50,
    });
    addCreature(room, "low-b", "herbivore", row[2].x, row[2].y, {
      ownerID: "p1", trust: 50,
    });

    const before = room.state.creatures.size;
    room.handleBreed(client, { creatureId: "low-a" });
    expect(room.state.creatures.size).toBe(before);
  });

  it("breeding without enough berries rejected", () => {
    const room = createRoomWithMap(42);
    const row = findWalkableRow(room, 3);
    if (!row) return;

    const { client, player } = joinPlayer(room, "p1");
    player.berries = 5; // need 10

    addCreature(room, "poor-a", "herbivore", row[1].x, row[1].y, {
      ownerID: "p1", trust: 80,
    });
    addCreature(room, "poor-b", "herbivore", row[2].x, row[2].y, {
      ownerID: "p1", trust: 80,
    });

    const before = room.state.creatures.size;
    room.handleBreed(client, { creatureId: "poor-a" });
    expect(room.state.creatures.size).toBe(before);
    expect(player.berries).toBe(5);
  });

  it("breeding cooldown enforced", () => {
    const room = createRoomWithMap(42);
    const row = findWalkableRow(room, 3);
    if (!row) return;

    const { client, player } = joinPlayer(room, "p1");
    player.berries = 100;

    addCreature(room, "cool-a", "herbivore", row[1].x, row[1].y, {
      ownerID: "p1", trust: 90, lastBredTick: 1,
    });
    addCreature(room, "cool-b", "herbivore", row[2].x, row[2].y, {
      ownerID: "p1", trust: 90,
    });

    room.state.tick = BREEDING.COOLDOWN_TICKS - 10;

    const before = room.state.creatures.size;
    room.handleBreed(client, { creatureId: "cool-a" });
    expect(room.state.creatures.size).toBe(before);
    expect(player.berries).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. Taming Cost Validation
// ═══════════════════════════════════════════════════════════════════

describe("Phase 4.8 Integration — Taming Cost Validation", () => {
  it("taming costs 1 berry for both herbivore and carnivore", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "p1");
    player.berries = 6;

    const pos = findOwnedWalkableTile(room, "p1");
    if (!pos) return;

    addCreature(room, "herb-cost", "herbivore", pos.x, pos.y);
    addCreature(room, "carn-cost", "carnivore", pos.x, pos.y);

    // Tame herbivore (costs 1 berry)
    room.handleTame(client, { creatureId: "herb-cost" });
    expect(player.berries).toBe(5);

    // Tame carnivore (costs 1 berry)
    room.handleTame(client, { creatureId: "carn-cost" });
    expect(player.berries).toBe(4);
  });

  it("herbivore taming with no berries is rejected", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "p1");
    player.berries = 0;

    const pos = findOwnedWalkableTile(room, "p1");
    if (!pos) return;

    const creature = addCreature(room, "herb-no", "herbivore", pos.x, pos.y);

    room.handleTame(client, { creatureId: "herb-no" });
    expect(creature.ownerID).toBe(""); // still wild
  });
});
