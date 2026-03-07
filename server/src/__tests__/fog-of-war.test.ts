import { describe, it, expect, vi } from "vitest";
import { GameState, PlayerState, CreatureState, TileState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { spawnHQ } from "../rooms/territory.js";
import { computeVisibleTiles } from "../rooms/visibility.js";
import {
  TileType, isWaterTile,
  DEFAULT_MAP_SIZE, TERRITORY, PAWN, DAY_NIGHT, FOG_OF_WAR,
  CREATURE_TYPES,
} from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): GameRoom {
  const room = Object.create(GameRoom.prototype) as GameRoom;
  room.state = new GameState();
  room.generateMap(seed);
  room.broadcast = vi.fn();
  // Initialize playerViews map (normally created by constructor)
  room.playerViews = new Map();
  return room;
}

interface MockClient {
  sessionId: string;
  send: (...args: unknown[]) => void;
  view?: unknown;
}

function fakeClient(sessionId: string): MockClient {
  return { sessionId, send: vi.fn() };
}

/** Join a player and get their PlayerState (HQ is spawned automatically). */
function joinPlayer(room: GameRoom, sessionId: string) {
  const client = fakeClient(sessionId);
  room.onJoin(client);
  const player = room.state.players.get(sessionId)!;
  return { client, player };
}

/** Add a pawn builder at a specific position. */
function addBuilder(
  room: GameRoom,
  id: string,
  ownerID: string,
  x: number,
  y: number,
  overrides: Partial<{
    health: number;
    currentState: string;
  }> = {},
): CreatureState {
  const creature = new CreatureState();
  creature.id = id;
  creature.creatureType = "pawn_builder";
  creature.x = x;
  creature.y = y;
  creature.health = overrides.health ?? PAWN.BUILDER_HEALTH;
  creature.currentState = overrides.currentState ?? "idle";
  creature.ownerID = ownerID;
  creature.pawnType = "builder";
  creature.stamina = PAWN.BUILDER_MAX_STAMINA;
  room.state.creatures.set(id, creature);
  return creature;
}

/** Add a wildlife creature (herbivore/carnivore) at a specific position. */
function addWildlife(
  room: GameRoom,
  id: string,
  creatureType: string,
  x: number,
  y: number,
): CreatureState {
  const typeDef = CREATURE_TYPES[creatureType];
  const creature = new CreatureState();
  creature.id = id;
  creature.creatureType = creatureType;
  creature.x = x;
  creature.y = y;
  creature.health = typeDef.health;
  creature.hunger = typeDef.hunger;
  creature.stamina = typeDef.maxStamina;
  creature.currentState = "idle";
  room.state.creatures.set(id, creature);
  return creature;
}

/** Collect tiles owned by a player as {x, y} pairs. */
function getOwnedTiles(room: GameRoom, playerId: string): Array<{ x: number; y: number }> {
  const result: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (tile.ownerID === playerId) {
      result.push({ x: tile.x, y: tile.y });
    }
  }
  return result;
}

/**
 * Determine whether a tile is a "territory edge" tile.
 * An edge tile has at least one Moore neighbor (8-directional) that is
 * unowned or out of bounds. Mirrors the logic in visibility.ts.
 */
function isTerritoryEdge(room: GameRoom, tile: TileState, playerId: string): boolean {
  const dirs = [
    [-1, -1], [0, -1], [1, -1],
    [-1,  0],          [1,  0],
    [-1,  1], [0,  1], [1,  1],
  ];
  for (const [dx, dy] of dirs) {
    const nx = tile.x + dx;
    const ny = tile.y + dy;
    const neighbor = room.state.getTile(nx, ny);
    if (!neighbor || neighbor.ownerID !== playerId) {
      return true;
    }
  }
  return false;
}

