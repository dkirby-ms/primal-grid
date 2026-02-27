import { Room, Client, CloseCode } from "colyseus";
import { GameState, PlayerState, CreatureState, StructureState } from "./GameState.js";
import { generateProceduralMap } from "./mapGenerator.js";
import { tickCreatureAI } from "./creatureAI.js";
import {
  TICK_RATE, DEFAULT_MAP_SIZE, DEFAULT_MAP_SEED,
  CRAFT, PLACE, FARM_HARVEST, TAME, ABANDON, BREED,
  PLACE_SHAPE, ASSIGN_PAWN,
  ResourceType, TileType, ItemType, Personality,
  RESOURCE_REGEN, CREATURE_SPAWN, CREATURE_TYPES,
  CREATURE_AI, CREATURE_RESPAWN, FARM, TAMING, BREEDING, TERRITORY,
  TERRITORY_INCOME, SHAPE, SHAPE_CATALOG,
  RECIPES, canCraft, getItemField,
} from "@primal-grid/shared";
import type { CraftPayload, PlacePayload, FarmHarvestPayload, TamePayload, AbandonPayload, BreedPayload, PlaceShapePayload, AssignPawnPayload } from "@primal-grid/shared";
import { spawnHQ, isShapeAdjacentToTerritory } from "./territory.js";

const PLAYER_COLORS = [
  "#e6194b", "#3cb44b", "#4363d8", "#f58231",
  "#911eb4", "#42d4f4", "#f032e6", "#bfef45",
  "#fabed4", "#469990", "#dcbeff", "#9a6324",
];

export class GameRoom extends Room {
  state = new GameState();
  private nextCreatureId = 0;
  private nextStructureId = 0;

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
      this.tickTrustDecay();
      this.tickFarms();
      this.tickTerritoryIncome();
    }, 1000 / TICK_RATE);

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

    this.onMessage(BREED, (client, message: BreedPayload) => {
      this.handleBreed(client, message);
    });

    this.onMessage(PLACE_SHAPE, (client, message: PlaceShapePayload) => {
      this.handlePlaceShape(client, message);
    });

    this.onMessage(ASSIGN_PAWN, (client, message: AssignPawnPayload) => {
      this.handleAssignPawn(client, message);
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
    if (this.nextStructureId == null) this.nextStructureId = 0;
    if (this.nextCreatureId == null) this.nextCreatureId = 0;
    const idRef = { value: this.nextStructureId };
    const creatureIdRef = { value: this.nextCreatureId };
    spawnHQ(this.state, player, hqPos.x, hqPos.y, idRef, creatureIdRef);
    this.nextStructureId = idRef.value;
    this.nextCreatureId = creatureIdRef.value;

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

      // Check no existing structure on this tile
      let occupied = false;
      this.state.structures.forEach((s) => {
        if (s.x === cell.x && s.y === cell.y) occupied = true;
      });
      if (occupied) return;
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

  private handleAssignPawn(client: Client, message: AssignPawnPayload) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const { creatureId, command, zoneX, zoneY } = message;
    if (!creatureId) return;

    const creature = this.state.creatures.get(creatureId);
    if (!creature) return;

    // Must own the creature
    if (creature.ownerID !== client.sessionId) return;

    // Must have trust >= 70 (obedient)
    if (creature.trust < TAMING.TRUST_AT_OBEDIENT) return;

    // Validate command
    const validCommands = ["idle", "gather", "guard"];
    if (!validCommands.includes(command)) return;

    // For gather/guard, validate zone tile
    if (command === "gather" || command === "guard") {
      if (zoneX == null || zoneY == null) return;
      if (!Number.isInteger(zoneX) || !Number.isInteger(zoneY)) return;

      // Zone tile must be within player's territory
      const zoneTile = this.state.getTile(zoneX, zoneY);
      if (!zoneTile) return;
      if (zoneTile.ownerID !== client.sessionId) return;

      creature.zoneX = zoneX;
      creature.zoneY = zoneY;
    }

    // Set command
    creature.command = command;

    // Idle clears zone
    if (command === "idle") {
      creature.zoneX = -1;
      creature.zoneY = -1;
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

    // Validate item type is placeable
    const placeableTypes = [ItemType.Workbench, ItemType.FarmPlot, ItemType.Turret, ItemType.HQ];
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

    // Validate tile is owned by the player
    const placeTile = this.state.getTile(x, y);
    if (!placeTile || placeTile.ownerID !== client.sessionId) return;

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

    // Tile must be owned by the player
    const harvestTile = this.state.getTile(x, y);
    if (!harvestTile || harvestTile.ownerID !== client.sessionId) return;

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

    // Creature must be on or adjacent to a tile owned by the player
    let nearTerritory = false;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const t = this.state.getTile(creature.x + dx, creature.y + dy);
        if (t && t.ownerID === client.sessionId) { nearTerritory = true; break; }
      }
      if (nearTerritory) break;
    }
    if (!nearTerritory) return;

    // Check pack size limit
    let ownedCount = 0;
    this.state.creatures.forEach((c) => {
      if (c.ownerID === client.sessionId) ownedCount++;
    });
    if (ownedCount >= TAMING.MAX_PACK_SIZE) return;

    // Cost: 1 berry for all creature types
    if (player.berries < 1) return;
    player.berries -= 1;

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
  }

  private tickTrustDecay() {
    this.state.creatures.forEach((creature) => {
      if (creature.ownerID === "") return;

      const owner = this.state.players.get(creature.ownerID);
      if (!owner) return;

      const tile = this.state.getTile(creature.x, creature.y);
      const inTerritory = tile?.ownerID === creature.ownerID;

      // Proximity trust gain: +1 per 10 ticks if in territory
      if (inTerritory && this.state.tick % 10 === 0) {
        creature.trust = Math.min(100, creature.trust + TAMING.TRUST_PER_PROXIMITY_TICK);
      }

      // Trust decay: -1 per 20 ticks if outside territory
      if (!inTerritory && this.state.tick % 20 === 0) {
        creature.trust = Math.max(0, creature.trust - TAMING.TRUST_DECAY_ALONE);
      }

      // Auto-abandon: if trust at 0 for 50+ consecutive ticks
      if (creature.trust === 0) {
        creature.zeroTrustTicks++;
        if (creature.zeroTrustTicks >= TAMING.ZERO_TRUST_ABANDON_TICKS) {
          creature.ownerID = "";
          creature.zeroTrustTicks = 0;
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
