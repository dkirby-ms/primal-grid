import { describe, it, expect, vi, beforeEach } from "vitest";
import { GameState, PlayerState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import {
  BUILDING_INCOME,
  STRUCTURE_INCOME,
  TERRITORY,
  PAWN_TYPES,
  ENEMY_BASE_TYPES,
  STARVATION,
  TileType,
  isWaterTile,
} from "@primal-grid/shared";

// ── Test types ──────────────────────────────────────────────────────

interface MockClient {
  sessionId: string;
  send: ReturnType<typeof vi.fn>;
}

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): GameRoom {
  const room = Object.create(GameRoom.prototype) as GameRoom;
  room.state = new GameState();
  room.generateMap(seed);
  room.broadcast = vi.fn();
  return room;
}

function fakeClient(sessionId: string): MockClient {
  return { sessionId, send: vi.fn() };
}

function joinPlayer(room: GameRoom, sessionId: string) {
  const client = fakeClient(sessionId);
  room.onJoin(client);
  const player = room.state.players.get(sessionId)!;
  return { client, player };
}

function giveResources(
  player: PlayerState,
  wood: number,
  stone: number,
  food?: number,
) {
  player.wood = wood;
  player.stone = stone;
  if (food !== undefined) {
    player.food = food;
  }
}

/**
 * Manually add a pawn creature to the room state owned by playerId.
 * Returns the created creature.
 */
let testCreatureCounter = 0;
function addPawn(
  room: GameRoom,
  playerId: string,
  pawnType: string,
  x: number,
  y: number,
): CreatureState {
  const pawnDef = PAWN_TYPES[pawnType];
  const creature = new CreatureState();
  creature.id = `test_pawn_${testCreatureCounter++}`;
  creature.creatureType = pawnDef.creatureType;
  creature.x = x;
  creature.y = y;
  creature.health = pawnDef.health;
  creature.hunger = 100;
  creature.currentState = "idle";
  creature.ownerID = playerId;
  creature.pawnType = pawnType;
  creature.stamina = pawnDef.maxStamina;
  creature.nextMoveTick = 0;
  room.state.creatures.set(creature.id, creature);
  return creature;
}

/** Find a walkable, unowned tile for placing pawns. */
function findWalkableTile(room: GameRoom): { x: number; y: number } {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (
      tile.ownerID === "" &&
      !isWaterTile(tile.type) &&
      tile.type !== TileType.Rock
    ) {
      return { x: tile.x, y: tile.y };
    }
  }
  throw new Error("No walkable tile found on map");
}

/** Prepare an owned buildable tile for the player. */
function prepareBuildableTile(
  room: GameRoom,
  playerId: string,
): { x: number; y: number } {
  for (let i = 0; i < room.state.tiles.length; i++) {
    const tile = room.state.tiles.at(i)!;
    if (
      tile.ownerID === "" &&
      !isWaterTile(tile.type) &&
      tile.type !== TileType.Rock
    ) {
      tile.ownerID = playerId;
      tile.structureType = "";
      return { x: tile.x, y: tile.y };
    }
  }
  throw new Error("No buildable tile found on map");
}

