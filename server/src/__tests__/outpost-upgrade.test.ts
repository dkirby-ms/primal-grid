import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameRoom } from "../rooms/GameRoom.js";
import { tickCombat } from "../rooms/combat.js";
import { setAttackCooldown } from "../rooms/combatTracking.js";
import { CreatureState, GameState, PlayerState, TileState } from "../rooms/GameState.js";
import {
  ENEMY_BASE_TYPES,
  OUTPOST_UPGRADE_COST_STONE,
  OUTPOST_UPGRADE_COST_WOOD,
  UPGRADED_OUTPOST_ATTACK_INTERVAL,
  UPGRADED_OUTPOST_DAMAGE,
} from "@primal-grid/shared";

type TestableGameRoom = GameRoom & {
  handlePlaceBuilding(
    client: { sessionId: string; send: (...args: unknown[]) => void },
    message: { x: number; y: number; buildingType: "farm" | "factory" },
  ): void;
  handleUpgradeOutpost(
    client: { sessionId: string; send: (...args: unknown[]) => void },
    message: { x: number; y: number },
  ): void;
  tickOutpostAttacks(): void;
};

interface MockClient {
  sessionId: string;
  send: ReturnType<typeof vi.fn>;
}

function createRoom(size: number = 7): TestableGameRoom {
  const room = Object.create(GameRoom.prototype) as TestableGameRoom;
  room.state = new GameState();
  room.state.mapWidth = size;
  room.state.mapHeight = size;
  room.broadcast = vi.fn();
  (room as unknown as { enemyBaseState: Map<string, { spawnedMobileIds: Set<string> }> }).enemyBaseState = new Map();

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const tile = new TileState();
      tile.x = x;
      tile.y = y;
      room.state.tiles.push(tile);
    }
  }

  return room;
}

function addPlayer(
  room: TestableGameRoom,
  id: string,
  resources: { wood?: number; stone?: number } = {},
): PlayerState {
  const player = new PlayerState();
  player.id = id;
  player.displayName = id;
  player.wood = resources.wood ?? 100;
  player.stone = resources.stone ?? 100;
  room.state.players.set(id, player);
  return player;
}

function addOutpost(
  room: TestableGameRoom,
  x: number,
  y: number,
  ownerID: string,
  upgraded: boolean = false,
): TileState {
  const tile = room.state.getTile(x, y);
  if (!tile) {
    throw new Error(`Missing tile at (${x}, ${y})`);
  }

  tile.ownerID = ownerID;
  tile.structureType = "outpost";
  tile.upgraded = upgraded;
  tile.attackCooldown = 0;
  return tile;
}

function addCreature(
  room: TestableGameRoom,
  id: string,
  creatureType: string,
  x: number,
  y: number,
  health: number = 40,
): CreatureState {
  const creature = new CreatureState();
  creature.id = id;
  creature.creatureType = creatureType;
  creature.x = x;
  creature.y = y;
  creature.health = health;
  room.state.creatures.set(id, creature);
  return creature;
}

function fakeClient(sessionId: string): MockClient {
  return { sessionId, send: vi.fn() };
}

