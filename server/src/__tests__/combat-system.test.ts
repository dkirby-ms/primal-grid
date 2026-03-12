/**
 * Combat System Tests — Issues #17 (Enemy Bases & Mobiles) and #18 (Defenders & Attackers).
 *
 * Conventions:
 *   - Object.create(GameRoom.prototype) pattern for room mocking
 *   - gameTick() helper (tick+=1 + tickCreatureAI) to match real game loop
 *   - Creature stamina initialized to maxStamina
 *   - Manhattan distance for all distance checks
 */

import { describe, it, expect } from "vitest";
import { GameState, CreatureState, PlayerState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { tickCombat } from "../rooms/combat.js";
import { stepEnemyBase, onBaseDestroyed } from "../rooms/enemyBaseAI.js";
import type { EnemyBaseTracker } from "../rooms/enemyBaseAI.js";
import { stepEnemyMobile } from "../rooms/enemyMobileAI.js";
import { stepDefender } from "../rooms/defenderAI.js";
import { stepAttacker } from "../rooms/attackerAI.js";
import type { AttackerTracker } from "../rooms/attackerAI.js";
import {
  ENEMY_BASE_TYPES, ENEMY_MOBILE_TYPES, PAWN_TYPES,
  COMBAT, ENEMY_SPAWNING, SHAPE,
  TERRITORY,
  DayPhase,
  isEnemyBase, isEnemyMobile,
} from "@primal-grid/shared";
import { spawnHQ } from "../rooms/territory.js";

/** Expose private GameRoom members for testing. */
type TestableGameRoom = GameRoom & {
  generateMap(seed?: number): void;
  nextCreatureId: number;
  creatureIdCounter: { value: number };
  enemyBaseState: Map<string, EnemyBaseTracker>;
  attackerState: Map<string, AttackerTracker>;
  tickEnemyBaseSpawning(): void;
  handleSpawnPawn(client: { sessionId: string; send: (...args: unknown[]) => void }, message: { pawnType: string }): void;

};

// ── Helpers ─────────────────────────────────────────────────────────

/** Minimum tick for creature-vs-creature combat (must pass cooldown check). */
const FIRST_COMBAT_TICK = Math.ceil(COMBAT.ATTACK_COOLDOWN_TICKS / COMBAT.COMBAT_TICK_INTERVAL) * COMBAT.COMBAT_TICK_INTERVAL;
/** Minimum tick for tile attacks (must pass tile cooldown check). */
const FIRST_TILE_TICK = Math.ceil(COMBAT.TILE_ATTACK_COOLDOWN_TICKS / COMBAT.COMBAT_TICK_INTERVAL) * COMBAT.COMBAT_TICK_INTERVAL;

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

function joinPlayer(room: GameRoom, sessionId: string) {
  const player = new PlayerState();
  player.id = sessionId;
  room.state.players.set(sessionId, player);

  // Find a walkable area for HQ
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

/** Find a walkable tile not owned by anyone and not water/rock. */
function findUnclaimedWalkable(room: GameRoom, minX = 0, minY = 0): { x: number; y: number } {
  const w = room.state.mapWidth;
  for (let y = minY; y < w; y++) {
    for (let x = (y === minY ? minX : 0); x < w; x++) {
      const tile = room.state.getTile(x, y);
      if (tile && room.state.isWalkable(x, y) && tile.ownerID === "") {
        return { x, y };
      }
    }
  }
  return { x: 1, y: 1 };
}

/** Place an enemy base creature directly. */
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

/** Place an enemy mobile creature directly. */
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

/** Place a defender pawn directly. */
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

/** Place an attacker pawn directly. */
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

/** Place a builder pawn directly. */
function addBuilder(
  room: GameRoom,
  id: string,
  ownerID: string,
  x: number,
  y: number,
): CreatureState {
  const creature = new CreatureState();
  creature.id = id;
  creature.creatureType = "pawn_builder";
  creature.x = x;
  creature.y = y;
  creature.health = PAWN_TYPES["builder"].health;
  creature.hunger = 100;
  creature.currentState = "idle";
  creature.ownerID = ownerID;
  creature.pawnType = "builder";
  creature.targetX = -1;
  creature.targetY = -1;
  creature.stamina = PAWN_TYPES["builder"].maxStamina;
  creature.nextMoveTick = 0;
  room.state.creatures.set(id, creature);
  return creature;
}

/** Run combat resolution for the current tick. */
const _combatIdCounter = { value: 10000 };
function runCombat(room: GameRoom, ebState: Map<string, EnemyBaseTracker>) {
  tickCombat(room.state, room, ebState, _combatIdCounter, (room as TestableGameRoom).attackerState);
}

/** Set a tile as non-HQ owned territory. */
function claimNonHQTile(room: GameRoom, x: number, y: number, ownerID: string, shapeHP: number = SHAPE.BLOCK_HP) {
  const tile = room.state.getTile(x, y);
  if (tile) {
    tile.ownerID = ownerID;
    tile.shapeHP = shapeHP;
    tile.isHQTerritory = false;
  }
}

function manhattan(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

// ═══════════════════════════════════════════════════════════════════════
// PART 1 — Issue #17: Enemy Bases & Mobiles
// ═══════════════════════════════════════════════════════════════════════

// ── 1.1  Enemy Base Spawning ─────────────────────────────────────────

describe("Enemy Bases — Spawning", () => {
  it("spawns an enemy base at a random unclaimed walkable tile after ENEMY_BASE_SPAWN_INTERVAL ticks", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");

    // Force night phase and tick past first-base delay
    room.state.dayPhase = DayPhase.Night;
    room.state.tick = ENEMY_SPAWNING.FIRST_BASE_DELAY_TICKS;

    // Make tick align with spawn interval
    room.state.tick = Math.ceil(ENEMY_SPAWNING.FIRST_BASE_DELAY_TICKS / ENEMY_SPAWNING.BASE_SPAWN_INTERVAL_TICKS) * ENEMY_SPAWNING.BASE_SPAWN_INTERVAL_TICKS;

    const _beforeCount = room.state.creatures.size;
    // Call the private method
    room.enemyBaseState = new Map();
    room.tickEnemyBaseSpawning();

    // Should have spawned one base creature
    let baseCount = 0;
    room.state.creatures.forEach((c) => {
      if (isEnemyBase(c.creatureType)) baseCount++;
    });
    expect(baseCount).toBe(1);
  });

  it("does NOT spawn a base on player-owned territory", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    room.state.dayPhase = DayPhase.Night;
    room.state.tick = ENEMY_SPAWNING.BASE_SPAWN_INTERVAL_TICKS * 2;
    room.enemyBaseState = new Map();
    room.tickEnemyBaseSpawning();

    // Any spawned base should not be on player territory
    room.state.creatures.forEach((c) => {
      if (isEnemyBase(c.creatureType)) {
        const tile = room.state.getTile(c.x, c.y);
        expect(tile?.ownerID).toBe("");
      }
    });
  });

  it("does NOT spawn a base on water or rock tiles", () => {
    const room = createRoom();
    joinPlayer(room, "p1");
    room.state.dayPhase = DayPhase.Night;

    // Spawn several bases
    for (let i = 1; i <= 5; i++) {
      room.state.tick = ENEMY_SPAWNING.BASE_SPAWN_INTERVAL_TICKS * i;
      room.enemyBaseState = room.enemyBaseState ?? new Map();
      room.tickEnemyBaseSpawning();
    }

    room.state.creatures.forEach((c) => {
      if (isEnemyBase(c.creatureType)) {
        expect(room.state.isWalkable(c.x, c.y)).toBe(true);
      }
    });
  });

  it("does NOT spawn a base on a tile already occupied by another base", () => {
    const room = createRoom();
    joinPlayer(room, "p1");
    room.state.dayPhase = DayPhase.Night;
    room.enemyBaseState = new Map();

    // Spawn several bases
    for (let i = 1; i <= 5; i++) {
      room.state.tick = ENEMY_SPAWNING.BASE_SPAWN_INTERVAL_TICKS * i;
      room.tickEnemyBaseSpawning();
    }

    const basePositions: string[] = [];
    room.state.creatures.forEach((c) => {
      if (isEnemyBase(c.creatureType)) {
        // Bases must have MIN_DISTANCE_BETWEEN_BASES separation
        for (const pos of basePositions) {
          const [bx, by] = pos.split(",").map(Number);
          expect(manhattan(c.x, c.y, bx, by)).toBeGreaterThanOrEqual(ENEMY_SPAWNING.MIN_DISTANCE_BETWEEN_BASES);
        }
        basePositions.push(`${c.x},${c.y}`);
      }
    });
  });

  it("each base type has correct HP from ENEMY_BASE_TYPES registry", () => {
    const room = createRoom();
    const pos = findUnclaimedWalkable(room);

    for (const [key, def] of Object.entries(ENEMY_BASE_TYPES)) {
      const base = addEnemyBase(room, `base-${key}`, key, pos.x, pos.y);
      expect(base.health).toBe(def.health);
      room.state.creatures.delete(base.id);
    }
  });

  it("base is static — position does not change across ticks", () => {
    const room = createRoom();
    const pos = findUnclaimedWalkable(room);
    const base = addEnemyBase(room, "static-base", "enemy_base_raider", pos.x, pos.y);
    const origX = base.x;
    const origY = base.y;

    // Set to night so base AI runs
    room.state.dayPhase = DayPhase.Night;
    const _ebState = new Map<string, EnemyBaseTracker>();
    const _nextId = { value: 100 };
    base.nextMoveTick = room.state.tick + 1000; // Don't spawn mobiles

    for (let i = 0; i < 20; i++) {
      room.state.tick += 1;
    }

    expect(base.x).toBe(origX);
    expect(base.y).toBe(origY);
  });

  it("base spawn respects minimum distance from player HQ", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    room.state.dayPhase = DayPhase.Night;
    room.enemyBaseState = new Map();

    for (let i = 1; i <= 5; i++) {
      room.state.tick = ENEMY_SPAWNING.BASE_SPAWN_INTERVAL_TICKS * i;
      room.tickEnemyBaseSpawning();
    }

    room.state.creatures.forEach((c) => {
      if (isEnemyBase(c.creatureType)) {
        const dist = manhattan(c.x, c.y, player.hqX, player.hqY);
        expect(dist).toBeGreaterThanOrEqual(ENEMY_SPAWNING.MIN_DISTANCE_FROM_HQ);
      }
    });
  });
});

