import { describe, it, expect } from "vitest";
import { GameState, CreatureState, TileState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { tickCreatureAI, moveToward } from "../rooms/creatureAI.js";
import {
  TileType, ResourceType,
  CREATURE_TYPES, CREATURE_AI,
  DEFAULT_MAP_SIZE,
} from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

/** Create a room with map + creature spawning. Uses Object.create pattern. */
function createRoom(seed?: number): any {
  const room = Object.create(GameRoom.prototype) as any;
  room.state = new GameState();
  room.generateMap(seed);
  // Stub broadcast/send so tickCreatureAI doesn't throw
  room.broadcast = () => {};
  room.send = () => {};
  return room;
}

/** Place a creature at a position. */
function addCreature(
  room: any,
  id: string,
  type: string,
  x: number,
  y: number,
  overrides: Partial<{
    health: number;
    hunger: number;
    currentState: string;
    ownerID: string;
    pawnType: string;
  }> = {},
): CreatureState {
  const creature = new CreatureState();
  creature.id = id;
  creature.creatureType = type;
  creature.x = x;
  creature.y = y;
  const typeDef = (CREATURE_TYPES as Record<string, any>)[type];
  if (typeDef) {
    creature.health = overrides.health ?? typeDef.health;
    creature.hunger = overrides.hunger ?? typeDef.hunger;
  } else {
    creature.health = overrides.health ?? 100;
    creature.hunger = overrides.hunger ?? 100;
  }
  creature.currentState = overrides.currentState ?? "idle";
  creature.ownerID = overrides.ownerID ?? "";
  creature.pawnType = overrides.pawnType ?? "";
  room.state.creatures.set(id, creature);
  return creature;
}

/** Mark a tile as owned by a player. */
function claimTile(room: any, x: number, y: number, ownerID: string): void {
  const tile = room.state.getTile(x, y);
  if (tile) {
    tile.ownerID = ownerID;
  }
}

/** Find a contiguous block of walkable tiles. Returns the top-left corner. */
function findWalkableBlock(room: any, width: number, height: number): { x: number; y: number } | null {
  const mapW = room.state.mapWidth;
  const mapH = room.state.mapHeight;
  for (let y = 1; y < mapH - height - 1; y++) {
    for (let x = 1; x < mapW - width - 1; x++) {
      let allWalkable = true;
      // Check the block plus a 1-tile border around it
      for (let dy = -1; dy <= height && allWalkable; dy++) {
        for (let dx = -1; dx <= width && allWalkable; dx++) {
          if (!room.state.isWalkable(x + dx, y + dy)) allWalkable = false;
        }
      }
      if (allWalkable) return { x, y };
    }
  }
  return null;
}

function manhattan(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

/** Tick the creature AI via the exported module function. */
function tickAI(room: any): void {
  room.state.tick += CREATURE_AI.TICK_INTERVAL;
  tickCreatureAI(room.state, room);
}

// ── Test: Herbivore blocked by territory ────────────────────────────

describe("Territory Barrier — Herbivore blocked", () => {
  it("herbivore wandering does NOT enter a player-owned tile", () => {
    const room = createRoom(42);
    room.state.creatures.clear();

    // Find a walkable block: creature sits at center, surrounded by owned tiles on one side
    const block = findWalkableBlock(room, 5, 5);
    expect(block).not.toBeNull();
    const { x: bx, y: by } = block!;

    // Place herbivore in the middle
    const herb = addCreature(room, "herb-wander", "herbivore", bx + 2, by + 2, {
      currentState: "idle",
      hunger: 100, // well-fed, no food-seeking urgency
    });

    // Claim all tiles in a 3x3 area to the right (bx+3..bx+5, by+1..by+3)
    for (let dy = 0; dy <= 4; dy++) {
      for (let dx = 3; dx <= 4; dx++) {
        claimTile(room, bx + dx, by + dy, "player-1");
      }
    }

    // Run many ticks — herbivore wanders randomly but should NEVER land on owned tiles
    for (let i = 0; i < 60; i++) {
      tickAI(room);
      const c = room.state.creatures.get("herb-wander");
      if (!c) break; // died — fine, not our concern
      const tile = room.state.getTile(c.x, c.y);
      expect(tile?.ownerID ?? "").not.toBe("player-1");
    }
  });

  it("herbivore moving toward food does NOT enter owned tile", () => {
    const room = createRoom(42);
    room.state.creatures.clear();

    const block = findWalkableBlock(room, 5, 3);
    expect(block).not.toBeNull();
    const { x: bx, y: by } = block!;

    // Place a resource on the far side of owned territory
    const foodTile = room.state.getTile(bx + 4, by + 1);
    foodTile!.resourceType = ResourceType.Wood;
    foodTile!.resourceAmount = 10;

    // Claim tiles between herbivore and food (forming a wall)
    for (let dy = 0; dy <= 2; dy++) {
      claimTile(room, bx + 2, by + dy, "player-1");
    }

    // Place hungry herbivore on the left side
    const herb = addCreature(room, "herb-food", "herbivore", bx, by + 1, {
      currentState: "wander",
      hunger: CREATURE_AI.HUNGRY_THRESHOLD - 10,
    });

    for (let i = 0; i < 20; i++) {
      tickAI(room);
      const c = room.state.creatures.get("herb-food");
      if (!c) break;
      const tile = room.state.getTile(c.x, c.y);
      expect(tile?.ownerID ?? "").not.toBe("player-1");
    }
  });

  it("herbivore fleeing carnivore does NOT enter owned tile", () => {
    const room = createRoom(42);
    room.state.creatures.clear();

    const block = findWalkableBlock(room, 5, 3);
    expect(block).not.toBeNull();
    const { x: bx, y: by } = block!;

    // Owned territory on the right side — herbivore fleeing left-to-right should be blocked
    for (let dy = 0; dy <= 2; dy++) {
      claimTile(room, bx + 3, by + dy, "player-1");
      claimTile(room, bx + 4, by + dy, "player-1");
    }

    // Herbivore at (bx+2, by+1), carnivore chasing from (bx, by+1)
    const herb = addCreature(room, "herb-flee", "herbivore", bx + 2, by + 1, {
      currentState: "idle",
    });
    addCreature(room, "carn-chase", "carnivore", bx, by + 1, {
      currentState: "hunt",
      hunger: CREATURE_AI.HUNGRY_THRESHOLD - 10,
    });

    for (let i = 0; i < 20; i++) {
      tickAI(room);
      const c = room.state.creatures.get("herb-flee");
      if (!c) break;
      const tile = room.state.getTile(c.x, c.y);
      expect(tile?.ownerID ?? "").not.toBe("player-1");
    }
  });
});

// ── Test: Carnivore blocked by territory ────────────────────────────

describe("Territory Barrier — Carnivore blocked", () => {
  it("carnivore wandering does NOT enter a player-owned tile", () => {
    const room = createRoom(42);
    room.state.creatures.clear();

    const block = findWalkableBlock(room, 5, 5);
    expect(block).not.toBeNull();
    const { x: bx, y: by } = block!;

    const carn = addCreature(room, "carn-wander", "carnivore", bx + 2, by + 2, {
      currentState: "idle",
      hunger: 100,
    });

    // Claim surrounding tiles on one side
    for (let dy = 0; dy <= 4; dy++) {
      for (let dx = 3; dx <= 4; dx++) {
        claimTile(room, bx + dx, by + dy, "player-1");
      }
    }

    for (let i = 0; i < 60; i++) {
      tickAI(room);
      const c = room.state.creatures.get("carn-wander");
      if (!c) break;
      const tile = room.state.getTile(c.x, c.y);
      expect(tile?.ownerID ?? "").not.toBe("player-1");
    }
  });

  it("carnivore hunting does NOT enter a player-owned tile to reach prey", () => {
    const room = createRoom(42);
    room.state.creatures.clear();

    const block = findWalkableBlock(room, 6, 3);
    expect(block).not.toBeNull();
    const { x: bx, y: by } = block!;

    // Owned wall between carnivore and herbivore
    for (let dy = 0; dy <= 2; dy++) {
      claimTile(room, bx + 3, by + dy, "player-1");
    }

    // Carnivore on left, prey on right
    const carn = addCreature(room, "carn-hunt", "carnivore", bx + 1, by + 1, {
      currentState: "hunt",
      hunger: CREATURE_AI.HUNGRY_THRESHOLD - 10,
    });
    addCreature(room, "prey-herb", "herbivore", bx + 5, by + 1, {
      currentState: "idle",
    });

    for (let i = 0; i < 20; i++) {
      tickAI(room);
      const c = room.state.creatures.get("carn-hunt");
      if (!c) break;
      const tile = room.state.getTile(c.x, c.y);
      expect(tile?.ownerID ?? "").not.toBe("player-1");
    }
  });
});

// ── Test: Pawn builder moves freely in OWN territory ────────────────

describe("Territory Barrier — Pawn builder in own territory", () => {
  it("pawn_builder with matching ownerID moves within own territory", () => {
    const room = createRoom(42);
    room.state.creatures.clear();

    const block = findWalkableBlock(room, 5, 5);
    expect(block).not.toBeNull();
    const { x: bx, y: by } = block!;

    // Claim a 5x5 area for player-1
    for (let dy = 0; dy < 5; dy++) {
      for (let dx = 0; dx < 5; dx++) {
        claimTile(room, bx + dx, by + dy, "player-1");
      }
    }

    // Place builder owned by player-1 at center of territory
    const builder = addCreature(room, "builder-own", "pawn_builder", bx + 2, by + 2, {
      currentState: "idle",
      ownerID: "player-1",
      pawnType: "builder",
    });

    // Use moveToward to move within territory — should succeed
    const startX = builder.x;
    const startY = builder.y;
    moveToward(builder, bx + 4, by + 4, room.state);

    // Builder should have moved (not stuck)
    const moved = builder.x !== startX || builder.y !== startY;
    expect(moved).toBe(true);

    // Builder should still be on a player-1 tile (within territory)
    const tile = room.state.getTile(builder.x, builder.y);
    expect(tile?.ownerID).toBe("player-1");
  });
});

// ── Test: Pawn builder blocked from OTHER player's territory ────────

describe("Territory Barrier — Pawn builder vs other territory", () => {
  it("pawn_builder cannot enter tiles owned by a different player", () => {
    const room = createRoom(42);
    room.state.creatures.clear();

    const block = findWalkableBlock(room, 6, 3);
    expect(block).not.toBeNull();
    const { x: bx, y: by } = block!;

    // Player-2 owns tiles bx+3..bx+5
    for (let dy = 0; dy <= 2; dy++) {
      for (let dx = 3; dx <= 5; dx++) {
        claimTile(room, bx + dx, by + dy, "player-2");
      }
    }

    // Player-1's builder at (bx+2, by+1) trying to move right into player-2 territory
    const builder = addCreature(room, "builder-blocked", "pawn_builder", bx + 2, by + 1, {
      currentState: "idle",
      ownerID: "player-1",
      pawnType: "builder",
    });

    moveToward(builder, bx + 5, by + 1, room.state);

    // Builder should NOT have entered player-2's territory
    const tile = room.state.getTile(builder.x, builder.y);
    expect(tile?.ownerID ?? "").not.toBe("player-2");
  });
});

// ── Test: Carnivore skips prey inside territory ─────────────────────

describe("Territory Barrier — Carnivore target filtering", () => {
  it("carnivore does NOT target prey inside player territory", () => {
    const room = createRoom(42);
    room.state.creatures.clear();

    const block = findWalkableBlock(room, 7, 5);
    expect(block).not.toBeNull();
    const { x: bx, y: by } = block!;

    // Player-1 territory: a 3x3 block on the right side
    for (let dy = 1; dy <= 3; dy++) {
      for (let dx = 4; dx <= 6; dx++) {
        claimTile(room, bx + dx, by + dy, "player-1");
      }
    }

    // Herbivore INSIDE territory (should be ignored by carnivore)
    addCreature(room, "herb-safe", "herbivore", bx + 5, by + 2, {
      currentState: "idle",
    });

    // Carnivore OUTSIDE territory, hungry
    const carn = addCreature(room, "carn-skip", "carnivore", bx + 1, by + 2, {
      currentState: "idle",
      hunger: CREATURE_AI.HUNGRY_THRESHOLD - 10,
    });

    // Tick several times — carnivore should NOT move toward the herbivore
    const startX = carn.x;
    const startY = carn.y;

    for (let i = 0; i < 10; i++) {
      tickAI(room);
    }

    const c = room.state.creatures.get("carn-skip");
    if (c) {
      // Carnivore should NOT be hunting (no valid target)
      // If it wandered randomly, that's fine. But it should never enter territory
      const tile = room.state.getTile(c.x, c.y);
      expect(tile?.ownerID ?? "").not.toBe("player-1");
      // It should not have gotten adjacent to the protected herbivore
      const herb = room.state.creatures.get("herb-safe");
      if (herb) {
        const dist = manhattan(c.x, c.y, herb.x, herb.y);
        // Should not be adjacent to prey inside territory (can't reach)
        expect(dist).toBeGreaterThan(1);
      }
    }
  });

  it("carnivore does NOT target pawn_builder inside territory", () => {
    const room = createRoom(42);
    room.state.creatures.clear();

    const block = findWalkableBlock(room, 7, 5);
    expect(block).not.toBeNull();
    const { x: bx, y: by } = block!;

    // Player-1 territory
    for (let dy = 1; dy <= 3; dy++) {
      for (let dx = 4; dx <= 6; dx++) {
        claimTile(room, bx + dx, by + dy, "player-1");
      }
    }

    // Builder INSIDE territory
    addCreature(room, "builder-safe", "pawn_builder", bx + 5, by + 2, {
      currentState: "idle",
      ownerID: "player-1",
      pawnType: "builder",
    });

    // Carnivore outside, hungry
    const carn = addCreature(room, "carn-skip-builder", "carnivore", bx + 1, by + 2, {
      currentState: "idle",
      hunger: CREATURE_AI.HUNGRY_THRESHOLD - 10,
    });

    for (let i = 0; i < 10; i++) {
      tickAI(room);
    }

    const c = room.state.creatures.get("carn-skip-builder");
    if (c) {
      const tile = room.state.getTile(c.x, c.y);
      expect(tile?.ownerID ?? "").not.toBe("player-1");
    }
  });
});

// ── Test: Herbivore skips resources inside territory ─────────────────

describe("Territory Barrier — Herbivore resource filtering", () => {
  it("herbivore does NOT target food tiles inside player territory", () => {
    const room = createRoom(42);
    room.state.creatures.clear();

    const block = findWalkableBlock(room, 7, 5);
    expect(block).not.toBeNull();
    const { x: bx, y: by } = block!;

    // Clear any existing resources in the area
    for (let dy = 0; dy < 5; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        const t = room.state.getTile(bx + dx, by + dy);
        if (t) { t.resourceType = -1; t.resourceAmount = 0; }
      }
    }

    // Player-1 territory with food inside
    for (let dy = 1; dy <= 3; dy++) {
      for (let dx = 4; dx <= 6; dx++) {
        claimTile(room, bx + dx, by + dy, "player-1");
      }
    }
    const foodInside = room.state.getTile(bx + 5, by + 2);
    foodInside!.resourceType = ResourceType.Wood;
    foodInside!.resourceAmount = 50;

    // Hungry herbivore outside territory — only food is inside territory
    const herb = addCreature(room, "herb-no-food", "herbivore", bx + 1, by + 2, {
      currentState: "idle",
      hunger: CREATURE_AI.HUNGRY_THRESHOLD - 10,
    });

    for (let i = 0; i < 15; i++) {
      tickAI(room);
      const c = room.state.creatures.get("herb-no-food");
      if (!c) break;
      // Herbivore must never enter owned tiles
      const tile = room.state.getTile(c.x, c.y);
      expect(tile?.ownerID ?? "").not.toBe("player-1");
    }
  });
});

// ── Test: Creature already inside territory when it expands ─────────

describe("Territory Barrier — Creature trapped inside territory", () => {
  it("creature inside expanded territory cannot move to adjacent owned tiles", () => {
    const room = createRoom(42);
    room.state.creatures.clear();

    const block = findWalkableBlock(room, 5, 5);
    expect(block).not.toBeNull();
    const { x: bx, y: by } = block!;

    // Place a herbivore in the center
    const herb = addCreature(room, "herb-trapped", "herbivore", bx + 2, by + 2, {
      currentState: "idle",
      hunger: 100, // well-fed
    });

    // Now expand territory AROUND the creature (all surrounding tiles owned)
    for (let dy = 0; dy < 5; dy++) {
      for (let dx = 0; dx < 5; dx++) {
        claimTile(room, bx + dx, by + dy, "player-1");
      }
    }

    // The creature is on an owned tile. All adjacent tiles are also owned.
    // On each tick, the creature should NOT move to any adjacent owned tile.
    const startX = herb.x;
    const startY = herb.y;

    for (let i = 0; i < 20; i++) {
      tickAI(room);
      const c = room.state.creatures.get("herb-trapped");
      if (!c) break;
      // Creature should stay put (trapped) — can't move to any adjacent owned tile
      expect(c.x).toBe(startX);
      expect(c.y).toBe(startY);
    }
  });
});
