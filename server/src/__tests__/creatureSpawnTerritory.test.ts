import { describe, it, expect } from "vitest";
import { GameState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import {
  CREATURE_TYPES, CREATURE_RESPAWN, CREATURE_SPAWN,
  DEFAULT_MAP_SIZE,
} from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): GameRoom {
  const room = Object.create(GameRoom.prototype) as GameRoom;
  room.state = new GameState();
  room.generateMap(seed);
  room.broadcast = () => {};
  return room;
}

function createRoomWithCreatures(seed?: number): GameRoom {
  const room = createRoomWithMap(seed);
  room.spawnCreatures();
  return room;
}

/** Claim a block of tiles for a player. Returns how many tiles were claimed. */
function claimTiles(
  room: GameRoom,
  ownerID: string,
  startX: number,
  startY: number,
  width: number,
  height: number,
): number {
  let claimed = 0;
  for (let y = startY; y < startY + height; y++) {
    for (let x = startX; x < startX + width; x++) {
      const tile = room.state.getTile(x, y);
      if (tile) {
        tile.ownerID = ownerID;
        claimed++;
      }
    }
  }
  return claimed;
}

/** Claim ALL tiles on the map for a player. */
function claimAllTiles(room: GameRoom, ownerID: string): void {
  const w = room.state.mapWidth;
  const h = room.state.mapHeight;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tile = room.state.getTile(x, y);
      if (tile) tile.ownerID = ownerID;
    }
  }
}

/** Claim all walkable tiles except one. Returns coords of the spared tile. */
function claimAllWalkableExceptOne(room: GameRoom, ownerID: string): { x: number; y: number } | null {
  const w = room.state.mapWidth;
  const h = room.state.mapHeight;
  let spared: { x: number; y: number } | null = null;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tile = room.state.getTile(x, y);
      if (!tile) continue;
      if (room.state.isWalkable(x, y) && !spared) {
        spared = { x, y }; // leave this one unowned
      } else {
        tile.ownerID = ownerID;
      }
    }
  }
  return spared;
}

// ═══════════════════════════════════════════════════════════════════
// Territory Exclusion — Creature Spawning
// ═══════════════════════════════════════════════════════════════════

