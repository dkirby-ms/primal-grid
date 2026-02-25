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

function placePlayerAt(room: any, sessionId: string, x: number, y: number) {
  const client = fakeClient(sessionId);
  room.onJoin(client);
  const player = room.state.players.get(sessionId)!;
  player.x = x;
  player.y = y;
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

/** Find two walkable tiles at given Manhattan distance. */
function findTilesAtDistance(
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

/** Find a tile with berries resource. */
function findBerryTile(room: any): { x: number; y: number } | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (tile.resourceType === ResourceType.Berries && tile.resourceAmount > 0
        && room.state.isWalkable(tile.x, tile.y)) {
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
  if (typeof room.tickPackFollow === "function") room.tickPackFollow();
}

/** Count creatures owned by a player. */
function countOwned(room: any, playerId: string): number {
  let count = 0;
  room.state.creatures.forEach((c: any) => {
    if (c.ownerID === playerId) count++;
  });
  return count;
}

/** Count by type (only wild — ownerID is empty). */
function countWildByType(room: any): { herbivores: number; carnivores: number } {
  let herbivores = 0;
  let carnivores = 0;
  room.state.creatures.forEach((c: any) => {
    if (c.ownerID !== "") return;
    if (c.creatureType === "herbivore") herbivores++;
    else if (c.creatureType === "carnivore") carnivores++;
  });
  return { herbivores, carnivores };
}

function manhattan(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

// ═══════════════════════════════════════════════════════════════════
// 1. Full Taming → Pack → Command Cycle
// ═══════════════════════════════════════════════════════════════════

describe("Phase 4.8 Integration — Full Taming → Pack → Follow Cycle", () => {
  it("gather berries → tame → build trust → select → creature follows player", () => {
    const room = createRoomWithMap(42);
    const row = findWalkableRow(room, 5);
    if (!row) return;

    // Player at row[0], creature at row[1]
    const { client, player } = placePlayerAt(room, "p1", row[0].x, row[0].y);

    // Give player berries (simulating gathered berries)
    player.berries = 20;

    const creature = addCreature(room, "c1", "herbivore", row[1].x, row[1].y, {
      personality: "docile",
    });

    // Step 1: Tame the creature (costs 1 berry)
    room.handleTame(client, { creatureId: "c1" });
    expect(creature.ownerID).toBe("p1");
    expect(player.berries).toBe(19);

    // Step 2: Build trust via proximity ticks until trust >= 70
    // Proximity gain: +1 per 10 ticks when within 3 tiles
    // Docile creatures start at trust 10
    const startTrust = creature.trust;
    expect(startTrust).toBe(10); // docile initial trust

    // Need to reach 70: that's 60 more trust = 600 ticks at +1/10 ticks
    // Use tickTrustDecay directly to avoid AI moving the creature away
    for (let i = 0; i < 700; i++) {
      room.state.tick += 1;
      room.tickTrustDecay();
    }
    expect(creature.trust).toBeGreaterThanOrEqual(TAMING.TRUST_AT_OBEDIENT);

    // Step 3: Select creature into pack
    room.handleSelectCreature(client, { creatureId: "c1" });
    const pack = room.playerSelectedPacks?.get("p1");
    expect(pack).toBeDefined();
    expect(pack!.has("c1")).toBe(true);

    // Step 4: Move player away and verify creature follows via tickPackFollow
    player.x = row[3].x;
    player.y = row[3].y;
    const distBefore = manhattan(creature.x, creature.y, player.x, player.y);
    expect(distBefore).toBeGreaterThan(1);

    // Tick pack follow to move creature toward player
    for (let i = 0; i < 5; i++) {
      simulateTick(room);
    }

    const distAfter = manhattan(creature.x, creature.y, player.x, player.y);
    expect(distAfter).toBeLessThan(distBefore);
  });

  it("creature in pack has 'follow' state after pack tick", () => {
    const room = createRoomWithMap(42);
    const row = findWalkableRow(room, 3);
    if (!row) return;

    const { client, player } = placePlayerAt(room, "p1", row[0].x, row[0].y);
    player.berries = 5;

    const creature = addCreature(room, "c-follow", "herbivore", row[1].x, row[1].y, {
      ownerID: "p1", trust: 80,
    });

    room.handleSelectCreature(client, { creatureId: "c-follow" });

    // Move player a bit away
    player.x = row[2].x;
    player.y = row[2].y;

    simulateTick(room);

    expect(creature.currentState).toBe("follow");
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

    const { client, player } = placePlayerAt(room, "p1", row[0].x, row[0].y);
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
      // Reset cooldowns for retry
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
    // Speed: avg of 2 and -2 = 0, ± mutation, capped at ±3
    expect(offspring.speed).toBeGreaterThanOrEqual(-BREEDING.TRAIT_CAP);
    expect(offspring.speed).toBeLessThanOrEqual(BREEDING.TRAIT_CAP);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Pack Management
// ═══════════════════════════════════════════════════════════════════

describe("Phase 4.8 Integration — Pack Management", () => {
  it("select 8 creatures (max), 9th rejected, deselect one, add new one", () => {
    const room = createRoomWithMap(42);
    const row = findWalkableRow(room, 2);
    if (!row) return;

    const { client } = placePlayerAt(room, "p1", row[0].x, row[0].y);

    // Create 9 owned creatures with trust >= 70
    for (let i = 0; i < 9; i++) {
      addCreature(room, `pack-${i}`, "herbivore", row[1].x, row[1].y, {
        ownerID: "p1", trust: 80,
      });
    }

    // Select first 8 → all should be added
    for (let i = 0; i < 8; i++) {
      room.handleSelectCreature(client, { creatureId: `pack-${i}` });
    }
    const pack = room.playerSelectedPacks?.get("p1");
    expect(pack!.size).toBe(8);

    // 9th creature → rejected (pack full)
    room.handleSelectCreature(client, { creatureId: "pack-8" });
    expect(pack!.size).toBe(8);
    expect(pack!.has("pack-8")).toBe(false);

    // Deselect one (toggle off)
    room.handleSelectCreature(client, { creatureId: "pack-0" });
    expect(pack!.size).toBe(7);

    // Now add 9th creature → should work
    room.handleSelectCreature(client, { creatureId: "pack-8" });
    expect(pack!.size).toBe(8);
    expect(pack!.has("pack-8")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Ownership Isolation
// ═══════════════════════════════════════════════════════════════════

describe("Phase 4.8 Integration — Ownership Isolation", () => {
  it("Player B cannot tame a creature already owned by Player A", () => {
    const room = createRoomWithMap(42);
    const row = findWalkableRow(room, 3);
    if (!row) return;

    const { client: clientA } = placePlayerAt(room, "pA", row[0].x, row[0].y);
    const { client: clientB, player: playerB } = placePlayerAt(room, "pB", row[2].x, row[2].y);
    const playerA = room.state.players.get("pA")!;
    playerA.berries = 5;
    playerB.berries = 5;

    const creature = addCreature(room, "c-own", "herbivore", row[1].x, row[1].y);

    // Player A tames (adjacent)
    room.handleTame(clientA, { creatureId: "c-own" });
    expect(creature.ownerID).toBe("pA");

    // Player B tries to tame same creature (also adjacent)
    room.handleTame(clientB, { creatureId: "c-own" });
    expect(creature.ownerID).toBe("pA"); // unchanged
  });

  it("Player B cannot SELECT Player A's creature", () => {
    const room = createRoomWithMap(42);
    const row = findWalkableRow(room, 3);
    if (!row) return;

    placePlayerAt(room, "pA", row[0].x, row[0].y);
    const { client: clientB } = placePlayerAt(room, "pB", row[2].x, row[2].y);

    addCreature(room, "c-sel", "herbivore", row[1].x, row[1].y, {
      ownerID: "pA", trust: 80,
    });

    // Player B tries to select Player A's creature
    room.handleSelectCreature(clientB, { creatureId: "c-sel" });

    const packB = room.playerSelectedPacks?.get("pB");
    // Pack should either not exist or not contain the creature
    if (packB) {
      expect(packB.has("c-sel")).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Trust Decay → Auto-Abandon
// ═══════════════════════════════════════════════════════════════════

describe("Phase 4.8 Integration — Trust Decay → Auto-Abandon", () => {
  it("tamed creature far from owner loses trust, eventually auto-abandons", () => {
    const room = createRoomWithMap(42);
    const pair = findTilesAtDistance(room, 8);
    if (!pair) return;

    const { player } = placePlayerAt(room, "p1", pair.a.x, pair.a.y);
    const creature = addCreature(room, "c-decay", "herbivore", pair.b.x, pair.b.y, {
      ownerID: "p1", trust: 10, personality: "neutral",
    });

    // Verify distance > 3
    expect(manhattan(player.x, player.y, creature.x, creature.y)).toBeGreaterThan(3);

    // Simulate many ticks — trust decays -1 per 20 ticks when > 3 away
    // Starting at 10: needs 200 ticks to reach 0, then 50 more for auto-abandon
    for (let i = 0; i < 350; i++) {
      simulateTick(room);
    }

    // Creature should have auto-abandoned
    expect(creature.ownerID).toBe("");
    expect(creature.trust).toBe(0);
  });

  it("trust decay stops when owner moves close again", () => {
    const room = createRoomWithMap(42);
    const row = findWalkableRow(room, 10);
    if (!row) return;

    const { player } = placePlayerAt(room, "p1", row[0].x, row[0].y);
    const creature = addCreature(room, "c-stop", "herbivore", row[8].x, row[8].y, {
      ownerID: "p1", trust: 30,
    });

    // Decay for 100 ticks (should lose ~5 trust at -1/20 ticks)
    // Use tickTrustDecay directly to avoid AI moving the creature away
    for (let i = 0; i < 100; i++) {
      room.state.tick += 1;
      room.tickTrustDecay();
    }
    const trustAfterDecay = creature.trust;
    expect(trustAfterDecay).toBeLessThan(30);

    // Move owner adjacent to creature
    player.x = creature.x;
    player.y = creature.y;

    // Now proximity gain kicks in: +1 per 10 ticks
    for (let i = 0; i < 100; i++) {
      room.state.tick += 1;
      room.tickTrustDecay();
    }

    // Trust should have increased from proximity
    expect(creature.trust).toBeGreaterThan(trustAfterDecay);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Ecosystem with Tamed Creatures
// ═══════════════════════════════════════════════════════════════════

describe("Phase 4.8 Integration — Ecosystem with Tamed Creatures", () => {
  it("tame several creatures, 200+ ticks, wild populations still sustain", () => {
    const room = createRoomWithEcosystem(42);
    const row = findWalkableRow(room, 2);
    if (!row) return;

    const { client, player } = placePlayerAt(room, "p1", row[0].x, row[0].y);
    player.berries = 20;

    // Tame 3 wild herbivores
    let tamed = 0;
    const toTame: string[] = [];
    room.state.creatures.forEach((c: any) => {
      if (c.creatureType === "herbivore" && c.ownerID === "" && tamed < 3) {
        toTame.push(c.id);
        tamed++;
      }
    });

    for (const cId of toTame) {
      const creature = room.state.creatures.get(cId)!;
      // Move player adjacent for taming
      player.x = creature.x;
      player.y = creature.y;
      room.handleTame(client, { creatureId: cId });
    }

    expect(countOwned(room, "p1")).toBe(3);

    // Run 250 ticks — respawning should sustain wild populations
    for (let i = 0; i < 250; i++) {
      simulateTick(room);
    }

    // Wild creatures should still exist via respawning
    const total = room.state.creatures.size;
    expect(total).toBeGreaterThan(3); // more than just the tamed ones
  });

  it("tamed creatures don't interfere with respawn thresholds", () => {
    const room = createRoomWithEcosystem(42);
    const row = findWalkableRow(room, 2);
    if (!row) return;

    const { client, player } = placePlayerAt(room, "p1", row[0].x, row[0].y);
    player.berries = 20;

    // Kill all wild herbivores except tame some first
    const herbIds: string[] = [];
    room.state.creatures.forEach((c: any) => {
      if (c.creatureType === "herbivore") herbIds.push(c.id);
    });

    // Tame 2
    for (let i = 0; i < Math.min(2, herbIds.length); i++) {
      const c = room.state.creatures.get(herbIds[i])!;
      player.x = c.x;
      player.y = c.y;
      room.handleTame(client, { creatureId: herbIds[i] });
      c.trust = 80; // so they stay tamed
    }

    // Kill remaining wild herbivores
    for (let i = 2; i < herbIds.length; i++) {
      room.state.creatures.delete(herbIds[i]);
    }

    // Run respawn ticks
    for (let i = 0; i < 200; i++) {
      simulateTick(room);
    }

    // Respawner should have added new creatures since population was low
    // Total herbivores (tamed + wild) should be above 2
    let herbCount = 0;
    room.state.creatures.forEach((c: any) => {
      if (c.creatureType === "herbivore") herbCount++;
    });
    expect(herbCount).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. Breeding Edge Cases
// ═══════════════════════════════════════════════════════════════════

describe("Phase 4.8 Integration — Breeding Edge Cases", () => {
  it("breeding different creature types rejected", () => {
    const room = createRoomWithMap(42);
    const row = findWalkableRow(room, 3);
    if (!row) return;

    const { client, player } = placePlayerAt(room, "p1", row[0].x, row[0].y);
    player.berries = 20;

    addCreature(room, "herb-x", "herbivore", row[1].x, row[1].y, {
      ownerID: "p1", trust: 80,
    });
    addCreature(room, "carn-x", "carnivore", row[2].x, row[2].y, {
      ownerID: "p1", trust: 80,
    });

    const before = room.state.creatures.size;
    room.handleBreed(client, { creatureId: "herb-x" });
    // No same-type mate adjacent → no offspring
    expect(room.state.creatures.size).toBe(before);
    expect(player.berries).toBe(20); // not consumed
  });

  it("breeding with trust too low rejected", () => {
    const room = createRoomWithMap(42);
    const row = findWalkableRow(room, 3);
    if (!row) return;

    const { client, player } = placePlayerAt(room, "p1", row[0].x, row[0].y);
    player.berries = 20;

    addCreature(room, "low-a", "herbivore", row[1].x, row[1].y, {
      ownerID: "p1", trust: 50, // below 70
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

    const { client, player } = placePlayerAt(room, "p1", row[0].x, row[0].y);
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
    expect(player.berries).toBe(5); // not consumed
  });

  it("breeding cooldown enforced", () => {
    const room = createRoomWithMap(42);
    const row = findWalkableRow(room, 3);
    if (!row) return;

    const { client, player } = placePlayerAt(room, "p1", row[0].x, row[0].y);
    player.berries = 100;

    addCreature(room, "cool-a", "herbivore", row[1].x, row[1].y, {
      ownerID: "p1", trust: 90, lastBredTick: 1,
    });
    addCreature(room, "cool-b", "herbivore", row[2].x, row[2].y, {
      ownerID: "p1", trust: 90,
    });

    // Set tick so parent-a is within cooldown
    room.state.tick = BREEDING.COOLDOWN_TICKS - 10;

    const before = room.state.creatures.size;
    room.handleBreed(client, { creatureId: "cool-a" });
    expect(room.state.creatures.size).toBe(before); // rejected due to cooldown
    expect(player.berries).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. Taming Cost Validation
// ═══════════════════════════════════════════════════════════════════

describe("Phase 4.8 Integration — Taming Cost Validation", () => {
  it("herbivore taming requires berry, carnivore requires meat", () => {
    const room = createRoomWithMap(42);
    const row = findWalkableRow(room, 4);
    if (!row) return;

    const { client, player } = placePlayerAt(room, "p1", row[0].x, row[0].y);
    player.berries = 3;
    player.meat = 3;

    addCreature(room, "herb-cost", "herbivore", row[1].x, row[1].y);
    addCreature(room, "carn-cost", "carnivore", row[1].x, row[1].y);

    // Tame herbivore (costs 1 berry)
    room.handleTame(client, { creatureId: "herb-cost" });
    expect(player.berries).toBe(2);
    expect(player.meat).toBe(3);

    // Tame carnivore (costs 1 meat)
    room.handleTame(client, { creatureId: "carn-cost" });
    expect(player.meat).toBe(2);
    expect(player.berries).toBe(2);
  });

  it("herbivore taming with no berries is rejected", () => {
    const room = createRoomWithMap(42);
    const row = findWalkableRow(room, 2);
    if (!row) return;

    const { client, player } = placePlayerAt(room, "p1", row[0].x, row[0].y);
    player.berries = 0;
    player.meat = 5;

    const creature = addCreature(room, "herb-no", "herbivore", row[1].x, row[1].y);

    room.handleTame(client, { creatureId: "herb-no" });
    expect(creature.ownerID).toBe(""); // still wild
  });

  it("carnivore taming with no meat is rejected", () => {
    const room = createRoomWithMap(42);
    const row = findWalkableRow(room, 2);
    if (!row) return;

    const { client, player } = placePlayerAt(room, "p1", row[0].x, row[0].y);
    player.berries = 5;
    player.meat = 0;

    const creature = addCreature(room, "carn-no", "carnivore", row[1].x, row[1].y);

    room.handleTame(client, { creatureId: "carn-no" });
    expect(creature.ownerID).toBe(""); // still wild
  });
});
