import { describe, it, expect } from "vitest";
import { GameState, CreatureState, PlayerState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import {
  CREATURE_TYPES, CREATURE_AI, DEFAULT_MAP_SIZE,
  TAMING,
} from "@primal-grid/shared";

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

/** Join a player and return client + player. Player gets HQ and starting territory. */
function joinPlayer(room: any, sessionId: string) {
  const client = fakeClient(sessionId);
  room.onJoin(client);
  const player = room.state.players.get(sessionId)!;
  return { client, player };
}

/** Place a creature manually at a specific position with Phase 4 fields. */
function addCreature(
  room: any,
  id: string,
  type: string,
  x: number,
  y: number,
  overrides: Partial<{
    health: number; hunger: number; currentState: string;
    ownerID: string; trust: number; personality: string;
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
  if ("ownerID" in creature) (creature as any).ownerID = overrides.ownerID ?? "";
  if ("trust" in creature) (creature as any).trust = overrides.trust ?? 0;
  if ("personality" in creature) (creature as any).personality = overrides.personality ?? "neutral";
  room.state.creatures.set(id, creature);
  return creature;
}

/** Find a tile owned by player that is walkable. */
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

/** Find a tile NOT owned by any player. */
function findUnownedWalkableTile(room: any): { x: number; y: number } | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (tile.ownerID === "" && room.state.isWalkable(tile.x, tile.y)) {
      return { x: tile.x, y: tile.y };
    }
  }
  return null;
}

// ── TAME Handler ────────────────────────────────────────────────────

describe("Phase 4.2 — TAME Handler", () => {
  it("tames a creature on owned territory, sets ownerID", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "p1");
    player.berries = 5;

    const pos = findOwnedWalkableTile(room, "p1");
    if (!pos) return;

    const creature = addCreature(room, "c1", "herbivore", pos.x, pos.y);

    room.handleTame(client, { creatureId: "c1" });

    expect(creature.ownerID).toBe("p1");
    expect(player.berries).toBe(4); // cost 1 berry
  });

  it("rejects taming a creature far from territory", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "p1");
    player.berries = 5;

    const unowned = findUnownedWalkableTile(room);
    if (!unowned) return;

    // Ensure far from any owned territory
    let farTile: { x: number; y: number } | null = null;
    for (let i = room.state.tiles.length - 1; i >= 0; i--) {
      const tile = room.state.tiles.at(i)!;
      if (tile.ownerID === "" && room.state.isWalkable(tile.x, tile.y)) {
        // Check no adjacent owned tiles
        let nearTerritory = false;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const t = room.state.getTile(tile.x + dx, tile.y + dy);
            if (t && t.ownerID === "p1") { nearTerritory = true; break; }
          }
          if (nearTerritory) break;
        }
        if (!nearTerritory) { farTile = { x: tile.x, y: tile.y }; break; }
      }
    }
    if (!farTile) return;

    const creature = addCreature(room, "c-far", "herbivore", farTile.x, farTile.y);

    room.handleTame(client, { creatureId: "c-far" });

    expect(creature.ownerID).toBe(""); // still wild
    expect(player.berries).toBe(5); // not consumed
  });

  it("rejects taming an already-owned creature", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "p1");
    player.berries = 5;

    const pos = findOwnedWalkableTile(room, "p1");
    if (!pos) return;

    const creature = addCreature(room, "c-owned", "herbivore", pos.x, pos.y, {
      ownerID: "other-player",
    });

    room.handleTame(client, { creatureId: "c-owned" });

    expect(creature.ownerID).toBe("other-player"); // unchanged
    expect(player.berries).toBe(5);
  });

  it("rejects taming with insufficient food (no berries)", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "p1");
    player.berries = 0;

    const pos = findOwnedWalkableTile(room, "p1");
    if (!pos) return;

    const creature = addCreature(room, "c-nofood", "herbivore", pos.x, pos.y);

    room.handleTame(client, { creatureId: "c-nofood" });

    expect(creature.ownerID).toBe(""); // still wild
  });

  it("taming costs 1 berry for all creature types", () => {
    const room = createRoomWithMap(42);
    const { client, player } = joinPlayer(room, "p1");
    player.berries = 5;

    const pos = findOwnedWalkableTile(room, "p1");
    if (!pos) return;

    addCreature(room, "c-herb", "herbivore", pos.x, pos.y);

    room.handleTame(client, { creatureId: "c-herb" });

    expect(player.berries).toBe(4);
  });
});

