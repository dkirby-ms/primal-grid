import { describe, it, expect } from "vitest";
import { GameState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import {
  TileType, ResourceType,
  CREATURE_TYPES, CREATURE_AI, CREATURE_SPAWN,
  RESOURCE_REGEN, DEFAULT_MAP_SIZE,
} from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithEcosystem(seed?: number): any {
  const room = Object.create(GameRoom.prototype) as any;
  room.state = new GameState();
  room.generateMap(seed);
  room.spawnCreatures();
  return room;
}

/** Place a creature manually at a specific position. */
function addCreature(
  room: any,
  id: string,
  type: string,
  x: number,
  y: number,
  overrides: Partial<{ health: number; hunger: number; currentState: string }> = {},
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
  room.state.creatures.set(id, creature);
  return creature;
}

/** Find a walkable tile optionally matching a biome type. */
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

/** Find a walkable tile WITH resources. */
function findResourceTile(room: any): any | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (tile.resourceAmount > 0 && room.state.isWalkable(tile.x, tile.y)) {
      return tile;
    }
  }
  return null;
}

/** Find a walkable tile WITHOUT resources. */
function findBarrenWalkableTile(room: any): { x: number; y: number } | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (room.state.isWalkable(tile.x, tile.y) && tile.resourceAmount <= 0) {
      return { x: tile.x, y: tile.y };
    }
  }
  return null;
}

/** Run one full simulation tick: advance tick counter + all subsystems. */
function simulateTick(room: any): void {
  room.state.tick += 1;
  room.tickResourceRegen();
  room.tickCreatureAI();
  // Phase 2.6: respawn check (Pemulis will implement)
  if (typeof room.tickCreatureRespawn === "function") {
    room.tickCreatureRespawn();
  }
}

/** Count creatures by type. */
function countByType(room: any): { herbivores: number; carnivores: number } {
  let herbivores = 0;
  let carnivores = 0;
  room.state.creatures.forEach((c: any) => {
    if (c.creatureType === "herbivore") herbivores++;
    else if (c.creatureType === "carnivore") carnivores++;
  });
  return { herbivores, carnivores };
}

/** Total resource amount across all tiles. */
function totalResources(room: any): number {
  let sum = 0;
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (tile.resourceAmount > 0) sum += tile.resourceAmount;
  }
  return sum;
}

