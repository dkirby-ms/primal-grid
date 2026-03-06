import { describe, it, expect } from "vitest";
import { GameState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { tickCreatureAI } from "../rooms/creatureAI.js";
import {
  CREATURE_TYPES, CREATURE_AI,
} from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): any {
  const room = Object.create(GameRoom.prototype) as any;
  room.state = new GameState();
  room.generateMap(seed);
  room.broadcast = () => {};
  return room;
}

/** Place a creature manually at a specific position. */
function addCreature(
  room: any,
  id: string,
  type: string,
  x: number,
  y: number,
  overrides: Partial<{ health: number; hunger: number; currentState: string; nextMoveTick: number }> = {},
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
  creature.nextMoveTick = overrides.nextMoveTick ?? room.state.tick;
  room.state.creatures.set(id, creature);
  return creature;
}

/**
 * Find N walkable tiles that are far apart from each other.
 * Separation ensures no detection-radius interactions between creatures.
 */
function findSpacedWalkableTiles(
  room: any, count: number, minSeparation: number = 10,
): { x: number; y: number }[] {
  const tiles: { x: number; y: number }[] = [];
  const w = room.state.mapWidth;

  for (let y = 1; y < w - 1 && tiles.length < count; y++) {
    for (let x = 1; x < w - 1 && tiles.length < count; x++) {
      if (!room.state.isWalkable(x, y)) continue;
      // Ensure surrounded by walkable tiles (creature can actually move)
      const hasWalkableNeighbor =
        room.state.isWalkable(x + 1, y) ||
        room.state.isWalkable(x - 1, y) ||
        room.state.isWalkable(x, y + 1) ||
        room.state.isWalkable(x, y - 1);
      if (!hasWalkableNeighbor) continue;

      // Check separation from all previously chosen tiles
      const farEnough = tiles.every(
        (t) => Math.abs(t.x - x) + Math.abs(t.y - y) >= minSeparation,
      );
      if (!farEnough) continue;

      tiles.push({ x, y });
    }
  }

  return tiles;
}

/** Snapshot positions of all creatures keyed by id. */
function snapshotPositions(room: any): Map<string, { x: number; y: number }> {
  const snap = new Map<string, { x: number; y: number }>();
  room.state.creatures.forEach((c: any) => {
    snap.set(c.id, { x: c.x, y: c.y });
  });
  return snap;
}

/** Count how many creatures moved compared to a previous snapshot. */
function countMoved(room: any, before: Map<string, { x: number; y: number }>): number {
  let moved = 0;
  room.state.creatures.forEach((c: any) => {
    const prev = before.get(c.id);
    if (prev && (prev.x !== c.x || prev.y !== c.y)) {
      moved++;
    }
  });
  return moved;
}

/** Run a single game tick: increment by 1 and call tickCreatureAI. */
function aiTick(room: any): void {
  room.state.tick += 1;
  tickCreatureAI(room.state, room);
}

// ═══════════════════════════════════════════════════════════════════
// BUG — Creature Independent Movement
// Bug: "If one mobile moves, then they all seem to move."
// Creatures should move independently, not in lockstep.
// ═══════════════════════════════════════════════════════════════════