describe("Outpost upgrade system", () => {
  let room: TestableGameRoom;

  beforeEach(() => {
    room = createRoom();
  });

  it("upgrades the targeted owned outpost and spends resources", () => {
    const client = fakeClient("p1");
    const player = addPlayer(room, "p1");
    const tile = addOutpost(room, 2, 2, "p1");
    tile.attackCooldown = 5;

    room.handleUpgradeOutpost(client, { x: 2, y: 2 });

    expect(tile.upgraded).toBe(true);
    expect(tile.attackCooldown).toBe(0);
    expect(player.wood).toBe(100 - OUTPOST_UPGRADE_COST_WOOD);
    expect(player.stone).toBe(100 - OUTPOST_UPGRADE_COST_STONE);
    expect(room.broadcast).toHaveBeenCalledWith(
      "game_log",
      expect.objectContaining({ type: "building" }),
    );
  });

  it("rejects upgrading an outpost the player does not own", () => {
    const client = fakeClient("p1");
    const player = addPlayer(room, "p1");
    addPlayer(room, "p2");
    const tile = addOutpost(room, 2, 2, "p2");

    room.handleUpgradeOutpost(client, { x: 2, y: 2 });

    expect(tile.upgraded).toBe(false);
    expect(player.wood).toBe(100);
    expect(player.stone).toBe(100);
    expect(client.send).toHaveBeenCalledWith(
      "game_log",
      expect.objectContaining({ message: "You don't own this tile.", type: "error" }),
    );
  });

  it("rejects upgrading a non-outpost tile", () => {
    const client = fakeClient("p1");
    const player = addPlayer(room, "p1");
    const tile = room.state.getTile(2, 2)!;
    tile.ownerID = "p1";
    tile.structureType = "farm";

    room.handleUpgradeOutpost(client, { x: 2, y: 2 });

    expect(tile.upgraded).toBe(false);
    expect(player.wood).toBe(100);
    expect(player.stone).toBe(100);
    expect(client.send).toHaveBeenCalledWith(
      "game_log",
      expect.objectContaining({ message: "Tile does not have an outpost.", type: "error" }),
    );
  });

  it("rejects upgrading an outpost that is already upgraded", () => {
    const client = fakeClient("p1");
    const player = addPlayer(room, "p1");
    const tile = addOutpost(room, 2, 2, "p1", true);

    room.handleUpgradeOutpost(client, { x: 2, y: 2 });

    expect(tile.upgraded).toBe(true);
    expect(player.wood).toBe(100);
    expect(player.stone).toBe(100);
    expect(client.send).toHaveBeenCalledWith(
      "game_log",
      expect.objectContaining({ message: "Outpost is already upgraded.", type: "error" }),
    );
  });

  it("rejects upgrading without enough resources", () => {
    const client = fakeClient("p1");
    const player = addPlayer(room, "p1", {
      wood: OUTPOST_UPGRADE_COST_WOOD - 1,
      stone: OUTPOST_UPGRADE_COST_STONE - 1,
    });
    const tile = addOutpost(room, 2, 2, "p1");

    room.handleUpgradeOutpost(client, { x: 2, y: 2 });

    expect(tile.upgraded).toBe(false);
    expect(player.wood).toBe(OUTPOST_UPGRADE_COST_WOOD - 1);
    expect(player.stone).toBe(OUTPOST_UPGRADE_COST_STONE - 1);
    expect(client.send).toHaveBeenCalledWith(
      "game_log",
      expect.objectContaining({
        message: `Not enough resources. Need ${OUTPOST_UPGRADE_COST_WOOD} wood + ${OUTPOST_UPGRADE_COST_STONE} stone.`,
        type: "error",
      }),
    );
  });

  it("targets the closest enemy and respects the configured attack interval", () => {
    addPlayer(room, "p1");
    const tile = addOutpost(room, 2, 2, "p1", true);
    const closestEnemy = addCreature(room, "enemy-close", "enemy_scout", 2, 3);
    const fartherEnemy = addCreature(room, "enemy-far", "enemy_raider", 2, 6);

    room.tickOutpostAttacks();

    expect(closestEnemy.health).toBe(40 - UPGRADED_OUTPOST_DAMAGE);
    expect(fartherEnemy.health).toBe(40);
    expect(tile.attackCooldown).toBe(UPGRADED_OUTPOST_ATTACK_INTERVAL - 1);

    for (let i = 0; i < UPGRADED_OUTPOST_ATTACK_INTERVAL - 1; i += 1) {
      room.tickOutpostAttacks();
      expect(closestEnemy.health).toBe(40 - UPGRADED_OUTPOST_DAMAGE);
    }

    room.tickOutpostAttacks();

    expect(closestEnemy.health).toBe(40 - (UPGRADED_OUTPOST_DAMAGE * 2));
    expect(fartherEnemy.health).toBe(40);
  });

  it("cleans up enemy base trackers and spawned mobiles when an upgraded outpost kills a base", () => {
    const player = addPlayer(room, "p1");
    const tile = addOutpost(room, 2, 2, "p1", true);
    const reward = ENEMY_BASE_TYPES.enemy_base_raider.reward;
    const base = addCreature(room, "enemy-base", "enemy_base_raider", 2, 3, UPGRADED_OUTPOST_DAMAGE);
    const mobile = addCreature(room, "enemy-mobile", "enemy_raider", 3, 3, 10);
    const enemyBaseState = (room as unknown as {
      enemyBaseState: Map<string, { spawnedMobileIds: Set<string> }>;
    }).enemyBaseState;
    enemyBaseState.set(base.id, { spawnedMobileIds: new Set([mobile.id]) });

    room.tickOutpostAttacks();

    expect(tile.attackCooldown).toBe(UPGRADED_OUTPOST_ATTACK_INTERVAL - 1);
    expect(room.state.creatures.has(base.id)).toBe(false);
    expect(room.state.creatures.has(mobile.id)).toBe(false);
    expect(enemyBaseState.has(base.id)).toBe(false);
    expect(player.wood).toBe(100 + reward.wood);
    expect(player.stone).toBe(100 + reward.stone);
    expect(player.food).toBe(reward.food);
  });

  it("clears upgrade state when an outpost tile is replaced by another building", () => {
    const client = fakeClient("p1");
    addPlayer(room, "p1");
    const tile = addOutpost(room, 2, 2, "p1", true);
    tile.attackCooldown = 3;

    room.handlePlaceBuilding(client, { x: 2, y: 2, buildingType: "farm" });

    expect(tile.structureType).toBe("farm");
    expect(tile.upgraded).toBe(false);
    expect(tile.attackCooldown).toBe(0);
  });

  it("clears combat cooldown tracking when an upgraded outpost kills an enemy", () => {
    const firstRoom = createRoom();
    addPlayer(firstRoom, "p1");
    addOutpost(firstRoom, 2, 2, "p1", true);
    addCreature(firstRoom, "enemy-reused", "enemy_raider", 2, 3, UPGRADED_OUTPOST_DAMAGE);
    setAttackCooldown("enemy-reused", 100);

    firstRoom.tickOutpostAttacks();
    expect(firstRoom.state.creatures.has("enemy-reused")).toBe(false);

    const secondRoom = createRoom();
    secondRoom.state.tick = 100;
    const enemyBaseState = (secondRoom as unknown as {
      enemyBaseState: Map<string, { spawnedMobileIds: Set<string> }>;
    }).enemyBaseState;
    const attackerState = new Map<string, { startedAtTick: number; homeX: number; homeY: number }>();

    const builder = addCreature(secondRoom, "builder-1", "pawn_builder", 2, 2, 50);
    builder.ownerID = "p1";
    builder.pawnType = "builder";
    addCreature(secondRoom, "enemy-reused", "enemy_raider", 2, 3, 50);

    tickCombat(secondRoom.state, secondRoom as never, enemyBaseState as never, { value: 0 }, attackerState as never);

    expect(builder.health).toBeLessThan(50);
  });
});