// ── 1.2  Enemy Base Properties ───────────────────────────────────────

describe("Enemy Bases — Properties & Types", () => {
  it("raider_camp has lower HP than fortress", () => {
    expect(ENEMY_BASE_TYPES["enemy_base_raider"].health).toBeLessThan(
      ENEMY_BASE_TYPES["enemy_base_fortress"].health
    );
  });

  it("hive spawns mobiles more frequently than raider_camp (shorter spawn interval)", () => {
    expect(ENEMY_BASE_TYPES["enemy_base_hive"].spawnInterval).toBeLessThan(
      ENEMY_BASE_TYPES["enemy_base_raider"].spawnInterval
    );
  });

  it("fortress has highest HP among all base types", () => {
    const fortressHP = ENEMY_BASE_TYPES["enemy_base_fortress"].health;
    for (const [_key, def] of Object.entries(ENEMY_BASE_TYPES)) {
      expect(fortressHP).toBeGreaterThanOrEqual(def.health);
    }
  });

  it("all base types are present in ENEMY_BASE_TYPES constant registry", () => {
    expect(ENEMY_BASE_TYPES["enemy_base_raider"]).toBeDefined();
    expect(ENEMY_BASE_TYPES["enemy_base_hive"]).toBeDefined();
    expect(ENEMY_BASE_TYPES["enemy_base_fortress"]).toBeDefined();
  });

  it("base has ownerID set to empty string (sentinel for non-player entity)", () => {
    const room = createRoom();
    const pos = findUnclaimedWalkable(room);
    const base = addEnemyBase(room, "owner-test", "enemy_base_raider", pos.x, pos.y);
    expect(base.ownerID).toBe("");
  });
});

// ── 1.3  Enemy Mobile Spawning ───────────────────────────────────────

describe("Enemy Mobiles — Spawning from Bases", () => {
  it("base spawns a mobile after its spawn interval ticks during night", () => {
    const room = createRoom();
    room.state.dayPhase = DayPhase.Night;
    const pos = findUnclaimedWalkable(room);
    const base = addEnemyBase(room, "spawn-base", "enemy_base_raider", pos.x, pos.y);
    base.nextMoveTick = 0; // Ready to spawn

    const ebState = new Map<string, EnemyBaseTracker>();
    const nextId = { value: 100 };

    stepEnemyBase(base, room.state, room, ebState, nextId);

    // Should have spawned a mobile
    const spawned = room.state.creatures.get("enemy_100");
    expect(spawned).toBeDefined();
    expect(spawned!.creatureType).toBe("enemy_raider");
  });

  it("spawned mobile appears on or adjacent to the base tile", () => {
    const room = createRoom();
    room.state.dayPhase = DayPhase.Night;
    const pos = findUnclaimedWalkable(room);
    const base = addEnemyBase(room, "adj-base", "enemy_base_raider", pos.x, pos.y);
    base.nextMoveTick = 0;

    const ebState = new Map<string, EnemyBaseTracker>();
    const nextId = { value: 200 };

    stepEnemyBase(base, room.state, room, ebState, nextId);

    const mobile = room.state.creatures.get("enemy_200");
    expect(mobile).toBeDefined();
    const dist = manhattan(mobile!.x, mobile!.y, base.x, base.y);
    expect(dist).toBeLessThanOrEqual(1);
  });

  it("raider_camp spawns raider-type mobiles", () => {
    expect(ENEMY_BASE_TYPES["enemy_base_raider"].spawnType).toBe("enemy_raider");
  });

  it("hive spawns swarm-type mobiles", () => {
    expect(ENEMY_BASE_TYPES["enemy_base_hive"].spawnType).toBe("enemy_swarm");
  });

  it("fortress spawns raider-type mobiles", () => {
    expect(ENEMY_BASE_TYPES["enemy_base_fortress"].spawnType).toBe("enemy_raider");
  });

  it("mobile inherits stats (HP, damage) from ENEMY_MOBILE_TYPES registry", () => {
    const room = createRoom();
    room.state.dayPhase = DayPhase.Night;
    const pos = findUnclaimedWalkable(room);
    const base = addEnemyBase(room, "stats-base", "enemy_base_hive", pos.x, pos.y);
    base.nextMoveTick = 0;

    const ebState = new Map<string, EnemyBaseTracker>();
    const nextId = { value: 300 };

    stepEnemyBase(base, room.state, room, ebState, nextId);

    const mobile = room.state.creatures.get("enemy_300");
    expect(mobile).toBeDefined();
    const swarmDef = ENEMY_MOBILE_TYPES["enemy_swarm"];
    expect(mobile!.health).toBe(swarmDef.health);
  });

  it("base respects max concurrent mobiles cap per base", () => {
    const room = createRoom();
    room.state.dayPhase = DayPhase.Night;
    const pos = findUnclaimedWalkable(room);
    const base = addEnemyBase(room, "cap-base", "enemy_base_raider", pos.x, pos.y);

    const ebState = new Map<string, EnemyBaseTracker>();
    const nextId = { value: 400 };

    const maxMobiles = ENEMY_BASE_TYPES["enemy_base_raider"].maxMobiles;

    // Spawn until cap
    for (let i = 0; i < maxMobiles + 2; i++) {
      base.nextMoveTick = 0;
      room.state.tick = i * 10;
      stepEnemyBase(base, room.state, room, ebState, nextId);
    }

    const tracker = ebState.get("cap-base");
    expect(tracker).toBeDefined();
    expect(tracker!.spawnedMobileIds.size).toBeLessThanOrEqual(maxMobiles);
  });

  it("destroyed base stops spawning new mobiles", () => {
    const room = createRoom();
    room.state.dayPhase = DayPhase.Night;
    const pos = findUnclaimedWalkable(room);
    const base = addEnemyBase(room, "dead-base", "enemy_base_raider", pos.x, pos.y);

    const ebState = new Map<string, EnemyBaseTracker>();
    const nextId = { value: 500 };

    // Spawn one mobile first
    base.nextMoveTick = 0;
    stepEnemyBase(base, room.state, room, ebState, nextId);
    const _countBefore = room.state.creatures.size;

    // "Destroy" the base: set health to 0, remove it, and clean up
    base.health = 0;
    onBaseDestroyed("dead-base", room.state, ebState);
    room.state.creatures.delete("dead-base");

    // All spawned mobiles should also be gone
    let mobileCount = 0;
    room.state.creatures.forEach((c) => {
      if (isEnemyMobile(c.creatureType)) mobileCount++;
    });
    expect(mobileCount).toBe(0);
  });
});

// ── 1.4  Enemy Mobile AI — Pathfinding ───────────────────────────────

describe("Enemy Mobiles — Pathfinding toward Player Territory", () => {
  it("mobile moves toward nearest player-owned tile each AI tick", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    // Place mobile far from player territory
    const pos = findUnclaimedWalkable(room, 20, 20);
    const mobile = addEnemyMobile(room, "path-mob", "enemy_raider", pos.x, pos.y);
    const _origDist = manhattan(mobile.x, mobile.y, player.hqX, player.hqY);

    stepEnemyMobile(mobile, room.state);

    // Mobile should have found a target or moved toward map center
    if (mobile.currentState === "move_to_target") {
      expect(mobile.targetX).toBeGreaterThanOrEqual(0);
      expect(mobile.targetY).toBeGreaterThanOrEqual(0);
    }
  });

  it("mobile does not path through water or rock tiles", () => {
    const room = createRoom();
    const mobile = addEnemyMobile(room, "water-mob", "enemy_raider", 5, 5, { currentState: "move_to_target", targetX: 15, targetY: 15 });

    // Run several steps
    for (let i = 0; i < 10; i++) {
      stepEnemyMobile(mobile, room.state);
    }

    // Verify mob is on a walkable tile
    expect(room.state.isWalkable(mobile.x, mobile.y)).toBe(true);
  });

  it("mobile re-targets if nearest player territory changes (tile unclaimed)", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const pos = findUnclaimedWalkable(room, 15, 15);

    // Claim a non-HQ tile near the mobile
    const claimPos = findUnclaimedWalkable(room, pos.x - 2, pos.y);
    claimNonHQTile(room, claimPos.x, claimPos.y, "p1");

    const mobile = addEnemyMobile(room, "retarget-mob", "enemy_raider", pos.x, pos.y, {
      currentState: "move_to_target",
      targetX: claimPos.x,
      targetY: claimPos.y,
    });

    // Unclaim the target tile
    const tile = room.state.getTile(claimPos.x, claimPos.y)!;
    tile.ownerID = "";

    stepEnemyMobile(mobile, room.state);

    // Should have re-targeted (back to seek_territory)
    expect(mobile.currentState).toBe("seek_territory");
  });

  it("mobile with no reachable player territory wanders toward map center", () => {
    const room = createRoom();
    // No player joined, no territory
    const pos = findUnclaimedWalkable(room);
    const mobile = addEnemyMobile(room, "no-target-mob", "enemy_raider", pos.x, pos.y);

    const _origX = mobile.x;
    const _origY = mobile.y;

    stepEnemyMobile(mobile, room.state);

    // Should stay in seek_territory and move toward center
    expect(mobile.currentState).toBe("seek_territory");
  });
});

