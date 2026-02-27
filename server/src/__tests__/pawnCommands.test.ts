import { describe, it, expect } from "vitest";
import { GameState, CreatureState, PlayerState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { tickCreatureAI } from "../rooms/creatureAI.js";
import {
  CREATURE_TYPES, CREATURE_AI, TAMING, PAWN_COMMAND,
  TileType, ResourceType,
} from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): any {
  const room = Object.create(GameRoom.prototype) as any;
  room.state = new GameState();
  room.nextStructureId = 0;
  room.nextCreatureId = 0;
  room.generateMap(seed);
  return room;
}

function fakeClient(sessionId: string): any {
  return { sessionId };
}

function joinPlayer(room: any, sessionId: string) {
  const client = fakeClient(sessionId);
  room.onJoin(client);
  const player = room.state.players.get(sessionId)!;
  return { client, player };
}

/** Place a creature manually with pawn fields pre-set. */
function addCreature(
  room: any,
  id: string,
  type: string,
  x: number,
  y: number,
  overrides: Partial<{
    health: number; hunger: number; currentState: string;
    ownerID: string; trust: number; personality: string;
    command: string; zoneX: number; zoneY: number;
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
  creature.command = overrides.command ?? "idle";
  creature.zoneX = overrides.zoneX ?? -1;
  creature.zoneY = overrides.zoneY ?? -1;
  room.state.creatures.set(id, creature);
  return creature;
}

/** Find a walkable tile owned by the player (without structure). */
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

/** Find a walkable tile NOT owned by any player. */
function findUnownedWalkableTile(room: any): { x: number; y: number } | null {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (tile.ownerID === "" && room.state.isWalkable(tile.x, tile.y)) {
      return { x: tile.x, y: tile.y };
    }
  }
  return null;
}

// ── ASSIGN_PAWN Handler Tests ───────────────────────────────────────