describe("BUG — Creature Independent Movement", () => {
  const SEED = 42;
  const CREATURE_COUNT = 5;

  // ── Independent Movement Timing ──────────────────────────────────

  describe("independent movement timing", () => {
    it("not every creature moves on every AI tick", () => {
      const room = createRoomWithMap(SEED);
      const positions = findSpacedWalkableTiles(room, CREATURE_COUNT);
      expect(positions.length).toBe(CREATURE_COUNT);

      // Place herbivores far apart, well-fed, all idle — no interaction triggers
      positions.forEach((pos, i) => {
        addCreature(room, `herb-${i}`, "herbivore", pos.x, pos.y, {
          hunger: 100, // well-fed, no food-seeking
          currentState: "idle",
          nextMoveTick: room.state.tick + 1 + (i % CREATURE_AI.TICK_INTERVAL),
        });
      });

      // Run a single AI tick
      const before = snapshotPositions(room);
      aiTick(room);
      const moved = countMoved(room, before);

      // With independent timing, not ALL creatures should move on the same tick
      expect(moved).toBeLessThan(CREATURE_COUNT);
    });

    it("each creature eventually moves over enough ticks", () => {
      const room = createRoomWithMap(SEED);
      const positions = findSpacedWalkableTiles(room, CREATURE_COUNT);
      expect(positions.length).toBe(CREATURE_COUNT);

      positions.forEach((pos, i) => {
        addCreature(room, `herb-${i}`, "herbivore", pos.x, pos.y, {
          hunger: 100,
          currentState: "idle",
          nextMoveTick: room.state.tick + 1 + (i % CREATURE_AI.TICK_INTERVAL),
        });
      });

      const initial = snapshotPositions(room);
      const hasMoved = new Set<string>();

      // Over 20 AI ticks, every creature should move at least once
      for (let t = 0; t < 20; t++) {
        const before = snapshotPositions(room);
        aiTick(room);
        room.state.creatures.forEach((c: any) => {
          const prev = initial.get(c.id);
          if (prev && (prev.x !== c.x || prev.y !== c.y)) {
            hasMoved.add(c.id);
          }
        });
      }

      // All creatures should have moved at least once
      expect(hasMoved.size).toBe(CREATURE_COUNT);
    });
  });

  // ── Staggered Movement ───────────────────────────────────────────

  describe("staggered movement", () => {
    it("5 creatures do not all change position on the same tick", () => {
      const room = createRoomWithMap(SEED);
      const positions = findSpacedWalkableTiles(room, CREATURE_COUNT);
      expect(positions.length).toBe(CREATURE_COUNT);

      positions.forEach((pos, i) => {
        addCreature(room, `herb-${i}`, "herbivore", pos.x, pos.y, {
          hunger: 100,
          currentState: "idle",
          nextMoveTick: room.state.tick + 1 + (i % CREATURE_AI.TICK_INTERVAL),
        });
      });

      // Over 10 ticks, check that there's at least one tick where
      // some but not all creatures moved
      let hadPartialMovement = false;

      for (let t = 0; t < 10; t++) {
        const before = snapshotPositions(room);
        aiTick(room);
        const moved = countMoved(room, before);

        if (moved > 0 && moved < CREATURE_COUNT) {
          hadPartialMovement = true;
          break;
        }
      }

      expect(hadPartialMovement).toBe(true);
    });

    it("movement is distributed across ticks, not bunched", () => {
      const room = createRoomWithMap(SEED);
      const positions = findSpacedWalkableTiles(room, CREATURE_COUNT);
      expect(positions.length).toBe(CREATURE_COUNT);

      positions.forEach((pos, i) => {
        addCreature(room, `herb-${i}`, "herbivore", pos.x, pos.y, {
          hunger: 100,
          currentState: "idle",
          nextMoveTick: room.state.tick + 1 + (i % CREATURE_AI.TICK_INTERVAL),
        });
      });

      // Record first-move tick for each creature
      const initial = snapshotPositions(room);
      const firstMoveTick = new Map<string, number>();

      for (let t = 1; t <= 20; t++) {
        const before = snapshotPositions(room);
        aiTick(room);
        room.state.creatures.forEach((c: any) => {
          if (firstMoveTick.has(c.id)) return;
          const prev = initial.get(c.id);
          if (prev && (prev.x !== c.x || prev.y !== c.y)) {
            firstMoveTick.set(c.id, t);
          }
        });
      }

      // All creatures should have moved
      expect(firstMoveTick.size).toBe(CREATURE_COUNT);

      // Their first-move ticks should NOT all be the same
      const ticks = [...firstMoveTick.values()];
      const uniqueTicks = new Set(ticks);
      expect(uniqueTicks.size).toBeGreaterThan(1);
    });
  });

  // ── Per-Creature Movement Cooldown ───────────────────────────────

  describe("per-creature movement cooldown", () => {
    it("a creature does not move on consecutive AI ticks", () => {
      const room = createRoomWithMap(SEED);
      const positions = findSpacedWalkableTiles(room, 1);
      expect(positions.length).toBe(1);

      const creature = addCreature(room, "cooldown-test", "herbivore", positions[0].x, positions[0].y, {
        hunger: 100,
        currentState: "idle",
      });

      // Tick until the creature moves
      let movedOnTick = -1;
      for (let t = 0; t < 20; t++) {
        const prevX = creature.x;
        const prevY = creature.y;
        aiTick(room);
        if (creature.x !== prevX || creature.y !== prevY) {
          movedOnTick = t;
          break;
        }
      }

      expect(movedOnTick).toBeGreaterThanOrEqual(0);

      // On the very next AI tick, the creature should NOT move (cooldown)
      const afterMoveX = creature.x;
      const afterMoveY = creature.y;
      aiTick(room);

      expect(creature.x).toBe(afterMoveX);
      expect(creature.y).toBe(afterMoveY);
    });

    it("cooldown is per-creature, not global", () => {
      const room = createRoomWithMap(SEED);
      const positions = findSpacedWalkableTiles(room, 2);
      expect(positions.length).toBe(2);

      const creatureA = addCreature(room, "cd-a", "herbivore", positions[0].x, positions[0].y, {
        hunger: 100,
        currentState: "idle",
        nextMoveTick: room.state.tick + 1,
      });
      const creatureB = addCreature(room, "cd-b", "herbivore", positions[1].x, positions[1].y, {
        hunger: 100,
        currentState: "idle",
        nextMoveTick: room.state.tick + 2,
      });

      // Over 20 ticks, track per-creature movement ticks
      const moveTicks: { a: number[]; b: number[] } = { a: [], b: [] };

      for (let t = 0; t < 20; t++) {
        const prevAx = creatureA.x, prevAy = creatureA.y;
        const prevBx = creatureB.x, prevBy = creatureB.y;
        aiTick(room);
        if (creatureA.x !== prevAx || creatureA.y !== prevAy) moveTicks.a.push(t);
        if (creatureB.x !== prevBx || creatureB.y !== prevBy) moveTicks.b.push(t);
      }

      // Both should have moved at some point
      expect(moveTicks.a.length).toBeGreaterThan(0);
      expect(moveTicks.b.length).toBeGreaterThan(0);

      // Their movement tick sets should NOT be identical (different cooldown phases)
      const aSet = new Set(moveTicks.a);
      const bSet = new Set(moveTicks.b);
      const identical = moveTicks.a.length === moveTicks.b.length &&
        moveTicks.a.every((t) => bSet.has(t));
      expect(identical).toBe(false);
    });
  });

  // ── Uncorrelated Movement ────────────────────────────────────────

  describe("uncorrelated movement", () => {
    it("one creature moving does not force others to move", () => {
      const room = createRoomWithMap(SEED);
      const positions = findSpacedWalkableTiles(room, 3, 12);
      expect(positions.length).toBe(3);

      const creatures = positions.map((pos, i) =>
        addCreature(room, `uncorr-${i}`, "herbivore", pos.x, pos.y, {
          hunger: 100,
          currentState: "idle",
          nextMoveTick: room.state.tick + 1 + (i % CREATURE_AI.TICK_INTERVAL),
        }),
      );

      // Over 10 ticks, find at least one tick where exactly 1 creature moved
      let hadSingleMovement = false;

      for (let t = 0; t < 10; t++) {
        const before = snapshotPositions(room);
        aiTick(room);
        const moved = countMoved(room, before);
        if (moved === 1) {
          hadSingleMovement = true;
          break;
        }
      }

      // If creatures are truly independent, we should see ticks where
      // only 1 of 3 moves (not all-or-nothing)
      expect(hadSingleMovement).toBe(true);
    });

    it("creatures maintain independent schedules over many ticks", () => {
      const room = createRoomWithMap(SEED);
      const positions = findSpacedWalkableTiles(room, CREATURE_COUNT);
      expect(positions.length).toBe(CREATURE_COUNT);

      positions.forEach((pos, i) => {
        addCreature(room, `sched-${i}`, "herbivore", pos.x, pos.y, {
          hunger: 100,
          currentState: "idle",
          nextMoveTick: room.state.tick + 1 + (i % CREATURE_AI.TICK_INTERVAL),
        });
      });

      // Over 30 ticks, record movement count per tick
      const movesPerTick: number[] = [];

      for (let t = 0; t < 30; t++) {
        const before = snapshotPositions(room);
        aiTick(room);
        movesPerTick.push(countMoved(room, before));
      }

      // Movement should NOT be perfectly correlated (all 0 or all N every tick)
      const nonZeroTicks = movesPerTick.filter((m) => m > 0);
      expect(nonZeroTicks.length).toBeGreaterThan(0);

      // At least some non-zero ticks should have FEWER than all creatures moving
      const partialTicks = nonZeroTicks.filter((m) => m < CREATURE_COUNT);
      expect(partialTicks.length).toBeGreaterThan(0);
    });
  });
});
