import { Room, Client, CloseCode } from "colyseus";
import { StateView } from "@colyseus/schema";
import { GameState, PlayerState, CreatureState } from "./GameState.js";
import { generateProceduralMap } from "./mapGenerator.js";
import { tickCreatureAI } from "./creatureAI.js";
import { computeVisibleTiles } from "./visibility.js";
import { tickCombat } from "./combat.js";
import { tickGraveDecay } from "./graveDecay.js";
import type { EnemyBaseTracker } from "./enemyBaseAI.js";
import type { AttackerTracker } from "./attackerAI.js";
import {
  TICK_RATE, DEFAULT_MAP_SIZE, DEFAULT_MAP_SEED,
  SPAWN_PAWN, SET_NAME,
  ResourceType, TileType, isWaterTile,
  RESOURCE_REGEN, CREATURE_SPAWN, CREATURE_TYPES,
  CREATURE_AI, CREATURE_RESPAWN, TERRITORY,
  STRUCTURE_INCOME, SHAPE,
  PROGRESSION, getLevelForXP,
  PAWN, PAWN_TYPES, DAY_NIGHT, FOG_OF_WAR,
  ENEMY_SPAWNING, ENEMY_BASE_TYPES,
  DayPhase,
  isEnemyBase,
} from "@primal-grid/shared";
import type { SpawnPawnPayload, SetNamePayload } from "@primal-grid/shared";
import { spawnHQ } from "./territory.js";

const PLAYER_COLORS = [
  "#e6194b", "#3cb44b", "#4363d8", "#f58231",
  "#911eb4", "#42d4f4", "#f032e6", "#bfef45",
  "#fabed4", "#469990", "#dcbeff", "#9a6324",
];

export class GameRoom extends Room {
  state = new GameState();
  private nextCreatureId = 0;
  /** Per-player StateView, cached visible tile indices, and visible creature IDs for fog of war. */
  playerViews = new Map<string, { view: StateView; visibleIndices: Set<number>; visibleCreatureIds: Set<string>; devMode: boolean }>();
  /** Server-side tracking for enemy bases (mobile ownership). */
  private enemyBaseState = new Map<string, EnemyBaseTracker>();
  /** Server-side tracking for attacker pawns (sortie timer, home tile). */
  private attackerState = new Map<string, AttackerTracker>();
  /** Shared mutable counter for creature IDs (passed to AI functions). */
  private creatureIdCounter = { value: 0 };

  override onCreate(options: Record<string, unknown>) {
    const seed = typeof options?.seed === "number" ? options.seed : DEFAULT_MAP_SEED;
    this.generateMap(seed);
    this.spawnCreatures();

    this.setSimulationInterval((_deltaTime) => {
      this.state.tick += 1;
      this.tickDayNightCycle();
      this.tickClaiming();
      this.tickResourceRegen();
      this.tickCreatureAI();
      this.tickCreatureRespawn();
      this.tickStructureIncome();
      this.tickPawnUpkeep();
      this.tickEnemyBaseSpawning();
      this.tickCombat();
      this.tickGraveDecay();
      this.tickFogOfWar();
    }, 1000 / TICK_RATE);

    this.onMessage(SPAWN_PAWN, (client, message: SpawnPawnPayload) => {
      this.handleSpawnPawn(client, message);
    });

    this.onMessage(SET_NAME, (client, message: SetNamePayload) => {
      this.handleSetName(client, message);
    });

    console.log("[GameRoom] Room created.");
  }

  override onJoin(client: Client, options?: Record<string, unknown>) {
    const player = new PlayerState();
    player.id = client.sessionId;
    player.color = PLAYER_COLORS[this.state.players.size % PLAYER_COLORS.length];

    this.state.players.set(client.sessionId, player);

    // Spawn HQ and claim starting territory
    const hqPos = this.findHQSpawnLocation();
    spawnHQ(this.state, player, hqPos.x, hqPos.y);

    const devMode = options?.devMode === true;

    // Initialize per-player StateView for fog of war
    this.initPlayerView(client, player, devMode);

    // Add new player to all existing views (scoreboard visibility)
    if (this.playerViews) {
      for (const [sid, entry] of this.playerViews) {
        if (sid !== client.sessionId) {
          entry.view.add(player);
        }
      }
    }

    console.log(`[GameRoom] Client joined: ${client.sessionId}, HQ at (${hqPos.x}, ${hqPos.y})${devMode ? ' [DEV MODE]' : ''}`);
    client.send("game_log", { message: "Welcome to Primal Grid!", type: "info" });
  }