describe("C9 — Pawn Command Integration Tests", () => {

  describe("ASSIGN_PAWN handler validation", () => {

    it("1. accepted — owned creature with trust ≥ 70, valid command, zone in territory", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");

      const pos = findOwnedWalkableTile(room, "p1")!;
      expect(pos).not.toBeNull();

      const creature = addCreature(room, "c1", "herbivore", pos.x, pos.y, {
        ownerID: "p1",
        trust: 100,
      });

      room.handleAssignPawn(client, {
        creatureId: "c1",
        command: "gather",
        zoneX: pos.x,
        zoneY: pos.y,
      });

      expect(creature.command).toBe("gather");
      expect(creature.zoneX).toBe(pos.x);
      expect(creature.zoneY).toBe(pos.y);
    });

    it("2. rejected: unowned — creature owned by different player", () => {
      const room = createRoomWithMap(42);
      const { client } = joinPlayer(room, "p1");

      const pos = findOwnedWalkableTile(room, "p1")!;
      expect(pos).not.toBeNull();

      const creature = addCreature(room, "c2", "herbivore", pos.x, pos.y, {
        ownerID: "p2",
        trust: 100,
      });

      room.handleAssignPawn(client, {
        creatureId: "c2",
        command: "gather",
        zoneX: pos.x,
        zoneY: pos.y,
      });

      // Should remain idle — command rejected
      expect(creature.command).toBe("idle");
      expect(creature.zoneX).toBe(-1);
    });

    it("3. rejected: low trust — creature with trust < 70", () => {
      const room = createRoomWithMap(42);
      const { client } = joinPlayer(room, "p1");

      const pos = findOwnedWalkableTile(room, "p1")!;
      expect(pos).not.toBeNull();

      const creature = addCreature(room, "c3", "herbivore", pos.x, pos.y, {
        ownerID: "p1",
        trust: 69,
      });

      room.handleAssignPawn(client, {
        creatureId: "c3",
        command: "gather",
        zoneX: pos.x,
        zoneY: pos.y,
      });

      expect(creature.command).toBe("idle");
      expect(creature.zoneX).toBe(-1);
    });

    it("4. rejected: invalid command — command string not in whitelist", () => {
      const room = createRoomWithMap(42);
      const { client } = joinPlayer(room, "p1");

      const pos = findOwnedWalkableTile(room, "p1")!;
      expect(pos).not.toBeNull();

      const creature = addCreature(room, "c4", "herbivore", pos.x, pos.y, {
        ownerID: "p1",
        trust: 100,
      });

      room.handleAssignPawn(client, {
        creatureId: "c4",
        command: "attack" as any,
        zoneX: pos.x,
        zoneY: pos.y,
      });

      expect(creature.command).toBe("idle");
    });

    it("5. rejected: zone outside territory — zone tile not owned by player", () => {
      const room = createRoomWithMap(42);
      const { client } = joinPlayer(room, "p1");

      const unowned = findUnownedWalkableTile(room)!;
      expect(unowned).not.toBeNull();

      const pos = findOwnedWalkableTile(room, "p1")!;
      const creature = addCreature(room, "c5", "herbivore", pos.x, pos.y, {
        ownerID: "p1",
        trust: 100,
      });

      room.handleAssignPawn(client, {
        creatureId: "c5",
        command: "gather",
        zoneX: unowned.x,
        zoneY: unowned.y,
      });

      // Command should not be set — zone is outside territory
      expect(creature.command).toBe("idle");
      expect(creature.zoneX).toBe(-1);
    });
  });

  // ── Gather Pawn Behavior ──────────────────────────────────────────

  describe("Gather pawn behavior", () => {

    it("6. gather pawn moves toward zone", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");

      const pos = findOwnedWalkableTile(room, "p1")!;
      expect(pos).not.toBeNull();

      // Place creature far from zone (at least 5 tiles away)
      const startX = Math.max(0, pos.x - 8);
      const startY = Math.max(0, pos.y - 8);

      const creature = addCreature(room, "g1", "herbivore", startX, startY, {
        ownerID: "p1",
        trust: 100,
        command: "gather",
        zoneX: pos.x,
        zoneY: pos.y,
      });

      const initialDist = Math.abs(creature.x - pos.x) + Math.abs(creature.y - pos.y);

      // Tick creature AI several times
      for (let i = 0; i < 5; i++) {
        tickCreatureAI(room.state);
      }

      const finalDist = Math.abs(creature.x - pos.x) + Math.abs(creature.y - pos.y);
      expect(finalDist).toBeLessThan(initialDist);
    });

    it("7. gather pawn collects resources — creature at resource tile harvests", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");

      const pos = findOwnedWalkableTile(room, "p1")!;
      expect(pos).not.toBeNull();

      // Place resource on the tile
      const tile = room.state.getTile(pos.x, pos.y)!;
      tile.resourceType = ResourceType.Wood;
      tile.resourceAmount = 5;

      // Place creature right on the zone tile (within range ≤ 2)
      const creature = addCreature(room, "g2", "herbivore", pos.x, pos.y, {
        ownerID: "p1",
        trust: 100,
        command: "gather",
        zoneX: pos.x,
        zoneY: pos.y,
      });

      const woodBefore = player.wood;
      tickCreatureAI(room.state);

      // Resource should be harvested, amount decremented
      expect(tile.resourceAmount).toBe(4);
      expect(player.wood).toBe(woodBefore + 1);
    });

    it("8. gather pawn deposits to owner — owner's wood/stone/fiber/berries increment", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");

      const pos = findOwnedWalkableTile(room, "p1")!;
      expect(pos).not.toBeNull();

      // Test each resource type
      const resourceTests = [
        { type: ResourceType.Wood, field: "wood" as const },
        { type: ResourceType.Stone, field: "stone" as const },
        { type: ResourceType.Fiber, field: "fiber" as const },
        { type: ResourceType.Berries, field: "berries" as const },
      ];

      for (const rt of resourceTests) {
        const tile = room.state.getTile(pos.x, pos.y)!;
        tile.resourceType = rt.type;
        tile.resourceAmount = 3;

        const cid = `g-${rt.field}`;
        const creature = addCreature(room, cid, "herbivore", pos.x, pos.y, {
          ownerID: "p1",
          trust: 100,
          command: "gather",
          zoneX: pos.x,
          zoneY: pos.y,
        });

        const before = player[rt.field];
        tickCreatureAI(room.state);

        expect(player[rt.field]).toBe(before + 1);

        // Clean up creature for next iteration
        room.state.creatures.delete(cid);
      }
    });
  });

  // ── Guard Pawn Behavior ───────────────────────────────────────────

  describe("Guard pawn behavior", () => {

    it("9. guard pawn attacks wild creature in range", () => {
      const room = createRoomWithMap(42);
      joinPlayer(room, "p1");

      const pos = findOwnedWalkableTile(room, "p1")!;
      expect(pos).not.toBeNull();

      // Guard at pos
      const guard = addCreature(room, "guard1", "herbivore", pos.x, pos.y, {
        ownerID: "p1",
        trust: 100,
        command: "guard",
        zoneX: pos.x,
        zoneY: pos.y,
      });

      // Wild creature adjacent to guard (within GUARD_RANGE)
      const wildX = pos.x + 1;
      const wildY = pos.y;
      const wild = addCreature(room, "wild1", "carnivore", wildX, wildY, {
        health: 100,
      });

      const healthBefore = wild.health;

      // Tick several times so guard can reach and attack
      for (let i = 0; i < 3; i++) {
        tickCreatureAI(room.state);
      }

      // Wild creature should have taken damage
      expect(wild.health).toBeLessThan(healthBefore);
    });

    it("10. guard pawn returns to post — guard that drifted returns to zone", () => {
      const room = createRoomWithMap(42);
      joinPlayer(room, "p1");

      const pos = findOwnedWalkableTile(room, "p1")!;
      expect(pos).not.toBeNull();

      // Find a walkable tile at least 5 tiles from zone for reliable test
      let startX = pos.x;
      let startY = pos.y;
      for (let d = 5; d <= 10; d++) {
        for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
          const tx = pos.x + dx;
          const ty = pos.y + dy;
          if (tx >= 0 && ty >= 0 && room.state.isWalkable(tx, ty)) {
            startX = tx;
            startY = ty;
            break;
          }
        }
        if (startX !== pos.x || startY !== pos.y) break;
      }

      const guard = addCreature(room, "guard2", "herbivore", startX, startY, {
        ownerID: "p1",
        trust: 100,
        command: "guard",
        zoneX: pos.x,
        zoneY: pos.y,
      });

      const initialDist = Math.abs(guard.x - pos.x) + Math.abs(guard.y - pos.y);
      expect(initialDist).toBeGreaterThan(3);

      for (let i = 0; i < 5; i++) {
        tickCreatureAI(room.state);
      }

      const finalDist = Math.abs(guard.x - pos.x) + Math.abs(guard.y - pos.y);
      expect(finalDist).toBeLessThan(initialDist);
    });

    it("11. guard pawn idles when no threats — stays near post", () => {
      const room = createRoomWithMap(42);
      joinPlayer(room, "p1");

      const pos = findOwnedWalkableTile(room, "p1")!;
      expect(pos).not.toBeNull();

      // Guard right at post, no hostiles nearby
      const guard = addCreature(room, "guard3", "herbivore", pos.x, pos.y, {
        ownerID: "p1",
        trust: 100,
        command: "guard",
        zoneX: pos.x,
        zoneY: pos.y,
      });

      tickCreatureAI(room.state);

      // Should be idle and near post
      expect(guard.currentState).toBe("idle");
      const dist = Math.abs(guard.x - pos.x) + Math.abs(guard.y - pos.y);
      expect(dist).toBeLessThanOrEqual(3);
    });
  });

  // ── Idle Pawn Behavior ────────────────────────────────────────────

  describe("Idle pawn behavior", () => {

    it("12. idle tamed creature stays in territory", () => {
      const room = createRoomWithMap(42);
      joinPlayer(room, "p1");

      const pos = findOwnedWalkableTile(room, "p1")!;
      expect(pos).not.toBeNull();

      const creature = addCreature(room, "idle1", "herbivore", pos.x, pos.y, {
        ownerID: "p1",
        trust: 100,
        command: "idle",
      });

      // Tick several times
      for (let i = 0; i < 10; i++) {
        tickCreatureAI(room.state);
      }

      // Should still be on an owned tile
      const tile = room.state.getTile(creature.x, creature.y);
      expect(tile).toBeDefined();
      expect(tile!.ownerID).toBe("p1");
    });
  });

  // ── Command Change & Idle Clear ───────────────────────────────────

  describe("Command transitions", () => {

    it("13. command change updates behavior — gather → guard", () => {
      const room = createRoomWithMap(42);
      const { client, player } = joinPlayer(room, "p1");

      const pos = findOwnedWalkableTile(room, "p1")!;
      expect(pos).not.toBeNull();

      const creature = addCreature(room, "cc1", "herbivore", pos.x, pos.y, {
        ownerID: "p1",
        trust: 100,
        command: "gather",
        zoneX: pos.x,
        zoneY: pos.y,
      });

      expect(creature.command).toBe("gather");

      // Change to guard
      room.handleAssignPawn(client, {
        creatureId: "cc1",
        command: "guard",
        zoneX: pos.x,
        zoneY: pos.y,
      });

      expect(creature.command).toBe("guard");
      expect(creature.zoneX).toBe(pos.x);
      expect(creature.zoneY).toBe(pos.y);

      // Tick once — should behave as guard (idle state, no threats)
      tickCreatureAI(room.state);
      expect(creature.currentState).toBe("idle");
    });

    it("14. idle command clears zone — zoneX/zoneY set to -1", () => {
      const room = createRoomWithMap(42);
      const { client } = joinPlayer(room, "p1");

      const pos = findOwnedWalkableTile(room, "p1")!;
      expect(pos).not.toBeNull();

      const creature = addCreature(room, "cc2", "herbivore", pos.x, pos.y, {
        ownerID: "p1",
        trust: 100,
        command: "gather",
        zoneX: pos.x,
        zoneY: pos.y,
      });

      expect(creature.zoneX).toBe(pos.x);
      expect(creature.zoneY).toBe(pos.y);

      // Send idle command
      room.handleAssignPawn(client, {
        creatureId: "cc2",
        command: "idle",
        zoneX: 0,
        zoneY: 0,
      });

      expect(creature.command).toBe("idle");
      expect(creature.zoneX).toBe(-1);
      expect(creature.zoneY).toBe(-1);
    });
  });
});