/** Manhattan distance — matches addCircleFill in visibility.ts. */
function manhattan(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

/** Set room's day phase directly (no tick advancement needed). */
function setDayPhase(room: GameRoom, targetPhase: string): void {
  const phaseEntry = DAY_NIGHT.PHASES.find(p => p.name === targetPhase);
  if (!phaseEntry) throw new Error(`Unknown phase: ${targetPhase}`);
  const targetTick = Math.floor(
    (phaseEntry.startPercent / 100) * DAY_NIGHT.CYCLE_LENGTH_TICKS
  );
  room.state.dayTick = targetTick;
  room.state.dayPhase = targetPhase;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Fog of War — Phase A", () => {

  // ─── 1. Territory Edge Detection ──────────────────────────────────

  describe("Territory edge detection", () => {
    it("5×5 HQ: only perimeter tiles are edge tiles", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");

      const owned = getOwnedTiles(room, "p1");
      expect(owned.length).toBe(25);

      const half = Math.floor(TERRITORY.STARTING_SIZE / 2);
      for (const pos of owned) {
        const tile = room.state.getTile(pos.x, pos.y)!;
        const isPerimeter =
          pos.x === player.hqX - half ||
          pos.x === player.hqX + half ||
          pos.y === player.hqY - half ||
          pos.y === player.hqY + half;

        if (isPerimeter) {
          expect(isTerritoryEdge(room, tile, "p1")).toBe(true);
        }
      }
    });

    it("interior HQ tiles are NOT edge tiles", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");

      const half = Math.floor(TERRITORY.STARTING_SIZE / 2);
      for (let dy = -half + 1; dy <= half - 1; dy++) {
        for (let dx = -half + 1; dx <= half - 1; dx++) {
          const tx = player.hqX + dx;
          const ty = player.hqY + dy;
          const tile = room.state.getTile(tx, ty)!;
          expect(isTerritoryEdge(room, tile, "p1")).toBe(false);
        }
      }
    });

    it("corner tiles of territory are edge tiles", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");

      const half = Math.floor(TERRITORY.STARTING_SIZE / 2);
      const corners = [
        { x: player.hqX - half, y: player.hqY - half },
        { x: player.hqX + half, y: player.hqY - half },
        { x: player.hqX - half, y: player.hqY + half },
        { x: player.hqX + half, y: player.hqY + half },
      ];

      for (const corner of corners) {
        const tile = room.state.getTile(corner.x, corner.y)!;
        expect(tile).toBeDefined();
        expect(isTerritoryEdge(room, tile, "p1")).toBe(true);
      }
    });

    it("map-boundary tiles are always edge tiles (out-of-bounds = unowned)", () => {
      const room = createRoomWithMap(42);

      const cornerTile = room.state.getTile(0, 0)!;
      cornerTile.ownerID = "edge-test";
      expect(isTerritoryEdge(room, cornerTile, "edge-test")).toBe(true);

      const farCorner = room.state.getTile(
        room.state.mapWidth - 1, room.state.mapHeight - 1,
      )!;
      farCorner.ownerID = "edge-test";
      expect(isTerritoryEdge(room, farCorner, "edge-test")).toBe(true);
    });
  });

  // ─── 2. HQ Vision ────────────────────────────────────────────────

  describe("HQ vision", () => {
    it("HQ center generates radius-5 Manhattan circle of visible tiles", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");
      setDayPhase(room, "day");

      const visible = computeVisibleTiles(room.state, "p1");

      // Every tile within Manhattan distance HQ_RADIUS of HQ center must be visible
      const hqR = FOG_OF_WAR.HQ_RADIUS;
      for (let y = 0; y < room.state.mapHeight; y++) {
        for (let x = 0; x < room.state.mapWidth; x++) {
          if (manhattan(x, y, player.hqX, player.hqY) <= hqR) {
            expect(visible.has(y * room.state.mapWidth + x)).toBe(true);
          }
        }
      }
    });

    it("HQ vision stacks with territory edge vision (union, not intersection)", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");
      setDayPhase(room, "day");

      const visible = computeVisibleTiles(room.state, "p1");

      // Pick a CORNER edge tile — it's the farthest from HQ center (Manhattan 4),
      // so its edge-vision radius-3 circle extends beyond HQ radius-5.
      const half = Math.floor(TERRITORY.STARTING_SIZE / 2);
      const cornerX = player.hqX + half;
      const cornerY = player.hqY + half;
      const cornerTile = room.state.getTile(cornerX, cornerY)!;
      expect(cornerTile.ownerID).toBe("p1");

      const edgeR = FOG_OF_WAR.TERRITORY_EDGE_RADIUS;
      let foundBeyondHQ = false;
      for (let dy = -edgeR; dy <= edgeR; dy++) {
        for (let dx = -edgeR; dx <= edgeR; dx++) {
          const tx = cornerX + dx;
          const ty = cornerY + dy;
          if (
            tx >= 0 && tx < room.state.mapWidth &&
            ty >= 0 && ty < room.state.mapHeight &&
            manhattan(tx, ty, cornerX, cornerY) <= edgeR
          ) {
            expect(visible.has(ty * room.state.mapWidth + tx)).toBe(true);
            if (manhattan(tx, ty, player.hqX, player.hqY) > FOG_OF_WAR.HQ_RADIUS) {
              foundBeyondHQ = true;
            }
          }
        }
      }
      // Corner edge tile at Manhattan 4 from HQ + edge radius 3 = reach Manhattan 7,
      // well beyond HQ radius 5.
      expect(foundBeyondHQ).toBe(true);
    });

    it("HQ vision is clamped to map bounds (no out-of-bounds indices)", () => {
      const room = createRoomWithMap(42);
      joinPlayer(room, "p1");
      setDayPhase(room, "day");

      const visible = computeVisibleTiles(room.state, "p1");

      const totalTiles = room.state.mapWidth * room.state.mapHeight;
      for (const idx of visible) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(totalTiles);
      }
    });
  });

  // ─── 3. Pawn Builder Vision ───────────────────────────────────────

  describe("Pawn builder vision", () => {
    it("active pawn builders provide radius-4 vision from their position", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");
      setDayPhase(room, "day");

      // Place builder far from HQ to isolate its vision contribution
      const bx = Math.min(player.hqX + 20, room.state.mapWidth - 5);
      const by = Math.min(player.hqY + 20, room.state.mapHeight - 5);
      addBuilder(room, "builder-1", "p1", bx, by);

      const visible = computeVisibleTiles(room.state, "p1");

      const pawnR = FOG_OF_WAR.PAWN_RADIUS;
      for (let dy = -pawnR; dy <= pawnR; dy++) {
        for (let dx = -pawnR; dx <= pawnR; dx++) {
          const tx = bx + dx;
          const ty = by + dy;
          if (
            tx >= 0 && tx < room.state.mapWidth &&
            ty >= 0 && ty < room.state.mapHeight &&
            manhattan(tx, ty, bx, by) <= pawnR
          ) {
            expect(visible.has(ty * room.state.mapWidth + tx)).toBe(true);
          }
        }
      }
    });

    it("pawn vision moves with the pawn (recomputed each call)", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");
      setDayPhase(room, "day");

      const bx = Math.min(player.hqX + 20, room.state.mapWidth - 8);
      const by = Math.min(player.hqY + 20, room.state.mapHeight - 8);
      const builder = addBuilder(room, "builder-m", "p1", bx, by);

      const visible1 = computeVisibleTiles(room.state, "p1");
      expect(visible1.has(by * room.state.mapWidth + bx)).toBe(true);

      // Move the builder
      const newX = bx + 5;
      const newY = by + 5;
      builder.x = newX;
      builder.y = newY;

      const visible2 = computeVisibleTiles(room.state, "p1");
      expect(visible2.has(newY * room.state.mapWidth + newX)).toBe(true);

      // Verify new position's full radius is covered
      const pawnR = FOG_OF_WAR.PAWN_RADIUS;
      for (let dy = -pawnR; dy <= pawnR; dy++) {
        for (let dx = -pawnR; dx <= pawnR; dx++) {
          const tx = newX + dx;
          const ty = newY + dy;
          if (
            tx >= 0 && tx < room.state.mapWidth &&
            ty >= 0 && ty < room.state.mapHeight &&
            manhattan(tx, ty, newX, newY) <= pawnR
          ) {
            expect(visible2.has(ty * room.state.mapWidth + tx)).toBe(true);
          }
        }
      }
    });

    it("dead/removed pawns don't provide vision", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");
      setDayPhase(room, "day");

      // Place builder far enough that removal should be detectable
      const bx = Math.min(player.hqX + 25, room.state.mapWidth - 6);
      const by = Math.min(player.hqY + 25, room.state.mapHeight - 6);
      addBuilder(room, "builder-dead", "p1", bx, by);

      const visibleBefore = computeVisibleTiles(room.state, "p1");
      expect(visibleBefore.has(by * room.state.mapWidth + bx)).toBe(true);

      // Remove builder
      room.state.creatures.delete("builder-dead");

      const visibleAfter = computeVisibleTiles(room.state, "p1");

      // If far from all other vision sources, builder tile should no longer be visible
      const distFromHQ = manhattan(bx, by, player.hqX, player.hqY);
      if (distFromHQ > FOG_OF_WAR.HQ_RADIUS + FOG_OF_WAR.TERRITORY_EDGE_RADIUS + TERRITORY.STARTING_SIZE) {
        expect(visibleAfter.has(by * room.state.mapWidth + bx)).toBe(false);
      }
    });
  });

  // ─── 4. Day/Night Modifiers ───────────────────────────────────────

  describe("Day/night vision modifiers", () => {
    it("dawn: radius reduced by 1", () => {
      const room = createRoomWithMap(42);
      joinPlayer(room, "p1");

      setDayPhase(room, "day");
      const visibleDay = computeVisibleTiles(room.state, "p1");

      setDayPhase(room, "dawn");
      const visibleDawn = computeVisibleTiles(room.state, "p1");

      expect(visibleDawn.size).toBeLessThan(visibleDay.size);
    });

    it("day: no modifier (full radius)", () => {
      const room = createRoomWithMap(42);
      joinPlayer(room, "p1");

      setDayPhase(room, "day");
      const visibleDay = computeVisibleTiles(room.state, "p1");

      // Day gives full radii — substantial coverage from HQ + edge
      expect(visibleDay.size).toBeGreaterThan(0);
    });

    it("dusk: radius reduced by 1 (same as dawn)", () => {
      const room = createRoomWithMap(42);
      joinPlayer(room, "p1");

      setDayPhase(room, "day");
      const visibleDay = computeVisibleTiles(room.state, "p1");

      setDayPhase(room, "dusk");
      const visibleDusk = computeVisibleTiles(room.state, "p1");

      expect(visibleDusk.size).toBeLessThan(visibleDay.size);

      setDayPhase(room, "dawn");
      const visibleDawn = computeVisibleTiles(room.state, "p1");
      expect(visibleDusk.size).toBe(visibleDawn.size);
    });

    it("night: radius reduced by 2", () => {
      const room = createRoomWithMap(42);
      joinPlayer(room, "p1");

      setDayPhase(room, "day");
      const visibleDay = computeVisibleTiles(room.state, "p1");

      setDayPhase(room, "dawn");
      const visibleDawn = computeVisibleTiles(room.state, "p1");

      setDayPhase(room, "night");
      const visibleNight = computeVisibleTiles(room.state, "p1");

      expect(visibleNight.size).toBeLessThan(visibleDawn.size);
      expect(visibleNight.size).toBeLessThan(visibleDay.size);
    });

    it("minimum radius is always 1 (never 0)", () => {
      const room = createRoomWithMap(42);
      joinPlayer(room, "p1");
      setDayPhase(room, "night");

      const visible = computeVisibleTiles(room.state, "p1");
      expect(visible.size).toBeGreaterThan(0);
    });

    it("radius-3 source at night → effective radius max(1, 3-2) = 1", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");

      // Territory edge base radius = 3, night modifier = -2 → effective = 1
      setDayPhase(room, "night");
      const visible = computeVisibleTiles(room.state, "p1");

      // An edge tile should still provide vision to itself (radius ≥ 1)
      const half = Math.floor(TERRITORY.STARTING_SIZE / 2);
      const edgeX = player.hqX + half;
      const edgeY = player.hqY;
      const edgeTile = room.state.getTile(edgeX, edgeY);

      if (edgeTile && edgeTile.ownerID === "p1") {
        expect(visible.has(edgeY * room.state.mapWidth + edgeX)).toBe(true);
      }
    });
  });

  // ─── 5. Visibility Computation Union ──────────────────────────────

  describe("Visibility computation union", () => {
    it("multiple sources' visible tiles are unioned (not duplicated)", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");
      setDayPhase(room, "day");

      // Add builder that overlaps with HQ vision
      addBuilder(room, "builder-overlap", "p1", player.hqX + 3, player.hqY);

      const visible = computeVisibleTiles(room.state, "p1");

      // HQ center and builder position both visible
      expect(visible.has(player.hqY * room.state.mapWidth + player.hqX)).toBe(true);
      expect(visible.has(player.hqY * room.state.mapWidth + (player.hqX + 3))).toBe(true);

      // Set semantics — array length matches size (no dupes)
      expect(Array.from(visible).length).toBe(visible.size);
    });

    it("a tile visible from both HQ and territory edge is counted once", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");
      setDayPhase(room, "day");

      const visible = computeVisibleTiles(room.state, "p1");

      const hqIdx = player.hqY * room.state.mapWidth + player.hqX;
      expect(visible.has(hqIdx)).toBe(true);
      expect(Array.from(visible).length).toBe(visible.size);
    });
  });

  // ─── 6. onLeave Cleanup ──────────────────────────────────────────

  describe("onLeave cleanup", () => {
    it("player disconnect cleans up playerViews entry", () => {
      const room = createRoomWithMap(42);
      const { client } = joinPlayer(room, "p1");

      expect(room.state.players.get("p1")).toBeDefined();
      expect(room.playerViews.has("p1")).toBe(true);

      room.onLeave(client as unknown as Parameters<typeof room.onLeave>[0], 1000);

      expect(room.state.players.get("p1")).toBeUndefined();
      expect(room.playerViews.has("p1")).toBe(false);
    });

    it("no memory leak from accumulated playerViews entries", () => {
      const room = createRoomWithMap(42);

      for (let i = 0; i < 10; i++) {
        const { client } = joinPlayer(room, `leak-${i}`);
        room.onLeave(client as unknown as Parameters<typeof room.onLeave>[0], 1000);
      }

      expect(room.state.players.size).toBe(0);
      expect(room.playerViews.size).toBe(0);
    });
  });

  // ─── 7. Edge Cases ────────────────────────────────────────────────

  describe("Edge cases", () => {
    it("player with no territory doesn't crash computeVisibleTiles", () => {
      const room = createRoomWithMap(42);

      const player = new PlayerState();
      player.id = "no-territory";
      player.hqX = -1;
      player.hqY = -1;
      room.state.players.set("no-territory", player);

      expect(() => {
        const visible = computeVisibleTiles(room.state, "no-territory");
        expect(visible).toBeDefined();
        expect(visible.size).toBe(0);
      }).not.toThrow();
    });

    it("player at map corner: vision circles clipped to bounds", () => {
      const room = createRoomWithMap(42);

      const player = new PlayerState();
      player.id = "corner-player";
      room.state.players.set("corner-player", player);
      spawnHQ(room.state, player, 2, 2);

      setDayPhase(room, "day");

      const visible = computeVisibleTiles(room.state, "corner-player");

      const totalTiles = room.state.mapWidth * room.state.mapHeight;
      for (const idx of visible) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(totalTiles);
      }

      // HQ tile itself must be visible
      expect(visible.has(2 * room.state.mapWidth + 2)).toBe(true);
    });

    it("single-tile territory: 1 tile is its own edge", () => {
      const room = createRoomWithMap(42);

      const midX = Math.floor(room.state.mapWidth / 2);
      const midY = Math.floor(room.state.mapHeight / 2);
      const tile = room.state.getTile(midX, midY)!;
      tile.ownerID = "single-tile";

      expect(isTerritoryEdge(room, tile, "single-tile")).toBe(true);
    });

    it("computeVisibleTiles returns a Set<number> of valid tile indices", () => {
      const room = createRoomWithMap(42);
      joinPlayer(room, "p1");
      setDayPhase(room, "day");

      const visible = computeVisibleTiles(room.state, "p1");

      expect(visible).toBeInstanceOf(Set);
      expect(visible.size).toBeGreaterThan(0);
      for (const idx of visible) {
        expect(Number.isInteger(idx)).toBe(true);
      }
    });

    it("two players have independent visibility sets", () => {
      const room = createRoomWithMap(42);
      joinPlayer(room, "p1");
      joinPlayer(room, "p2");
      setDayPhase(room, "day");

      const visible1 = computeVisibleTiles(room.state, "p1");
      const visible2 = computeVisibleTiles(room.state, "p2");

      const p1 = room.state.players.get("p1")!;
      const p2 = room.state.players.get("p2")!;

      expect(visible1.has(p1.hqY * room.state.mapWidth + p1.hqX)).toBe(true);
      expect(visible2.has(p2.hqY * room.state.mapWidth + p2.hqX)).toBe(true);
    });

    it("visibility across all day phases produces non-empty results", () => {
      const room = createRoomWithMap(42);
      joinPlayer(room, "p1");

      for (const phase of ["dawn", "day", "dusk", "night"]) {
        setDayPhase(room, phase);
        const visible = computeVisibleTiles(room.state, "p1");
        expect(visible.size).toBeGreaterThan(0);
      }
    });
  });

  // ─── 8. Creature Visibility Filtering ─────────────────────────────

  describe("Creature visibility filtering", () => {

    /** Run one fog tick at the correct interval. */
    function fogTick(room: GameRoom): void {
      room.state.tick += FOG_OF_WAR.TICK_INTERVAL;
      // Call tickFogOfWar via the room's internal method (public via prototype access)
      (room as unknown as { tickFogOfWar(): void }).tickFogOfWar();
    }

    it("wildlife creature on a visible tile is tracked as visible", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");
      setDayPhase(room, "day");

      // Place herbivore right next to HQ (definitely visible)
      addWildlife(room, "herb-vis", "herbivore", player.hqX + 1, player.hqY);

      fogTick(room);

      const entry = room.playerViews.get("p1")!;
      expect(entry.visibleCreatureIds.has("herb-vis")).toBe(true);
    });

    it("wildlife creature far outside visible tiles is NOT tracked as visible", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");
      setDayPhase(room, "day");

      // Place herbivore far from all vision sources
      const farX = (player.hqX + 30) % room.state.mapWidth;
      const farY = (player.hqY + 30) % room.state.mapHeight;
      addWildlife(room, "herb-far", "herbivore", farX, farY);

      fogTick(room);

      const entry = room.playerViews.get("p1")!;
      expect(entry.visibleCreatureIds.has("herb-far")).toBe(false);
    });

    it("own pawn builders are ALWAYS visible regardless of fog", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");
      setDayPhase(room, "day");

      // Place own builder far from HQ — outside any vision source
      const farX = (player.hqX + 30) % room.state.mapWidth;
      const farY = (player.hqY + 30) % room.state.mapHeight;
      addBuilder(room, "own-builder", "p1", farX, farY);

      fogTick(room);

      const entry = room.playerViews.get("p1")!;
      expect(entry.visibleCreatureIds.has("own-builder")).toBe(true);
    });

    it("enemy pawn builders outside fog are NOT visible", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");
      joinPlayer(room, "p2");
      setDayPhase(room, "day");

      // Place enemy builder far from p1's vision
      const p1 = room.state.players.get("p1")!;
      const farX = (p1.hqX + 30) % room.state.mapWidth;
      const farY = (p1.hqY + 30) % room.state.mapHeight;
      addBuilder(room, "enemy-builder", "p2", farX, farY);

      fogTick(room);

      const entry = room.playerViews.get("p1")!;
      expect(entry.visibleCreatureIds.has("enemy-builder")).toBe(false);
    });

    it("creature moving into fog becomes invisible after fog tick", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");
      setDayPhase(room, "day");

      // Place creature on visible tile first
      const herb = addWildlife(room, "herb-move", "herbivore", player.hqX + 1, player.hqY);
      fogTick(room);

      const entry = room.playerViews.get("p1")!;
      expect(entry.visibleCreatureIds.has("herb-move")).toBe(true);

      // Move creature far away
      herb.x = (player.hqX + 30) % room.state.mapWidth;
      herb.y = (player.hqY + 30) % room.state.mapHeight;
      fogTick(room);

      expect(entry.visibleCreatureIds.has("herb-move")).toBe(false);
    });

    it("creature moving onto a visible tile becomes visible after fog tick", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");
      setDayPhase(room, "day");

      // Place creature far away initially
      const farX = (player.hqX + 30) % room.state.mapWidth;
      const farY = (player.hqY + 30) % room.state.mapHeight;
      const herb = addWildlife(room, "herb-approach", "herbivore", farX, farY);
      fogTick(room);

      const entry = room.playerViews.get("p1")!;
      expect(entry.visibleCreatureIds.has("herb-approach")).toBe(false);

      // Move creature next to HQ
      herb.x = player.hqX + 1;
      herb.y = player.hqY;
      fogTick(room);

      expect(entry.visibleCreatureIds.has("herb-approach")).toBe(true);
    });

    it("initPlayerView includes creatures already on visible tiles", () => {
      const room = createRoomWithMap(42);

      // Add a wildlife creature before any player joins
      // Use center of map so it won't conflict with HQ spawn
      const midX = Math.floor(room.state.mapWidth / 2);
      const midY = Math.floor(room.state.mapHeight / 2);
      addWildlife(room, "pre-herb", "herbivore", midX, midY);

      const { player } = joinPlayer(room, "p1");
      setDayPhase(room, "day");

      const entry = room.playerViews.get("p1")!;
      const visibleIndices = computeVisibleTiles(room.state, "p1");
      const creatureTileIdx = midY * room.state.mapWidth + midX;

      // If the creature happens to be on a visible tile, it should be tracked
      if (visibleIndices.has(creatureTileIdx)) {
        expect(entry.visibleCreatureIds.has("pre-herb")).toBe(true);
      } else {
        expect(entry.visibleCreatureIds.has("pre-herb")).toBe(false);
      }
    });

    it("carnivore on visible tile is visible; same carnivore off tile is not", () => {
      const room = createRoomWithMap(42);
      const { player } = joinPlayer(room, "p1");
      setDayPhase(room, "day");

      const carn = addWildlife(room, "raptor-1", "carnivore", player.hqX, player.hqY + 1);
      fogTick(room);

      const entry = room.playerViews.get("p1")!;
      expect(entry.visibleCreatureIds.has("raptor-1")).toBe(true);

      // Move off-screen
      carn.x = (player.hqX + 30) % room.state.mapWidth;
      carn.y = (player.hqY + 30) % room.state.mapHeight;
      fogTick(room);

      expect(entry.visibleCreatureIds.has("raptor-1")).toBe(false);
    });
  });
});
