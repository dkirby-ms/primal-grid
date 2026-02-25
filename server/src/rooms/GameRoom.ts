import { Room, Client, CloseCode } from "colyseus";
import { GameState, PlayerState, CreatureState } from "./GameState.js";
import { generateProceduralMap } from "./mapGenerator.js";
import { tickCreatureAI } from "./creatureAI.js";
import {
  TICK_RATE, DEFAULT_MAP_SIZE, DEFAULT_MAP_SEED,
  MOVE, GATHER, EAT,
  ResourceType, TileType,
  RESOURCE_REGEN, CREATURE_SPAWN, CREATURE_TYPES,
  PLAYER_SURVIVAL, CREATURE_AI, CREATURE_RESPAWN,
} from "@primal-grid/shared";
import type { MovePayload, GatherPayload } from "@primal-grid/shared";

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
      this.tickPlayerSurvival();
      this.tickResourceRegen();
      this.tickCreatureAI();
      this.tickCreatureRespawn();
    }, 1000 / TICK_RATE);

    this.onMessage(MOVE, (client, message: MovePayload) => {
      this.handleMove(client, message);
    });

    this.onMessage(GATHER, (client, message: GatherPayload) => {
      this.handleGather(client, message);
    });

    this.onMessage(EAT, (client) => {
      this.handleEat(client);
    });

    console.log("[GameRoom] Room created.");
  }

  override onJoin(client: Client) {
    const player = new PlayerState();
    player.id = client.sessionId;
    player.color = PLAYER_COLORS[this.state.players.size % PLAYER_COLORS.length];

    const spawn = this.findRandomWalkableTile();
    player.x = spawn.x;
    player.y = spawn.y;

    this.state.players.set(client.sessionId, player);
    console.log(`[GameRoom] Client joined: ${client.sessionId} at (${spawn.x}, ${spawn.y})`);
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

  private handleMove(client: Client, message: MovePayload) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const { dx, dy } = message;
    // Validate direction values are -1, 0, or 1
    if (!Number.isInteger(dx) || !Number.isInteger(dy)) return;
    if (dx < -1 || dx > 1 || dy < -1 || dy > 1) return;
    if (dx === 0 && dy === 0) return;

    const newX = player.x + dx;
    const newY = player.y + dy;

    if (this.state.isWalkable(newX, newY)) {
      player.x = newX;
      player.y = newY;
    }
  }

  private generateMap(seed: number = DEFAULT_MAP_SEED) {
    generateProceduralMap(this.state, seed, DEFAULT_MAP_SIZE, DEFAULT_MAP_SIZE);
  }

  private handleGather(client: Client, message: GatherPayload) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const { x, y } = message;
    if (!Number.isInteger(x) || !Number.isInteger(y)) return;

    // Player must be on or adjacent to the tile
    const dx = Math.abs(player.x - x);
    const dy = Math.abs(player.y - y);
    if (dx > 1 || dy > 1) return;

    const tile = this.state.getTile(x, y);
    if (!tile || tile.resourceType < 0 || tile.resourceAmount <= 0) return;

    // Decrement resource, increment player inventory
    tile.resourceAmount -= 1;
    switch (tile.resourceType) {
      case ResourceType.Wood: player.wood += 1; break;
      case ResourceType.Stone: player.stone += 1; break;
      case ResourceType.Fiber: player.fiber += 1; break;
      case ResourceType.Berries: player.berries += 1; break;
    }

    // Deplete tile if empty
    if (tile.resourceAmount <= 0) {
      tile.resourceAmount = 0;
      tile.resourceType = -1;
    }
  }

  private handleEat(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (player.berries <= 0) return;
    if (player.hunger >= PLAYER_SURVIVAL.MAX_HUNGER) return;

    player.berries -= 1;
    player.hunger = Math.min(
      player.hunger + PLAYER_SURVIVAL.BERRY_HUNGER_RESTORE,
      PLAYER_SURVIVAL.MAX_HUNGER,
    );
  }

  private tickPlayerSurvival() {
    if (this.state.tick % PLAYER_SURVIVAL.HUNGER_TICK_INTERVAL !== 0) return;

    this.state.players.forEach((player) => {
      player.hunger = Math.max(0, player.hunger - PLAYER_SURVIVAL.HUNGER_DRAIN);

      if (player.hunger <= 0) {
        player.health = Math.max(
          PLAYER_SURVIVAL.HEALTH_FLOOR,
          player.health - PLAYER_SURVIVAL.STARVATION_DAMAGE,
        );
      }
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
      case TileType.Grassland: return Math.random() < 0.5 ? ResourceType.Fiber : ResourceType.Berries;
      case TileType.Highland: return ResourceType.Stone;
      case TileType.Sand: return Math.random() < RESOURCE_REGEN.SAND_FIBER_CHANCE ? ResourceType.Fiber : -1;
      default: return -1;
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
