import { Room, Client, CloseCode } from "colyseus";
import { GameState, PlayerState, CreatureState } from "./GameState.js";
import { generateProceduralMap } from "./mapGenerator.js";
import { tickCreatureAI } from "./creatureAI.js";
import {
  TICK_RATE, DEFAULT_MAP_SIZE, DEFAULT_MAP_SEED,
  PLACE_SHAPE,
  ResourceType, TileType,
  RESOURCE_REGEN, CREATURE_SPAWN, CREATURE_TYPES,
  CREATURE_AI, CREATURE_RESPAWN, TERRITORY,
  TERRITORY_INCOME, SHAPE, SHAPE_CATALOG,
} from "@primal-grid/shared";
import type { PlaceShapePayload } from "@primal-grid/shared";
import { spawnHQ, isShapeAdjacentToTerritory } from "./territory.js";

const PLAYER_COLORS = [
  "#e6194b", "#3cb44b", "#4363d8", "#f58231",
  "#911eb4", "#42d4f4", "#f032e6", "#bfef45",
  "#fabed4", "#469990", "#dcbeff", "#9a6324",
];

export class GameRoom extends Room {
  state = new GameState();
  private nextCreatureId = 0;

  override onCreate(options: Record<string, unknown>) {
    const seed = typeof options?.seed === "number" ? options.seed : DEFAULT_MAP_SEED;
    this.generateMap(seed);
    this.spawnCreatures();

    this.setSimulationInterval((_deltaTime) => {
      this.state.tick += 1;
      this.tickClaiming();
      this.tickResourceRegen();
      this.tickCreatureAI();
      this.tickCreatureRespawn();
      this.tickTerritoryIncome();
    }, 1000 / TICK_RATE);

    this.onMessage(PLACE_SHAPE, (client, message: PlaceShapePayload) => {
      this.handlePlaceShape(client, message);
    });

    console.log("[GameRoom] Room created.");
  }

  override onJoin(client: Client) {
    const player = new PlayerState();
    player.id = client.sessionId;
    player.color = PLAYER_COLORS[this.state.players.size % PLAYER_COLORS.length];

    this.state.players.set(client.sessionId, player);

    // Spawn HQ and claim starting territory
    const hqPos = this.findHQSpawnLocation();
    spawnHQ(this.state, player, hqPos.x, hqPos.y);

    console.log(`[GameRoom] Client joined: ${client.sessionId}, HQ at (${hqPos.x}, ${hqPos.y})`);
  }

  override onLeave(client: Client, code: number) {
    this.state.players.delete(client.sessionId);
    const consented = code === CloseCode.CONSENTED;
    console.log(
      `[GameRoom] Client left: ${client.sessionId} (consented: ${consented})`
    );
  }

  override onDispose() {
    console.log("[GameRoom] Room disposed.");
  }

  private generateMap(seed: number = DEFAULT_MAP_SEED) {
    generateProceduralMap(this.state, seed, DEFAULT_MAP_SIZE, DEFAULT_MAP_SIZE);
  }

  private handlePlaceShape(client: Client, message: PlaceShapePayload) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const { shapeId, x, y, rotation } = message;

    // Validate shape exists
    const shapeDef = SHAPE_CATALOG[shapeId];
    if (!shapeDef) return;

    // Validate rotation
    if (rotation !== 0 && rotation !== 1 && rotation !== 2 && rotation !== 3) return;

    // Get rotated cells and compute absolute positions
    const rotatedCells = shapeDef.rotations[rotation];
    const absoluteCells = rotatedCells.map((c) => ({ x: x + c.dx, y: y + c.dy }));

    // Validate ALL cells
    for (const cell of absoluteCells) {
      const tile = this.state.getTile(cell.x, cell.y);
      if (!tile) return;
      if (tile.type === TileType.Water || tile.type === TileType.Rock) return;
      if (tile.shapeHP > 0) return;
      if (tile.ownerID !== "" && tile.ownerID !== player.id) return;
      if (tile.claimingPlayerID !== "" && tile.claimingPlayerID !== player.id) return;
    }

