import { Room, Client, CloseCode } from "colyseus";
import { GameState, PlayerState, CreatureState } from "./GameState.js";
import { generateProceduralMap } from "./mapGenerator.js";
import { tickCreatureAI } from "./creatureAI.js";
import { stepBuilder } from "./builderAI.js";
import {
  TICK_RATE, DEFAULT_MAP_SIZE, DEFAULT_MAP_SEED,
  SPAWN_PAWN,
  ResourceType, TileType,
  RESOURCE_REGEN, CREATURE_SPAWN, CREATURE_TYPES,
  CREATURE_AI, CREATURE_RESPAWN, TERRITORY,
  STRUCTURE_INCOME, SHAPE,
  PROGRESSION, getLevelForXP,
  PAWN,
} from "@primal-grid/shared";
import type { SpawnPawnPayload } from "@primal-grid/shared";
import { spawnHQ } from "./territory.js";

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
      this.tickStructureIncome();
      this.tickPawnUpkeep();
    }, 1000 / TICK_RATE);

    this.onMessage(SPAWN_PAWN, (client, message: SpawnPawnPayload) => {
      this.handleSpawnPawn(client, message);
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

  private handleSpawnPawn(client: Client, message: SpawnPawnPayload) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (message.pawnType !== "builder") return;

    // Validate resources
    if (player.wood < PAWN.BUILDER_COST_WOOD || player.stone < PAWN.BUILDER_COST_STONE) return;

    // Validate pawn cap
    let pawnCount = 0;
    this.state.creatures.forEach((c) => {
      if (c.ownerID === client.sessionId && c.pawnType === "builder") pawnCount++;
    });
    if (pawnCount >= PAWN.MAX_PER_PLAYER) return;

    // Find walkable tile within HQ zone
    const spawnPos = this.findHQWalkableTile(player);
    if (!spawnPos) return;

    // Deduct cost
    player.wood -= PAWN.BUILDER_COST_WOOD;
    player.stone -= PAWN.BUILDER_COST_STONE;

    // Spawn builder
    if (this.nextCreatureId == null) this.nextCreatureId = 0;
    const creature = new CreatureState();
    creature.id = `pawn_${this.nextCreatureId++}`;
    creature.creatureType = "pawn_builder";
    creature.x = spawnPos.x;
    creature.y = spawnPos.y;
    creature.health = PAWN.BUILDER_HEALTH;
    creature.hunger = 100;
    creature.currentState = "idle";
    creature.ownerID = client.sessionId;
    creature.pawnType = "builder";
    creature.buildMode = message.buildMode === "farm" ? "farm" : "outpost";
    creature.targetX = -1;
    creature.targetY = -1;
    creature.buildProgress = 0;
    this.state.creatures.set(creature.id, creature);
  }

  /** Find a random walkable tile within the player's HQ zone. */
  private findHQWalkableTile(player: PlayerState): { x: number; y: number } | null {
    const halfSize = Math.floor(TERRITORY.STARTING_SIZE / 2);
    const candidates: { x: number; y: number }[] = [];
    for (let dy = -halfSize; dy <= halfSize; dy++) {
      for (let dx = -halfSize; dx <= halfSize; dx++) {
        const tx = player.hqX + dx;
        const ty = player.hqY + dy;
        if (this.state.isWalkable(tx, ty)) {
          candidates.push({ x: tx, y: ty });
        }
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private tickPawnUpkeep() {
    if (this.state.tick % PAWN.UPKEEP_INTERVAL_TICKS !== 0) return;

    const toRemove: string[] = [];

    this.state.creatures.forEach((creature) => {
      if (creature.pawnType !== "builder") return;
      const owner = this.state.players.get(creature.ownerID);
      if (!owner) {
        toRemove.push(creature.id);
        return;
      }

      if (owner.wood >= PAWN.BUILDER_UPKEEP_WOOD) {
        owner.wood -= PAWN.BUILDER_UPKEEP_WOOD;
      } else {
        creature.health -= PAWN.UPKEEP_DAMAGE;
        if (creature.health <= 0) {
          toRemove.push(creature.id);
        }
      }
    });

    for (const id of toRemove) {
      this.state.creatures.delete(id);
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

  private tickStructureIncome() {
    if (this.state.tick % STRUCTURE_INCOME.INTERVAL_TICKS !== 0) return;

    // Count farms per player
    const farmCounts = new Map<string, number>();
    const len = this.state.tiles.length;
    for (let i = 0; i < len; i++) {
      const tile = this.state.tiles.at(i);
      if (!tile || tile.ownerID === "" || tile.structureType !== "farm") continue;
      farmCounts.set(tile.ownerID, (farmCounts.get(tile.ownerID) || 0) + 1);
    }

    // Grant income per player: HQ base income + farm income
    this.state.players.forEach((player, playerId) => {
      if (player.hqX < 0 || player.hqY < 0) return;

      // HQ base income
      player.wood += STRUCTURE_INCOME.HQ_WOOD;
      player.stone += STRUCTURE_INCOME.HQ_STONE;

      // Farm income
      const farms = farmCounts.get(playerId) || 0;
      player.wood += farms * STRUCTURE_INCOME.FARM_WOOD;
      player.stone += farms * STRUCTURE_INCOME.FARM_STONE;
    });
  }

  private tickCreatureAI() {
    if (this.state.tick % CREATURE_AI.TICK_INTERVAL !== 0) return;
    tickCreatureAI(this.state);
  }

  /** Biome-to-resource mapping for regeneration. */
  private getDefaultResourceType(biomeType: number): number {
    switch (biomeType) {
      case TileType.Forest: return ResourceType.Wood;
      case TileType.Grassland: return ResourceType.Wood;
      case TileType.Highland: return ResourceType.Stone;
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
        if (player) {
          player.score += 1;
          player.xp += PROGRESSION.XP_PER_TILE_CLAIMED;
          const newLevel = getLevelForXP(player.xp);
          if (newLevel > player.level) {
            player.level = newLevel;
          }
        }
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
