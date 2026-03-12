/**
 * Explorer AI — Issue #147
 *
 * Tests verify that explorers:
 * 1. Prefer unclaimed tiles over owned tiles (frontier bias)
 * 2. Navigate through owned territory toward the frontier (frontier scan)
 * 3. Spread apart from other same-owner explorers (repulsion)
 * 4. Fall back to random movement when fully surrounded by owned tiles
 */
import { describe, it, expect, vi } from "vitest";
import { GameState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { stepExplorer, countFrontierInDirection } from "../rooms/explorerAI.js";
import {
  PAWN_TYPES,
} from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): GameRoom {
  const room = Object.create(GameRoom.prototype) as GameRoom;
  room.state = new GameState();
  room.generateMap(seed);
  room.broadcast = vi.fn();
  room.playerViews = new Map();
  return room;
}

function addExplorer(
  room: GameRoom,
  id: string,
  ownerID: string,
  x: number,
  y: number,
  overrides: Partial<{
    currentState: string;
  }> = {},
): CreatureState {
  const creature = new CreatureState();
  creature.id = id;
  creature.creatureType = "pawn_explorer";
  creature.x = x;
  creature.y = y;
  creature.health = PAWN_TYPES.explorer.health;
  creature.currentState = overrides.currentState ?? "wander";
  creature.ownerID = ownerID;
  creature.pawnType = "explorer";
  creature.stamina = PAWN_TYPES.explorer.maxStamina;
  creature.nextMoveTick = 0;
  room.state.creatures.set(id, creature);
  return creature;
}

/** Claim a rectangular region of tiles for a given owner. */
function claimRegion(
  state: GameState,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  ownerID: string,
) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      const tile = state.getTile(x, y);
      if (tile) tile.ownerID = ownerID;
    }
  }
}

/**
 * Find a walkable position on the map where we can place an explorer
 * and claim a region around it. Returns the center coordinates.
 */