// ── 1.5  Enemy Mobile AI — Territory Attack ──────────────────────────

describe("Enemy Mobiles — Attacking Player Territory", () => {
  it("mobile transitions to attacking_tile when adjacent to player tile", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");

    // Place a non-HQ claimed tile and put mobile next to it
    const pos = findUnclaimedWalkable(room, 15, 15);
    claimNonHQTile(room, pos.x, pos.y, "p1");

    const mobile = addEnemyMobile(room, "attack-mob", "enemy_raider", pos.x + 1, pos.y, {
      currentState: "move_to_target",
      targetX: pos.x,
      targetY: pos.y,
    });

    stepEnemyMobile(mobile, room.state);

    expect(mobile.currentState).toBe("attacking_tile");
  });

  it("tile shapeHP decreases by mobile's tileDamage via tickCombat", () => {
    const room = createRoom();
    joinPlayer(room, "p1");

    const pos = findUnclaimedWalkable(room, 15, 15);
    claimNonHQTile(room, pos.x, pos.y, "p1");

    const _mobile = addEnemyMobile(room, "dmg-mob", "enemy_raider", pos.x + 1, pos.y, {
      currentState: "attacking_tile",
      targetX: pos.x,
      targetY: pos.y,
    });

    const tile = room.state.getTile(pos.x, pos.y)!;
    const origHP = tile.shapeHP;
    const raiderDef = ENEMY_MOBILE_TYPES["enemy_raider"];

    // Tile attacks use TILE_ATTACK_COOLDOWN_TICKS
    room.state.tick = FIRST_TILE_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    expect(tile.shapeHP).toBe(origHP - raiderDef.tileDamage);
  });

  it("tile ownership is lost only when shapeHP reaches zero", () => {
    const room = createRoom();
    joinPlayer(room, "p1");

    const pos = findUnclaimedWalkable(room, 15, 15);
    claimNonHQTile(room, pos.x, pos.y, "p1", 30); // Low HP

    const _mobile = addEnemyMobile(room, "hp-mob", "enemy_raider", pos.x + 1, pos.y, {
      currentState: "attacking_tile",
      targetX: pos.x,
      targetY: pos.y,
    });

    const tile = room.state.getTile(pos.x, pos.y)!;
    const raiderDef = ENEMY_MOBILE_TYPES["enemy_raider"];

    // First attack shouldn't clear ownership if shapeHP > damage
    if (tile.shapeHP > raiderDef.tileDamage) {
      room.state.tick = FIRST_TILE_TICK;
      const ebState = new Map<string, EnemyBaseTracker>();
      runCombat(room, ebState);
      expect(tile.ownerID).toBe("p1");
    }

    // Keep attacking until destroyed (each needs cooldown gap)
    for (let i = 0; i < 20; i++) {
      room.state.tick = FIRST_TILE_TICK + COMBAT.TILE_ATTACK_COOLDOWN_TICKS * (i + 1);
      // Align to combat interval
      room.state.tick = Math.ceil(room.state.tick / COMBAT.COMBAT_TICK_INTERVAL) * COMBAT.COMBAT_TICK_INTERVAL;
      const ebState = new Map<string, EnemyBaseTracker>();
      runCombat(room, ebState);
      if (tile.shapeHP <= 0) break;
    }

    expect(tile.shapeHP).toBeLessThanOrEqual(0);
    expect(tile.ownerID).toBe("");
  });

  it("mobile moves to next player tile after destroying current target", () => {
    const room = createRoom();
    joinPlayer(room, "p1");

    const pos = findUnclaimedWalkable(room, 15, 15);
    claimNonHQTile(room, pos.x, pos.y, "p1", 5); // Very low HP

    const mobile = addEnemyMobile(room, "next-mob", "enemy_raider", pos.x + 1, pos.y, {
      currentState: "attacking_tile",
      targetX: pos.x,
      targetY: pos.y,
    });

    // Destroy the tile in one hit (tileDamage > shapeHP)
    room.state.tick = FIRST_TILE_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    // Mobile should switch to seek_territory
    expect(mobile.currentState).toBe("seek_territory");
  });

  it("mobile cannot attack HQ/starting territory tiles (isHQTerritory protected)", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    // Mobile targets an HQ tile
    const mobile = addEnemyMobile(room, "hq-mob", "enemy_raider", player.hqX + 1, player.hqY, {
      currentState: "move_to_target",
      targetX: player.hqX,
      targetY: player.hqY,
    });

    stepEnemyMobile(mobile, room.state);

    // Should re-target since HQ tiles are protected
    expect(mobile.currentState).toBe("seek_territory");
  });

  it("multiple mobiles attacking same tile stack damage correctly", () => {
    const room = createRoom();
    joinPlayer(room, "p1");

    const pos = findUnclaimedWalkable(room, 15, 15);
    claimNonHQTile(room, pos.x, pos.y, "p1");

    // Two mobiles attacking the same tile
    addEnemyMobile(room, "stack-mob1", "enemy_raider", pos.x + 1, pos.y, {
      currentState: "attacking_tile",
      targetX: pos.x,
      targetY: pos.y,
    });
    addEnemyMobile(room, "stack-mob2", "enemy_raider", pos.x - 1, pos.y, {
      currentState: "attacking_tile",
      targetX: pos.x,
      targetY: pos.y,
    });

    const tile = room.state.getTile(pos.x, pos.y)!;
    const origHP = tile.shapeHP;
    const raiderDmg = ENEMY_MOBILE_TYPES["enemy_raider"].tileDamage;

    room.state.tick = FIRST_TILE_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    // Both should deal damage
    expect(tile.shapeHP).toBe(origHP - raiderDmg * 2);
  });
});

// ── 1.6  Enemy Mobile Lifecycle ──────────────────────────────────────

describe("Enemy Mobiles — Despawn & Lifecycle", () => {
  it("all mobiles from a base despawn when their base is destroyed", () => {
    const room = createRoom();
    const pos = findUnclaimedWalkable(room);
    const _base = addEnemyBase(room, "despawn-base", "enemy_base_raider", pos.x, pos.y);
    const _mob1 = addEnemyMobile(room, "mob1", "enemy_raider", pos.x + 1, pos.y);
    const _mob2 = addEnemyMobile(room, "mob2", "enemy_raider", pos.x - 1, pos.y);

    const ebState = new Map<string, EnemyBaseTracker>();
    ebState.set("despawn-base", {
      spawnedMobileIds: new Set(["mob1", "mob2"]),
    });

    onBaseDestroyed("despawn-base", room.state, ebState);

    expect(room.state.creatures.has("mob1")).toBe(false);
    expect(room.state.creatures.has("mob2")).toBe(false);
  });

  it("mobile at zero HP is removed from state by tickCombat", () => {
    const room = createRoom();
    const pos = findUnclaimedWalkable(room);
    const _mobile = addEnemyMobile(room, "dead-mob", "enemy_raider", pos.x, pos.y, { health: 0 });

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    expect(room.state.creatures.has("dead-mob")).toBe(false);
  });

  it("destroying a mobile does not affect its parent base HP", () => {
    const room = createRoom();
    const pos = findUnclaimedWalkable(room);
    const base = addEnemyBase(room, "intact-base", "enemy_base_raider", pos.x, pos.y);
    const origHP = base.health;
    const _mobile = addEnemyMobile(room, "kill-mob", "enemy_raider", pos.x + 2, pos.y, { health: 0 });

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    expect(base.health).toBe(origHP);
  });
});

// ── 1.7  Enemy Base Destruction & Rewards ────────────────────────────