    // Validate adjacency to existing territory
    if (!isShapeAdjacentToTerritory(this.state, player.id, absoluteCells)) return;

    // Validate cost
    const cost = absoluteCells.length * SHAPE.COST_WOOD_PER_CELL;
    if (player.wood < cost) return;

    // Deduct wood
    player.wood -= cost;

    // Apply shape — start claiming for unowned tiles, reinforce instantly for owned
    for (const cell of absoluteCells) {
      const tile = this.state.getTile(cell.x, cell.y)!;
      if (tile.ownerID === player.id) {
        // Already owned — reinforce immediately
        tile.shapeHP = SHAPE.BLOCK_HP;
      } else {
        // Start claiming process
        tile.claimingPlayerID = player.id;
        tile.claimProgress = 1;
      }
    }
  }

  /** Find a walkable tile at least 10 tiles from any existing HQ. */
  private findHQSpawnLocation(): { x: number; y: number } {
    const MIN_HQ_DISTANCE = 10;
    const w = this.state.mapWidth;
    const h = this.state.mapHeight;

    // Collect existing HQ positions
    const hqs: { x: number; y: number }[] = [];
    this.state.players.forEach((p) => {
      if (p.hqX >= 0 && p.hqY >= 0) hqs.push({ x: p.hqX, y: p.hqY });
    });

    // Try random walkable tiles far from other HQs
    for (let attempts = 0; attempts < 200; attempts++) {
      const x = Math.floor(Math.random() * w);
      const y = Math.floor(Math.random() * h);
      if (!this.state.isWalkable(x, y)) continue;
      const tooClose = hqs.some(
        (hq) => Math.abs(hq.x - x) + Math.abs(hq.y - y) < MIN_HQ_DISTANCE,
      );
      if (!tooClose) return { x, y };
    }

    // Fallback: any walkable tile
    return this.findRandomWalkableTile();
  }

  private tickTerritoryIncome() {
    if (this.state.tick % TERRITORY_INCOME.INTERVAL_TICKS !== 0) return;

    const len = this.state.tiles.length;
    for (let i = 0; i < len; i++) {
      const tile = this.state.tiles.at(i);
      if (!tile) continue;
      if (tile.ownerID === "" || tile.resourceAmount <= 0) continue;
      if (tile.shapeHP > 0) continue;
      const owner = this.state.players.get(tile.ownerID);
      if (!owner) continue;

      const amount = TERRITORY_INCOME.AMOUNT;
      switch (tile.resourceType) {
        case ResourceType.Wood:    owner.wood    += amount; break;
        case ResourceType.Stone:   owner.stone   += amount; break;
        case ResourceType.Fiber:   owner.fiber   += amount; break;
        case ResourceType.Berries: owner.berries += amount; break;
        default: continue;
      }
      tile.resourceAmount -= amount;
      if (tile.resourceAmount <= 0) {
        tile.resourceType = -1;
      }
    }
  }

  private tickCreatureAI() {
    if (this.state.tick % CREATURE_AI.TICK_INTERVAL !== 0) return;
    tickCreatureAI(this.state);
  }

  /** Biome-to-resource mapping for regeneration. */
  private getDefaultResourceType(biomeType: number): number {
    switch (biomeType) {
      case TileType.Forest: return ResourceType.Wood;
      case TileType.Grassland: return Math.random() < 0.5 ? ResourceType.Fiber : ResourceType.Berries;
      case TileType.Highland: return ResourceType.Stone;
      case TileType.Sand: return Math.random() < RESOURCE_REGEN.SAND_FIBER_CHANCE ? ResourceType.Fiber : -1;
      default: return -1;
    }
  }

  private tickClaiming() {
    const len = this.state.tiles.length;
    for (let i = 0; i < len; i++) {
      const tile = this.state.tiles.at(i);
      if (!tile || tile.claimProgress <= 0) continue;

      tile.claimProgress += 1;
      if (tile.claimProgress >= TERRITORY.CLAIM_TICKS) {
        tile.ownerID = tile.claimingPlayerID;
        tile.shapeHP = SHAPE.BLOCK_HP;
        const player = this.state.players.get(tile.claimingPlayerID);
        if (player) player.score += 1;
        tile.claimingPlayerID = "";
        tile.claimProgress = 0;
      }
    }
  }

  private tickResourceRegen() {
    if (this.state.tick % RESOURCE_REGEN.INTERVAL_TICKS !== 0) return;

    const len = this.state.tiles.length;
    for (let i = 0; i < len; i++) {
      const tile = this.state.tiles.at(i);
      if (!tile) continue;

      if (tile.resourceType >= 0 && tile.resourceAmount < RESOURCE_REGEN.MAX_AMOUNT) {
        // Existing resource — regenerate toward max
        tile.resourceAmount = Math.min(
          tile.resourceAmount + RESOURCE_REGEN.REGEN_AMOUNT,
          RESOURCE_REGEN.MAX_AMOUNT,
        );
      } else if (tile.resourceType < 0) {
        // Depleted tile — try to regrow based on biome
        const newType = this.getDefaultResourceType(tile.type);
        if (newType >= 0) {
          tile.resourceType = newType;
          tile.resourceAmount = RESOURCE_REGEN.REGEN_AMOUNT;
        }
      }
    }
  }

  private spawnCreatures() {
    for (const [typeKey, count] of [
      ["herbivore", CREATURE_SPAWN.HERBIVORE_COUNT],
      ["carnivore", CREATURE_SPAWN.CARNIVORE_COUNT],
    ] as const) {
      for (let i = 0; i < count; i++) {
        this.spawnOneCreature(typeKey);
      }
    }

    console.log(`[GameRoom] Spawned ${this.state.creatures.size} creatures.`);
  }

  private spawnOneCreature(typeKey: string): void {
    if (this.nextCreatureId == null) this.nextCreatureId = 0;
    const typeDef = CREATURE_TYPES[typeKey];
    const preferredBiomes = new Set(typeDef.preferredBiomes as readonly number[]);
    const pos = this.findWalkableTileInBiomes(preferredBiomes);
    const creature = new CreatureState();
    creature.id = `creature_${this.nextCreatureId++}`;
    creature.creatureType = typeKey;
    creature.x = pos.x;
    creature.y = pos.y;
    creature.health = typeDef.health;
    creature.hunger = typeDef.hunger;
    creature.currentState = "idle";
    this.state.creatures.set(creature.id, creature);
  }

  private tickCreatureRespawn() {
    if (this.state.tick % CREATURE_RESPAWN.CHECK_INTERVAL !== 0) return;

    for (const typeKey of Object.keys(CREATURE_TYPES)) {
      const typeDef = CREATURE_TYPES[typeKey];
      let count = 0;
      this.state.creatures.forEach((c) => {
        if (c.creatureType === typeKey) count++;
      });

      while (count < typeDef.minPopulation) {
        this.spawnOneCreature(typeKey);
        count++;
      }
    }
  }

  private findWalkableTileInBiomes(preferredBiomes: Set<number>): { x: number; y: number } {
    const w = this.state.mapWidth;
    const h = this.state.mapHeight;

    // Try preferred biomes first
    for (let attempts = 0; attempts < 100; attempts++) {
      const x = Math.floor(Math.random() * w);
      const y = Math.floor(Math.random() * h);
      const tile = this.state.getTile(x, y);
      if (tile && this.state.isWalkable(x, y) && preferredBiomes.has(tile.type)) {
        return { x, y };
      }
    }

    // Fallback: any walkable tile
    return this.findRandomWalkableTile();
  }

  private findRandomWalkableTile(): { x: number; y: number } {
    const w = this.state.mapWidth;
    const h = this.state.mapHeight;
    for (let attempts = 0; attempts < 100; attempts++) {
      const x = Math.floor(Math.random() * w);
      const y = Math.floor(Math.random() * h);
      if (this.state.isWalkable(x, y)) {
        return { x, y };
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (this.state.isWalkable(x, y)) {
          return { x, y };
        }
      }
    }
    return { x: 0, y: 0 };
  }
}
