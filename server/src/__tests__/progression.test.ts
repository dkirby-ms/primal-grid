import { describe, it, expect } from "vitest";
import { GameState, PlayerState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import {
  getLevelForXP,
  getAvailableShapes,
  xpForNextLevel,
  hasAbility,
  PROGRESSION,
  TERRITORY,
  TileType,
} from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): any {
  const room = Object.create(GameRoom.prototype) as any;
  room.state = new GameState();
  room.generateMap(seed);
  room.broadcast = () => {};
  return room;
}

function fakeClient(sessionId: string): any {
  return { sessionId, send: () => {} };
}

function joinPlayer(room: any, sessionId: string) {
  const client = fakeClient(sessionId);
  room.onJoin(client);
  const player = room.state.players.get(sessionId)!;
  return { client, player };
}

// ── Unit Tests: getLevelForXP ───────────────────────────────────────

describe("getLevelForXP", () => {
  it("0 XP → level 1", () => {
    expect(getLevelForXP(0)).toBe(1);
  });

  it("10 XP → level 2", () => {
    expect(getLevelForXP(10)).toBe(2);
  });

  it("9 XP → level 1 (boundary, not enough for level 2)", () => {
    expect(getLevelForXP(9)).toBe(1);
  });

  it("25 XP → level 3", () => {
    expect(getLevelForXP(25)).toBe(3);
  });

  it("140 XP → level 7 (max)", () => {
    expect(getLevelForXP(140)).toBe(7);
  });

  it("9999 XP → never exceeds MAX_LEVEL", () => {
    expect(getLevelForXP(9999)).toBe(PROGRESSION.MAX_LEVEL);
  });

  it("exact thresholds for each level", () => {
    for (const def of PROGRESSION.LEVELS) {
      expect(getLevelForXP(def.xpRequired)).toBe(def.level);
    }
  });

  it("one XP below each threshold stays at previous level", () => {
    for (const def of PROGRESSION.LEVELS) {
      if (def.xpRequired > 0) {
        expect(getLevelForXP(def.xpRequired - 1)).toBe(def.level - 1);
      }
    }
  });
});

// ── Unit Tests: getAvailableShapes ─────────────────────────────────

describe("getAvailableShapes", () => {
  it("level 1 → starter shapes only", () => {
    const shapes = getAvailableShapes(1);
    expect(shapes).toContain("tetra_o");
    expect(shapes).toContain("tetra_i");
    expect(shapes).toHaveLength(2);
  });

  it("level 2 → includes tetra_t", () => {
    const shapes = getAvailableShapes(2);
    expect(shapes).toContain("tetra_o");
    expect(shapes).toContain("tetra_i");
    expect(shapes).toContain("tetra_t");
    expect(shapes).toHaveLength(3);
  });

  it("level 3 → cumulative: o, i, t, l", () => {
    const shapes = getAvailableShapes(3);
    expect(shapes).toContain("tetra_o");
    expect(shapes).toContain("tetra_i");
    expect(shapes).toContain("tetra_t");
    expect(shapes).toContain("tetra_l");
    expect(shapes).toHaveLength(4);
  });

  it("level 5 → all 7 shapes unlocked", () => {
    const shapes = getAvailableShapes(5);
    expect(shapes).toHaveLength(7);
    expect(shapes).toContain("tetra_o");
    expect(shapes).toContain("tetra_i");
    expect(shapes).toContain("tetra_t");
    expect(shapes).toContain("tetra_l");
    expect(shapes).toContain("tetra_j");
    expect(shapes).toContain("tetra_s");
    expect(shapes).toContain("tetra_z");
  });

  it("level 7 → still exactly 7 shapes (no extras from ability levels)", () => {
    const shapes = getAvailableShapes(7);
    expect(shapes).toHaveLength(7);
  });

  it("level 4 → includes j but not s/z", () => {
    const shapes = getAvailableShapes(4);
    expect(shapes).toContain("tetra_j");
    expect(shapes).not.toContain("tetra_s");
    expect(shapes).not.toContain("tetra_z");
    expect(shapes).toHaveLength(5);
  });
});

// ── Unit Tests: xpForNextLevel ─────────────────────────────────────