describe("Territory Exclusion — Creature Spawning", () => {

  // ── 1. Creatures don't spawn on owned tiles ─────────────────────

  it("spawnCreatures: no creature lands on a player-owned tile", () => {
    const room = createRoomWithMap(42);

    // Claim a large region so there's meaningful owned area
    claimTiles(room, "player1", 0, 0, 20, 20);

    room.spawnCreatures();

    room.state.creatures.forEach((creature: CreatureState) => {
      const tile = room.state.getTile(creature.x, creature.y);
      expect(tile).toBeDefined();
      expect(tile!.ownerID).toBe("");
    });
  });

  it("spawnOneCreature: single creature avoids owned tiles", () => {
    const room = createRoomWithMap(42);

    // Claim half the map
    claimTiles(room, "player1", 0, 0, DEFAULT_MAP_SIZE, Math.floor(DEFAULT_MAP_SIZE / 2));

    // Spawn 20 individual creatures and verify each one
    for (let i = 0; i < 20; i++) {
      room.spawnOneCreature("herbivore");
    }

    room.state.creatures.forEach((creature: CreatureState) => {
      const tile = room.state.getTile(creature.x, creature.y);
      expect(tile).toBeDefined();
      expect(tile!.ownerID).toBe("");
    });
  });

  it("creatures avoid owned tiles across multiple seeds", () => {
    for (const seed of [1, 42, 100, 777]) {
      const room = createRoomWithMap(seed);
      claimTiles(room, "player1", 5, 5, 15, 15);
      room.spawnCreatures();

      room.state.creatures.forEach((creature: CreatureState) => {
        const tile = room.state.getTile(creature.x, creature.y);
        expect(tile!.ownerID).toBe("");
      });
    }
  });

  // ── 2. Creatures still spawn on unowned tiles ───────────────────

  it("creatures still spawn when some tiles are owned", () => {
    const room = createRoomWithMap(42);
    claimTiles(room, "player1", 0, 0, 10, 10);
    room.spawnCreatures();

    expect(room.state.creatures.size).toBeGreaterThan(0);

    // Verify they're on walkable, unowned tiles
    room.state.creatures.forEach((creature: CreatureState) => {
      expect(room.state.isWalkable(creature.x, creature.y)).toBe(true);
      const tile = room.state.getTile(creature.x, creature.y);
      expect(tile!.ownerID).toBe("");
    });
  });

  it("creature count stays reasonable even with large territory", () => {
    const room = createRoomWithMap(42);
    // Claim 25% of the map
    claimTiles(room, "player1", 0, 0, Math.floor(DEFAULT_MAP_SIZE / 2), Math.floor(DEFAULT_MAP_SIZE / 2));
    room.spawnCreatures();

    const expectedTotal = CREATURE_SPAWN.HERBIVORE_COUNT + CREATURE_SPAWN.CARNIVORE_COUNT + 
                         CREATURE_SPAWN.BIRD_COUNT + CREATURE_SPAWN.MONKEY_COUNT + CREATURE_SPAWN.SPIDER_COUNT;
    // Even with territory, most creatures should still find valid tiles
    expect(room.state.creatures.size).toBeGreaterThanOrEqual(Math.floor(expectedTotal * 0.5));
  });

  // ── 3. Respawned creatures also avoid territory ─────────────────

  it("tickCreatureRespawn: new creatures avoid owned tiles", () => {
    const room = createRoomWithCreatures(42);

    // Claim a large region AFTER initial spawning
    claimTiles(room, "player1", 0, 0, 30, 30);

    // Kill all herbivores to force respawn
    const toRemove: string[] = [];
    room.state.creatures.forEach((c: CreatureState) => {
      if (c.creatureType === "herbivore") toRemove.push(c.id);
    });
    toRemove.forEach((id: string) => room.state.creatures.delete(id));

    // Track existing creature IDs before respawn
    const existingIds = new Set<string>();
    room.state.creatures.forEach((c: CreatureState) => existingIds.add(c.id));

    // Trigger respawn
    room.state.tick = CREATURE_RESPAWN.CHECK_INTERVAL;
    room.tickCreatureRespawn();

    // Only verify NEWLY spawned creatures avoid owned tiles
    room.state.creatures.forEach((creature: CreatureState) => {
      if (existingIds.has(creature.id)) return; // skip pre-existing
      const tile = room.state.getTile(creature.x, creature.y);
      expect(tile).toBeDefined();
      expect(tile!.ownerID).toBe("");
    });

    // Confirm new creatures were actually spawned
    expect(room.state.creatures.size).toBeGreaterThan(existingIds.size);
  });

  it("respawned creatures land on walkable unowned tiles", () => {
    const room = createRoomWithCreatures(42);
    const minPop = (CREATURE_TYPES as Record<string, { minPopulation: number }>)["carnivore"].minPopulation;

    // Claim tiles
    claimTiles(room, "player2", 10, 10, 20, 20);

    // Remove carnivores below minimum
    const toRemove: string[] = [];
    room.state.creatures.forEach((c: CreatureState) => {
      if (c.creatureType === "carnivore") toRemove.push(c.id);
    });
    toRemove.forEach((id: string) => room.state.creatures.delete(id));

    // Trigger respawn
    room.state.tick = CREATURE_RESPAWN.CHECK_INTERVAL;
    room.tickCreatureRespawn();

    // Count carnivores — should be at least minPopulation
    let carnCount = 0;
    room.state.creatures.forEach((c: CreatureState) => {
      if (c.creatureType === "carnivore") {
        carnCount++;
        const tile = room.state.getTile(c.x, c.y);
        expect(tile!.ownerID).toBe("");
        expect(room.state.isWalkable(c.x, c.y)).toBe(true);
      }
    });
    expect(carnCount).toBeGreaterThanOrEqual(minPop);
  });

  // ── 4. Edge case: all/nearly all tiles owned ────────────────────

  it("creature placed on sole remaining unowned tile when rest are owned", () => {
    const room = createRoomWithMap(42);
    const spared = claimAllWalkableExceptOne(room, "player1");
    expect(spared).not.toBeNull();

    room.spawnOneCreature("herbivore");

    // The creature should land on the one unowned walkable tile
    expect(room.state.creatures.size).toBe(1);
    room.state.creatures.forEach((creature: CreatureState) => {
      const tile = room.state.getTile(creature.x, creature.y);
      expect(tile!.ownerID).toBe("");
    });
  });

  it("all tiles owned: spawn still returns a position (graceful fallback)", () => {
    const room = createRoomWithMap(42);
    claimAllTiles(room, "player1");

    // The implementation falls back to (0,0) when nothing is available
    room.spawnOneCreature("herbivore");
    expect(room.state.creatures.size).toBe(1);

    // Creature exists — the system didn't crash
    const creature = room.state.creatures.values().next().value;
    expect(creature).toBeDefined();
    expect(typeof creature.x).toBe("number");
    expect(typeof creature.y).toBe("number");
  });

  it("multi-player territory: no creature spawns on any player's tiles", () => {
    const room = createRoomWithMap(42);
    // Two players each claim separate regions
    claimTiles(room, "player1", 0, 0, 15, 15);
    claimTiles(room, "player2", 40, 40, 15, 15);

    room.spawnCreatures();

    room.state.creatures.forEach((creature: CreatureState) => {
      const tile = room.state.getTile(creature.x, creature.y);
      expect(tile).toBeDefined();
      expect(tile!.ownerID).toBe("");
    });
  });
});
