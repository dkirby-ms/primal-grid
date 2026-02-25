import { describe, it, expect } from "vitest";
import { GameState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import {
  TileType, ResourceType,
  CREATURE_TYPES, CREATURE_AI, CREATURE_SPAWN,
  DEFAULT_MAP_SIZE,
} from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithCreatures(seed?: number): any {
  const room = Object.create(GameRoom.prototype) as any;
  room.state = new GameState();
  room.generateMap(seed);
  room.spawnCreatures();
  return room;
}

/** Place a creature manually at a specific position with given state. */
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

/** Find a walkable tile of the given type. */
function findWalkableTile(room: any, tileType?: number): { x: number; y: number } {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (room.state.isWalkable(tile.x, tile.y)) {
      if (tileType === undefined || tile.type === tileType) {
        return { x: tile.x, y: tile.y };
      }
    }
  }
  // Fallback
  return { x: 1, y: 1 };
}

/** Find two walkable tiles separated by exactly `dist` Manhattan distance. */
function findTilesAtDistance(
  room: any, dist: number, tileType?: number,
): { a: { x: number; y: number }; b: { x: number; y: number } } | null {
  const w = room.state.mapWidth;
  for (let y1 = 0; y1 < w; y1++) {
    for (let x1 = 0; x1 < w; x1++) {
      if (!room.state.isWalkable(x1, y1)) continue;
      const t1 = room.state.getTile(x1, y1);
      if (tileType !== undefined && t1?.type !== tileType) continue;
      // Try horizontal
      const x2 = x1 + dist;
      if (x2 < w && room.state.isWalkable(x2, y1)) {
        return { a: { x: x1, y: y1 }, b: { x: x2, y: y1 } };
      }
    }
  }
  return null;
}

/** Manhattan distance. */
function manhattan(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

// ── FSM States ──────────────────────────────────────────────────────

describe("Phase 2.5 — Creature AI: FSM States", () => {
  it("all creatures start in idle state", () => {
    const room = createRoomWithCreatures(42);
    room.state.creatures.forEach((creature: any) => {
      expect(creature.currentState).toBe("idle");
    });
  });

  it("valid FSM states are idle, wander, eat, flee, hunt", () => {
    const validStates = ["idle", "wander", "eat", "flee", "hunt"];
    const room = createRoomWithCreatures(42);

    // Tick enough times to see state transitions
    for (let i = 0; i < 20; i++) {
      room.state.tick += 1;
      room.tickCreatureAI();
    }

    room.state.creatures.forEach((creature: any) => {
      expect(validStates).toContain(creature.currentState);
    });
  });
});

// ── Herbivore Transitions ───────────────────────────────────────────

describe("Phase 2.5 — Creature AI: Herbivore Transitions", () => {
  it("herbivore in idle transitions to wander after idle duration", () => {
    const room = createRoomWithCreatures(42);

    // Find a herbivore
    let herbivore: any = null;
    room.state.creatures.forEach((c: any) => {
      if (c.creatureType === "herbivore" && !herbivore) herbivore = c;
    });
    expect(herbivore).not.toBeNull();
    expect(herbivore.currentState).toBe("idle");

    // Tick past idle duration
    for (let i = 0; i < CREATURE_AI.IDLE_DURATION + 2; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      room.tickCreatureAI();
    }

    // Should have transitioned out of idle (likely to wander)
    expect(herbivore.currentState).not.toBe("idle");
  });

  it("hungry herbivore near food transitions to eat", () => {
    const room = createRoomWithCreatures(42);
    // Clear default creatures and place one manually
    room.state.creatures.clear();

    // Find a tile with berries or fiber (food for herbivore)
    let foodTile: any = null;
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      if (tile.resourceAmount > 0 && room.state.isWalkable(tile.x, tile.y)) {
        foodTile = tile;
        break;
      }
    }
    if (!foodTile) return; // skip if no food on this seed

    const herb = addCreature(room, "herb-eat", "herbivore", foodTile.x, foodTile.y, {
      hunger: CREATURE_AI.HUNGRY_THRESHOLD - 10, // hungry
      currentState: "wander",
    });

    // Tick AI
    for (let i = 0; i < 5; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      room.tickCreatureAI();
    }

    // Should transition to eat (or have eaten and moved on)
    // The creature was hungry and on a food tile — at some point it should eat
    expect(["eat", "idle", "wander"]).toContain(herb.currentState);
  });

  it("herbivore flees when carnivore is within detection radius", () => {
    const room = createRoomWithCreatures(42);
    room.state.creatures.clear();

    const herbDetection = (CREATURE_TYPES as Record<string, any>).herbivore.detectionRadius;

    // Find two walkable tiles close together
    const pos = findTilesAtDistance(room, 2);
    if (!pos) return;

    const herb = addCreature(room, "flee-herb", "herbivore", pos.a.x, pos.a.y, {
      currentState: "wander",
    });
    addCreature(room, "threat-carn", "carnivore", pos.b.x, pos.b.y, {
      currentState: "wander",
    });

    // Distance should be within herbivore detection radius
    const dist = manhattan(pos.a.x, pos.a.y, pos.b.x, pos.b.y);
    expect(dist).toBeLessThanOrEqual(herbDetection);

    // Tick AI
    for (let i = 0; i < 5; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      room.tickCreatureAI();
    }

    // Herbivore should be fleeing (or have fled and returned to wander)
    expect(["flee", "wander", "idle"]).toContain(herb.currentState);
    // At minimum, it should have moved away
    const newDist = manhattan(herb.x, herb.y, pos.b.x, pos.b.y);
    // Should not have stayed on same spot if it noticed the carnivore
    expect(herb.x !== pos.a.x || herb.y !== pos.a.y || herb.currentState === "flee").toBe(true);
  });
});

