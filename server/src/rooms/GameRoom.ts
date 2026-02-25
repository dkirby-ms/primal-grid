import { Room, Client, CloseCode } from "colyseus";
import { GameState, PlayerState, CreatureState, StructureState } from "./GameState.js";
import { generateProceduralMap } from "./mapGenerator.js";
import { tickCreatureAI, moveToward } from "./creatureAI.js";
import {
  TICK_RATE, DEFAULT_MAP_SIZE, DEFAULT_MAP_SEED,
  MOVE, GATHER, EAT, CRAFT, PLACE, FARM_HARVEST, TAME, ABANDON, SELECT_CREATURE, BREED,
  ResourceType, TileType, ItemType, Personality,
  RESOURCE_REGEN, CREATURE_SPAWN, CREATURE_TYPES,
  PLAYER_SURVIVAL, CREATURE_AI, CREATURE_RESPAWN, FARM, TAMING, BREEDING,
  RECIPES, canCraft, getItemField,
} from "@primal-grid/shared";
import type { MovePayload, GatherPayload, CraftPayload, PlacePayload, FarmHarvestPayload, TamePayload, AbandonPayload, SelectCreaturePayload, BreedPayload } from "@primal-grid/shared";

const PLAYER_COLORS = [
  "#e6194b", "#3cb44b", "#4363d8", "#f58231",
  "#911eb4", "#42d4f4", "#f032e6", "#bfef45",
  "#fabed4", "#469990", "#dcbeff", "#9a6324",
];

export class GameRoom extends Room {
  state = new GameState();
  private nextCreatureId = 0;
  private nextStructureId = 0;
  /** Server-only session state: selected pack per player (not synced to client). */
  playerSelectedPacks = new Map<string, Set<string>>();

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
      this.tickTrustDecay();
      this.tickFarms();
      this.tickPackFollow();
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

    this.onMessage(CRAFT, (client, message: CraftPayload) => {
      this.handleCraft(client, message);
    });

    this.onMessage(PLACE, (client, message: PlacePayload) => {
      this.handlePlace(client, message);
    });

    this.onMessage(FARM_HARVEST, (client, message: FarmHarvestPayload) => {
      this.handleFarmHarvest(client, message);
    });

    this.onMessage(TAME, (client, message: TamePayload) => {
      this.handleTame(client, message);
    });

    this.onMessage(ABANDON, (client, message: AbandonPayload) => {
      this.handleAbandon(client, message);
    });

    this.onMessage(SELECT_CREATURE, (client, message: SelectCreaturePayload) => {
      this.handleSelectCreature(client, message);
    });