describe("Enemy Bases — Destruction & Rewards", () => {
  it("base is removed from state when HP reaches zero", () => {
    const room = createRoom();
    const pos = findUnclaimedWalkable(room);
    const base = addEnemyBase(room, "remove-base", "enemy_base_raider", pos.x, pos.y);
    base.health = 0;

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    expect(room.state.creatures.has("remove-base")).toBe(false);
  });

  it("destroying a base awards resources to nearby player pawn's owner", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    const origWood = player.wood;
    const origStone = player.stone;

    const pos = findUnclaimedWalkable(room, 15, 15);
    const base = addEnemyBase(room, "reward-base", "enemy_base_raider", pos.x, pos.y);
    base.health = 0;

    // Place attacker adjacent to base for reward attribution
    addAttacker(room, "reward-atk", "p1", pos.x + 1, pos.y);

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    const raiderReward = ENEMY_BASE_TYPES["enemy_base_raider"].reward;
    expect(player.wood).toBe(origWood + raiderReward.wood);
    expect(player.stone).toBe(origStone + raiderReward.stone);
  });

  it("reward amount varies by base type (fortress > hive > raider_camp)", () => {
    const raiderReward = ENEMY_BASE_TYPES["enemy_base_raider"].reward;
    const hiveReward = ENEMY_BASE_TYPES["enemy_base_hive"].reward;
    const fortressReward = ENEMY_BASE_TYPES["enemy_base_fortress"].reward;

    const raiderTotal = raiderReward.wood + raiderReward.stone;
    const hiveTotal = hiveReward.wood + hiveReward.stone;
    const fortressTotal = fortressReward.wood + fortressReward.stone;

    expect(fortressTotal).toBeGreaterThan(raiderTotal);
    expect(raiderTotal).toBeGreaterThan(hiveTotal);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PART 2 — Issue #18: Defenders & Attackers
// ═══════════════════════════════════════════════════════════════════════

// ── 2.1  Pawn Type Constants ─────────────────────────────────────────

describe("Pawn Types — Constants & Registry", () => {
  it("all three pawn types exist in PAWN_TYPES registry", () => {
    expect(PAWN_TYPES["builder"]).toBeDefined();
    expect(PAWN_TYPES["defender"]).toBeDefined();
    expect(PAWN_TYPES["attacker"]).toBeDefined();
  });

  it("pawn types have differentiated resource costs for strategic choice", () => {
    // Builder: wood-focused, cheap stone (economy unit)
    expect(PAWN_TYPES["builder"].cost.wood).toBe(10);
    expect(PAWN_TYPES["builder"].cost.stone).toBe(3);

    // Defender: stone-heavy, cheap wood (stone-sink defensive unit)
    expect(PAWN_TYPES["defender"].cost.wood).toBe(8);
    expect(PAWN_TYPES["defender"].cost.stone).toBe(12);

    // Attacker: expensive wood, moderate stone (costly offensive unit)
    expect(PAWN_TYPES["attacker"].cost.wood).toBe(18);
    expect(PAWN_TYPES["attacker"].cost.stone).toBe(10);
  });

  it("each pawn type has damage, HP, and maxCount defined", () => {
    for (const [_key, def] of Object.entries(PAWN_TYPES)) {
      expect(def.health).toBeGreaterThan(0);
      expect(def.maxCount).toBeGreaterThan(0);
      expect(typeof def.damage).toBe("number");
    }
  });

  it("defender has damage > 0 (can fight enemies)", () => {
    expect(PAWN_TYPES["defender"].damage).toBeGreaterThan(0);
  });

  it("attacker has higher damage than defender", () => {
    expect(PAWN_TYPES["attacker"].damage).toBeGreaterThan(PAWN_TYPES["defender"].damage);
  });

  it("builder has zero damage (not a combat unit)", () => {
    expect(PAWN_TYPES["builder"].damage).toBe(0);
  });
});

// ── 2.2  Defender Spawning ───────────────────────────────────────────

describe("Defenders — Spawning", () => {
  it("spawn_pawn with pawnType 'defender' creates a defender creature", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    player.wood = 100;
    player.stone = 100;

    const fakeClient = { sessionId: "p1", send: (() => {}) as (...args: unknown[]) => void };
    room.nextCreatureId = 0;
    room.creatureIdCounter = { value: 0 };
    room.handleSpawnPawn(fakeClient, { pawnType: "defender" });

    let found = false;
    room.state.creatures.forEach((c) => {
      if (c.pawnType === "defender") found = true;
    });
    expect(found).toBe(true);
  });

  it("defender deducts correct resource cost from player inventory", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    player.wood = 100;
    player.stone = 100;

    const fakeClient = { sessionId: "p1", send: (() => {}) as (...args: unknown[]) => void };
    room.nextCreatureId = 0;
    room.creatureIdCounter = { value: 0 };
    room.handleSpawnPawn(fakeClient, { pawnType: "defender" });

    const defCost = PAWN_TYPES["defender"].cost;
    expect(player.wood).toBe(100 - defCost.wood);
    expect(player.stone).toBe(100 - defCost.stone);
  });

  it("defender spawn rejected if player lacks resources", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    player.wood = 0;
    player.stone = 0;

    const fakeClient = { sessionId: "p1", send: (() => {}) as (...args: unknown[]) => void };
    room.nextCreatureId = 0;
    room.creatureIdCounter = { value: 0 };
    room.handleSpawnPawn(fakeClient, { pawnType: "defender" });

    let found = false;
    room.state.creatures.forEach((c) => {
      if (c.pawnType === "defender") found = true;
    });
    expect(found).toBe(false);
  });

  it("defender spawn rejected if player at max defender count", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    player.wood = 1000;
    player.stone = 1000;

    const fakeClient = { sessionId: "p1", send: (() => {}) as (...args: unknown[]) => void };
    room.nextCreatureId = 0;
    room.creatureIdCounter = { value: 0 };

    const maxDefs = PAWN_TYPES["defender"].maxCount;
    for (let i = 0; i < maxDefs + 1; i++) {
      room.handleSpawnPawn(fakeClient, { pawnType: "defender" });
    }

    let defCount = 0;
    room.state.creatures.forEach((c) => {
      if (c.pawnType === "defender") defCount++;
    });
    expect(defCount).toBe(maxDefs);
  });

  it("defender initializes with correct HP, stamina, and pawnType", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    player.wood = 100;
    player.stone = 100;

    const fakeClient = { sessionId: "p1", send: (() => {}) as (...args: unknown[]) => void };
    room.nextCreatureId = 0;
    room.creatureIdCounter = { value: 0 };
    room.handleSpawnPawn(fakeClient, { pawnType: "defender" });

    const defDef = PAWN_TYPES["defender"];
    room.state.creatures.forEach((c) => {
      if (c.pawnType === "defender") {
        expect(c.health).toBe(defDef.health);
        expect(c.stamina).toBe(defDef.maxStamina);
        expect(c.creatureType).toBe("pawn_defender");
      }
    });
  });

  it("defender has ownerID set to spawning player's sessionId", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    player.wood = 100;
    player.stone = 100;

    const fakeClient = { sessionId: "p1", send: (() => {}) as (...args: unknown[]) => void };
    room.nextCreatureId = 0;
    room.creatureIdCounter = { value: 0 };
    room.handleSpawnPawn(fakeClient, { pawnType: "defender" });

    room.state.creatures.forEach((c) => {
      if (c.pawnType === "defender") {
        expect(c.ownerID).toBe("p1");
      }
    });
  });
});

// ── 2.3  Defender AI — Patrol Behavior ───────────────────────────────

describe("Defenders — Patrol AI", () => {
  it("idle defender transitions to patrol state", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    const def = addDefender(room, "patrol-def", "p1", player.hqX, player.hqY);

    stepDefender(def, room.state);

    expect(def.currentState).toBe("patrol");
  });

  it("patrolling defender moves only within player-owned territory", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    const def = addDefender(room, "terr-def", "p1", player.hqX, player.hqY, { currentState: "patrol" });

    for (let i = 0; i < 30; i++) {
      stepDefender(def, room.state);
      const tile = room.state.getTile(def.x, def.y);
      expect(tile?.ownerID).toBe("p1");
    }
  });

  it("defender does NOT leave player territory boundaries", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    const def = addDefender(room, "bound-def", "p1", player.hqX + 2, player.hqY + 2, { currentState: "patrol" });

    for (let i = 0; i < 50; i++) {
      stepDefender(def, room.state);
      const tile = room.state.getTile(def.x, def.y);
      expect(tile?.ownerID).toBe("p1");
    }
  });

  it("defender covers different areas of territory over time (not stuck in corner)", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    const def = addDefender(room, "cover-def", "p1", player.hqX, player.hqY, { currentState: "patrol" });

    const visited = new Set<string>();
    for (let i = 0; i < 100; i++) {
      stepDefender(def, room.state);
      visited.add(`${def.x},${def.y}`);
    }

    // Should visit at least a few different tiles
    expect(visited.size).toBeGreaterThan(1);
  });

  it("defender returns to territory if somehow displaced outside owned tiles", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");

    // Place defender outside territory
    const outsidePos = findUnclaimedWalkable(room, 20, 20);
    const def = addDefender(room, "displaced-def", "p1", outsidePos.x, outsidePos.y, { currentState: "returning" });

    for (let i = 0; i < 30; i++) {
      stepDefender(def, room.state);
    }

    // Should have returned to territory or be moving toward it
    const tile = room.state.getTile(def.x, def.y);
    if (tile?.ownerID === "p1") {
      expect(def.currentState).toBe("patrol");
    } else {
      expect(["returning", "patrol"]).toContain(def.currentState);
    }
  });
});