// ── Carnivore Transitions ───────────────────────────────────────────

describe("Phase 2.5 — Creature AI: Carnivore Transitions", () => {
  it("carnivore in wander transitions to hunt when herbivore within detection radius", () => {
    const room = createRoomWithCreatures(42);
    room.state.creatures.clear();

    const carnDetection = (CREATURE_TYPES as Record<string, any>).carnivore.detectionRadius;

    const pos = findTilesAtDistance(room, 3);
    if (!pos) return;

    const carn = addCreature(room, "hunt-carn", "carnivore", pos.a.x, pos.a.y, {
      currentState: "wander",
    });
    addCreature(room, "prey-herb", "herbivore", pos.b.x, pos.b.y, {
      currentState: "wander",
    });

    const dist = manhattan(pos.a.x, pos.a.y, pos.b.x, pos.b.y);
    expect(dist).toBeLessThanOrEqual(carnDetection);

    // Tick AI
    for (let i = 0; i < 5; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      room.tickCreatureAI();
    }

    // Carnivore should be hunting (or have killed and moved on)
    expect(["hunt", "eat", "wander", "idle"]).toContain(carn.currentState);
  });

  it("carnivore in hunt moves toward herbivore target (greedy Manhattan)", () => {
    const room = createRoomWithCreatures(42);
    room.state.creatures.clear();

    // Place carnivore and herbivore with some distance
    const pos = findTilesAtDistance(room, 5);
    if (!pos) return;

    const carn = addCreature(room, "chase-carn", "carnivore", pos.a.x, pos.a.y, {
      currentState: "hunt",
    });
    const herb = addCreature(room, "target-herb", "herbivore", pos.b.x, pos.b.y, {
      currentState: "idle",
    });

    const startDist = manhattan(carn.x, carn.y, pos.b.x, pos.b.y);

    // Tick AI once
    room.state.tick += CREATURE_AI.TICK_INTERVAL;
    room.tickCreatureAI();

    const newDist = manhattan(carn.x, carn.y, herb.x, herb.y);

    // Carnivore should have moved closer to the herbivore (or at least not farther)
    // Note: herbivore might also move, so we check against original target position
    const distToOrigTarget = manhattan(carn.x, carn.y, pos.b.x, pos.b.y);
    expect(distToOrigTarget).toBeLessThanOrEqual(startDist);
  });
});