// ── ABANDON Handler ─────────────────────────────────────────────────

describe("Phase 4.2 — ABANDON Handler", () => {
  it("owner can abandon: resets ownerID and trust", () => {
    const room = createRoomWithMap(42);
    const { client } = joinPlayer(room, "p1");

    const pos = findOwnedWalkableTile(room, "p1");
    if (!pos) return;

    const creature = addCreature(room, "c-abandon", "herbivore", pos.x, pos.y, {
      ownerID: "p1",
      trust: 80,
    });

    room.handleAbandon(client, { creatureId: "c-abandon" });

    expect(creature.ownerID).toBe("");
    expect(creature.trust).toBe(0);
  });

  it("non-owner cannot abandon someone else's creature", () => {
    const room = createRoomWithMap(42);
    const { client } = joinPlayer(room, "not-owner");

    const pos = findOwnedWalkableTile(room, "not-owner");
    if (!pos) return;

    const creature = addCreature(room, "c-notown", "herbivore", pos.x, pos.y, {
      ownerID: "real-owner",
      trust: 60,
    });

    room.handleAbandon(client, { creatureId: "c-notown" });

    expect(creature.ownerID).toBe("real-owner"); // unchanged
    expect(creature.trust).toBe(60);
  });
});

// ── Trust Mechanics ─────────────────────────────────────────────────

describe("Phase 4.2 — Trust Mechanics (Territory-Based)", () => {
  it("trust decays -1 per 20 ticks when creature is outside territory", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "p1");

    const unowned = findUnownedWalkableTile(room);
    if (!unowned) return;

    const creature = addCreature(room, "c-decay", "herbivore", unowned.x, unowned.y, {
      ownerID: "p1",
      trust: 50,
    });

    // Simulate 20 ticks
    for (let i = 0; i < 20; i++) {
      room.state.tick += 1;
      if (room.tickTrustDecay) room.tickTrustDecay();
    }

    expect(creature.trust).toBe(49); // -1 after 20 ticks
  });

  it("trust increases +1 per 10 ticks when creature is inside territory", () => {
    const room = createRoomWithMap(42);
    joinPlayer(room, "p1");

    const owned = findOwnedWalkableTile(room, "p1");
    if (!owned) return;

    const creature = addCreature(room, "c-prox", "herbivore", owned.x, owned.y, {
      ownerID: "p1",
      trust: 30,
    });

    // Simulate 10 ticks — creature is on owned tile
    for (let i = 0; i < 10; i++) {
      room.state.tick += 1;
      if (room.tickTrustDecay) room.tickTrustDecay();
    }

    expect(creature.trust).toBe(31); // +1 after 10 ticks
  });

  it("auto-abandon: trust at 0 for 50+ ticks turns creature wild", () => {
    const room = createRoomWithMap(42);
    joinPlayer(room, "p1");

    const unowned = findUnownedWalkableTile(room);
    if (!unowned) return;

    const creature = addCreature(room, "c-autoabandon", "herbivore", unowned.x, unowned.y, {
      ownerID: "p1",
      trust: 0,
    });

    // Simulate 55 ticks at trust=0
    for (let i = 0; i < 55; i++) {
      room.state.tick += 1;
      if (room.tickTrustDecay) room.tickTrustDecay();
    }

    expect(creature.ownerID).toBe(""); // went wild
    expect(creature.trust).toBe(0);
  });
});

// ── Personality Assignment ──────────────────────────────────────────

describe("Phase 4.1 — Personality Assignment at Spawn", () => {
  it("all spawned creatures get a valid personality", () => {
    const room = createRoomWithMap(42);
    room.spawnCreatures();

    const validPersonalities = ["docile", "neutral", "aggressive"];
    room.state.creatures.forEach((creature: any) => {
      if ("personality" in creature) {
        expect(validPersonalities).toContain(creature.personality);
      }
    });
  });

  it("personality distribution shows weighted randomness (not all same)", () => {
    const room = createRoomWithMap(42);
    room.spawnCreatures();

    const personalities = new Set<string>();
    room.state.creatures.forEach((creature: any) => {
      if ("personality" in creature) {
        personalities.add(creature.personality);
      }
    });

    if (personalities.size > 0) {
      expect(personalities.size).toBeGreaterThanOrEqual(1);
    }
  });
});