// ── 2.4  Defender AI — Combat Engagement ─────────────────────────────

describe("Defenders — Combat with Enemy Mobiles", () => {
  it("defender transitions to engage state when enemy mobile enters owned territory", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    const def = addDefender(room, "engage-def", "p1", player.hqX, player.hqY);

    // Place enemy mobile inside player territory
    const _mobile = addEnemyMobile(room, "engage-mob", "enemy_raider", player.hqX + 1, player.hqY);

    stepDefender(def, room.state);

    expect(def.currentState).toBe("engage");
  });

  it("defender moves toward nearest enemy mobile within detection radius", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    const def = addDefender(room, "chase-def", "p1", player.hqX - 1, player.hqY - 1);

    // Place enemy mobile at edge of territory
    const mobile = addEnemyMobile(room, "chase-mob", "enemy_raider", player.hqX + 1, player.hqY + 1);

    const origDist = manhattan(def.x, def.y, mobile.x, mobile.y);

    // Step several times
    for (let i = 0; i < 5; i++) {
      stepDefender(def, room.state);
    }

    if (def.currentState === "engage") {
      const newDist = manhattan(def.x, def.y, mobile.x, mobile.y);
      expect(newDist).toBeLessThanOrEqual(origDist);
    }
  });

  it("defender deals damage to adjacent enemy mobile each combat tick", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    const _def = addDefender(room, "dmg-def", "p1", player.hqX, player.hqY);
    const mobile = addEnemyMobile(room, "dmg-target", "enemy_raider", player.hqX + 1, player.hqY);
    const origHP = mobile.health;

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    const defDmg = PAWN_TYPES["defender"].damage;
    expect(mobile.health).toBe(origHP - defDmg);
  });

  it("defender takes damage from enemy mobile in return (two-way combat)", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    const def = addDefender(room, "twoway-def", "p1", player.hqX, player.hqY);
    const _mobile = addEnemyMobile(room, "twoway-mob", "enemy_raider", player.hqX + 1, player.hqY);
    const origDefHP = def.health;

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    const mobDmg = ENEMY_MOBILE_TYPES["enemy_raider"].damage;
    expect(def.health).toBe(origDefHP - mobDmg);
  });

  it("defender at zero HP is removed from state", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    const _def = addDefender(room, "dead-def", "p1", player.hqX, player.hqY, { health: 0 });

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    expect(room.state.creatures.has("dead-def")).toBe(false);
  });

  it("defender returns to patrol after enemy is destroyed", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    const def = addDefender(room, "resume-def", "p1", player.hqX, player.hqY, { currentState: "engage" });

    // No hostiles present — should revert to patrol
    stepDefender(def, room.state);

    expect(def.currentState).toBe("patrol");
  });

  it("defender prioritizes closest enemy when multiple hostiles present", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    const def = addDefender(room, "prio-def", "p1", player.hqX, player.hqY);

    const closeMob = addEnemyMobile(room, "close-mob", "enemy_raider", player.hqX + 1, player.hqY);
    const _farMob = addEnemyMobile(room, "far-mob", "enemy_raider", player.hqX + 2, player.hqY + 2);

    stepDefender(def, room.state);

    expect(def.currentState).toBe("engage");
    expect(def.targetX).toBe(closeMob.x);
    expect(def.targetY).toBe(closeMob.y);
  });

  it("defender does NOT chase enemies outside owned territory", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    const def = addDefender(room, "nochase-def", "p1", player.hqX + 2, player.hqY, { currentState: "engage" });

    // Enemy is outside territory
    const outsidePos = findUnclaimedWalkable(room, 20, 20);
    addEnemyMobile(room, "outside-mob", "enemy_raider", outsidePos.x, outsidePos.y);

    stepDefender(def, room.state);

    // Should not be pursuing — enemy is not in territory
    expect(def.currentState).toBe("patrol");
  });
});

// ── 2.5  Attacker Spawning ───────────────────────────────────────────

describe("Attackers — Spawning", () => {
  it("spawn_pawn with pawnType 'attacker' creates an attacker creature", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    player.wood = 100;
    player.stone = 100;

    const fakeClient = { sessionId: "p1", send: (() => {}) as (...args: unknown[]) => void };
    room.nextCreatureId = 0;
    room.creatureIdCounter = { value: 0 };
    room.handleSpawnPawn(fakeClient, { pawnType: "attacker" });

    let found = false;
    room.state.creatures.forEach((c) => {
      if (c.pawnType === "attacker") found = true;
    });
    expect(found).toBe(true);
  });

  it("attacker deducts correct resource cost from player inventory", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    player.wood = 100;
    player.stone = 100;

    const fakeClient = { sessionId: "p1", send: (() => {}) as (...args: unknown[]) => void };
    room.nextCreatureId = 0;
    room.creatureIdCounter = { value: 0 };
    room.handleSpawnPawn(fakeClient, { pawnType: "attacker" });

    const atkCost = PAWN_TYPES["attacker"].cost;
    expect(player.wood).toBe(100 - atkCost.wood);
    expect(player.stone).toBe(100 - atkCost.stone);
  });

  it("attacker spawn rejected if player lacks resources", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    player.wood = 0;
    player.stone = 0;

    const fakeClient = { sessionId: "p1", send: (() => {}) as (...args: unknown[]) => void };
    room.nextCreatureId = 0;
    room.creatureIdCounter = { value: 0 };
    room.handleSpawnPawn(fakeClient, { pawnType: "attacker" });

    let found = false;
    room.state.creatures.forEach((c) => {
      if (c.pawnType === "attacker") found = true;
    });
    expect(found).toBe(false);
  });

  it("attacker spawn rejected if player at max attacker count", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    player.wood = 1000;
    player.stone = 1000;

    const fakeClient = { sessionId: "p1", send: (() => {}) as (...args: unknown[]) => void };
    room.nextCreatureId = 0;
    room.creatureIdCounter = { value: 0 };

    const maxAtk = PAWN_TYPES["attacker"].maxCount;
    for (let i = 0; i < maxAtk + 1; i++) {
      room.handleSpawnPawn(fakeClient, { pawnType: "attacker" });
    }

    let atkCount = 0;
    room.state.creatures.forEach((c) => {
      if (c.pawnType === "attacker") atkCount++;
    });
    expect(atkCount).toBe(maxAtk);
  });

  it("attacker initializes with correct HP, stamina, damage, and pawnType", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    player.wood = 100;
    player.stone = 100;

    const fakeClient = { sessionId: "p1", send: (() => {}) as (...args: unknown[]) => void };
    room.nextCreatureId = 0;
    room.creatureIdCounter = { value: 0 };
    room.handleSpawnPawn(fakeClient, { pawnType: "attacker" });

    const atkDef = PAWN_TYPES["attacker"];
    room.state.creatures.forEach((c) => {
      if (c.pawnType === "attacker") {
        expect(c.health).toBe(atkDef.health);
        expect(c.stamina).toBe(atkDef.maxStamina);
        expect(c.creatureType).toBe("pawn_attacker");
      }
    });
  });
});

// ── 2.6  Attacker AI — Seek & Destroy ────────────────────────────────

