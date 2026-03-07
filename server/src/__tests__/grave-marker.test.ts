/**
 * Grave Marker System Tests
 *
 * Tests for grave marker spawning, properties, decay, and inertness.
 * Validates that dead creatures leave behind inert markers that decay over time,
 * and that grave markers are fully ignored by combat resolution and AI.
 *
 * Conventions:
 *   - Object.create(GameRoom.prototype) for room mocking
 *   - Tick ≥ ATTACK_COOLDOWN_TICKS for creature combat
 *   - Manhattan distance for all adjacency checks
 */

import { describe, it, expect } from "vitest";
import { GameState, CreatureState, PlayerState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { tickCombat } from "../rooms/combat.js";
import { tickGraveDecay } from "../rooms/graveDecay.js";
import type { EnemyBaseTracker } from "../rooms/enemyBaseAI.js";
import type { AttackerTracker } from "../rooms/attackerAI.js";
import {
  ENEMY_BASE_TYPES, ENEMY_MOBILE_TYPES, PAWN_TYPES,
  COMBAT, GRAVE_MARKER,
  isGraveMarker,
} from "@primal-grid/shared";
import { spawnHQ } from "../rooms/territory.js";

/** Expose private GameRoom members for testing. */
type TestableGameRoom = GameRoom & {
  generateMap(seed?: number): void;
  nextCreatureId: number;
  creatureIdCounter: { value: number };
  enemyBaseState: Map<string, EnemyBaseTracker>;
  attackerState: Map<string, AttackerTracker>;
};

// ── Helpers ─────────────────────────────────────────────────────────

const FIRST_COMBAT_TICK =
  Math.ceil(COMBAT.ATTACK_COOLDOWN_TICKS / COMBAT.COMBAT_TICK_INTERVAL) *
  COMBAT.COMBAT_TICK_INTERVAL;

const idCounter = { value: 50000 };

function createRoom(seed: number = 42): TestableGameRoom {
  const room = Object.create(GameRoom.prototype) as TestableGameRoom;
  room.state = new GameState();
  room.generateMap(seed);
  room.broadcast = (() => {}) as unknown as GameRoom['broadcast'];
  room.nextCreatureId = 0;
  room.creatureIdCounter = { value: 0 };
  room.enemyBaseState = new Map();
  room.attackerState = new Map();
  return room;
}

function joinPlayer(room: GameRoom, sessionId: string): PlayerState {
  const player = new PlayerState();
  player.id = sessionId;
  room.state.players.set(sessionId, player);
  const w = room.state.mapWidth;
  for (let y = 4; y < w - 4; y++) {
    for (let x = 4; x < w - 4; x++) {
      if (room.state.isWalkable(x, y)) {
        spawnHQ(room.state, player, x, y);
        return player;
      }
    }
  }
  spawnHQ(room.state, player, 5, 5);
  return player;
}

function addDefender(
  room: GameRoom,
  id: string,
  ownerID: string,
  x: number,
  y: number,
  overrides: Partial<{ health: number; currentState: string; stamina: number }> = {},
): CreatureState {
  const pawnDef = PAWN_TYPES["defender"];
  const creature = new CreatureState();
  creature.id = id;
  creature.creatureType = "pawn_defender";
  creature.x = x;
  creature.y = y;
  creature.health = overrides.health ?? pawnDef.health;
  creature.hunger = 100;
  creature.currentState = overrides.currentState ?? "idle";
  creature.ownerID = ownerID;
  creature.pawnType = "defender";
  creature.targetX = -1;
  creature.targetY = -1;
  creature.stamina = overrides.stamina ?? pawnDef.maxStamina;
  creature.nextMoveTick = 0;
  room.state.creatures.set(id, creature);
  return creature;
}

function addAttacker(
  room: GameRoom,
  id: string,
  ownerID: string,
  x: number,
  y: number,
  overrides: Partial<{ health: number; currentState: string; stamina: number }> = {},
): CreatureState {
  const pawnDef = PAWN_TYPES["attacker"];
  const creature = new CreatureState();
  creature.id = id;
  creature.creatureType = "pawn_attacker";
  creature.x = x;
  creature.y = y;
  creature.health = overrides.health ?? pawnDef.health;
  creature.hunger = 100;
  creature.currentState = overrides.currentState ?? "idle";
  creature.ownerID = ownerID;
  creature.pawnType = "attacker";
  creature.targetX = -1;
  creature.targetY = -1;
  creature.stamina = overrides.stamina ?? pawnDef.maxStamina;
  creature.nextMoveTick = 0;
  room.state.creatures.set(id, creature);
  return creature;
}

function addEnemyMobile(
  room: GameRoom,
  id: string,
  mobileType: string,
  x: number,
  y: number,
  overrides: Partial<{ currentState: string; targetX: number; targetY: number; health: number }> = {},
): CreatureState {
  const mobileDef = ENEMY_MOBILE_TYPES[mobileType];
  const creature = new CreatureState();
  creature.id = id;
  creature.creatureType = mobileType;
  creature.x = x;
  creature.y = y;
  creature.health = overrides.health ?? mobileDef?.health ?? 40;
  creature.hunger = 100;
  creature.currentState = overrides.currentState ?? "seek_territory";
  creature.ownerID = "";
  creature.pawnType = "";
  creature.targetX = overrides.targetX ?? -1;
  creature.targetY = overrides.targetY ?? -1;
  creature.stamina = 0;
  creature.nextMoveTick = 0;
  room.state.creatures.set(id, creature);
  return creature;
}

function addEnemyBase(
  room: GameRoom,
  id: string,
  baseType: string,
  x: number,
  y: number,
): CreatureState {
  const baseDef = ENEMY_BASE_TYPES[baseType];
  const creature = new CreatureState();
  creature.id = id;
  creature.creatureType = baseType;
  creature.x = x;
  creature.y = y;
  creature.health = baseDef?.health ?? 200;
  creature.hunger = 100;
  creature.currentState = "active";
  creature.ownerID = "";
  creature.pawnType = "";
  creature.targetX = -1;
  creature.targetY = -1;
  creature.stamina = 0;
  creature.nextMoveTick = 0;
  room.state.creatures.set(id, creature);
  return creature;
}

function addGraveMarker(
  room: GameRoom,
  id: string,
  originalType: string,
  x: number,
  y: number,
  spawnTick: number,
): CreatureState {
  const grave = new CreatureState();
  grave.id = id;
  grave.creatureType = "grave_marker";
  grave.pawnType = originalType;
  grave.x = x;
  grave.y = y;
  grave.health = 1;
  grave.spawnTick = spawnTick;
  grave.nextMoveTick = Number.MAX_SAFE_INTEGER;
  grave.currentState = "idle";
  room.state.creatures.set(id, grave);
  return grave;
}

function runCombat(room: GameRoom, ebState: Map<string, EnemyBaseTracker>, counter = idCounter) {
  tickCombat(room.state, room, ebState, counter, (room as TestableGameRoom).attackerState);
}

/** Collect all grave markers currently in state. */
function findGraveMarkers(state: GameState): CreatureState[] {
  const markers: CreatureState[] = [];
  state.creatures.forEach((c) => {
    if (isGraveMarker(c.creatureType)) markers.push(c);
  });
  return markers;
}

// ═══════════════════════════════════════════════════════════════════════
// Grave Markers — Spawning on Death
// ═══════════════════════════════════════════════════════════════════════

describe("Grave Markers — Spawning on Death", () => {
  it("spawns a grave marker when an enemy mobile dies in combat", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const pair = findAdjacentWalkable(room);

    addDefender(room, "def1", "p1", pair.ax, pair.ay);
    addEnemyMobile(room, "mob1", "enemy_raider", pair.bx, pair.by, { health: 1 });

    room.state.tick = FIRST_COMBAT_TICK;
    runCombat(room, new Map());

    expect(room.state.creatures.has("mob1")).toBe(false);
    const graves = findGraveMarkers(room.state);
    expect(graves.length).toBeGreaterThanOrEqual(1);
    const grave = graves.find((g) => g.x === pair.bx && g.y === pair.by);
    expect(grave).toBeDefined();
  });

  it("spawns a grave marker when a player pawn dies in combat", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const pair = findAdjacentWalkable(room);

    addDefender(room, "def1", "p1", pair.ax, pair.ay, { health: 1 });
    addEnemyMobile(room, "mob1", "enemy_raider", pair.bx, pair.by);

    room.state.tick = FIRST_COMBAT_TICK;
    runCombat(room, new Map());

    expect(room.state.creatures.has("def1")).toBe(false);
    const graves = findGraveMarkers(room.state);
    const defenderGrave = graves.find((g) => g.x === pair.ax && g.y === pair.ay);
    expect(defenderGrave).toBeDefined();
  });

  it("spawns grave markers for BOTH combatants when both die simultaneously", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const pair = findAdjacentWalkable(room);

    addDefender(room, "def1", "p1", pair.ax, pair.ay, { health: 1 });
    addEnemyMobile(room, "mob1", "enemy_raider", pair.bx, pair.by, { health: 1 });

    room.state.tick = FIRST_COMBAT_TICK;
    runCombat(room, new Map());

    expect(room.state.creatures.has("def1")).toBe(false);
    expect(room.state.creatures.has("mob1")).toBe(false);

    const graves = findGraveMarkers(room.state);
    expect(graves.length).toBe(2);
    expect(graves.some((g) => g.x === pair.ax && g.y === pair.ay)).toBe(true);
    expect(graves.some((g) => g.x === pair.bx && g.y === pair.by)).toBe(true);
  });

  it("does NOT spawn a grave marker when an enemy base is destroyed", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const pair = findAdjacentWalkable(room);

    addEnemyBase(room, "base1", "enemy_base_raider", pair.bx, pair.by);
    const base = room.state.creatures.get("base1")!;
    base.health = 1;

    addAttacker(room, "atk1", "p1", pair.ax, pair.ay);

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    ebState.set("base1", { spawnedMobileIds: new Set<string>() } as EnemyBaseTracker);
    runCombat(room, ebState);

    expect(room.state.creatures.has("base1")).toBe(false);
    const graves = findGraveMarkers(room.state);
    const baseGrave = graves.find((g) => g.x === pair.bx && g.y === pair.by);
    expect(baseGrave).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Grave Markers — Properties
// ═══════════════════════════════════════════════════════════════════════

describe("Grave Markers — Properties", () => {
  it("has creatureType='grave_marker'", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const pair = findAdjacentWalkable(room);

    addDefender(room, "def1", "p1", pair.ax, pair.ay);
    addEnemyMobile(room, "mob1", "enemy_raider", pair.bx, pair.by, { health: 1 });

    room.state.tick = FIRST_COMBAT_TICK;
    runCombat(room, new Map());

    const graves = findGraveMarkers(room.state);
    const grave = graves.find((g) => g.x === pair.bx && g.y === pair.by);
    expect(grave?.creatureType).toBe("grave_marker");
  });

  it("stores original creature type in pawnType field", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const pair = findAdjacentWalkable(room);

    addDefender(room, "def1", "p1", pair.ax, pair.ay);
    addEnemyMobile(room, "mob1", "enemy_raider", pair.bx, pair.by, { health: 1 });

    room.state.tick = FIRST_COMBAT_TICK;
    runCombat(room, new Map());

    const graves = findGraveMarkers(room.state);
    const mobGrave = graves.find((g) => g.x === pair.bx && g.y === pair.by);
    expect(mobGrave?.pawnType).toBe("enemy_raider");
  });

  it("stores player pawn's creatureType in pawnType when pawn dies", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const pair = findAdjacentWalkable(room);

    addDefender(room, "def1", "p1", pair.ax, pair.ay, { health: 1 });
    addEnemyMobile(room, "mob1", "enemy_raider", pair.bx, pair.by);

    room.state.tick = FIRST_COMBAT_TICK;
    runCombat(room, new Map());

    const graves = findGraveMarkers(room.state);
    const defGrave = graves.find((g) => g.x === pair.ax && g.y === pair.ay);
    expect(defGrave?.pawnType).toBe("pawn_defender");
  });

  it("has health = 1", () => {
    const room = createRoom();
    const pair = findAdjacentWalkable(room);
    const grave = addGraveMarker(room, "g1", "enemy_raider", pair.ax, pair.ay, 0);
    expect(grave.health).toBe(1);
  });

  it("has nextMoveTick = Number.MAX_SAFE_INTEGER (immobile)", () => {
    const room = createRoom();
    const pair = findAdjacentWalkable(room);
    const grave = addGraveMarker(room, "g1", "enemy_raider", pair.ax, pair.ay, 0);
    expect(grave.nextMoveTick).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("has spawnTick = current tick when spawned via combat death", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const pair = findAdjacentWalkable(room);

    addDefender(room, "def1", "p1", pair.ax, pair.ay);
    addEnemyMobile(room, "mob1", "enemy_raider", pair.bx, pair.by, { health: 1 });

    const combatTick = FIRST_COMBAT_TICK;
    room.state.tick = combatTick;
    runCombat(room, new Map());

    const graves = findGraveMarkers(room.state);
    const grave = graves.find((g) => g.x === pair.bx && g.y === pair.by);
    expect(grave?.spawnTick).toBe(combatTick);
  });

  it("grave marker position matches death position", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const pair = findAdjacentWalkable(room);

    addDefender(room, "def1", "p1", pair.ax, pair.ay);
    addEnemyMobile(room, "mob1", "enemy_raider", pair.bx, pair.by, { health: 1 });

    room.state.tick = FIRST_COMBAT_TICK;
    runCombat(room, new Map());

    const graves = findGraveMarkers(room.state);
    const grave = graves.find((g) => g.x === pair.bx && g.y === pair.by);
    expect(grave).toBeDefined();
    expect(grave!.x).toBe(pair.bx);
    expect(grave!.y).toBe(pair.by);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Grave Markers — Decay
// ═══════════════════════════════════════════════════════════════════════

describe("Grave Markers — Decay", () => {
  it("persists before GRAVE_MARKER.DECAY_TICKS have elapsed", () => {
    const room = createRoom();
    const spawnTick = 100;
    addGraveMarker(room, "g1", "enemy_raider", 10, 10, spawnTick);

    // One tick before decay
    tickGraveDecay(room.state, spawnTick + GRAVE_MARKER.DECAY_TICKS - 1);

    expect(room.state.creatures.has("g1")).toBe(true);
  });

  it("removed exactly at GRAVE_MARKER.DECAY_TICKS after spawn", () => {
    const room = createRoom();
    const spawnTick = 100;
    addGraveMarker(room, "g1", "enemy_raider", 10, 10, spawnTick);

    tickGraveDecay(room.state, spawnTick + GRAVE_MARKER.DECAY_TICKS);

    expect(room.state.creatures.has("g1")).toBe(false);
  });

  it("removed after DECAY_TICKS have passed (well past expiry)", () => {
    const room = createRoom();
    const spawnTick = 50;
    addGraveMarker(room, "g1", "enemy_raider", 10, 10, spawnTick);

    tickGraveDecay(room.state, spawnTick + GRAVE_MARKER.DECAY_TICKS + 100);

    expect(room.state.creatures.has("g1")).toBe(false);
  });

  it("multiple grave markers decay independently based on their own spawnTick", () => {
    const room = createRoom();
    addGraveMarker(room, "g1", "enemy_raider", 10, 10, 100);
    addGraveMarker(room, "g2", "pawn_defender", 12, 10, 200);
    addGraveMarker(room, "g3", "enemy_swarm", 14, 10, 300);

    // At tick 100 + DECAY_TICKS: only g1 should be removed
    tickGraveDecay(room.state, 100 + GRAVE_MARKER.DECAY_TICKS);
    expect(room.state.creatures.has("g1")).toBe(false);
    expect(room.state.creatures.has("g2")).toBe(true);
    expect(room.state.creatures.has("g3")).toBe(true);

    // At tick 200 + DECAY_TICKS: g2 also removed
    tickGraveDecay(room.state, 200 + GRAVE_MARKER.DECAY_TICKS);
    expect(room.state.creatures.has("g2")).toBe(false);
    expect(room.state.creatures.has("g3")).toBe(true);

    // At tick 300 + DECAY_TICKS: g3 also removed
    tickGraveDecay(room.state, 300 + GRAVE_MARKER.DECAY_TICKS);
    expect(room.state.creatures.has("g3")).toBe(false);
  });

  it("non-grave creatures are NOT removed by tickGraveDecay", () => {
    const room = createRoom();
    addEnemyMobile(room, "mob1", "enemy_raider", 10, 10);
    addGraveMarker(room, "g1", "enemy_raider", 12, 10, 0);

    tickGraveDecay(room.state, GRAVE_MARKER.DECAY_TICKS + 1000);

    expect(room.state.creatures.has("mob1")).toBe(true);
    expect(room.state.creatures.has("g1")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Grave Markers — Inertness (Combat Exclusion)
// ═══════════════════════════════════════════════════════════════════════

describe("Grave Markers — Inertness", () => {
  it("grave markers are skipped during combat Phase 1 (not attacked by enemies)", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const pair = findAdjacentWalkable(room);

    // Place a grave marker adjacent to an enemy mobile
    const grave = addGraveMarker(room, "g1", "pawn_defender", pair.ax, pair.ay, 0);
    addEnemyMobile(room, "mob1", "enemy_raider", pair.bx, pair.by);

    room.state.tick = FIRST_COMBAT_TICK;
    runCombat(room, new Map());

    // Grave marker should still be alive (health=1, untouched)
    expect(room.state.creatures.has("g1")).toBe(true);
    expect(grave.health).toBe(1);
  });

  it("grave markers are skipped during combat Phase 1 (not attacked by player pawns)", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const pair = findAdjacentWalkable(room);

    // Place a grave marker (of enemy type) adjacent to a defender
    const grave = addGraveMarker(room, "g1", "enemy_raider", pair.bx, pair.by, 0);
    addDefender(room, "def1", "p1", pair.ax, pair.ay);

    room.state.tick = FIRST_COMBAT_TICK;
    runCombat(room, new Map());

    // Grave marker should be untouched
    expect(room.state.creatures.has("g1")).toBe(true);
    expect(grave.health).toBe(1);
  });

  it("enemy mobile ignores grave marker and does not target it", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const pair = findAdjacentWalkable(room);

    // Grave marker is the ONLY creature adjacent to the mobile — should not engage
    addGraveMarker(room, "g1", "pawn_defender", pair.ax, pair.ay, 0);
    const mob = addEnemyMobile(room, "mob1", "enemy_raider", pair.bx, pair.by);

    const initialHealth = mob.health;
    room.state.tick = FIRST_COMBAT_TICK;
    runCombat(room, new Map());

    // Mobile should not have taken any damage (no hostile target found)
    expect(mob.health).toBe(initialHealth);
  });

  it("grave marker does not deal damage (getCreatureDamage returns 0)", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const pair = findAdjacentWalkable(room);

    addGraveMarker(room, "g1", "enemy_raider", pair.ax, pair.ay, 0);
    const def = addDefender(room, "def1", "p1", pair.bx, pair.by);

    const initialHealth = def.health;
    room.state.tick = FIRST_COMBAT_TICK;
    runCombat(room, new Map());

    // Defender should not have taken damage from the inert grave marker
    expect(def.health).toBe(initialHealth);
  });

  it("grave markers with isGraveMarker() correctly identified", () => {
    expect(isGraveMarker("grave_marker")).toBe(true);
    expect(isGraveMarker("enemy_raider")).toBe(false);
    expect(isGraveMarker("pawn_defender")).toBe(false);
    expect(isGraveMarker("enemy_base_raider")).toBe(false);
    expect(isGraveMarker("herbivore")).toBe(false);
    expect(isGraveMarker("")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Grave Markers — Integration (Full Lifecycle)
// ═══════════════════════════════════════════════════════════════════════

describe("Grave Markers — Integration", () => {
  it("full lifecycle: combat → death → grave spawn → persist → decay → removal", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const pair = findAdjacentWalkable(room);
    const counter = { value: 90000 };

    // Place a defender that will survive and a raider that will die
    addDefender(room, "def1", "p1", pair.ax, pair.ay);
    addEnemyMobile(room, "mob1", "enemy_raider", pair.bx, pair.by, { health: 1 });

    // Step 1: Combat kills the raider, grave marker spawns
    const combatTick = FIRST_COMBAT_TICK;
    room.state.tick = combatTick;
    runCombat(room, new Map(), counter);

    expect(room.state.creatures.has("mob1")).toBe(false);
    const graves = findGraveMarkers(room.state);
    expect(graves.length).toBeGreaterThanOrEqual(1);
    const grave = graves.find((g) => g.x === pair.bx && g.y === pair.by)!;
    expect(grave).toBeDefined();
    expect(grave.spawnTick).toBe(combatTick);

    // Step 2: Grave marker persists just before decay
    tickGraveDecay(room.state, combatTick + GRAVE_MARKER.DECAY_TICKS - 1);
    expect(room.state.creatures.has(grave.id)).toBe(true);

    // Step 3: Grave marker decays and is removed
    tickGraveDecay(room.state, combatTick + GRAVE_MARKER.DECAY_TICKS);
    expect(room.state.creatures.has(grave.id)).toBe(false);
  });

  it("grave marker from combat does not interfere with subsequent combat", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const pair = findAdjacentWalkable(room);
    const counter = { value: 80000 };

    // Kill a raider → creates grave marker at pair.b
    addDefender(room, "def1", "p1", pair.ax, pair.ay);
    addEnemyMobile(room, "mob1", "enemy_raider", pair.bx, pair.by, { health: 1 });

    room.state.tick = FIRST_COMBAT_TICK;
    runCombat(room, new Map(), counter);

    const graves = findGraveMarkers(room.state);
    expect(graves.length).toBeGreaterThanOrEqual(1);

    // Now place a NEW raider adjacent to the defender (same position as grave)
    addEnemyMobile(room, "mob2", "enemy_raider", pair.bx, pair.by, { health: 1 });

    // Advance tick past cooldown and run combat again
    room.state.tick = FIRST_COMBAT_TICK + COMBAT.ATTACK_COOLDOWN_TICKS * 2;
    // Ensure tick is on a combat interval
    if (room.state.tick % COMBAT.COMBAT_TICK_INTERVAL !== 0) {
      room.state.tick += COMBAT.COMBAT_TICK_INTERVAL - (room.state.tick % COMBAT.COMBAT_TICK_INTERVAL);
    }
    runCombat(room, new Map(), counter);

    // Second raider should also be dead
    expect(room.state.creatures.has("mob2")).toBe(false);

    // Defender should still be alive (took damage from both encounters)
    const def = room.state.creatures.get("def1");
    // The defender took raider damage twice: 15 * 2 = 30, started at 80
    // It should survive if both raiders had 1 HP (instant kill, but simultaneous damage)
    expect(def?.health).toBeDefined();
  });

  it("multiple deaths in same tick produce multiple grave markers", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const counter = { value: 70000 };

    // Find two separate adjacent pairs
    const pair1 = findAdjacentWalkable(room, 4, 4);
    const pair2 = findAdjacentWalkable(room, pair1.ax, pair1.ay + 5);

    addDefender(room, "def1", "p1", pair1.ax, pair1.ay);
    addEnemyMobile(room, "mob1", "enemy_raider", pair1.bx, pair1.by, { health: 1 });

    addDefender(room, "def2", "p1", pair2.ax, pair2.ay);
    addEnemyMobile(room, "mob2", "enemy_raider", pair2.bx, pair2.by, { health: 1 });

    room.state.tick = FIRST_COMBAT_TICK;
    runCombat(room, new Map(), counter);

    const graves = findGraveMarkers(room.state);
    // At minimum 2 graves (one per dead raider); could be more if defenders also die
    expect(graves.length).toBeGreaterThanOrEqual(2);
  });

  it("GRAVE_MARKER.DECAY_TICKS constant is defined and positive", () => {
    expect(GRAVE_MARKER.DECAY_TICKS).toBeDefined();
    expect(GRAVE_MARKER.DECAY_TICKS).toBeGreaterThan(0);
  });
});

// ── Position helpers ────────────────────────────────────────────────

/** Find two adjacent walkable tiles (start search from given coordinates). */
function findAdjacentWalkable(
  room: GameRoom,
  startX = 2,
  startY = 2,
): { ax: number; ay: number; bx: number; by: number } {
  const w = room.state.mapWidth;
  for (let y = startY; y < w - 2; y++) {
    for (let x = (y === startY ? startX : 2); x < w - 2; x++) {
      if (room.state.isWalkable(x, y) && room.state.isWalkable(x + 1, y)) {
        return { ax: x, ay: y, bx: x + 1, by: y };
      }
    }
  }
  return { ax: 2, ay: 2, bx: 3, by: 2 };
}