  override onLeave(client: Client, code: number) {
    // Clean up fog of war StateView
    this.cleanupPlayerView(client.sessionId);

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

  private handleSetName(client: Client, message: SetNamePayload) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const raw = typeof message.name === "string" ? message.name : "";
    const sanitized = raw.trim().slice(0, 20);
    if (sanitized.length === 0) return;

    player.displayName = sanitized;
    this.broadcast("game_log", { message: `${sanitized} has joined`, type: "info" });
  }

  private handleSpawnPawn(client: Client, message: SpawnPawnPayload) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const pawnDef = PAWN_TYPES[message.pawnType];
    if (!pawnDef) return;

    // Validate resources
    if (player.wood < pawnDef.cost.wood || player.stone < pawnDef.cost.stone) return;

    // Validate pawn cap (per pawn type)
    let pawnCount = 0;
    this.state.creatures.forEach((c) => {
      if (c.ownerID === client.sessionId && c.pawnType === message.pawnType) pawnCount++;
    });
    if (pawnCount >= pawnDef.maxCount) return;

    // Find walkable tile within HQ zone
    const spawnPos = this.findHQWalkableTile(player);
    if (!spawnPos) return;

    // Deduct cost
    player.wood -= pawnDef.cost.wood;
    player.stone -= pawnDef.cost.stone;

    // Spawn pawn
    if (this.nextCreatureId == null) this.nextCreatureId = 0;
    const creature = new CreatureState();
    creature.id = `pawn_${this.nextCreatureId++}`;
    creature.creatureType = pawnDef.creatureType;
    creature.x = spawnPos.x;
    creature.y = spawnPos.y;
    creature.health = pawnDef.health;
    creature.hunger = 100;
    creature.currentState = "idle";
    creature.ownerID = client.sessionId;
    creature.pawnType = message.pawnType;
    creature.buildMode = message.pawnType === "builder" ? (message.buildMode === "farm" ? "farm" : "outpost") : "";
    creature.targetX = -1;
    creature.targetY = -1;
    creature.buildProgress = 0;
    creature.stamina = pawnDef.maxStamina;
    // Stagger so pawns don't all step on the same tick
    creature.nextMoveTick = this.state.tick + 1 + ((this.nextCreatureId - 1) % CREATURE_AI.TICK_INTERVAL);
    this.state.creatures.set(creature.id, creature);

    // Keep creatureIdCounter in sync
    if (!this.creatureIdCounter) this.creatureIdCounter = { value: 0 };
    this.creatureIdCounter.value = this.nextCreatureId;

    this.broadcast("game_log", { message: `${pawnDef.name} spawned`, type: "spawn" });
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
      if (!creature.pawnType || creature.pawnType === "") return;
      const pawnDef = PAWN_TYPES[creature.pawnType];
      if (!pawnDef) return;

      const owner = this.state.players.get(creature.ownerID);
      if (!owner) {
        toRemove.push(creature.id);
        return;
      }