    this.onMessage(BREED, (client, message: BreedPayload) => {
      this.handleBreed(client, message);
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

  /** Ensure playerSelectedPacks is initialized (tests skip constructor). */
  private ensurePacks(): Map<string, Set<string>> {
    if (!this.playerSelectedPacks) this.playerSelectedPacks = new Map<string, Set<string>>();
    return this.playerSelectedPacks;
  }

  override onLeave(client: Client, code: number) {
    this.state.players.delete(client.sessionId);
    this.ensurePacks().delete(client.sessionId);
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
    // Tool bonus: +1 yield if player has appropriate tool
    let bonus = 0;
    if (tile.resourceType === ResourceType.Wood && player.axes >= 1) bonus = 1;
    if (tile.resourceType === ResourceType.Stone && player.pickaxes >= 1) bonus = 1;
    const yield_ = 1 + bonus;
    switch (tile.resourceType) {
      case ResourceType.Wood: player.wood += yield_; break;
      case ResourceType.Stone: player.stone += yield_; break;
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

  private handleCraft(client: Client, message: CraftPayload) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const { recipeId } = message;
    const recipe = RECIPES[recipeId];
    if (!recipe) return;

    // Check resources
    if (!canCraft(player as unknown as Record<string, number>, recipeId)) return;

    // Decrement ingredients
    for (const ing of recipe.ingredients) {
      (player as unknown as Record<string, number>)[ing.resource] -= ing.amount;
    }

    // Increment output
    const field = getItemField(recipe.output);
    if (field) {
      (player as unknown as Record<string, number>)[field] += recipe.outputCount;
    }
  }

  private handlePlace(client: Client, message: PlacePayload) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const { itemType, x, y } = message;
    if (!Number.isInteger(x) || !Number.isInteger(y)) return;
    if (!Number.isInteger(itemType)) return;

    // Validate item type is placeable (Wall, Floor, Workbench, FarmPlot)
    const placeableTypes = [ItemType.Wall, ItemType.Floor, ItemType.Workbench, ItemType.FarmPlot];
    if (!placeableTypes.includes(itemType)) return;

    // Check player has the item
    const field = getItemField(itemType);
    if (!field) return;
    const count = (player as unknown as Record<string, number>)[field];
    if (!count || count < 1) return;

    // Validate tile is walkable (before placement)
    if (!this.state.isWalkable(x, y)) return;

    // Check no existing structure on this tile
    let occupied = false;
    this.state.structures.forEach((s) => {
      if (s.x === x && s.y === y) occupied = true;
    });
    if (occupied) return;

    // Validate player is adjacent or on tile
    const dx = Math.abs(player.x - x);
    const dy = Math.abs(player.y - y);
    if (dx > 1 || dy > 1) return;

    // FarmPlot restricted to Grassland/Forest tiles
    if (itemType === ItemType.FarmPlot) {
      const tile = this.state.getTile(x, y);
      if (!tile) return;
      if (tile.type !== TileType.Grassland && tile.type !== TileType.Forest) return;
    }

    // Decrement player inventory
    (player as unknown as Record<string, number>)[field] -= 1;

    // Create structure
    if (this.nextStructureId == null) this.nextStructureId = 0;
    const structure = new StructureState();
    structure.id = `structure_${this.nextStructureId++}`;
    structure.structureType = itemType;
    structure.x = x;
    structure.y = y;
    structure.placedBy = client.sessionId;
    if (itemType === ItemType.FarmPlot) {
      structure.growthProgress = 0;
      structure.cropReady = false;
    }
    this.state.structures.set(structure.id, structure);
  }

  private handleFarmHarvest(client: Client, message: FarmHarvestPayload) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const { x, y } = message;
    if (!Number.isInteger(x) || !Number.isInteger(y)) return;

    // Player must be adjacent or on tile
    const dx = Math.abs(player.x - x);
    const dy = Math.abs(player.y - y);
    if (dx > 1 || dy > 1) return;

    // Find farm plot at this tile
    let farm: StructureState | undefined;
    this.state.structures.forEach((s) => {
      if (s.x === x && s.y === y && s.structureType === ItemType.FarmPlot) {
        farm = s;
      }
    });
    if (!farm || !farm.cropReady) return;

    // Harvest: give berries scaled by tile fertility
    const tile = this.state.getTile(x, y);
    const fertility = tile ? tile.fertility : 0.5;
    const yield_ = Math.max(1, Math.round(FARM.BASE_HARVEST_YIELD * fertility));
    player.berries += yield_;

    // Reset farm
    farm.growthProgress = 0;
    farm.cropReady = false;
  }

  private handleTame(client: Client, message: TamePayload) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const { creatureId } = message;
    if (!creatureId) return;
    const creature = this.state.creatures.get(creatureId);
    if (!creature) return;

    // Must be wild
    if (creature.ownerID !== "") return;

    // Must be adjacent (Manhattan distance <= 1)
    const dist = Math.abs(player.x - creature.x) + Math.abs(player.y - creature.y);
    if (dist > 1) return;

    // Check pack size limit
    let ownedCount = 0;
    this.state.creatures.forEach((c) => {
      if (c.ownerID === client.sessionId) ownedCount++;
    });
    if (ownedCount >= TAMING.MAX_PACK_SIZE) return;

    // Cost: 1 berry (herbivore) or 1 meat (carnivore)
    if (creature.creatureType === "herbivore") {
      if (player.berries < 1) return;
      player.berries -= 1;
    } else {
      if (player.meat < 1) return;
      player.meat -= 1;
    }

    // Tame: set owner, apply personality-based initial trust
    creature.ownerID = client.sessionId;
    let initialTrust = 0;
    if (creature.personality === Personality.Docile) {
      initialTrust = 10;
    } else if (creature.personality === Personality.Aggressive) {
      initialTrust = 0; // clamped from -5
    }
    creature.trust = initialTrust;
    creature.zeroTrustTicks = 0;
  }