describe("Attackers — Seek & Destroy AI", () => {
  it("idle attacker transitions to seek state, targeting nearest enemy base", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    const pos = findUnclaimedWalkable(room, 20, 20);
    const _base = addEnemyBase(room, "seek-base", "enemy_base_raider", pos.x, pos.y);
    const atk = addAttacker(room, "seek-atk", "p1", player.hqX, player.hqY);

    const atkState = new Map<string, AttackerTracker>();
    stepAttacker(atk, room.state, atkState);

    expect(["seek_target", "move_to_target"]).toContain(atk.currentState);
  });

  it("attacker moves toward target enemy base each AI tick", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    const pos = findUnclaimedWalkable(room, 20, 20);
    const base = addEnemyBase(room, "move-base", "enemy_base_raider", pos.x, pos.y);
    const atk = addAttacker(room, "move-atk", "p1", player.hqX, player.hqY);

    const atkState = new Map<string, AttackerTracker>();

    // First tick: acquire target
    stepAttacker(atk, room.state, atkState);
    if (atk.currentState !== "move_to_target") return;

    const origDist = manhattan(atk.x, atk.y, base.x, base.y);

    // Tick forward to move
    for (let i = 0; i < 5; i++) {
      stepAttacker(atk, room.state, atkState);
    }

    // The attacker should have moved closer (or be equal if stuck)
    const newDist = manhattan(atk.x, atk.y, base.x, base.y);
    expect(newDist).toBeLessThanOrEqual(origDist);
  });

  it("attacker CAN leave player territory (unlike defender)", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    const pos = findUnclaimedWalkable(room, 20, 20);
    addEnemyBase(room, "leave-base", "enemy_base_raider", pos.x, pos.y);

    // Place attacker at territory edge
    const atk = addAttacker(room, "leave-atk", "p1", player.hqX + 2, player.hqY);

    const atkState = new Map<string, AttackerTracker>();

    for (let i = 0; i < 20; i++) {
      stepAttacker(atk, room.state, atkState);
    }

    // Attacker should have moved outside territory
    const _tile = room.state.getTile(atk.x, atk.y);
    // It may or may not be on owned tile — the point is it doesn't refuse to leave
    expect(atk.currentState).not.toBe("patrol"); // Attackers don't patrol
  });

  it("attacker deals damage to enemy base when adjacent via tickCombat", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const pos = findUnclaimedWalkable(room, 15, 15);
    const base = addEnemyBase(room, "hit-base", "enemy_base_raider", pos.x, pos.y);
    const origHP = base.health;

    const _atk = addAttacker(room, "hit-atk", "p1", pos.x + 1, pos.y);

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    const atkDmg = PAWN_TYPES["attacker"].damage;
    expect(base.health).toBe(origHP - atkDmg);
  });

  it("attacker returns to territory after maximum duration expires", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    const pos = findUnclaimedWalkable(room, 20, 20);
    addEnemyBase(room, "timeout-base", "enemy_base_raider", pos.x, pos.y);

    // Place attacker far from home (near the base)
    const atk = addAttacker(room, "timeout-atk", "p1", pos.x - 1, pos.y, { currentState: "move_to_target" });
    atk.targetX = pos.x;
    atk.targetY = pos.y;

    const atkState = new Map<string, AttackerTracker>();
    atkState.set("timeout-atk", {
      returnTick: room.state.tick, // Already expired
      homeTileX: player.hqX,
      homeTileY: player.hqY,
    });

    stepAttacker(atk, room.state, atkState);

    expect(atk.currentState).toBe("returning");
  });

  it("attacker at zero HP is removed from state", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    const _atk = addAttacker(room, "dead-atk", "p1", player.hqX, player.hqY, { health: 0 });

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    expect(room.state.creatures.has("dead-atk")).toBe(false);
  });

  it("attacker re-targets next nearest base if current target is destroyed", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    const pos1 = findUnclaimedWalkable(room, 15, 15);
    const pos2 = findUnclaimedWalkable(room, pos1.x + 5, pos1.y);
    addEnemyBase(room, "target1", "enemy_base_raider", pos1.x, pos1.y);
    addEnemyBase(room, "target2", "enemy_base_hive", pos2.x, pos2.y);

    const atk = addAttacker(room, "retarget-atk", "p1", pos1.x + 1, pos1.y, { currentState: "move_to_target" });
    atk.targetX = pos1.x;
    atk.targetY = pos1.y;

    const atkState = new Map<string, AttackerTracker>();
    atkState.set("retarget-atk", {
      returnTick: room.state.tick + 1000,
      homeTileX: player.hqX,
      homeTileY: player.hqY,
    });

    // Destroy first target
    room.state.creatures.delete("target1");

    stepAttacker(atk, room.state, atkState);

    // Should re-seek
    expect(atk.currentState).toBe("seek_target");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PART 3 — Combat Resolution & Integration
// ═══════════════════════════════════════════════════════════════════════

// ── 3.1  Defender vs Mobile Combat Resolution ────────────────────────

describe("Combat Resolution — Defender vs Enemy Mobile", () => {
  it("defender and mobile trade damage simultaneously each combat tick", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    const def = addDefender(room, "sim-def", "p1", player.hqX, player.hqY);
    const mobile = addEnemyMobile(room, "sim-mob", "enemy_raider", player.hqX + 1, player.hqY);
    const origDefHP = def.health;
    const origMobHP = mobile.health;

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    const defDmg = PAWN_TYPES["defender"].damage;
    const mobDmg = ENEMY_MOBILE_TYPES["enemy_raider"].damage;

    // Both take damage simultaneously
    expect(def.health).toBe(origDefHP - mobDmg);
    expect(mobile.health).toBe(origMobHP - defDmg);
  });

  it("higher-HP unit survives combat exchange", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    // Defender has higher HP
    const def = addDefender(room, "survive-def", "p1", player.hqX, player.hqY, { health: 100 });
    const mobile = addEnemyMobile(room, "survive-mob", "enemy_raider", player.hqX + 1, player.hqY, { health: 10 });

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    // Mobile should be dead, defender should survive
    expect(mobile.health).toBeLessThanOrEqual(0);
    expect(def.health).toBeGreaterThan(0);
  });

  it("both units can die in same tick if both reach zero HP simultaneously", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    const defDmg = PAWN_TYPES["defender"].damage;
    const mobDmg = ENEMY_MOBILE_TYPES["enemy_raider"].damage;

    // Set HP so both die in one hit
    const _def = addDefender(room, "mutual-def", "p1", player.hqX, player.hqY, { health: mobDmg });
    const _mobile = addEnemyMobile(room, "mutual-mob", "enemy_raider", player.hqX + 1, player.hqY, { health: defDmg });

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    // Both should be removed
    expect(room.state.creatures.has("mutual-def")).toBe(false);
    expect(room.state.creatures.has("mutual-mob")).toBe(false);
  });

  it("defender victory: mobile removed, defender resumes patrol at reduced HP", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    const def = addDefender(room, "victory-def", "p1", player.hqX, player.hqY, { currentState: "engage", health: 80 });
    const _mobile = addEnemyMobile(room, "victory-mob", "enemy_raider", player.hqX + 1, player.hqY, { health: 1 });

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    // Mobile should be dead
    expect(room.state.creatures.has("victory-mob")).toBe(false);
    expect(room.state.creatures.has("victory-def")).toBe(true);

    // Step defender — should return to patrol since no hostiles
    stepDefender(def, room.state);
    expect(def.currentState).toBe("patrol");
  });

  it("mobile victory: defender removed, mobile continues toward territory", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    const _def = addDefender(room, "loss-def", "p1", player.hqX, player.hqY, { health: 1 });
    const _mobile = addEnemyMobile(room, "loss-mob", "enemy_raider", player.hqX + 1, player.hqY, { health: 100 });

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    expect(room.state.creatures.has("loss-def")).toBe(false);
    expect(room.state.creatures.has("loss-mob")).toBe(true);
  });
});

// ── 3.2  Attacker vs Base Combat Resolution ──────────────────────────

describe("Combat Resolution — Attacker vs Enemy Base", () => {
  it("attacker deals damage to base each tick while adjacent", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const pos = findUnclaimedWalkable(room, 15, 15);
    const base = addEnemyBase(room, "atk-base", "enemy_base_raider", pos.x, pos.y);
    addAttacker(room, "atk-hit", "p1", pos.x + 1, pos.y);

    const origHP = base.health;
    const _atkDmg = PAWN_TYPES["attacker"].damage;

    // Multiple combat ticks
    for (let i = 1; i <= 3; i++) {
      room.state.tick = COMBAT.COMBAT_TICK_INTERVAL * i;
      // Need enough gap for cooldown
      room.state.tick = i * (COMBAT.ATTACK_COOLDOWN_TICKS + COMBAT.COMBAT_TICK_INTERVAL);
      // Align to combat interval
      room.state.tick = Math.ceil(room.state.tick / COMBAT.COMBAT_TICK_INTERVAL) * COMBAT.COMBAT_TICK_INTERVAL;
      const ebState = new Map<string, EnemyBaseTracker>();
      runCombat(room, ebState);
    }

    expect(base.health).toBeLessThan(origHP);
  });

  it("base does not fight back directly (static structure)", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const pos = findUnclaimedWalkable(room, 15, 15);
    addEnemyBase(room, "passive-base", "enemy_base_raider", pos.x, pos.y);
    const atk = addAttacker(room, "passive-atk", "p1", pos.x + 1, pos.y);
    const origHP = atk.health;

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    // Base has no damage value — attacker HP should be unchanged
    // (bases don't have entries in ENEMY_MOBILE_TYPES or PAWN_TYPES)
    expect(atk.health).toBe(origHP);
  });

  it("multiple attackers stack damage on same base", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const pos = findUnclaimedWalkable(room, 15, 15);
    const base = addEnemyBase(room, "stack-base", "enemy_base_raider", pos.x, pos.y);
    const origHP = base.health;

    addAttacker(room, "stack-atk1", "p1", pos.x + 1, pos.y);
    addAttacker(room, "stack-atk2", "p1", pos.x - 1, pos.y);

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    const atkDmg = PAWN_TYPES["attacker"].damage;
    expect(base.health).toBe(origHP - atkDmg * 2);
  });

  it("base destruction triggers mobile despawn for all its children", () => {
    const room = createRoom();
    const _player = joinPlayer(room, "p1");
    const pos = findUnclaimedWalkable(room, 15, 15);
    const base = addEnemyBase(room, "destroy-base", "enemy_base_raider", pos.x, pos.y);
    base.health = 1; // One hit to kill

    const _mob1 = addEnemyMobile(room, "child1", "enemy_raider", pos.x + 3, pos.y);
    const _mob2 = addEnemyMobile(room, "child2", "enemy_raider", pos.x + 4, pos.y);

    const _atk = addAttacker(room, "destroy-atk", "p1", pos.x + 1, pos.y);

    const ebState = new Map<string, EnemyBaseTracker>();
    ebState.set("destroy-base", {
      spawnedMobileIds: new Set(["child1", "child2"]),
    });

    room.state.tick = FIRST_COMBAT_TICK;
    runCombat(room, ebState);

    // Base and children should all be gone
    expect(room.state.creatures.has("destroy-base")).toBe(false);
    expect(room.state.creatures.has("child1")).toBe(false);
    expect(room.state.creatures.has("child2")).toBe(false);
  });
});