      if (owner.wood >= pawnDef.upkeep.wood) {
        owner.wood -= pawnDef.upkeep.wood;
      } else {
        creature.health -= PAWN.UPKEEP_DAMAGE;
        if (creature.health <= 0) {
          toRemove.push(creature.id);
          this.broadcast("game_log", { message: `${pawnDef.name} starved (no wood for upkeep)`, type: "death" });
        } else {
          this.broadcast("game_log", { message: `${pawnDef.name} taking damage — need wood!`, type: "upkeep" });
        }
      }
    });

    for (const id of toRemove) {
      this.state.creatures.delete(id);
    }
  }

  /** Count Water/Rock tiles in the NxN starting zone around (cx, cy). */
  private countNonWalkableInZone(cx: number, cy: number): number {
    const half = Math.floor(TERRITORY.STARTING_SIZE / 2);
    let count = 0;
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const tile = this.state.getTile(cx + dx, cy + dy);
        if (!tile || isWaterTile(tile.type) || tile.type === TileType.Rock) {
          count++;
        }
      }
    }
    return count;
  }

  /** Find a walkable tile at least 10 tiles from any existing HQ.
   *  Prefers locations where the 5×5 zone has zero Water/Rock tiles. */
  private findHQSpawnLocation(): { x: number; y: number } {
    const MIN_HQ_DISTANCE = 10;
    const w = this.state.mapWidth;
    const h = this.state.mapHeight;

    // Ensure the full NxN starting territory fits within the map
    const half = Math.floor(TERRITORY.STARTING_SIZE / 2);
    const minCoord = half;
    const maxX = w - half;
    const maxY = h - half;

    // Collect existing HQ positions
    const hqs: { x: number; y: number }[] = [];
    this.state.players.forEach((p) => {
      if (p.hqX >= 0 && p.hqY >= 0) hqs.push({ x: p.hqX, y: p.hqY });
    });

    // Try random walkable tiles far from other HQs, preferring zones with no Water/Rock
    let bestCandidate: { x: number; y: number } | null = null;
    let bestNonWalkable = Infinity;

    for (let attempts = 0; attempts < 200; attempts++) {
      const x = minCoord + Math.floor(Math.random() * (maxX - minCoord));
      const y = minCoord + Math.floor(Math.random() * (maxY - minCoord));
      if (!this.state.isWalkable(x, y)) continue;
      const tooClose = hqs.some(
        (hq) => Math.abs(hq.x - x) + Math.abs(hq.y - y) < MIN_HQ_DISTANCE,
      );
      if (tooClose) continue;

      const nonWalkable = this.countNonWalkableInZone(x, y);
      if (nonWalkable === 0) return { x, y };
      if (nonWalkable < bestNonWalkable) {
        bestNonWalkable = nonWalkable;
        bestCandidate = { x, y };
      }
    }

    // Accept best candidate found (spawnHQ will force-convert remaining tiles)
    if (bestCandidate) return bestCandidate;

    // Fallback: any walkable tile within safe margin
    for (let y = minCoord; y < maxY; y++) {
      for (let x = minCoord; x < maxX; x++) {
        if (this.state.isWalkable(x, y)) {
          return { x, y };
        }
      }
    }
    return { x: minCoord, y: minCoord };
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

  tickDayNightCycle() {
    this.state.dayTick = (this.state.dayTick + 1) % DAY_NIGHT.CYCLE_LENGTH_TICKS;
    const pct = (this.state.dayTick / DAY_NIGHT.CYCLE_LENGTH_TICKS) * 100;
    for (const phase of DAY_NIGHT.PHASES) {
      if (pct >= phase.startPercent && pct < phase.endPercent) {
        if (this.state.dayPhase !== phase.name) {
          this.state.dayPhase = phase.name;
        }
        break;
      }
    }
  }

  /** Periodically spawn enemy bases on the map (night-only). */
  private tickEnemyBaseSpawning() {
    // Lazy-initialize for test compatibility
    if (!this.enemyBaseState) this.enemyBaseState = new Map();

    // Only spawn during night phase
    if (this.state.dayPhase !== DayPhase.Night) return;

    // Grace period at start
    if (this.state.tick < ENEMY_SPAWNING.FIRST_BASE_DELAY_TICKS) return;

    // Check spawn interval
    if (this.state.tick % ENEMY_SPAWNING.BASE_SPAWN_INTERVAL_TICKS !== 0) return;

    // Count existing bases
    let baseCount = 0;
    this.state.creatures.forEach((c) => {
      if (isEnemyBase(c.creatureType)) baseCount++;
    });
    if (baseCount >= ENEMY_SPAWNING.MAX_BASES) return;

    // Pick a random base type
    const baseTypeKeys = Object.keys(ENEMY_BASE_TYPES);
    const baseTypeKey = baseTypeKeys[Math.floor(Math.random() * baseTypeKeys.length)];
    const baseDef = ENEMY_BASE_TYPES[baseTypeKey];
    if (!baseDef) return;

    // Find valid spawn location
    const pos = this.findEnemyBaseSpawnLocation();
    if (!pos) return;

    if (this.nextCreatureId == null) this.nextCreatureId = 0;
    const base = new CreatureState();
    base.id = `enemy_base_${this.nextCreatureId++}`;
    base.creatureType = baseTypeKey;
    base.x = pos.x;
    base.y = pos.y;
    base.health = baseDef.health;
    base.hunger = 100;
    base.currentState = "active";
    base.ownerID = "";
    base.pawnType = "";
    base.targetX = -1;
    base.targetY = -1;
    base.stamina = 0;
    base.nextMoveTick = this.state.tick + baseDef.spawnInterval;
    this.state.creatures.set(base.id, base);

    this.creatureIdCounter.value = this.nextCreatureId;

    this.broadcast("game_log", {
      message: `Enemy base spawned: ${baseDef.name} at (${pos.x},${pos.y}) on tick ${this.state.tick} [phase=${this.state.dayPhase}, bases=${baseCount + 1}/${ENEMY_SPAWNING.MAX_BASES}]`,
      type: "spawn",
    });
  }

  /** Find a valid spawn location for an enemy base. */
  private findEnemyBaseSpawnLocation(): { x: number; y: number } | null {
    const w = this.state.mapWidth;
    const h = this.state.mapHeight;

    // Collect HQ positions and existing base positions
    const hqs: { x: number; y: number }[] = [];
    this.state.players.forEach((p) => {
      if (p.hqX >= 0 && p.hqY >= 0) hqs.push({ x: p.hqX, y: p.hqY });
    });

    const bases: { x: number; y: number }[] = [];
    this.state.creatures.forEach((c) => {
      if (isEnemyBase(c.creatureType)) bases.push({ x: c.x, y: c.y });
    });

    for (let attempts = 0; attempts < 100; attempts++) {
      const x = Math.floor(Math.random() * w);
      const y = Math.floor(Math.random() * h);
      const tile = this.state.getTile(x, y);
      if (!tile || !this.state.isWalkable(x, y)) continue;
      if (tile.ownerID !== "") continue;

      // Min distance from HQs
      const tooCloseToHQ = hqs.some(
        (hq) => Math.abs(hq.x - x) + Math.abs(hq.y - y) < ENEMY_SPAWNING.MIN_DISTANCE_FROM_HQ,
      );
      if (tooCloseToHQ) continue;

      // Min distance between bases
      const tooCloseToBase = bases.some(
        (b) => Math.abs(b.x - x) + Math.abs(b.y - y) < ENEMY_SPAWNING.MIN_DISTANCE_BETWEEN_BASES,
      );
      if (tooCloseToBase) continue;

      return { x, y };
    }
    return null;
  }

  /** Resolve combat interactions. */
  private tickCombat() {
    if (!this.enemyBaseState) this.enemyBaseState = new Map();
    if (!this.creatureIdCounter) this.creatureIdCounter = { value: this.nextCreatureId ?? 0 };
    this.creatureIdCounter.value = this.nextCreatureId;
    tickCombat(this.state, this, this.enemyBaseState, this.creatureIdCounter, this.attackerState);
    this.nextCreatureId = this.creatureIdCounter.value;
  }

  /** Remove expired grave markers. */
  private tickGraveDecay() {
    tickGraveDecay(this.state, this.state.tick);
  }

  private tickCreatureAI() {
    // Lazy-initialize server-side state for test compatibility
    if (!this.enemyBaseState) this.enemyBaseState = new Map();
    if (!this.attackerState) this.attackerState = new Map();
    if (!this.creatureIdCounter) this.creatureIdCounter = { value: this.nextCreatureId ?? 0 };

    // Keep counter in sync
    this.creatureIdCounter.value = this.nextCreatureId;
    tickCreatureAI(this.state, this, this.enemyBaseState, this.attackerState, this.creatureIdCounter);
    this.nextCreatureId = this.creatureIdCounter.value;
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
    creature.stamina = typeDef.maxStamina;
    // Stagger AI ticks so creatures don't all move on the same tick
    creature.nextMoveTick = this.state.tick + 1 + ((this.nextCreatureId - 1) % CREATURE_AI.TICK_INTERVAL);
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
      if (tile && this.state.isWalkable(x, y) && preferredBiomes.has(tile.type) && tile.ownerID === "") {
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
      const tile = this.state.getTile(x, y);
      if (tile && this.state.isWalkable(x, y) && tile.ownerID === "") {
        return { x, y };
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const tile = this.state.getTile(x, y);
        if (tile && this.state.isWalkable(x, y) && tile.ownerID === "") {
          return { x, y };
        }
      }
    }
    return { x: 0, y: 0 };
  }

  /** Create a StateView for the joining player and add initial visible tiles. */
  private initPlayerView(client: Client, player: PlayerState, devMode: boolean): void {
    if (!this.playerViews) {
      this.playerViews = new Map();
    }
    const view = new StateView();
    client.view = view;

    let visibleIndices: Set<number>;

    if (devMode) {
      // Dev mode: all tiles visible — no fog of war
      visibleIndices = new Set<number>();
      const totalTiles = this.state.tiles.length;
      for (let i = 0; i < totalTiles; i++) {
        visibleIndices.add(i);
        const tile = this.state.tiles.at(i);
        if (tile) view.add(tile);
      }
    } else {
      // Compute initial visibility (HQ + surrounding territory)
      visibleIndices = computeVisibleTiles(this.state, player.id);
      for (const idx of visibleIndices) {
        const tile = this.state.tiles.at(idx);
        if (tile) view.add(tile);
      }
    }

    // All players are always visible (scoreboard)
    this.state.players.forEach((p) => view.add(p));

    // Add visible creatures: own pawns always, others only on visible tiles
    const visibleCreatureIds = new Set<string>();
    this.state.creatures.forEach((creature, id) => {
      if (devMode) {
        view.add(creature);
        visibleCreatureIds.add(id);
      } else {
        const tileIdx = creature.y * this.state.mapWidth + creature.x;
        if (creature.ownerID === player.id || visibleIndices.has(tileIdx)) {
          view.add(creature);
          visibleCreatureIds.add(id);
        }
      }
    });

    this.playerViews.set(client.sessionId, { view, visibleIndices, visibleCreatureIds, devMode });
  }

  /** Remove all tracked items from a player's view and clean up tracking state. */
  private cleanupPlayerView(sessionId: string): void {
    if (!this.playerViews) return;
    const entry = this.playerViews.get(sessionId);
    if (!entry) return;

    const { view, visibleIndices, visibleCreatureIds } = entry;

    // Remove tiles
    for (const idx of visibleIndices) {
      const tile = this.state.tiles.at(idx);
      if (tile) {
        view.remove(tile);
      }
    }

    // Remove creatures
    for (const id of visibleCreatureIds) {
      const creature = this.state.creatures.get(id);
      if (creature) {
        view.remove(creature);
      }
    }

    // Remove players
    this.state.players.forEach((p) => view.remove(p));

    this.playerViews.delete(sessionId);
  }

  /** Recompute fog of war per player — runs every FOG_OF_WAR.TICK_INTERVAL ticks.
   *  Runs last in the tick loop so all movement/claiming has resolved. */
  private tickFogOfWar(): void {
    if (this.state.tick % FOG_OF_WAR.TICK_INTERVAL !== 0) return;
    if (!this.playerViews) return;

    for (const [sessionId, entry] of this.playerViews) {
      const { view, visibleIndices: oldIndices, visibleCreatureIds: oldCreatureIds } = entry;

      // Dev mode: all tiles always visible, just pick up new creatures/tiles
      if (entry.devMode) {
        const totalTiles = this.state.tiles.length;
        for (let i = 0; i < totalTiles; i++) {
          if (!oldIndices.has(i)) {
            oldIndices.add(i);
            const tile = this.state.tiles.at(i);
            if (tile) view.add(tile);
          }
        }
        this.state.creatures.forEach((creature, id) => {
          if (!oldCreatureIds.has(id)) {
            view.add(creature);
            oldCreatureIds.add(id);
          }
        });
        continue;
      }

      const newIndices = computeVisibleTiles(this.state, sessionId);

      // ── Tile visibility ──────────────────────────────────────────

      // Add newly visible tiles
      for (const idx of newIndices) {
        if (!oldIndices.has(idx)) {
          const tile = this.state.tiles.at(idx);
          if (tile) {
            view.add(tile);
          }
        }
      }

      // Remove tiles no longer visible
      for (const idx of oldIndices) {
        if (!newIndices.has(idx)) {
          const tile = this.state.tiles.at(idx);
          if (tile) {
            view.remove(tile);
          }
        }
      }

      entry.visibleIndices = newIndices;

      // ── Creature visibility ──────────────────────────────────────

      const newCreatureIds = new Set<string>();
      this.state.creatures.forEach((creature, id) => {
        const tileIdx = creature.y * this.state.mapWidth + creature.x;
        // Own pawns are always visible; other creatures only on visible tiles
        if (creature.ownerID === sessionId || newIndices.has(tileIdx)) {
          newCreatureIds.add(id);
        }
      });

      // Add newly visible creatures
      for (const id of newCreatureIds) {
        if (!oldCreatureIds.has(id)) {
          const creature = this.state.creatures.get(id);
          if (creature) {
            view.add(creature);
          }
        }
      }

      // Remove creatures no longer visible
      for (const id of oldCreatureIds) {
        if (!newCreatureIds.has(id)) {
          const creature = this.state.creatures.get(id);
          if (creature) {
            view.remove(creature);
          }
        }
      }

      entry.visibleCreatureIds = newCreatureIds;
    }
  }
}