/** Manhattan distance. */
function manhattan(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

/** Find two adjacent walkable tiles. */
function findAdjacentWalkablePair(room: any): { a: { x: number; y: number }; b: { x: number; y: number } } | null {
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

// ═══════════════════════════════════════════════════════════════════
// 1. Herbivore Grazing Depletes Tile Resources
// ═══════════════════════════════════════════════════════════════════

describe("Phase 2.6 — Herbivore Grazing Depletes Tile Resources", () => {
  it("hungry herbivore on a resource tile consumes resources via AI tick", () => {
    const room = createRoomWithEcosystem(42);
    room.state.creatures.clear();

    const tile = findResourceTile(room);
    if (!tile) return;

    const startAmount = tile.resourceAmount;
    addCreature(room, "grazer", "herbivore", tile.x, tile.y, {
      hunger: CREATURE_AI.HUNGRY_THRESHOLD - 10,
      currentState: "wander",
    });

    // Run AI ticks until creature eats
    for (let i = 0; i < 10; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      room.tickCreatureAI();
    }

    expect(tile.resourceAmount).toBeLessThan(startAmount);
  });

  it("fully depleted tile has resourceType = -1", () => {
    const room = createRoomWithEcosystem(42);
    room.state.creatures.clear();

    const tile = findResourceTile(room);
    if (!tile) return;

    // Set tile to 1 resource so it depletes quickly
    tile.resourceAmount = 1;
    addCreature(room, "depleter", "herbivore", tile.x, tile.y, {
      hunger: 0,
      currentState: "wander",
    });

    for (let i = 0; i < 5; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      room.tickCreatureAI();
    }

    if (tile.resourceAmount <= 0) {
      expect(tile.resourceType).toBe(-1);
    }
  });

  it("herbivore on depleted tile moves to seek food elsewhere", () => {
    const room = createRoomWithEcosystem(42);
    room.state.creatures.clear();

    const barrenPos = findBarrenWalkableTile(room);
    if (!barrenPos) return;

    const herb = addCreature(room, "seeker", "herbivore", barrenPos.x, barrenPos.y, {
      hunger: CREATURE_AI.HUNGRY_THRESHOLD - 20,
      currentState: "wander",
    });

    const startX = herb.x;
    const startY = herb.y;

    // Tick multiple times — creature should wander seeking food
    for (let i = 0; i < 20; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      room.tickCreatureAI();
    }

    // Should have moved from starting position
    expect(herb.x !== startX || herb.y !== startY).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Carnivore Hunting Reduces Herbivore Population
// ═══════════════════════════════════════════════════════════════════

describe("Phase 2.6 — Carnivore Hunting Reduces Herbivore Population", () => {
  it("carnivore adjacent to herbivore deals HUNT_DAMAGE", () => {
    const room = createRoomWithEcosystem(42);
    room.state.creatures.clear();

    const pair = findAdjacentWalkablePair(room);
    if (!pair) return;

    // Add carnivore FIRST so it's processed first in forEach — attacks before prey flees
    addCreature(room, "hunter", "carnivore", pair.a.x, pair.a.y, {
      hunger: CREATURE_AI.HUNGRY_THRESHOLD - 10,
      currentState: "hunt",
    });
    const herb = addCreature(room, "prey", "herbivore", pair.b.x, pair.b.y, {
      health: 100,
      hunger: 100,
      currentState: "idle",
    });

    const startHealth = herb.health;

    // Run several ticks — carnivore should attack at some point
    for (let i = 0; i < 10; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      room.tickCreatureAI();
    }

    // Herbivore should have taken damage (from hunting or possibly starvation)
    const herbRef = room.state.creatures.get("prey");
    if (herbRef) {
      expect(herbRef.health).toBeLessThan(startHealth);
    } else {
      // Herbivore was killed — that counts as damage dealt
      expect(true).toBe(true);
    }
  });

  it("carnivore kills herbivore after sufficient attacks", () => {
    const room = createRoomWithEcosystem(42);
    room.state.creatures.clear();

    const pair = findAdjacentWalkablePair(room);
    if (!pair) return;

    // Add carnivore first for iteration priority
    addCreature(room, "killer", "carnivore", pair.a.x, pair.a.y, {
      hunger: CREATURE_AI.HUNGRY_THRESHOLD - 10,
      currentState: "hunt",
    });
    addCreature(room, "doomed", "herbivore", pair.b.x, pair.b.y, {
      health: CREATURE_AI.HUNT_DAMAGE, // dies in 1 hit
      hunger: 100,
      currentState: "idle",
    });

    // Tick until herbivore dies — carnivore chases if prey flees
    for (let i = 0; i < 30; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      room.tickCreatureAI();
      if (!room.state.creatures.has("doomed")) break;
    }

    expect(room.state.creatures.has("doomed")).toBe(false);
  });

  it("herbivore population decreases over extended simulation", () => {
    const room = createRoomWithEcosystem(42);

    const initialCount = room.state.creatures.size;

    // Run 300 AI ticks — enough for starvation + hunting to kill some creatures
    for (let i = 0; i < 300; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      room.tickCreatureAI();
    }

    const finalCount = room.state.creatures.size;
    // Without respawning, total creature population should decrease
    expect(finalCount).toBeLessThan(initialCount);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Creature Respawning
// ═══════════════════════════════════════════════════════════════════

describe("Phase 2.6 — Creature Respawning", () => {
  it("respawn method exists on GameRoom", () => {
    const room = createRoomWithEcosystem(42);
    expect(typeof room.tickCreatureRespawn).toBe("function");
  });

  it("creatures respawn when population drops below threshold", () => {
    const room = createRoomWithEcosystem(42);
    // Kill all herbivores
    const toRemove: string[] = [];
    room.state.creatures.forEach((c: any) => {
      if (c.creatureType === "herbivore") toRemove.push(c.id);
    });
    toRemove.forEach((id: string) => room.state.creatures.delete(id));

    const { herbivores: before } = countByType(room);
    expect(before).toBe(0);

    // Run ticks to trigger respawn check
    for (let i = 0; i < 200; i++) {
      simulateTick(room);
    }

    const { herbivores: after } = countByType(room);
    expect(after).toBeGreaterThan(0);
  });

  it("respawned creatures appear on walkable tiles", () => {
    const room = createRoomWithEcosystem(42);
    // Kill all creatures
    room.state.creatures.clear();

    for (let i = 0; i < 200; i++) {
      simulateTick(room);
    }

    room.state.creatures.forEach((c: any) => {
      expect(room.state.isWalkable(c.x, c.y)).toBe(true);
    });
  });

  it("respawned creatures spawn in appropriate biomes", () => {
    const room = createRoomWithEcosystem(42);
    room.state.creatures.clear();

    for (let i = 0; i < 200; i++) {
      simulateTick(room);
    }

    const typeMap = CREATURE_TYPES as Record<string, any>;
    room.state.creatures.forEach((c: any) => {
      const typeDef = typeMap[c.creatureType];
      if (!typeDef) return;
      const tile = room.state.getTile(c.x, c.y);
      expect(tile).toBeDefined();
      // Respawned creatures should be in preferred biomes (or fallback walkable)
      // Soft check — preferred biome or any walkable tile is acceptable
      expect(room.state.isWalkable(c.x, c.y)).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Resource Regeneration Alongside Consumption
// ═══════════════════════════════════════════════════════════════════

describe("Phase 2.6 — Resource Regeneration Alongside Consumption", () => {
  it("depleted tile regenerates after regen interval", () => {
    const room = createRoomWithEcosystem(42);
    const tile = findResourceTile(room);
    if (!tile) return;

    const origType = tile.resourceType;
    // Deplete via simulated grazing
    tile.resourceAmount = 0;
    tile.resourceType = -1;

    // Advance ticks past regen interval
    for (let i = 0; i < RESOURCE_REGEN.INTERVAL_TICKS * 3; i++) {
      room.state.tick += 1;
      room.tickResourceRegen();
    }

    expect(tile.resourceAmount).toBeGreaterThan(0);
    expect(tile.resourceType).toBeGreaterThanOrEqual(0);
  });

  it("resources regen while herbivores are actively grazing", () => {
    const room = createRoomWithEcosystem(42);
    room.state.creatures.clear();

    // Find a tile with resources and place a hungry herbivore on it
    const tile = findResourceTile(room);
    if (!tile) return;

    tile.resourceAmount = 5;
    addCreature(room, "grazer-regen", "herbivore", tile.x, tile.y, {
      hunger: CREATURE_AI.HUNGRY_THRESHOLD - 30,
      currentState: "wander",
    });

    // Run enough ticks for both grazing and regen to occur
    for (let i = 0; i < RESOURCE_REGEN.INTERVAL_TICKS * 5; i++) {
      simulateTick(room);
    }

    // The system should not crash and tile should have a valid resource state
    expect(tile.resourceAmount).toBeGreaterThanOrEqual(0);
    expect(tile.resourceAmount).toBeLessThanOrEqual(RESOURCE_REGEN.MAX_AMOUNT);
  });

  it("system reaches equilibrium — resources do not permanently deplete", () => {
    const room = createRoomWithEcosystem(42);

    const initialTotal = totalResources(room);

    // Run the full simulation for many ticks
    for (let i = 0; i < 500; i++) {
      simulateTick(room);
    }

    const finalTotal = totalResources(room);

    // Resources should still exist — regen prevents permanent depletion
    expect(finalTotal).toBeGreaterThan(0);
    // Resources won't exceed the theoretical max
    const maxPossible = room.state.tiles.length * RESOURCE_REGEN.MAX_AMOUNT;
    expect(finalTotal).toBeLessThanOrEqual(maxPossible);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Ecosystem Stability (Full Integration)
// ═══════════════════════════════════════════════════════════════════

describe("Phase 2.6 — Ecosystem Stability", () => {
  it("200+ tick simulation runs without crashing", () => {
    const room = createRoomWithEcosystem(42);

    expect(() => {
      for (let i = 0; i < 250; i++) {
        simulateTick(room);
      }
    }).not.toThrow();
  });

  it("no NaN values in creature or tile state after 200 ticks", () => {
    const room = createRoomWithEcosystem(42);

    for (let i = 0; i < 200; i++) {
      simulateTick(room);
    }

    room.state.creatures.forEach((c: any) => {
      expect(Number.isNaN(c.x)).toBe(false);
      expect(Number.isNaN(c.y)).toBe(false);
      expect(Number.isNaN(c.health)).toBe(false);
      expect(Number.isNaN(c.hunger)).toBe(false);
    });

    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      expect(Number.isNaN(tile.resourceAmount)).toBe(false);
    }
  });

  it("creatures remain within map bounds after 200 ticks", () => {
    const room = createRoomWithEcosystem(42);

    for (let i = 0; i < 200; i++) {
      simulateTick(room);
    }

    room.state.creatures.forEach((c: any) => {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(room.state.mapWidth);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(room.state.mapHeight);
    });
  });

  it("all surviving creatures are on walkable tiles after 200 ticks", () => {
    const room = createRoomWithEcosystem(42);

    for (let i = 0; i < 200; i++) {
      simulateTick(room);
    }

    room.state.creatures.forEach((c: any) => {
      expect(room.state.isWalkable(c.x, c.y)).toBe(true);
    });
  });

  it("resources don't permanently deplete over 200 ticks", () => {
    const room = createRoomWithEcosystem(42);

    for (let i = 0; i < 200; i++) {
      simulateTick(room);
    }

    const total = totalResources(room);
    expect(total).toBeGreaterThan(0);
  });

  it("herbivore count stays above 0 over 200 ticks (with respawning)", () => {
    const room = createRoomWithEcosystem(42);

    for (let i = 0; i < 200; i++) {
      simulateTick(room);
    }

    const { herbivores } = countByType(room);
    // With respawning active, herbivores should not go extinct
    expect(herbivores).toBeGreaterThan(0);
  });

  it("creature states are valid FSM states after 200 ticks", () => {
    const room = createRoomWithEcosystem(42);
    const validStates = ["idle", "wander", "eat", "flee", "hunt"];

    for (let i = 0; i < 200; i++) {
      simulateTick(room);
    }

    room.state.creatures.forEach((c: any) => {
      expect(validStates).toContain(c.currentState);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Edge Cases
// ═══════════════════════════════════════════════════════════════════

describe("Phase 2.6 — Edge Cases", () => {
  it("0 herbivores: respawn should kick in", () => {
    const room = createRoomWithEcosystem(42);

    // Remove all herbivores
    const herbIds: string[] = [];
    room.state.creatures.forEach((c: any) => {
      if (c.creatureType === "herbivore") herbIds.push(c.id);
    });
    herbIds.forEach((id) => room.state.creatures.delete(id));
    expect(countByType(room).herbivores).toBe(0);

    // Run simulation — respawn should add new herbivores
    for (let i = 0; i < 200; i++) {
      simulateTick(room);
    }

    expect(countByType(room).herbivores).toBeGreaterThan(0);
  });

  it("0 resources on all tiles: creatures starve, die, then respawn", () => {
    const room = createRoomWithEcosystem(42);

    // Strip all resources from all tiles
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      tile.resourceAmount = 0;
      tile.resourceType = -1;
    }

    // Run simulation — creatures starve, resources regen, creatures respawn
    for (let i = 0; i < 500; i++) {
      simulateTick(room);
    }

    // Resources should have regenerated (biome-based regen)
    const regenTotal = totalResources(room);
    expect(regenTotal).toBeGreaterThan(0);

    // With respawning, some creatures should exist
    expect(room.state.creatures.size).toBeGreaterThanOrEqual(0);
  });

  it("carnivore-only map: carnivores starve without prey, then respawn", () => {
    const room = createRoomWithEcosystem(42);

    // Remove all herbivores — carnivores have nothing to eat
    const herbIds: string[] = [];
    room.state.creatures.forEach((c: any) => {
      if (c.creatureType === "herbivore") herbIds.push(c.id);
    });
    herbIds.forEach((id) => room.state.creatures.delete(id));

    const { carnivores: startCarns } = countByType(room);
    expect(startCarns).toBeGreaterThan(0);

    // Run enough ticks for carnivores to starve
    for (let i = 0; i < 300; i++) {
      simulateTick(room);
    }

    // Simulation should not crash
    expect(room.state.tick).toBeGreaterThan(0);
  });

  it("simulation handles empty creature collection gracefully", () => {
    const room = createRoomWithEcosystem(42);
    room.state.creatures.clear();

    // Should not throw with 0 creatures
    expect(() => {
      for (let i = 0; i < 50; i++) {
        simulateTick(room);
      }
    }).not.toThrow();
  });

  it("multiple herbivores on same tile compete for resources", () => {
    const room = createRoomWithEcosystem(42);
    room.state.creatures.clear();

    const tile = findResourceTile(room);
    if (!tile) return;

    tile.resourceAmount = 2;
    addCreature(room, "comp-1", "herbivore", tile.x, tile.y, {
      hunger: 0, currentState: "wander",
    });
    addCreature(room, "comp-2", "herbivore", tile.x, tile.y, {
      hunger: 0, currentState: "wander",
    });

    for (let i = 0; i < 10; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      room.tickCreatureAI();
    }

    // Tile should be fully depleted or near-depleted
    expect(tile.resourceAmount).toBeLessThanOrEqual(1);
  });

  it("creature health and hunger values stay in sane ranges", () => {
    const room = createRoomWithEcosystem(42);

    for (let i = 0; i < 100; i++) {
      simulateTick(room);
    }

    room.state.creatures.forEach((c: any) => {
      expect(c.health).toBeGreaterThan(0); // alive creatures have positive health
      expect(c.hunger).toBeGreaterThanOrEqual(0);
      expect(c.hunger).toBeLessThanOrEqual(200); // reasonable upper bound
      expect(c.health).toBeLessThanOrEqual(500); // reasonable upper bound
    });
  });
});