  private handleAbandon(client: Client, message: AbandonPayload) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const { creatureId } = message;
    if (!creatureId) return;
    const creature = this.state.creatures.get(creatureId);
    if (!creature) return;

    // Must own the creature
    if (creature.ownerID !== client.sessionId) return;

    creature.ownerID = "";
    creature.trust = 0;
    creature.zeroTrustTicks = 0;
    // Remove from any selected pack
    this.ensurePacks().forEach((pack) => pack.delete(creatureId));
  }

  private tickTrustDecay() {
    this.state.creatures.forEach((creature) => {
      if (creature.ownerID === "") return;

      const owner = this.state.players.get(creature.ownerID);
      if (!owner) return;

      const dist = Math.abs(creature.x - owner.x) + Math.abs(creature.y - owner.y);

      // Proximity trust gain: +1 per 10 ticks if within 3 tiles
      if (dist <= 3 && this.state.tick % 10 === 0) {
        creature.trust = Math.min(100, creature.trust + TAMING.TRUST_PER_PROXIMITY_TICK);
      }

      // Trust decay: -1 per 20 ticks if owner > 3 tiles away
      if (dist > 3 && this.state.tick % 20 === 0) {
        creature.trust = Math.max(0, creature.trust - TAMING.TRUST_DECAY_ALONE);
      }

      // Auto-abandon: if trust at 0 for 50+ consecutive ticks
      if (creature.trust === 0) {
        creature.zeroTrustTicks++;
        if (creature.zeroTrustTicks >= TAMING.ZERO_TRUST_ABANDON_TICKS) {
          creature.ownerID = "";
          creature.zeroTrustTicks = 0;
          // Remove from selected pack on auto-abandon
          this.ensurePacks().forEach((pack) => pack.delete(creature.id));
        }
      } else {
        creature.zeroTrustTicks = 0;
      }
    });
  }

  private tickFarms() {
    if (this.state.tick % FARM.TICK_INTERVAL !== 0) return;

    this.state.structures.forEach((structure) => {
      if (structure.structureType !== ItemType.FarmPlot) return;
      if (structure.cropReady) return;

      const tile = this.state.getTile(structure.x, structure.y);
      const fertility = tile ? tile.fertility : 0;
      structure.growthProgress = Math.min(
        FARM.READY_THRESHOLD,
        structure.growthProgress + fertility * FARM.GROWTH_RATE,
      );
      if (structure.growthProgress >= FARM.READY_THRESHOLD) {
        structure.cropReady = true;
      }
    });
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
    // Collect all creatures currently in any player's selected pack
    const packs = this.ensurePacks();
    const packIds = new Set<string>();
    packs.forEach((pack) => {
      pack.forEach((id) => packIds.add(id));
    });
    tickCreatureAI(this.state, packIds);
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
    creature.personality = this.rollPersonality(typeDef.personalityChart);
    this.state.creatures.set(creature.id, creature);
  }

  /** Pick a personality from weighted chart [Docile%, Neutral%, Aggressive%]. */
  private rollPersonality(chart: readonly [number, number, number]): string {
    const roll = Math.random() * 100;
    if (roll < chart[0]) return Personality.Docile;
    if (roll < chart[0] + chart[1]) return Personality.Neutral;
    return Personality.Aggressive;
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

  handleSelectCreature(client: Client, message: SelectCreaturePayload) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const { creatureId } = message;
    if (!creatureId) return;
    const creature = this.state.creatures.get(creatureId);
    if (!creature) return;

    // Must own the creature
    if (creature.ownerID !== client.sessionId) return;

    // Must have trust >= 70 (obedient)
    if (creature.trust < TAMING.TRUST_AT_OBEDIENT) return;

    let pack = this.ensurePacks().get(client.sessionId);
    if (!pack) {
      pack = new Set<string>();
      this.ensurePacks().set(client.sessionId, pack);
    }

    // Toggle: if already in pack, remove; otherwise add
    if (pack.has(creatureId)) {
      pack.delete(creatureId);
    } else {
      if (pack.size >= TAMING.MAX_PACK_SIZE) return;
      pack.add(creatureId);
    }
  }

  handleBreed(client: Client, message: BreedPayload) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const { creatureId } = message;
    if (!creatureId) return;
    const target = this.state.creatures.get(creatureId);
    if (!target) return;

    // Validate: creature owned by player
    if (target.ownerID !== client.sessionId) return;

    // Validate: trust >= 70
    if (target.trust < TAMING.TRUST_AT_OBEDIENT) return;

    // Check breeding cooldown on target
    if (target.lastBredTick > 0 && this.state.tick - target.lastBredTick < BREEDING.COOLDOWN_TICKS) return;

    // Check pack size limit
    let ownedCount = 0;
    this.state.creatures.forEach((c) => {
      if (c.ownerID === client.sessionId) ownedCount++;
    });
    if (ownedCount >= TAMING.MAX_PACK_SIZE) return;

    // Find mate: same type, same owner, trust >= 70, within 1 tile of target, not on cooldown
    let mate: CreatureState | null = null;
    this.state.creatures.forEach((c) => {
      if (mate) return;
      if (c.id === target.id) return;
      if (c.creatureType !== target.creatureType) return;
      if (c.ownerID !== client.sessionId) return;
      if (c.trust < TAMING.TRUST_AT_OBEDIENT) return;
      const dist = Math.abs(c.x - target.x) + Math.abs(c.y - target.y);
      if (dist > 1) return;
      if (c.lastBredTick > 0 && this.state.tick - c.lastBredTick < BREEDING.COOLDOWN_TICKS) return;
      mate = c;
    });
    if (!mate) return;

    // Cost: 10 berries
    if (player.berries < BREEDING.FOOD_COST) return;
    player.berries -= BREEDING.FOOD_COST;

    // Set cooldowns
    target.lastBredTick = this.state.tick;
    (mate as CreatureState).lastBredTick = this.state.tick;

    // 50% success chance
    if (Math.random() >= 0.5) return;

    // Find empty adjacent walkable tile near target
    const spawnPos = this.findAdjacentEmptyTile(target.x, target.y);
    if (!spawnPos) return;

    // Spawn offspring
    if (this.nextCreatureId == null) this.nextCreatureId = 0;
    const typeDef = CREATURE_TYPES[target.creatureType];
    const offspring = new CreatureState();
    offspring.id = `creature_${this.nextCreatureId++}`;
    offspring.creatureType = target.creatureType;
    offspring.x = spawnPos.x;
    offspring.y = spawnPos.y;
    offspring.ownerID = client.sessionId;
    offspring.trust = BREEDING.OFFSPRING_TRUST;
    offspring.health = typeDef.health;
    offspring.hunger = typeDef.hunger;
    offspring.currentState = "idle";

    // Traits: average parent speed deltas + random mutation ±1, cap ±3
    const avgSpeed = (target.speed + (mate as CreatureState).speed) / 2;
    const mutation = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
    offspring.speed = Math.max(-BREEDING.TRAIT_CAP, Math.min(BREEDING.TRAIT_CAP, Math.round(avgSpeed) + mutation));

    // Random personality from parent type's chart
    offspring.personality = this.rollPersonality(typeDef.personalityChart);

    this.state.creatures.set(offspring.id, offspring);
  }

  /** Find an empty adjacent walkable tile near (cx, cy). */
  private findAdjacentEmptyTile(cx: number, cy: number): { x: number; y: number } | null {
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!this.state.isWalkable(nx, ny)) continue;
      // Check no creature on this tile
      let occupied = false;
      this.state.creatures.forEach((c) => {
        if (c.x === nx && c.y === ny) occupied = true;
      });
      if (!occupied) return { x: nx, y: ny };
    }
    return null;
  }

  private tickPackFollow() {
    const packs = this.ensurePacks();
    for (const [playerId, pack] of packs) {
      const owner = this.state.players.get(playerId);
      if (!owner) { packs.delete(playerId); continue; }

      for (const creatureId of pack) {
        const creature = this.state.creatures.get(creatureId);
        if (!creature || creature.ownerID !== playerId) {
          pack.delete(creatureId);
          continue;
        }

        const dist = Math.abs(creature.x - owner.x) + Math.abs(creature.y - owner.y);
        if (dist > 1) {
          moveToward(creature, owner.x, owner.y, this.state);
        }
        creature.currentState = "follow";
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