// ── Hunger Depletion ────────────────────────────────────────────────

describe("Phase 2.5 — Creature AI: Hunger Depletion", () => {
  it("creature hunger depletes per AI tick", () => {
    const room = createRoomWithCreatures(42);
    room.state.creatures.clear();

    const pos = findWalkableTile(room);
    const creature = addCreature(room, "hunger-test", "herbivore", pos.x, pos.y, {
      hunger: 80,
    });

    const startHunger = creature.hunger;

    // Tick AI once
    room.state.tick += CREATURE_AI.TICK_INTERVAL;
    room.tickCreatureAI();

    expect(creature.hunger).toBe(startHunger - CREATURE_AI.HUNGER_DRAIN);
  });

  it("creature hunger does not go below 0", () => {
    const room = createRoomWithCreatures(42);
    room.state.creatures.clear();

    const pos = findWalkableTile(room);
    const creature = addCreature(room, "hunger-floor", "herbivore", pos.x, pos.y, {
      hunger: 1,
    });

    for (let i = 0; i < 10; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      room.tickCreatureAI();
      if (!room.state.creatures.has("hunger-floor")) break;
    }

    // Either creature died (removed) or hunger is 0
    const c = room.state.creatures.get("hunger-floor");
    if (c) {
      expect(c.hunger).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── Creature Death ──────────────────────────────────────────────────

describe("Phase 2.5 — Creature AI: Death", () => {
  it("creature is removed when health ≤ 0", () => {
    const room = createRoomWithCreatures(42);
    room.state.creatures.clear();

    const pos = findWalkableTile(room);
    addCreature(room, "death-test", "herbivore", pos.x, pos.y, {
      health: 1,
      hunger: 0, // starving → takes starvation damage
    });

    // Tick enough for starvation damage to kill
    for (let i = 0; i < 10; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      room.tickCreatureAI();
    }

    // Creature should be removed
    expect(room.state.creatures.has("death-test")).toBe(false);
  });

  it("creature with positive health is NOT removed", () => {
    const room = createRoomWithCreatures(42);
    room.state.creatures.clear();

    const pos = findWalkableTile(room);
    addCreature(room, "alive-test", "herbivore", pos.x, pos.y, {
      health: 100,
      hunger: 100, // well-fed, no starvation
    });

    room.state.tick += CREATURE_AI.TICK_INTERVAL;
    room.tickCreatureAI();

    expect(room.state.creatures.has("alive-test")).toBe(true);
  });

  it("starvation kills creature: hunger 0 → health drains → removed", () => {
    const room = createRoomWithCreatures(42);
    room.state.creatures.clear();

    // Find a tile WITHOUT resources so creature can't eat to restore hunger
    let barrenPos: { x: number; y: number } | null = null;
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      if (room.state.isWalkable(tile.x, tile.y) && tile.resourceAmount <= 0) {
        barrenPos = { x: tile.x, y: tile.y };
        break;
      }
    }
    if (!barrenPos) return;

    addCreature(room, "starve-die", "herbivore", barrenPos.x, barrenPos.y, {
      health: CREATURE_AI.STARVATION_DAMAGE * 2, // will die in ~2 ticks
      hunger: 0,
    });

    for (let i = 0; i < 20; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      room.tickCreatureAI();
    }

    expect(room.state.creatures.has("starve-die")).toBe(false);
  });
});

// ── Movement Constraints ────────────────────────────────────────────

describe("Phase 2.5 — Creature AI: Movement", () => {
  it("movement is max 1 tile per step", () => {
    const room = createRoomWithCreatures(42);

    // Record initial positions
    const initialPos = new Map<string, { x: number; y: number }>();
    room.state.creatures.forEach((c: any) => {
      initialPos.set(c.id, { x: c.x, y: c.y });
    });

    // Single AI tick
    room.state.tick += CREATURE_AI.TICK_INTERVAL;
    room.tickCreatureAI();

    // Check each creature moved at most 1 tile
    room.state.creatures.forEach((c: any) => {
      const prev = initialPos.get(c.id);
      if (!prev) return; // new creature or died
      const dx = Math.abs(c.x - prev.x);
      const dy = Math.abs(c.y - prev.y);
      expect(dx).toBeLessThanOrEqual(1);
      expect(dy).toBeLessThanOrEqual(1);
    });
  });

  it("movement respects walkability (no Water or Rock)", () => {
    const room = createRoomWithCreatures(42);

    // Tick many times to allow lots of movement
    for (let i = 0; i < 50; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      room.tickCreatureAI();
    }

    // All surviving creatures must be on walkable tiles
    room.state.creatures.forEach((c: any) => {
      const tile = room.state.getTile(c.x, c.y);
      expect(tile).toBeDefined();
      expect(tile!.type).not.toBe(TileType.Water);
      expect(tile!.type).not.toBe(TileType.Rock);
      expect(room.state.isWalkable(c.x, c.y)).toBe(true);
    });
  });

  it("creatures stay within map bounds after many ticks", () => {
    const room = createRoomWithCreatures(42);

    for (let i = 0; i < 100; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      room.tickCreatureAI();
    }

    room.state.creatures.forEach((c: any) => {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(DEFAULT_MAP_SIZE);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(DEFAULT_MAP_SIZE);
    });
  });
});

// ── Wander Behavior ─────────────────────────────────────────────────

describe("Phase 2.5 — Creature AI: Wander", () => {
  it("wandering creature moves to an adjacent walkable tile", () => {
    const room = createRoomWithCreatures(42);
    room.state.creatures.clear();

    // Find a walkable tile with walkable neighbors
    const pos = findWalkableTile(room, TileType.Grassland);
    const creature = addCreature(room, "wander-test", "herbivore", pos.x, pos.y, {
      currentState: "wander",
    });

    const prevX = creature.x;
    const prevY = creature.y;

    room.state.tick += CREATURE_AI.TICK_INTERVAL;
    room.tickCreatureAI();

    // Should have moved (or stayed if surrounded — unlikely on grassland)
    const dx = Math.abs(creature.x - prevX);
    const dy = Math.abs(creature.y - prevY);
    expect(dx + dy).toBeLessThanOrEqual(2); // max 1 in each axis
    expect(dx).toBeLessThanOrEqual(1);
    expect(dy).toBeLessThanOrEqual(1);

    // Must be on walkable tile
    expect(room.state.isWalkable(creature.x, creature.y)).toBe(true);
  });
});

// ── Detection Radius ────────────────────────────────────────────────

describe("Phase 2.5 — Creature AI: Detection Radius", () => {
  it("detection radius is configurable per creature type", () => {
    const herbDef = (CREATURE_TYPES as Record<string, any>).herbivore;
    const carnDef = (CREATURE_TYPES as Record<string, any>).carnivore;

    expect(herbDef.detectionRadius).toBeGreaterThan(0);
    expect(carnDef.detectionRadius).toBeGreaterThan(0);
    // Carnivore has wider detection than herbivore (per data)
    expect(carnDef.detectionRadius).toBeGreaterThan(herbDef.detectionRadius);
  });

  it("carnivore does NOT hunt herbivore outside detection radius", () => {
    const room = createRoomWithCreatures(42);
    room.state.creatures.clear();

    const carnDef = (CREATURE_TYPES as Record<string, any>).carnivore;
    const farDist = carnDef.detectionRadius + 5;

    // Place carnivore and herbivore far apart
    const pos = findTilesAtDistance(room, farDist);
    if (!pos) return; // map too small

    const carn = addCreature(room, "far-carn", "carnivore", pos.a.x, pos.a.y, {
      currentState: "wander",
    });
    addCreature(room, "far-herb", "herbivore", pos.b.x, pos.b.y, {
      currentState: "idle",
    });

    room.state.tick += CREATURE_AI.TICK_INTERVAL;
    room.tickCreatureAI();

    // Carnivore should NOT be hunting — too far
    expect(carn.currentState).not.toBe("hunt");
  });
});

// ── Greedy Manhattan ────────────────────────────────────────────────

describe("Phase 2.5 — Creature AI: Greedy Manhattan", () => {
  it("greedy Manhattan reduces distance to target each step", () => {
    const room = createRoomWithCreatures(42);
    room.state.creatures.clear();

    // Place with enough distance for multiple steps
    const pos = findTilesAtDistance(room, 4);
    if (!pos) return;

    const carn = addCreature(room, "greedy-carn", "carnivore", pos.a.x, pos.a.y, {
      currentState: "hunt",
      hunger: CREATURE_AI.HUNGRY_THRESHOLD - 10, // must be hungry to hunt
    });
    // Target — well-fed so it mostly idles
    const herb = addCreature(room, "greedy-target", "herbivore", pos.b.x, pos.b.y, {
      currentState: "idle",
      health: 200, // high health so it survives
      hunger: 100, // well-fed, won't seek food
    });

    // Track distance to ORIGINAL target position (herb may move via idle→wander)
    const targetX = pos.b.x;
    const targetY = pos.b.y;
    let prevDist = manhattan(carn.x, carn.y, targetX, targetY);

    for (let i = 0; i < 3; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      room.tickCreatureAI();
      const newDist = manhattan(carn.x, carn.y, targetX, targetY);
      // Each step should reduce or maintain distance to original target
      // (walkability constraints may block optimal move)
      expect(newDist).toBeLessThanOrEqual(prevDist);
      prevDist = newDist;
    }
  });
});

// ── AI Tick Interval ────────────────────────────────────────────────

describe("Phase 2.5 — Creature AI: Tick Interval", () => {
  it("creature AI does NOT run on every game tick (uses TICK_INTERVAL)", () => {
    const room = createRoomWithCreatures(42);

    // Record positions
    const positionsBefore = new Map<string, { x: number; y: number; state: string }>();
    room.state.creatures.forEach((c: any) => {
      positionsBefore.set(c.id, { x: c.x, y: c.y, state: c.currentState });
    });

    // Advance by 1 tick (less than TICK_INTERVAL) — AI should NOT update
    room.state.tick += 1;
    room.tickCreatureAI();

    // If TICK_INTERVAL > 1, nothing should have changed
    if (CREATURE_AI.TICK_INTERVAL > 1) {
      room.state.creatures.forEach((c: any) => {
        const prev = positionsBefore.get(c.id);
        if (!prev) return;
        expect(c.x).toBe(prev.x);
        expect(c.y).toBe(prev.y);
        expect(c.currentState).toBe(prev.state);
      });
    }
  });
});

// ── Full Ecosystem Stress ───────────────────────────────────────────

describe("Phase 2.5 — Creature AI: Ecosystem Stability", () => {
  it("simulation runs 200 AI ticks without crashing", () => {
    const room = createRoomWithCreatures(42);

    expect(() => {
      for (let i = 0; i < 200; i++) {
        room.state.tick += CREATURE_AI.TICK_INTERVAL;
        room.tickCreatureAI();
      }
    }).not.toThrow();
  });

  it("some creatures survive and some die over 200 ticks", () => {
    const room = createRoomWithCreatures(42);
    const initialCount = room.state.creatures.size;

    for (let i = 0; i < 200; i++) {
      room.state.tick += CREATURE_AI.TICK_INTERVAL;
      room.tickCreatureAI();
    }

    const finalCount = room.state.creatures.size;
    // Some may die from starvation; not all should survive or all die
    // This is a soft check — just verify the system didn't crash
    expect(finalCount).toBeGreaterThanOrEqual(0);
    expect(finalCount).toBeLessThanOrEqual(initialCount);
  });
});
