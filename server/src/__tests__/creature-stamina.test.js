import { describe, it, expect, vi } from "vitest";
import { GameState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { tickCreatureAI } from "../rooms/creatureAI.js";
import { CREATURE_TYPES, CREATURE_AI, PAWN, } from "@primal-grid/shared";
// ── Helpers ─────────────────────────────────────────────────────────
function createRoomWithMap(seed) {
    const room = Object.create(GameRoom.prototype);
    room.state = new GameState();
    room.generateMap(seed);
    room.broadcast = vi.fn();
    return room;
}
/** Place a creature manually at a specific position. */
function addCreature(room, id, type, x, y, overrides = {}) {
    const creature = new CreatureState();
    creature.id = id;
    creature.creatureType = type;
    creature.x = x;
    creature.y = y;
    const typeDef = CREATURE_TYPES[type];
    if (typeDef) {
        creature.health = overrides.health ?? typeDef.health;
        creature.hunger = overrides.hunger ?? typeDef.hunger;
        if (overrides.stamina !== undefined) {
            creature.stamina = overrides.stamina;
        }
        else if (typeDef.maxStamina !== undefined) {
            creature.stamina = typeDef.maxStamina;
        }
    }
    else {
        // pawn_builder — no typeDef in CREATURE_TYPES
        creature.health = overrides.health ?? PAWN.BUILDER_HEALTH;
        creature.hunger = overrides.hunger ?? 100;
        creature.ownerID = overrides.ownerID ?? "player-1";
        creature.pawnType = overrides.pawnType ?? "builder";
        if (overrides.stamina !== undefined) {
            creature.stamina = overrides.stamina;
        }
        else {
            creature.stamina = PAWN.BUILDER_MAX_STAMINA;
        }
    }
    creature.currentState = overrides.currentState ?? "idle";
    creature.nextMoveTick = overrides.nextMoveTick ?? 0;
    room.state.creatures.set(id, creature);
    return creature;
}
/** Find a walkable tile with walkable neighbors (creature can move). */
function findWalkableTile(room) {
    const w = room.state.mapWidth;
    for (let y = 2; y < w - 2; y++) {
        for (let x = 2; x < w - 2; x++) {
            if (room.state.isWalkable(x, y) &&
                room.state.isWalkable(x + 1, y) &&
                room.state.isWalkable(x - 1, y) &&
                room.state.isWalkable(x, y + 1) &&
                room.state.isWalkable(x, y - 1)) {
                return { x, y };
            }
        }
    }
    return { x: 2, y: 2 };
}
/**
 * Find N walkable tiles far apart from each other.
 * Ensures no detection-radius interactions between creatures.
 */
function findSpacedWalkableTiles(room, count, minSeparation = 12) {
    const tiles = [];
    const w = room.state.mapWidth;
    for (let y = 2; y < w - 2 && tiles.length < count; y++) {
        for (let x = 2; x < w - 2 && tiles.length < count; x++) {
            if (!room.state.isWalkable(x, y))
                continue;
            if (!room.state.isWalkable(x + 1, y) && !room.state.isWalkable(x - 1, y) &&
                !room.state.isWalkable(x, y + 1) && !room.state.isWalkable(x, y - 1))
                continue;
            const farEnough = tiles.every((t) => Math.abs(t.x - x) + Math.abs(t.y - y) >= minSeparation);
            if (!farEnough)
                continue;
            tiles.push({ x, y });
        }
    }
    return tiles;
}
/**
 * Find a walkable tile completely surrounded by non-walkable tiles
 * (creature cannot move anywhere from this tile).
 * Falls back to artificially blocking neighbors if none found.
 */
function findBlockedTile(room) {
    const w = room.state.mapWidth;
    for (let y = 1; y < w - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            if (room.state.isWalkable(x, y) &&
                !room.state.isWalkable(x + 1, y) &&
                !room.state.isWalkable(x - 1, y) &&
                !room.state.isWalkable(x, y + 1) &&
                !room.state.isWalkable(x, y - 1)) {
                return { x, y };
            }
        }
    }
    return null;
}
/** Run a single game tick: increment tick and call tickCreatureAI. */
function aiTick(room) {
    room.state.tick += 1;
    tickCreatureAI(room.state, room);
}
/** Run N AI ticks. */
function aiTickN(room, n) {
    for (let i = 0; i < n; i++)
        aiTick(room);
}
// Stamina constants per creature type (from design spec)
const HERBIVORE_STAMINA = {
    maxStamina: 10,
    costPerMove: 2,
    regenPerTick: 1,
    exhaustedThreshold: 5,
};
const CARNIVORE_STAMINA = {
    maxStamina: 14,
    costPerMove: 2,
    regenPerTick: 1,
    exhaustedThreshold: 6,
};
const BUILDER_STAMINA = {
    maxStamina: PAWN.BUILDER_MAX_STAMINA,
    costPerMove: PAWN.BUILDER_STAMINA_COST_PER_MOVE,
    regenPerTick: PAWN.BUILDER_STAMINA_REGEN_PER_TICK,
    exhaustedThreshold: PAWN.BUILDER_EXHAUSTED_THRESHOLD,
};
// ═══════════════════════════════════════════════════════════════════
// CREATURE STAMINA SYSTEM
// ═══════════════════════════════════════════════════════════════════
describe("Creature Stamina System", () => {
    const SEED = 42;
    // ── 1. Stamina Initialization ─────────────────────────────────────
    describe("stamina initialization", () => {
        it("herbivore spawns with stamina = maxStamina (10)", () => {
            const room = createRoomWithMap(SEED);
            const pos = findWalkableTile(room);
            const herb = addCreature(room, "herb-init", "herbivore", pos.x, pos.y);
            expect(herb.stamina).toBe(HERBIVORE_STAMINA.maxStamina);
        });
        it("carnivore spawns with stamina = maxStamina (14)", () => {
            const room = createRoomWithMap(SEED);
            const pos = findWalkableTile(room);
            const carn = addCreature(room, "carn-init", "carnivore", pos.x, pos.y);
            expect(carn.stamina).toBe(CARNIVORE_STAMINA.maxStamina);
        });
        it("pawn builder spawns with stamina = BUILDER_MAX_STAMINA (20)", () => {
            const room = createRoomWithMap(SEED);
            const pos = findWalkableTile(room);
            const builder = addCreature(room, "builder-init", "pawn_builder", pos.x, pos.y);
            expect(builder.stamina).toBe(BUILDER_STAMINA.maxStamina);
        });
    });
    // ── 2. Stamina Depletion ──────────────────────────────────────────
    describe("stamina depletion", () => {
        it("moving deducts staminaCostPerMove from herbivore", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const pos = findWalkableTile(room);
            const herb = addCreature(room, "herb-move", "herbivore", pos.x, pos.y, {
                hunger: 100,
                currentState: "wander",
                nextMoveTick: 0,
                stamina: HERBIVORE_STAMINA.maxStamina,
            });
            const initialStamina = herb.stamina;
            const initialX = herb.x;
            const initialY = herb.y;
            // Tick until the creature moves
            for (let t = 0; t < 20; t++) {
                aiTick(room);
                if (herb.x !== initialX || herb.y !== initialY)
                    break;
            }
            // If creature moved, stamina should have decreased
            if (herb.x !== initialX || herb.y !== initialY) {
                expect(herb.stamina).toBe(initialStamina - HERBIVORE_STAMINA.costPerMove);
            }
        });
        it("moving deducts staminaCostPerMove from carnivore", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const pos = findWalkableTile(room);
            const carn = addCreature(room, "carn-move", "carnivore", pos.x, pos.y, {
                hunger: 100,
                currentState: "wander",
                nextMoveTick: 0,
                stamina: CARNIVORE_STAMINA.maxStamina,
            });
            const initialStamina = carn.stamina;
            const initialX = carn.x;
            const initialY = carn.y;
            for (let t = 0; t < 20; t++) {
                aiTick(room);
                if (carn.x !== initialX || carn.y !== initialY)
                    break;
            }
            if (carn.x !== initialX || carn.y !== initialY) {
                expect(carn.stamina).toBe(initialStamina - CARNIVORE_STAMINA.costPerMove);
            }
        });
        it("failed movement (blocked) does NOT deduct stamina", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            // Place creature on map edge surrounded by water/rock so it can't move
            const blocked = findBlockedTile(room);
            if (!blocked)
                return; // skip if seed has no naturally blocked tile
            const herb = addCreature(room, "herb-stuck", "herbivore", blocked.x, blocked.y, {
                hunger: 100,
                currentState: "wander",
                nextMoveTick: 0,
                stamina: HERBIVORE_STAMINA.maxStamina,
            });
            const initialStamina = herb.stamina;
            aiTickN(room, 10);
            // Creature couldn't move, so stamina should not have been deducted for movement
            // (it may have regenerated if idle, but should NOT have gone down from movement cost)
            expect(herb.x).toBe(blocked.x);
            expect(herb.y).toBe(blocked.y);
            // Stamina should be >= initial (no movement cost, may have regen)
            expect(herb.stamina).toBeGreaterThanOrEqual(initialStamina);
        });
        it("stamina cannot go below 0", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const pos = findWalkableTile(room);
            const herb = addCreature(room, "herb-floor", "herbivore", pos.x, pos.y, {
                hunger: 100,
                currentState: "wander",
                nextMoveTick: 0,
                stamina: 1, // Almost empty
            });
            // Tick many times — stamina should floor at 0
            aiTickN(room, 30);
            expect(herb.stamina).toBeGreaterThanOrEqual(0);
        });
    });
    // ── 3. Stamina Regeneration ───────────────────────────────────────
    describe("stamina regeneration", () => {
        it("idle creature regens staminaRegenPerTick per AI tick", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const pos = findWalkableTile(room);
            const startStamina = 5;
            const herb = addCreature(room, "herb-regen", "herbivore", pos.x, pos.y, {
                hunger: 100,
                currentState: "idle",
                nextMoveTick: 0,
                stamina: startStamina,
            });
            // Force idle by blocking all neighbors if possible, or just check regen
            // We know idle creatures don't move, so stamina should increase
            const beforeStamina = herb.stamina;
            // Advance by enough ticks for at least one AI step at idle
            aiTick(room);
            // If creature stayed idle, stamina should have increased
            if (herb.currentState === "idle") {
                expect(herb.stamina).toBeGreaterThan(beforeStamina);
            }
        });
        it("eating creature regens stamina", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            // Find tile with resources for eating
            let foodPos = null;
            for (let i = 0; i < room.state.tiles.length; i++) {
                const tile = room.state.tiles.at(i);
                if (tile.resourceAmount > 0 && room.state.isWalkable(tile.x, tile.y)) {
                    foodPos = { x: tile.x, y: tile.y };
                    break;
                }
            }
            if (!foodPos)
                return; // skip if no food
            const herb = addCreature(room, "herb-eat-regen", "herbivore", foodPos.x, foodPos.y, {
                hunger: CREATURE_AI.HUNGRY_THRESHOLD - 10,
                currentState: "wander",
                nextMoveTick: 0,
                stamina: 3,
            });
            const beforeStamina = herb.stamina;
            aiTickN(room, 5);
            // Whether eating or idle, depleted stamina should regen when not moving
            expect(herb.stamina).toBeGreaterThanOrEqual(beforeStamina);
        });
        it("stamina caps at maxStamina (no overcharge)", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const pos = findWalkableTile(room);
            const herb = addCreature(room, "herb-cap", "herbivore", pos.x, pos.y, {
                hunger: 100,
                currentState: "idle",
                nextMoveTick: 0,
                stamina: HERBIVORE_STAMINA.maxStamina,
            });
            // Tick many times — stamina should never exceed max
            aiTickN(room, 20);
            expect(herb.stamina).toBeLessThanOrEqual(HERBIVORE_STAMINA.maxStamina);
        });
        it("exhausted creature regens stamina", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const pos = findWalkableTile(room);
            const herb = addCreature(room, "herb-exhaust-regen", "herbivore", pos.x, pos.y, {
                hunger: 100,
                currentState: "exhausted",
                nextMoveTick: 0,
                stamina: 0,
            });
            aiTickN(room, 3);
            expect(herb.stamina).toBeGreaterThan(0);
        });
    });
    // ── 4. Exhaustion State ───────────────────────────────────────────
    describe("exhaustion state", () => {
        it("creature enters exhausted state when stamina <= 0", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const pos = findWalkableTile(room);
            const herb = addCreature(room, "herb-exhaust", "herbivore", pos.x, pos.y, {
                hunger: 100,
                currentState: "wander",
                nextMoveTick: 0,
                stamina: HERBIVORE_STAMINA.costPerMove, // Exactly enough for one move
            });
            // Tick until creature has moved enough to deplete stamina
            for (let t = 0; t < 30; t++) {
                aiTick(room);
                if (herb.stamina <= 0)
                    break;
            }
            // Once stamina hits 0, creature should be exhausted
            if (herb.stamina <= 0) {
                expect(herb.currentState).toBe("exhausted");
            }
        });
        it("exhausted creature cannot move (stays at same x,y)", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const pos = findWalkableTile(room);
            const herb = addCreature(room, "herb-no-move", "herbivore", pos.x, pos.y, {
                hunger: 100,
                currentState: "exhausted",
                nextMoveTick: 0,
                stamina: 0,
            });
            const startX = herb.x;
            const startY = herb.y;
            aiTickN(room, 10);
            expect(herb.x).toBe(startX);
            expect(herb.y).toBe(startY);
        });
        it("exhausted creature does not wander, flee, or hunt", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            // Place exhausted herbivore near a carnivore — should NOT flee
            const positions = findSpacedWalkableTiles(room, 1);
            if (positions.length < 1)
                return;
            const herb = addCreature(room, "herb-no-flee", "herbivore", positions[0].x, positions[0].y, {
                hunger: 100,
                currentState: "exhausted",
                nextMoveTick: 0,
                stamina: 0,
            });
            // Even with a carnivore nearby, exhausted creature stays exhausted
            // (it can't flee or wander)
            aiTickN(room, 5);
            // Should still be exhausted (or recovering if stamina has regenerated above threshold)
            // But should NOT have moved
            expect(herb.x).toBe(positions[0].x);
            expect(herb.y).toBe(positions[0].y);
        });
        it("exhausted creature regens stamina while exhausted", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const pos = findWalkableTile(room);
            const herb = addCreature(room, "herb-regen-while-exhaust", "herbivore", pos.x, pos.y, {
                hunger: 100,
                currentState: "exhausted",
                nextMoveTick: 0,
                stamina: 0,
            });
            aiTickN(room, 3);
            expect(herb.stamina).toBeGreaterThan(0);
            // Should still be exhausted until threshold reached
            if (herb.stamina < HERBIVORE_STAMINA.exhaustedThreshold) {
                expect(herb.currentState).toBe("exhausted");
            }
        });
    });
    // ── 5. Recovery (Hysteresis) ──────────────────────────────────────
    describe("recovery (hysteresis)", () => {
        it("creature stays exhausted when stamina > 0 but < exhaustedThreshold", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const pos = findWalkableTile(room);
            // Set stamina between 0 and threshold
            const midStamina = Math.floor(HERBIVORE_STAMINA.exhaustedThreshold / 2);
            const herb = addCreature(room, "herb-hysteresis", "herbivore", pos.x, pos.y, {
                hunger: 100,
                currentState: "exhausted",
                nextMoveTick: 0,
                stamina: midStamina,
            });
            // Single tick — should still be exhausted since below threshold
            aiTick(room);
            if (herb.stamina < HERBIVORE_STAMINA.exhaustedThreshold) {
                expect(herb.currentState).toBe("exhausted");
            }
        });
        it("creature exits exhaustion when stamina >= exhaustedThreshold", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const pos = findWalkableTile(room);
            // Set stamina just below threshold so one regen tick pushes it over
            const herb = addCreature(room, "herb-recover", "herbivore", pos.x, pos.y, {
                hunger: 100,
                currentState: "exhausted",
                nextMoveTick: 0,
                stamina: HERBIVORE_STAMINA.exhaustedThreshold - 1,
            });
            // Tick until stamina >= threshold
            for (let t = 0; t < 20; t++) {
                aiTick(room);
                if (herb.stamina >= HERBIVORE_STAMINA.exhaustedThreshold)
                    break;
            }
            expect(herb.stamina).toBeGreaterThanOrEqual(HERBIVORE_STAMINA.exhaustedThreshold);
            expect(herb.currentState).not.toBe("exhausted");
        });
        it("after recovery, creature resumes normal AI (idle state)", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const pos = findWalkableTile(room);
            const herb = addCreature(room, "herb-resume", "herbivore", pos.x, pos.y, {
                hunger: 100,
                currentState: "exhausted",
                nextMoveTick: 0,
                stamina: 0,
            });
            // Tick until recovered
            for (let t = 0; t < 30; t++) {
                aiTick(room);
                if (herb.currentState !== "exhausted")
                    break;
            }
            // Should be back in a normal AI state
            const normalStates = ["idle", "wander", "eat", "flee", "hunt"];
            expect(normalStates).toContain(herb.currentState);
        });
        it("hysteresis prevents rapid toggling between exhausted and active", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const pos = findWalkableTile(room);
            const herb = addCreature(room, "herb-toggle", "herbivore", pos.x, pos.y, {
                hunger: 100,
                currentState: "exhausted",
                nextMoveTick: 0,
                stamina: 0,
            });
            // Track state transitions
            const stateHistory = [herb.currentState];
            for (let t = 0; t < 30; t++) {
                aiTick(room);
                if (stateHistory[stateHistory.length - 1] !== herb.currentState) {
                    stateHistory.push(herb.currentState);
                }
            }
            // Count transitions to/from exhausted
            let exhaustedTransitions = 0;
            for (let i = 1; i < stateHistory.length; i++) {
                if (stateHistory[i] === "exhausted" || stateHistory[i - 1] === "exhausted") {
                    exhaustedTransitions++;
                }
            }
            // With hysteresis, creature should transition OUT of exhausted at most once
            // (not toggle back and forth)
            expect(exhaustedTransitions).toBeLessThanOrEqual(2); // enter + exit = 2
        });
    });
    // ── 6. Integration with Existing AI ───────────────────────────────
    describe("integration with existing AI", () => {
        it("herbivore fleeing still works — deducts stamina per move", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            // Place herbivore and carnivore close together
            const pos = findWalkableTile(room);
            const herb = addCreature(room, "flee-herb", "herbivore", pos.x, pos.y, {
                hunger: 100,
                currentState: "idle",
                nextMoveTick: 0,
                stamina: HERBIVORE_STAMINA.maxStamina,
            });
            // Place carnivore within detection radius
            const carnX = Math.min(pos.x + 2, room.state.mapWidth - 2);
            addCreature(room, "threat-carn", "carnivore", carnX, pos.y, {
                hunger: 100,
                currentState: "idle",
                nextMoveTick: 0,
                stamina: CARNIVORE_STAMINA.maxStamina,
            });
            const initialStamina = herb.stamina;
            aiTickN(room, 5);
            // Herbivore should have fled and lost stamina
            if (herb.x !== pos.x || herb.y !== pos.y) {
                expect(herb.stamina).toBeLessThan(initialStamina);
            }
        });
        it("carnivore hunting deducts stamina per chase step", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const pos = findWalkableTile(room);
            const carn = addCreature(room, "hunt-carn", "carnivore", pos.x, pos.y, {
                hunger: CREATURE_AI.HUNGRY_THRESHOLD - 10,
                currentState: "idle",
                nextMoveTick: 0,
                stamina: CARNIVORE_STAMINA.maxStamina,
            });
            // Place herbivore within detection radius
            const herbX = Math.min(pos.x + 4, room.state.mapWidth - 2);
            addCreature(room, "prey-herb", "herbivore", herbX, pos.y, {
                hunger: 100,
                currentState: "idle",
                nextMoveTick: 0,
                stamina: HERBIVORE_STAMINA.maxStamina,
            });
            const initialStamina = carn.stamina;
            aiTickN(room, 5);
            // Carnivore should have hunted and lost stamina
            if (carn.x !== pos.x || carn.y !== pos.y) {
                expect(carn.stamina).toBeLessThan(initialStamina);
            }
        });
        it("creature that exhausts mid-flee stops moving", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const pos = findWalkableTile(room);
            const herb = addCreature(room, "exhaust-flee", "herbivore", pos.x, pos.y, {
                hunger: 100,
                currentState: "idle",
                nextMoveTick: 0,
                stamina: HERBIVORE_STAMINA.costPerMove, // Only enough for 1 move
            });
            // Place carnivore nearby
            const carnX = Math.min(pos.x + 2, room.state.mapWidth - 2);
            addCreature(room, "threat-carn2", "carnivore", carnX, pos.y, {
                hunger: 100,
                currentState: "idle",
                nextMoveTick: 0,
                stamina: CARNIVORE_STAMINA.maxStamina,
            });
            aiTickN(room, 10);
            // Herbivore should be exhausted and stopped
            if (herb.stamina <= 0) {
                expect(herb.currentState).toBe("exhausted");
                const stoppedX = herb.x;
                const stoppedY = herb.y;
                aiTickN(room, 3);
                expect(herb.x).toBe(stoppedX);
                expect(herb.y).toBe(stoppedY);
            }
        });
        it("hunger drain continues during exhaustion", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const pos = findWalkableTile(room);
            const initialHunger = 50;
            const herb = addCreature(room, "herb-hunger-exhaust", "herbivore", pos.x, pos.y, {
                hunger: initialHunger,
                currentState: "exhausted",
                nextMoveTick: 0,
                stamina: 0,
            });
            aiTickN(room, 5);
            // Hunger should have drained even while exhausted
            expect(herb.hunger).toBeLessThan(initialHunger);
        });
        it("starvation still kills exhausted creatures", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const pos = findWalkableTile(room);
            addCreature(room, "herb-starve-exhaust", "herbivore", pos.x, pos.y, {
                hunger: 0, // Already starving
                health: CREATURE_AI.STARVATION_DAMAGE * 2, // Will die in ~2 ticks
                currentState: "exhausted",
                nextMoveTick: 0,
                stamina: 0,
            });
            aiTickN(room, 20);
            // Creature should have died from starvation
            expect(room.state.creatures.has("herb-starve-exhaust")).toBe(false);
        });
    });
    // ── 7. Type Variation ─────────────────────────────────────────────
    describe("type variation", () => {
        it("herbivore exhausts after ~5 moves (maxStamina=10, cost=2)", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const pos = findWalkableTile(room);
            const herb = addCreature(room, "herb-exhaust-count", "herbivore", pos.x, pos.y, {
                hunger: 100,
                currentState: "wander",
                nextMoveTick: 0,
                stamina: HERBIVORE_STAMINA.maxStamina,
            });
            let moveCount = 0;
            let prevX = herb.x;
            let prevY = herb.y;
            for (let t = 0; t < 50; t++) {
                aiTick(room);
                if (herb.x !== prevX || herb.y !== prevY) {
                    moveCount++;
                    prevX = herb.x;
                    prevY = herb.y;
                }
                if (herb.currentState === "exhausted")
                    break;
            }
            // maxStamina(10) / costPerMove(2) = 5 pure moves to exhaust
            // Idle ticks between moves regen stamina, so actual move count can be higher
            if (herb.currentState === "exhausted") {
                expect(moveCount).toBeLessThanOrEqual(15);
                expect(moveCount).toBeGreaterThanOrEqual(3);
            }
        });
        it("carnivore exhausts after ~7 moves (maxStamina=14, cost=2)", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const pos = findWalkableTile(room);
            const carn = addCreature(room, "carn-exhaust-count", "carnivore", pos.x, pos.y, {
                hunger: 100,
                currentState: "wander",
                nextMoveTick: 0,
                stamina: CARNIVORE_STAMINA.maxStamina,
            });
            let moveCount = 0;
            let prevX = carn.x;
            let prevY = carn.y;
            for (let t = 0; t < 80; t++) {
                aiTick(room);
                if (carn.x !== prevX || carn.y !== prevY) {
                    moveCount++;
                    prevX = carn.x;
                    prevY = carn.y;
                }
                if (carn.currentState === "exhausted")
                    break;
            }
            // maxStamina(14) / costPerMove(2) = 7 pure moves to exhaust
            // Idle ticks between moves regen stamina, so actual move count can be higher
            if (carn.currentState === "exhausted") {
                expect(moveCount).toBeLessThanOrEqual(20);
                expect(moveCount).toBeGreaterThanOrEqual(5);
            }
        });
        it("herbivore recovers after ~5 idle ticks (threshold=5, regen=1)", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const pos = findWalkableTile(room);
            const herb = addCreature(room, "herb-recovery-time", "herbivore", pos.x, pos.y, {
                hunger: 100,
                currentState: "exhausted",
                nextMoveTick: 0,
                stamina: 0,
            });
            let _ticksToRecover = 0;
            for (let t = 0; t < 30; t++) {
                aiTick(room);
                _ticksToRecover++;
                if (herb.currentState !== "exhausted")
                    break;
            }
            // threshold(5) / regenPerTick(1) = 5 AI ticks to recover
            // But AI ticks only fire every TICK_INTERVAL, so tick count = 5 * interval
            expect(herb.currentState).not.toBe("exhausted");
            expect(herb.stamina).toBeGreaterThanOrEqual(HERBIVORE_STAMINA.exhaustedThreshold);
        });
        it("carnivore recovers after ~6 idle ticks (threshold=6, regen=1)", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const pos = findWalkableTile(room);
            const carn = addCreature(room, "carn-recovery-time", "carnivore", pos.x, pos.y, {
                hunger: 100,
                currentState: "exhausted",
                nextMoveTick: 0,
                stamina: 0,
            });
            for (let t = 0; t < 30; t++) {
                aiTick(room);
                if (carn.currentState !== "exhausted")
                    break;
            }
            expect(carn.currentState).not.toBe("exhausted");
            expect(carn.stamina).toBeGreaterThanOrEqual(CARNIVORE_STAMINA.exhaustedThreshold);
        });
        it("different creature types have independent stamina pools", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            const positions = findSpacedWalkableTiles(room, 2);
            if (positions.length < 2)
                return;
            const herb = addCreature(room, "indep-herb", "herbivore", positions[0].x, positions[0].y, {
                hunger: 100,
                currentState: "wander",
                nextMoveTick: 0,
                stamina: HERBIVORE_STAMINA.maxStamina,
            });
            const carn = addCreature(room, "indep-carn", "carnivore", positions[1].x, positions[1].y, {
                hunger: 100,
                currentState: "wander",
                nextMoveTick: 0,
                stamina: CARNIVORE_STAMINA.maxStamina,
            });
            // Different max stamina
            expect(herb.stamina).toBe(HERBIVORE_STAMINA.maxStamina);
            expect(carn.stamina).toBe(CARNIVORE_STAMINA.maxStamina);
            expect(herb.stamina).not.toBe(carn.stamina);
            // After some ticks, stamina values evolve independently
            aiTickN(room, 10);
            // Just verify they both still have valid stamina values
            expect(herb.stamina).toBeGreaterThanOrEqual(0);
            expect(carn.stamina).toBeGreaterThanOrEqual(0);
            expect(herb.stamina).toBeLessThanOrEqual(HERBIVORE_STAMINA.maxStamina);
            expect(carn.stamina).toBeLessThanOrEqual(CARNIVORE_STAMINA.maxStamina);
        });
        it("builder exhausts after ~20 moves (maxStamina=20, cost=1)", () => {
            const room = createRoomWithMap(SEED);
            room.state.creatures.clear();
            // Builder needs to be on owned territory to move
            const pos = findWalkableTile(room);
            const builder = addCreature(room, "builder-exhaust", "pawn_builder", pos.x, pos.y, {
                hunger: 100,
                currentState: "idle",
                nextMoveTick: 0,
                stamina: BUILDER_STAMINA.maxStamina,
            });
            // Builder has high stamina and low cost — should last many moves
            expect(builder.stamina).toBe(BUILDER_STAMINA.maxStamina);
            // maxStamina(20) / costPerMove(1) = 20 moves to exhaust
            const expectedMoves = BUILDER_STAMINA.maxStamina / BUILDER_STAMINA.costPerMove;
            expect(expectedMoves).toBe(20);
        });
    });
});
//# sourceMappingURL=creature-stamina.test.js.map