function getGameLogs(room: GameRoom, logType?: string) {
  const broadcast = room.broadcast as ReturnType<typeof vi.fn>;
  return broadcast.mock.calls
    .filter((call) => call[0] === "game_log")
    .map((call) => call[1] as { message: string; type: string })
    .filter((payload) => !logType || payload.type === logType);
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Food Economy System", () => {
  let room: GameRoom;

  beforeEach(() => {
    room = createRoomWithMap(42);
    testCreatureCounter = 0;
  });

  // ── 1. Starting food ────────────────────────────────────────────

  describe("starting food", () => {
    it("player starts with 50 food on join", () => {
      const { player } = joinPlayer(room, "p1");

      expect(player.food).toBe(TERRITORY.STARTING_FOOD);
      expect(player.food).toBe(50);
    });
  });

  // ── 2. HQ food income ──────────────────────────────────────────

  describe("HQ food income", () => {
    it("HQ produces 2 food per income tick", () => {
      const { player } = joinPlayer(room, "p1");
      const foodBefore = player.food;

      room.state.tick = STRUCTURE_INCOME.INTERVAL_TICKS;
      room.tickStructureIncome();

      // HQ income (2) minus starting explorer upkeep (1)
      const startingUpkeep = PAWN_TYPES.explorer.foodUpkeep;
      expect(player.food).toBe(foodBefore + STRUCTURE_INCOME.HQ_FOOD - startingUpkeep);
      expect(STRUCTURE_INCOME.HQ_FOOD).toBe(2);
    });
  });

  // ── 3. Farm food income ─────────────────────────────────────────

  describe("farm food income", () => {
    it("each farm produces 2 food per income tick (not wood/stone)", () => {
      const { client, player } = joinPlayer(room, "p1");
      const spot = prepareBuildableTile(room, "p1");
      giveResources(player, 100, 100, player.food);

      room.handlePlaceBuilding(client, {
        x: spot.x,
        y: spot.y,
        buildingType: "farm",
      });

      const foodBefore = player.food;
      const woodBefore = player.wood;
      const stoneBefore = player.stone;

      room.state.tick = STRUCTURE_INCOME.INTERVAL_TICKS;
      room.tickStructureIncome();

      // Farm produces food (minus starting explorer upkeep)
      const startingUpkeep = PAWN_TYPES.explorer.foodUpkeep;
      expect(BUILDING_INCOME.farm.food).toBe(2);
      expect(player.food).toBeGreaterThanOrEqual(
        foodBefore + STRUCTURE_INCOME.HQ_FOOD + BUILDING_INCOME.farm.food - startingUpkeep,
      );

      // Farm does NOT produce wood or stone
      expect(BUILDING_INCOME.farm.wood).toBe(0);
      expect(BUILDING_INCOME.farm.stone).toBe(0);
      expect(player.wood).toBe(woodBefore + STRUCTURE_INCOME.HQ_WOOD);
      expect(player.stone).toBe(stoneBefore + STRUCTURE_INCOME.HQ_STONE);
    });
  });

  // ── 4. Factory no food ──────────────────────────────────────────

  describe("factory produces no food", () => {
    it("factories produce wood and stone but NOT food", () => {
      const { client, player } = joinPlayer(room, "p1");
      const spot = prepareBuildableTile(room, "p1");
      giveResources(player, 100, 100, player.food);

      room.handlePlaceBuilding(client, {
        x: spot.x,
        y: spot.y,
        buildingType: "factory",
      });

      const foodBefore = player.food;

      room.state.tick = STRUCTURE_INCOME.INTERVAL_TICKS;
      room.tickStructureIncome();

      // Factory does NOT produce food
      expect(BUILDING_INCOME.factory.food).toBe(0);

      // Factory still produces wood and stone
      expect(BUILDING_INCOME.factory.wood).toBe(2);
      expect(BUILDING_INCOME.factory.stone).toBe(1);

      // Food only comes from HQ (not factory), minus starting explorer upkeep
      const startingUpkeep = PAWN_TYPES.explorer.foodUpkeep;
      expect(player.food).toBeGreaterThanOrEqual(
        foodBefore + STRUCTURE_INCOME.HQ_FOOD - startingUpkeep,
      );
    });
  });

  // ── 5. Food upkeep calculation ──────────────────────────────────

  describe("food upkeep per pawn type", () => {
    it("builder costs 1 food per income tick", () => {
      expect(PAWN_TYPES.builder.foodUpkeep).toBe(1);
    });

    it("explorer costs 1 food per income tick", () => {
      expect(PAWN_TYPES.explorer.foodUpkeep).toBe(1);
    });

    it("defender costs 2 food per income tick", () => {
      expect(PAWN_TYPES.defender.foodUpkeep).toBe(2);
    });

    it("attacker costs 3 food per income tick", () => {
      expect(PAWN_TYPES.attacker.foodUpkeep).toBe(3);
    });
  });

  // ── 6. Net food with mixed army ─────────────────────────────────

  describe("net food with mixed army", () => {
    it("food = income - total upkeep per income tick", () => {
      const { player } = joinPlayer(room, "p1");
      const pos = findWalkableTile(room);

      // Add a mixed army: 1 builder (1) + 1 defender (2) + 1 attacker (3) = 6 upkeep
      // Plus starting explorer (1) = 7 total upkeep
      addPawn(room, "p1", "builder", pos.x, pos.y);
      addPawn(room, "p1", "defender", pos.x, pos.y);
      addPawn(room, "p1", "attacker", pos.x, pos.y);

      const startingUpkeep = PAWN_TYPES.explorer.foodUpkeep;
      const totalUpkeep =
        PAWN_TYPES.builder.foodUpkeep +
        PAWN_TYPES.defender.foodUpkeep +
        PAWN_TYPES.attacker.foodUpkeep +
        startingUpkeep;
      expect(totalUpkeep).toBe(7);

      const foodBefore = player.food;

      // HQ food income is 2, upkeep is 7 → net = -5
      room.state.tick = STRUCTURE_INCOME.INTERVAL_TICKS;
      room.tickStructureIncome();

      const expectedNet = STRUCTURE_INCOME.HQ_FOOD - totalUpkeep;
      expect(expectedNet).toBe(-5);
      expect(player.food).toBe(foodBefore + expectedNet);
    });
  });

  // ── 7. Spawn blocked at zero food ──────────────────────────────

  describe("spawn blocked at zero food", () => {
    it("cannot spawn a pawn when food is 0", () => {
      const { client, player } = joinPlayer(room, "p1");
      giveResources(player, 200, 200, 0);

      const creaturesBefore = room.state.creatures.size;

      room.handleSpawnPawn(client, { pawnType: "builder" });

      // Spawn should be blocked — no new creature added
      expect(room.state.creatures.size).toBe(creaturesBefore);
      expect(client.send).toHaveBeenCalledWith(
        "game_log",
        expect.objectContaining({
          type: "error",
          message: expect.stringContaining("Food depleted."),
        }),
      );
    });

    it("cannot spawn a pawn when food is negative", () => {
      const { client, player } = joinPlayer(room, "p1");
      giveResources(player, 200, 200, -10);

      const creaturesBefore = room.state.creatures.size;

      room.handleSpawnPawn(client, { pawnType: "defender" });

      expect(room.state.creatures.size).toBe(creaturesBefore);
      expect(client.send).toHaveBeenCalledWith(
        "game_log",
        expect.objectContaining({
          type: "error",
          message: expect.stringContaining("Food depleted."),
        }),
      );
    });

    it("can spawn a pawn when food is positive", () => {
      const { client, player } = joinPlayer(room, "p1");
      giveResources(player, 200, 200, 50);

      const creaturesBefore = room.state.creatures.size;

      room.handleSpawnPawn(client, { pawnType: "builder" });

      // Spawn should succeed — new creature added
      expect(room.state.creatures.size).toBeGreaterThan(creaturesBefore);
    });
  });

  // ── 8. Starvation damage ────────────────────────────────────────

  describe("starvation damage", () => {
    it("when food <= 0, a random pawn takes 5 HP damage per income tick", () => {
      const { player } = joinPlayer(room, "p1");
      const pos = findWalkableTile(room);
      giveResources(player, 100, 100, 0);

      const existingPawnIds: string[] = [];
      room.state.creatures.forEach((creature, creatureId) => {
        if (creature.ownerID === "p1" && creature.pawnType !== "") {
          existingPawnIds.push(creatureId);
        }
      });
      expect(existingPawnIds).toHaveLength(1);
      room.state.creatures.delete(existingPawnIds[0]);

      const pawn = addPawn(room, "p1", "defender", pos.x, pos.y);
      const healthBefore = pawn.health;

      room.state.tick = STRUCTURE_INCOME.INTERVAL_TICKS;
      room.tickStructureIncome();

      // After income tick with food <= 0, one pawn should take starvation damage
      expect(STARVATION.DAMAGE_PER_TICK).toBe(5);

      // With the starting explorer removed, only this pawn can take the damage
      expect(pawn.health).toBe(healthBefore - STARVATION.DAMAGE_PER_TICK);
    });

    it("starvation damage applies each income tick while food <= 0", () => {
      const { player } = joinPlayer(room, "p1");
      const pos = findWalkableTile(room);
      giveResources(player, 100, 100, -20);

      addPawn(room, "p1", "builder", pos.x, pos.y);

      // Collect all player pawns (starting explorer + added builder)
      const allPawns: CreatureState[] = [];
      room.state.creatures.forEach((c) => {
        if (c.ownerID === "p1" && c.pawnType !== "") allPawns.push(c);
      });
      const totalHealthBefore = allPawns.reduce((sum, c) => sum + c.health, 0);

      // Tick 1
      room.state.tick = STRUCTURE_INCOME.INTERVAL_TICKS;
      room.tickStructureIncome();

      // Tick 2
      room.state.tick = STRUCTURE_INCOME.INTERVAL_TICKS * 2;
      room.tickStructureIncome();

      // Two ticks of starvation damage spread across all pawns
      const totalHealthAfter = allPawns.reduce((sum, c) => sum + c.health, 0);
      expect(totalHealthAfter).toBe(
        totalHealthBefore - 2 * STARVATION.DAMAGE_PER_TICK,
      );
    });
  });

  // ── 9. Food depletion floor ─────────────────────────────────────

  describe("food depletion floor", () => {
    it("clamps food to 0 when upkeep exceeds income", () => {
      const { player } = joinPlayer(room, "p1");
      const pos = findWalkableTile(room);

      // Add expensive army: 3 attackers = 9 upkeep + starting explorer = 10 total
      addPawn(room, "p1", "attacker", pos.x, pos.y);
      addPawn(room, "p1", "attacker", pos.x, pos.y);
      addPawn(room, "p1", "attacker", pos.x, pos.y);

      player.food = 1;

      room.state.tick = STRUCTURE_INCOME.INTERVAL_TICKS;
      room.tickStructureIncome();

      expect(player.food).toBe(0);
    });

    it("keeps food at 0 across repeated deficit ticks", () => {
      const { player } = joinPlayer(room, "p1");
      const pos = findWalkableTile(room);

      addPawn(room, "p1", "attacker", pos.x, pos.y);
      addPawn(room, "p1", "attacker", pos.x, pos.y);

      player.food = 0;

      room.state.tick = STRUCTURE_INCOME.INTERVAL_TICKS;
      room.tickStructureIncome();
      expect(player.food).toBe(0);

      room.state.tick = STRUCTURE_INCOME.INTERVAL_TICKS * 2;
      room.tickStructureIncome();
      expect(player.food).toBe(0);
    });

    it("broadcasts the depletion warning once when food first hits 0", () => {
      const { player } = joinPlayer(room, "p1");
      const pos = findWalkableTile(room);

      addPawn(room, "p1", "attacker", pos.x, pos.y);
      addPawn(room, "p1", "attacker", pos.x, pos.y);
      player.food = 1;

      room.state.tick = STRUCTURE_INCOME.INTERVAL_TICKS;
      room.tickStructureIncome();

      expect(getGameLogs(room, "deplete")).toEqual([
        expect.objectContaining({
          message: expect.stringContaining("ran out of food"),
          type: "deplete",
        }),
      ]);

      room.state.tick = STRUCTURE_INCOME.INTERVAL_TICKS * 2;
      room.tickStructureIncome();

      expect(getGameLogs(room, "deplete")).toHaveLength(1);
    });
  });

  // ── 10. Rebalanced spawn costs ──────────────────────────────────

  describe("rebalanced pawn spawn costs", () => {
    it("builder costs 10 wood, 3 stone", () => {
      expect(PAWN_TYPES.builder.cost.wood).toBe(10);
      expect(PAWN_TYPES.builder.cost.stone).toBe(3);
    });

    it("defender costs 8 wood, 12 stone", () => {
      expect(PAWN_TYPES.defender.cost.wood).toBe(8);
      expect(PAWN_TYPES.defender.cost.stone).toBe(12);
    });

    it("attacker costs 18 wood, 10 stone", () => {
      expect(PAWN_TYPES.attacker.cost.wood).toBe(18);
      expect(PAWN_TYPES.attacker.cost.stone).toBe(10);
    });

    it("explorer costs 10 wood, 6 stone", () => {
      expect(PAWN_TYPES.explorer.cost.wood).toBe(10);
      expect(PAWN_TYPES.explorer.cost.stone).toBe(6);
    });

    it("spawning a builder deducts the new costs", () => {
      const { client, player } = joinPlayer(room, "p1");
      giveResources(player, 100, 100, 50);

      const woodBefore = player.wood;
      const stoneBefore = player.stone;

      room.handleSpawnPawn(client, { pawnType: "builder" });

      expect(player.wood).toBe(woodBefore - PAWN_TYPES.builder.cost.wood);
      expect(player.stone).toBe(stoneBefore - PAWN_TYPES.builder.cost.stone);
    });
  });

  // ── 11. Enemy base food rewards ─────────────────────────────────

  describe("enemy base food rewards", () => {
    it("raider camp reward includes 5 food", () => {
      expect(ENEMY_BASE_TYPES.enemy_base_raider.reward.food).toBe(5);
    });

    it("hive reward includes 5 food", () => {
      expect(ENEMY_BASE_TYPES.enemy_base_hive.reward.food).toBe(5);
    });

    it("fortress reward includes 10 food", () => {
      expect(ENEMY_BASE_TYPES.enemy_base_fortress.reward.food).toBe(10);
    });

    it("enemy base rewards still include wood and stone", () => {
      expect(ENEMY_BASE_TYPES.enemy_base_raider.reward.wood).toBe(15);
      expect(ENEMY_BASE_TYPES.enemy_base_raider.reward.stone).toBe(10);
      expect(ENEMY_BASE_TYPES.enemy_base_hive.reward.wood).toBe(10);
      expect(ENEMY_BASE_TYPES.enemy_base_hive.reward.stone).toBe(5);
      expect(ENEMY_BASE_TYPES.enemy_base_fortress.reward.wood).toBe(25);
      expect(ENEMY_BASE_TYPES.enemy_base_fortress.reward.stone).toBe(20);
    });
  });
});