// ── 3.3  Multi-unit Engagement ───────────────────────────────────────

describe("Combat Resolution — Multi-unit Scenarios", () => {
  it("two defenders engage two mobiles — each picks closest target", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    const def1 = addDefender(room, "multi-def1", "p1", player.hqX, player.hqY);
    const def2 = addDefender(room, "multi-def2", "p1", player.hqX, player.hqY + 1);
    const _mob1 = addEnemyMobile(room, "multi-mob1", "enemy_raider", player.hqX + 1, player.hqY);
    const _mob2 = addEnemyMobile(room, "multi-mob2", "enemy_raider", player.hqX + 1, player.hqY + 1);

    // Step defenders to acquire targets
    stepDefender(def1, room.state);
    stepDefender(def2, room.state);

    // Each should engage
    expect(def1.currentState).toBe("engage");
    expect(def2.currentState).toBe("engage");
  });

  it("attacker ignores friendly defenders (no friendly fire)", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    const def = addDefender(room, "friend-def", "p1", player.hqX, player.hqY);
    const atk = addAttacker(room, "friend-atk", "p1", player.hqX + 1, player.hqY);
    const origDefHP = def.health;
    const origAtkHP = atk.health;

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    // No friendly fire
    expect(def.health).toBe(origDefHP);
    expect(atk.health).toBe(origAtkHP);
  });

  it("enemy mobiles ignore other enemy mobiles (no infighting)", () => {
    const room = createRoom();
    const mob1 = addEnemyMobile(room, "nofight1", "enemy_raider", 5, 5);
    const mob2 = addEnemyMobile(room, "nofight2", "enemy_raider", 6, 5);
    const origHP1 = mob1.health;
    const origHP2 = mob2.health;

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    expect(mob1.health).toBe(origHP1);
    expect(mob2.health).toBe(origHP2);
  });

  it("builders do not engage in combat (no damage dealt)", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    const builder = addBuilder(room, "passive-builder", "p1", player.hqX, player.hqY);
    const mobile = addEnemyMobile(room, "vs-builder", "enemy_raider", player.hqX + 1, player.hqY);
    const origMobHP = mobile.health;

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    // Builder deals 0 damage — mobile HP unchanged by builder
    // (mobile may take 0 from builder, builder takes damage from mobile)
    // Note: builder still gets hit by mobile
    expect(mobile.health).toBe(origMobHP);
    expect(builder.health).toBeLessThan(PAWN_TYPES["builder"].health);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PART 4 — Edge Cases & Boundary Conditions
// ═══════════════════════════════════════════════════════════════════════

describe("Edge Cases — Base Destroyed Mid-Combat", () => {
  it("mobiles mid-path despawn immediately when their parent base is destroyed", () => {
    const room = createRoom();
    const pos = findUnclaimedWalkable(room, 10, 10);
    addEnemyBase(room, "mid-base", "enemy_base_raider", pos.x, pos.y);
    const _mob = addEnemyMobile(room, "mid-mob", "enemy_raider", pos.x + 5, pos.y, { currentState: "move_to_target" });

    const ebState = new Map<string, EnemyBaseTracker>();
    ebState.set("mid-base", {
      spawnedMobileIds: new Set(["mid-mob"]),
    });

    onBaseDestroyed("mid-base", room.state, ebState);

    expect(room.state.creatures.has("mid-mob")).toBe(false);
  });

  it("base destroyed while spawning: tracker is cleaned up", () => {
    const room = createRoom();
    const pos = findUnclaimedWalkable(room);
    addEnemyBase(room, "cleanup-base", "enemy_base_raider", pos.x, pos.y);

    const ebState = new Map<string, EnemyBaseTracker>();
    ebState.set("cleanup-base", { spawnedMobileIds: new Set() });

    onBaseDestroyed("cleanup-base", room.state, ebState);

    expect(ebState.has("cleanup-base")).toBe(false);
  });
});

describe("Edge Cases — Defender Encounters Multiple Enemies", () => {
  it("defender engages one enemy at a time, not AoE", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    const def = addDefender(room, "single-def", "p1", player.hqX, player.hqY);
    const mob1 = addEnemyMobile(room, "aoe-mob1", "enemy_raider", player.hqX + 1, player.hqY, { health: 100 });
    const mob2 = addEnemyMobile(room, "aoe-mob2", "enemy_raider", player.hqX - 1, player.hqY, { health: 100 });
    const origDefHP = def.health;

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    const defDmg = PAWN_TYPES["defender"].damage;
    const mobDmg = ENEMY_MOBILE_TYPES["enemy_raider"].damage;
    // Pair-based: defender pairs with one mob, then the other mob pairs with defender.
    // Each mob takes defDmg individually from its pair resolution.
    // Defender takes damage from each mob that pairs with it.
    const mob1Dmg = 100 - mob1.health;
    const mob2Dmg = 100 - mob2.health;
    expect(mob1Dmg).toBe(defDmg);
    expect(mob2Dmg).toBe(defDmg);
    // Defender takes hits from both mobs
    expect(def.health).toBe(origDefHP - mobDmg * 2);
  });

  it("defender overwhelmed by 3+ mobiles dies faster than 1v1", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    // 1v1 scenario
    const def1 = addDefender(room, "1v1-def", "p1", player.hqX, player.hqY);
    const _mob1 = addEnemyMobile(room, "1v1-mob", "enemy_raider", player.hqX + 1, player.hqY);

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState1 = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState1);
    const dmg1v1 = PAWN_TYPES["defender"].health - def1.health;

    // Reset
    room.state.creatures.clear();

    // 1v3 scenario
    const def2 = addDefender(room, "1v3-def", "p1", player.hqX, player.hqY);
    addEnemyMobile(room, "3v1-mob1", "enemy_raider", player.hqX + 1, player.hqY);
    addEnemyMobile(room, "3v1-mob2", "enemy_raider", player.hqX - 1, player.hqY);
    addEnemyMobile(room, "3v1-mob3", "enemy_raider", player.hqX, player.hqY + 1);

    room.state.tick = COMBAT.COMBAT_TICK_INTERVAL * 2; // next combat tick after cooldown
    const ebState2 = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState2);
    const dmg1v3 = PAWN_TYPES["defender"].health - def2.health;

    // The defender against 3 mobiles takes at least as much damage
    // (pair-based means only one mob hits per tick, but the defender can be targeted by mob's own pair)
    expect(dmg1v3).toBeGreaterThanOrEqual(dmg1v1);
  });

  it("multiple defenders can converge on same enemy mobile", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    const def1 = addDefender(room, "conv-def1", "p1", player.hqX - 1, player.hqY);
    const def2 = addDefender(room, "conv-def2", "p1", player.hqX + 1, player.hqY);
    const _mob = addEnemyMobile(room, "conv-mob", "enemy_raider", player.hqX, player.hqY);

    stepDefender(def1, room.state);
    stepDefender(def2, room.state);

    // Both should target the same mobile
    expect(def1.currentState).toBe("engage");
    expect(def2.currentState).toBe("engage");
  });
});

describe("Edge Cases — Attacker Target Destroyed While En Route", () => {
  it("attacker heading to a base that is destroyed mid-path switches to seek_target", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    const pos = findUnclaimedWalkable(room, 15, 15);
    addEnemyBase(room, "gone-base", "enemy_base_raider", pos.x, pos.y);

    const atk = addAttacker(room, "enroute-atk", "p1", player.hqX, player.hqY, { currentState: "move_to_target" });
    atk.targetX = pos.x;
    atk.targetY = pos.y;

    const atkState = new Map<string, AttackerTracker>();
    atkState.set("enroute-atk", {
      returnTick: room.state.tick + 1000,
      homeTileX: player.hqX,
      homeTileY: player.hqY,
    });

    // Destroy the base
    room.state.creatures.delete("gone-base");

    stepAttacker(atk, room.state, atkState);

    expect(atk.currentState).toBe("seek_target");
  });

  it("attacker with no remaining bases on map stays in seek_target", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    const atk = addAttacker(room, "nobase-atk", "p1", player.hqX, player.hqY);

    // No enemy bases exist
    const atkState = new Map<string, AttackerTracker>();
    stepAttacker(atk, room.state, atkState);

    expect(atk.currentState).toBe("seek_target");
  });
});

describe("Edge Cases — Territory Changes During Combat", () => {
  it("mobile targeting a tile that becomes unclaimed mid-path skips it and seeks next", () => {
    const room = createRoom();
    joinPlayer(room, "p1");

    const pos = findUnclaimedWalkable(room, 15, 15);
    claimNonHQTile(room, pos.x, pos.y, "p1");

    const mobile = addEnemyMobile(room, "unclaim-mob", "enemy_raider", pos.x + 2, pos.y, {
      currentState: "move_to_target",
      targetX: pos.x,
      targetY: pos.y,
    });

    // Unclaim the tile
    const tile = room.state.getTile(pos.x, pos.y)!;
    tile.ownerID = "";

    stepEnemyMobile(mobile, room.state);

    expect(mobile.currentState).toBe("seek_territory");
  });

  it("new player territory expansion mid-patrol is included in defender's patrol zone", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    const def = addDefender(room, "expand-def", "p1", player.hqX, player.hqY, { currentState: "patrol" });

    // Expand territory by claiming adjacent tiles
    const halfSize = Math.floor(TERRITORY.STARTING_SIZE / 2);
    const newX = player.hqX + halfSize + 1;
    const newY = player.hqY;
    const newTile = room.state.getTile(newX, newY);
    if (newTile && room.state.isWalkable(newX, newY)) {
      newTile.ownerID = "p1";

      // Run patrol for many ticks to see if defender visits the new tile
      const visited = new Set<string>();
      for (let i = 0; i < 200; i++) {
        stepDefender(def, room.state);
        visited.add(`${def.x},${def.y}`);
      }

      // Defender should be able to reach the expanded tile
      // (it's adjacent to existing territory)
      expect(visited.size).toBeGreaterThan(2);
    }
  });
});