describe("xpForNextLevel", () => {
  it("level 1 → 10 XP needed for level 2", () => {
    expect(xpForNextLevel(1)).toBe(10);
  });

  it("level 6 → 140 XP needed for level 7", () => {
    expect(xpForNextLevel(6)).toBe(140);
  });

  it("level 7 (max) → null (no next level)", () => {
    expect(xpForNextLevel(7)).toBeNull();
  });

  it("each level returns the XP threshold of the next level", () => {
    for (let lvl = 1; lvl < PROGRESSION.MAX_LEVEL; lvl++) {
      const nextDef = PROGRESSION.LEVELS.find((d) => d.level === lvl + 1);
      expect(xpForNextLevel(lvl)).toBe(nextDef!.xpRequired);
    }
  });
});

// ── Unit Tests: hasAbility ─────────────────────────────────────────

describe("hasAbility", () => {
  it("level 5 → no 'pets' ability", () => {
    expect(hasAbility(5, "pets")).toBe(false);
  });

  it("level 6 → has 'pets' ability", () => {
    expect(hasAbility(6, "pets")).toBe(true);
  });

  it("level 7 → has 'pets' AND 'pet_breeding'", () => {
    expect(hasAbility(7, "pets")).toBe(true);
    expect(hasAbility(7, "pet_breeding")).toBe(true);
  });

  it("level 1 → no abilities", () => {
    expect(hasAbility(1, "pets")).toBe(false);
    expect(hasAbility(1, "pet_breeding")).toBe(false);
  });

  it("level 6 → no 'pet_breeding' yet", () => {
    expect(hasAbility(6, "pet_breeding")).toBe(false);
  });

  it("nonexistent ability → false at any level", () => {
    expect(hasAbility(7, "flying")).toBe(false);
  });
});

// ── Integration: Shape Gating ──────────────────────────────────────

describe("Shape gating (data-level)", () => {
  it("level 1 → only starter shapes available", () => {
    const available = getAvailableShapes(1);
    expect(available).toContain("tetra_o");
    expect(available).toContain("tetra_i");
    expect(available).not.toContain("tetra_t");
  });

  it("level 2 → tetra_t unlocked", () => {
    const available = getAvailableShapes(2);
    expect(available).toContain("tetra_t");
  });

  it("level 1 → tetra_o available (starter shape)", () => {
    expect(getAvailableShapes(1)).toContain("tetra_o");
  });
});

// ── Integration: XP and Level-Up ───────────────────────────────────

describe("XP and level-up integration", () => {
  it("player claims tiles → XP increments", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "xp-earner");

    // Set up a tile mid-claim that's about to finish
    const w = room.state.mapWidth;
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      if (
        tile.ownerID === "" &&
        tile.type !== TileType.Water &&
        tile.type !== TileType.Rock
      ) {
        // Simulate a tile almost done claiming
        tile.claimingPlayerID = "xp-earner";
        tile.claimProgress = TERRITORY.CLAIM_TICKS - 1;
        break;
      }
    }

    const xpBefore = player.xp;

    // Tick claiming — tile finishes claiming → XP should increment
    room.tickClaiming();

    expect(player.xp).toBe(xpBefore + PROGRESSION.XP_PER_TILE_CLAIMED);
  });

  it("player crosses level threshold → level updates", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "leveler");

    // Start at level 1, XP just below level 2 threshold (10)
    player.xp = 9;
    player.level = 1;

    // Set up one tile about to finish claiming
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      if (
        tile.ownerID === "" &&
        tile.type !== TileType.Water &&
        tile.type !== TileType.Rock
      ) {
        tile.claimingPlayerID = "leveler";
        tile.claimProgress = TERRITORY.CLAIM_TICKS - 1;
        break;
      }
    }

    // Tick → tile claims → XP goes to 10 → level should become 2
    room.tickClaiming();

    expect(player.xp).toBe(10);
    expect(player.level).toBe(2);
  });

  it("player at max level → no further level increase", () => {
    const room = createRoomWithMap(42);
    const { player } = joinPlayer(room, "maxed");

    // Set player to max level with lots of XP
    player.level = PROGRESSION.MAX_LEVEL;
    player.xp = 500;

    // Set up a tile about to finish claiming
    for (let i = 0; i < room.state.tiles.length; i++) {
      const tile = room.state.tiles.at(i)!;
      if (
        tile.ownerID === "" &&
        tile.type !== TileType.Water &&
        tile.type !== TileType.Rock
      ) {
        tile.claimingPlayerID = "maxed";
        tile.claimProgress = TERRITORY.CLAIM_TICKS - 1;
        break;
      }
    }

    // Tick — XP increases but level stays at max
    room.tickClaiming();

    expect(player.xp).toBe(501);
    expect(player.level).toBe(PROGRESSION.MAX_LEVEL);
  });
});