function findWalkableCenter(state: GameState, margin: number = 15): { x: number; y: number } {
  for (let y = margin; y < state.mapHeight - margin; y++) {
    for (let x = margin; x < state.mapWidth - margin; x++) {
      let allWalkable = true;
      for (let dy = -5; dy <= 5 && allWalkable; dy++) {
        for (let dx = -5; dx <= 5 && allWalkable; dx++) {
          if (!state.isWalkable(x + dx, y + dy)) allWalkable = false;
        }
      }
      if (allWalkable) return { x, y };
    }
  }
  return { x: margin, y: margin };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Explorer AI", () => {
  describe("stepExplorer FSM transitions", () => {
    it("transitions from idle to wander", () => {
      const room = createRoomWithMap(42);
      const center = findWalkableCenter(room.state);
      const explorer = addExplorer(room, "e1", "p1", center.x, center.y, {
        currentState: "idle",
      });

      stepExplorer(explorer, room.state);
      expect(explorer.currentState).toBe("wander");
    });

    it("recovers unknown states to wander", () => {
      const room = createRoomWithMap(42);
      const center = findWalkableCenter(room.state);
      const explorer = addExplorer(room, "e1", "p1", center.x, center.y, {
        currentState: "bogus_state",
      });

      stepExplorer(explorer, room.state);
      expect(explorer.currentState).toBe("wander");
    });
  });

  describe("countFrontierInDirection", () => {
    it("counts unclaimed tiles along a ray", () => {
      const room = createRoomWithMap(42);
      const center = findWalkableCenter(room.state);

      // Claim tiles to the west, leave east unclaimed
      claimRegion(room.state, center.x - 3, center.y, center.x, center.y, "p1");

      const eastCount = countFrontierInDirection(
        room.state, center.x, center.y, 1, 0, 6,
      );
      const westCount = countFrontierInDirection(
        room.state, center.x, center.y, -1, 0, 6,
      );

      // East should have more unclaimed tiles than west
      expect(eastCount).toBeGreaterThan(westCount);
    });

    it("returns 0 when all tiles in direction are owned", () => {
      const room = createRoomWithMap(42);
      const center = findWalkableCenter(room.state);

      // Claim a large region in all directions
      claimRegion(
        room.state,
        center.x - 8, center.y - 8,
        center.x + 8, center.y + 8,
        "p1",
      );

      const count = countFrontierInDirection(
        room.state, center.x, center.y, 1, 0, 6,
      );
      expect(count).toBe(0);
    });

    it("stops at map boundaries", () => {
      const room = createRoomWithMap(42);

      // Place at map edge and scan outward
      const count = countFrontierInDirection(
        room.state, 0, 0, -1, 0, 6,
      );
      expect(count).toBe(0);
    });
  });

  describe("frontier-directed movement", () => {
    it("moves toward unclaimed tiles when at frontier", () => {
      const room = createRoomWithMap(42);
      const center = findWalkableCenter(room.state);

      // Claim a large block around and west of center; leave only east unclaimed.
      // This forces the frontier to be exclusively to the east.
      claimRegion(
        room.state,
        center.x - 8, center.y - 8,
        center.x, center.y + 8,
        "p1",
      );

      const explorer = addExplorer(room, "e1", "p1", center.x, center.y);

      // Run steps — explorer should drift eastward (toward frontier)
      let eastwardMoves = 0;
      let totalMoves = 0;
      for (let i = 0; i < 40; i++) {
        const prevX = explorer.x;
        const moved = stepExplorer(explorer, room.state);
        if (moved) {
          totalMoves++;
          if (explorer.x > prevX) eastwardMoves++;
        }
      }

      // Explorer should move and frequently head east
      expect(totalMoves).toBeGreaterThan(0);
      expect(eastwardMoves).toBeGreaterThan(0);
    });

    it("navigates through owned territory toward frontier", () => {
      const room = createRoomWithMap(42);
      const center = findWalkableCenter(room.state);

      // Claim a narrow band: frontier is within scan range from the start.
      claimRegion(
        room.state,
        center.x - 4, center.y - 4,
        center.x + 2, center.y + 4,
        "p1",
      );

      // Place explorer inside owned territory — frontier (east of x+2) is nearby
      const explorer = addExplorer(room, "e1", "p1", center.x, center.y);
      const startX = explorer.x;

      // Track max-x reached over many steps
      let maxX = startX;
      for (let i = 0; i < 80; i++) {
        stepExplorer(explorer, room.state);
        if (explorer.x > maxX) maxX = explorer.x;
      }

      // Explorer should have ventured east of its starting position at some point
      expect(maxX).toBeGreaterThan(startX);
    });
  });

  describe("explorer repulsion", () => {
    it("explorers prefer tiles away from each other", () => {
      const room = createRoomWithMap(42);
      const center = findWalkableCenter(room.state);

      // Place two explorers at same position
      const e1 = addExplorer(room, "e1", "p1", center.x, center.y);
      const e2 = addExplorer(room, "e2", "p1", center.x, center.y);

      // Run several steps
      for (let i = 0; i < 30; i++) {
        stepExplorer(e1, room.state);
        stepExplorer(e2, room.state);
      }

      // They should have separated
      const dist = Math.abs(e1.x - e2.x) + Math.abs(e1.y - e2.y);
      expect(dist).toBeGreaterThan(0);
    });
  });

  describe("fallback behavior", () => {
    it("still moves when completely surrounded by owned tiles", () => {
      const room = createRoomWithMap(42);
      const center = findWalkableCenter(room.state);

      // Claim everything within a large radius
      claimRegion(
        room.state,
        center.x - 10, center.y - 10,
        center.x + 10, center.y + 10,
        "p1",
      );

      const explorer = addExplorer(room, "e1", "p1", center.x, center.y);

      let moved = false;
      for (let i = 0; i < 10; i++) {
        if (stepExplorer(explorer, room.state)) moved = true;
      }

      // Should still move even when no frontier exists
      expect(moved).toBe(true);
    });
  });
});