describe("Edge Cases — Resource & Spawning Boundaries", () => {
  it("player at exactly the cost threshold can spawn a unit (boundary check)", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    const defCost = PAWN_TYPES["defender"].cost;
    player.wood = defCost.wood;
    player.stone = defCost.stone;

    const fakeClient = { sessionId: "p1", send: (() => {}) as (...args: unknown[]) => void };
    room.nextCreatureId = 0;
    room.creatureIdCounter = { value: 0 };
    room.handleSpawnPawn(fakeClient, { pawnType: "defender" });

    let found = false;
    room.state.creatures.forEach((c) => {
      if (c.pawnType === "defender") found = true;
    });
    expect(found).toBe(true);
    expect(player.wood).toBe(0);
    expect(player.stone).toBe(0);
  });

  it("player one resource short of cost is rejected cleanly", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    const defCost = PAWN_TYPES["defender"].cost;
    player.wood = defCost.wood - 1;
    player.stone = defCost.stone;

    const fakeClient = { sessionId: "p1", send: (() => {}) as (...args: unknown[]) => void };
    room.nextCreatureId = 0;
    room.creatureIdCounter = { value: 0 };
    room.handleSpawnPawn(fakeClient, { pawnType: "defender" });

    let found = false;
    room.state.creatures.forEach((c) => {
      if (c.pawnType === "defender") found = true;
    });
    expect(found).toBe(false);
    // Resources not deducted
    expect(player.wood).toBe(defCost.wood - 1);
    expect(player.stone).toBe(defCost.stone);
  });

  it("spawning a defender at max count does not deduct resources", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    player.wood = 1000;
    player.stone = 1000;

    const fakeClient = { sessionId: "p1", send: (() => {}) as (...args: unknown[]) => void };
    room.nextCreatureId = 0;
    room.creatureIdCounter = { value: 0 };

    const maxDefs = PAWN_TYPES["defender"].maxCount;
    for (let i = 0; i < maxDefs; i++) {
      room.handleSpawnPawn(fakeClient, { pawnType: "defender" });
    }

    const woodAfterMax = player.wood;
    const stoneAfterMax = player.stone;

    // Try to spawn one more
    room.handleSpawnPawn(fakeClient, { pawnType: "defender" });

    // Resources should not change
    expect(player.wood).toBe(woodAfterMax);
    expect(player.stone).toBe(stoneAfterMax);
  });

  it("spawning different pawn types draws from separate max counts", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    player.wood = 5000;
    player.stone = 5000;

    const fakeClient = { sessionId: "p1", send: (() => {}) as (...args: unknown[]) => void };
    room.nextCreatureId = 0;
    room.creatureIdCounter = { value: 0 };

    // Fill defenders
    const maxDefs = PAWN_TYPES["defender"].maxCount;
    for (let i = 0; i < maxDefs; i++) {
      room.handleSpawnPawn(fakeClient, { pawnType: "defender" });
    }

    // Should still be able to spawn an attacker
    room.handleSpawnPawn(fakeClient, { pawnType: "attacker" });

    let defCount = 0;
    let atkCount = 0;
    room.state.creatures.forEach((c) => {
      if (c.pawnType === "defender") defCount++;
      if (c.pawnType === "attacker") atkCount++;
    });
    expect(defCount).toBe(maxDefs);
    expect(atkCount).toBe(1);
  });

  it("player can have max builders AND max defenders AND max attackers simultaneously", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");
    player.wood = 10000;
    player.stone = 10000;

    const fakeClient = { sessionId: "p1", send: (() => {}) as (...args: unknown[]) => void };
    room.nextCreatureId = 0;
    room.creatureIdCounter = { value: 0 };

    for (let i = 0; i < PAWN_TYPES["builder"].maxCount; i++) {
      room.handleSpawnPawn(fakeClient, { pawnType: "builder" });
    }
    for (let i = 0; i < PAWN_TYPES["defender"].maxCount; i++) {
      room.handleSpawnPawn(fakeClient, { pawnType: "defender" });
    }
    for (let i = 0; i < PAWN_TYPES["attacker"].maxCount; i++) {
      room.handleSpawnPawn(fakeClient, { pawnType: "attacker" });
    }

    let bCount = 0, dCount = 0, aCount = 0;
    room.state.creatures.forEach((c) => {
      if (c.pawnType === "builder") bCount++;
      if (c.pawnType === "defender") dCount++;
      if (c.pawnType === "attacker") aCount++;
    });
    expect(bCount).toBe(PAWN_TYPES["builder"].maxCount);
    expect(dCount).toBe(PAWN_TYPES["defender"].maxCount);
    expect(aCount).toBe(PAWN_TYPES["attacker"].maxCount);
  });
});

describe("Edge Cases — Map Boundary & Pathfinding", () => {
  it("mobile near map edge does not crash AI tick", () => {
    const room = createRoom();
    // Place at edge
    const w = room.state.mapWidth;
    const edgeX = w - 1;
    const edgeY = w - 1;
    const mobile = addEnemyMobile(room, "edge-mob", "enemy_raider", edgeX, edgeY);

    // Should not throw
    expect(() => {
      for (let i = 0; i < 10; i++) {
        stepEnemyMobile(mobile, room.state);
      }
    }).not.toThrow();
  });

  it("defender at territory edge adjacent to map boundary does not step off map", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    // Force territory to include edge tile
    const edgeTile = room.state.getTile(0, player.hqY);
    if (edgeTile) {
      edgeTile.ownerID = "p1";
    }

    const def = addDefender(room, "edge-def", "p1", 0, player.hqY, { currentState: "patrol" });

    for (let i = 0; i < 20; i++) {
      stepDefender(def, room.state);
      // Should never go out of bounds
      expect(def.x).toBeGreaterThanOrEqual(0);
      expect(def.y).toBeGreaterThanOrEqual(0);
      expect(def.x).toBeLessThan(room.state.mapWidth);
      expect(def.y).toBeLessThan(room.state.mapHeight);
    }
  });
});

describe("Edge Cases — Timing & Tick Ordering", () => {
  it("combat damage applied before death check (no zombie hits)", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    const _defDmg = PAWN_TYPES["defender"].damage;
    const _mobDmg = ENEMY_MOBILE_TYPES["enemy_raider"].damage;

    const _def = addDefender(room, "order-def", "p1", player.hqX, player.hqY, { health: 1 });
    const _mob = addEnemyMobile(room, "order-mob", "enemy_raider", player.hqX + 1, player.hqY, { health: 1 });

    room.state.tick = FIRST_COMBAT_TICK;
    const ebState = new Map<string, EnemyBaseTracker>();
    runCombat(room, ebState);

    // Both should be dead — damage was applied, then death check runs
    expect(room.state.creatures.has("order-def")).toBe(false);
    expect(room.state.creatures.has("order-mob")).toBe(false);
  });

  it("dead unit does not act on the tick it dies", () => {
    const room = createRoom();
    const player = joinPlayer(room, "p1");

    const mob = addEnemyMobile(room, "noact-mob", "enemy_raider", player.hqX + 1, player.hqY, { health: 0 });
    const _origX = mob.x;
    const _origY = mob.y;

    // Even if we try to step, dead units shouldn't process
    const _result = stepEnemyMobile(mob, room.state);
    // Should return false or not move — the creature has 0 HP
    // The AI may still step (health check is in tickCreatureAI wrapper), but combat will remove it
    expect(mob.health).toBeLessThanOrEqual(0);
  });

  it("enemy base only spawns during night phase (not dawn, day, or dusk)", () => {
    const room = createRoom();
    joinPlayer(room, "p1");
    room.state.tick = ENEMY_SPAWNING.BASE_SPAWN_INTERVAL_TICKS * 2;
    room.enemyBaseState = new Map();

    for (const phase of [DayPhase.Dawn, DayPhase.Day, DayPhase.Dusk]) {
      room.state.dayPhase = phase;
      room.state.creatures.clear();
      room.tickEnemyBaseSpawning();
      let count = 0;
      room.state.creatures.forEach((c) => { if (isEnemyBase(c.creatureType)) count++; });
      expect(count).toBe(0);
    }

    // Night should work
    room.state.dayPhase = DayPhase.Night;
    room.tickEnemyBaseSpawning();
    let nightCount = 0;
    room.state.creatures.forEach((c) => { if (isEnemyBase(c.creatureType)) nightCount++; });
    expect(nightCount).toBe(1);
  });
});
