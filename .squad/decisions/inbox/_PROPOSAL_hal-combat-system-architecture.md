# Combat System Architecture — Issues #17 & #18

**By:** Hal (Lead)
**Date:** 2026-03-07
**Status:** PROPOSAL — Awaiting review
**Closes:** #17 (enemy bases + mobiles), #18 (defender + attacker pawns)

---

## 1. Executive Summary

Issues #17 and #18 form a single combat system: enemy bases spawn hostile mobiles that attack player territory (#17), and players spawn defenders/attackers to fight back (#18). This document defines the data model, AI behaviors, combat resolution, constants structure, and implementation plan.

**Core principle:** Reuse existing patterns aggressively. CreatureState is the universal entity. FSM-per-type in separate AI modules. Data-driven type registries in shared constants. Zero new schema classes.

---

## 2. Data Model

### 2.1 No New Schema Classes

All new entity types reuse `CreatureState`. The project already established this pattern — builders are creatures with `creatureType="pawn_builder"`. Enemy bases and mobiles follow the same approach.

**New creatureType values:**
| creatureType | Category | Moves? | Has Owner? |
|---|---|---|---|
| `"enemy_base_raider"` | Enemy base | No | No |
| `"enemy_base_hive"` | Enemy base | No | No |
| `"enemy_base_fortress"` | Enemy base | No | No |
| `"enemy_scout"` | Enemy mobile | Yes | No |
| `"enemy_raider"` | Enemy mobile | Yes | No |
| `"enemy_swarm"` | Enemy mobile | Yes | No |
| `"pawn_defender"` | Player pawn | Yes | Yes |
| `"pawn_attacker"` | Player pawn | Yes | Yes |

**New pawnType values:** `"defender"`, `"attacker"` (in addition to existing `"builder"`).

### 2.2 CreatureState Field Reuse

Existing fields cover all needs:
- `health` — HP for all entities (bases, mobiles, pawns)
- `currentState` — FSM state string per entity type
- `targetX`, `targetY` — movement/attack target
- `ownerID` — player ID for pawns, empty for enemies
- `pawnType` — `"builder"` | `"defender"` | `"attacker"` | `""` for enemies
- `stamina` — reused for pawn stamina, unused for enemies
- `nextMoveTick` — tick scheduling, reused for base spawn timer

**Key insight:** `nextMoveTick` on enemy bases doubles as the spawn timer. When `tick >= base.nextMoveTick`, spawn a mobile and set `nextMoveTick = tick + spawnInterval`. No new fields needed.

### 2.3 Server-Side AI State

Combat-specific state that the client doesn't need lives in server-side Maps on `GameRoom`:

```typescript
// In GameRoom
private enemyBaseState = new Map<string, {
  spawnedMobileIds: Set<string>;  // Track which mobiles belong to this base
}>();

private attackerState = new Map<string, {
  returnTick: number;             // When attacker must return
  homeTileX: number;              // Return destination
  homeTileY: number;
}>();
```

This keeps the Colyseus schema clean. Only rendering-relevant state syncs to clients.

### 2.4 Type Helper Functions

Add to `shared/src/types.ts`:

```typescript
export function isEnemyBase(creatureType: string): boolean {
  return creatureType.startsWith("enemy_base_");
}

export function isEnemyMobile(creatureType: string): boolean {
  return creatureType === "enemy_scout"
      || creatureType === "enemy_raider"
      || creatureType === "enemy_swarm";
}

export function isPlayerPawn(creatureType: string): boolean {
  return creatureType.startsWith("pawn_");
}

export function isCombatPawn(pawnType: string): boolean {
  return pawnType === "defender" || pawnType === "attacker";
}
```

---

## 3. Constants Structure

### 3.1 ENEMY_BASE_TYPES Registry

```typescript
export const ENEMY_BASE_TYPES: Record<string, EnemyBaseTypeDef> = {
  enemy_base_raider: {
    name: "Raider Camp",
    icon: "⛺",
    health: 200,
    spawnInterval: 80,        // 20 seconds
    spawnType: "enemy_raider",
    maxMobiles: 3,
    color: 0xcc0000,
  },
  enemy_base_hive: {
    name: "Hive",
    icon: "🪺",
    health: 150,
    spawnInterval: 40,        // 10 seconds
    spawnType: "enemy_swarm",
    maxMobiles: 6,
    color: 0xcccc00,
  },
  enemy_base_fortress: {
    name: "Fortress",
    icon: "🏰",
    health: 400,
    spawnInterval: 120,       // 30 seconds
    spawnType: "enemy_raider",
    maxMobiles: 4,
    color: 0x880000,
  },
};
```

### 3.2 ENEMY_MOBILE_TYPES Registry

```typescript
export const ENEMY_MOBILE_TYPES: Record<string, EnemyMobileTypeDef> = {
  enemy_scout: {
    name: "Scout",
    icon: "👁",
    health: 20,
    damage: 5,
    tileDamage: 10,
    speed: 1,                 // AI tick interval multiplier
    detectionRadius: 6,
    color: 0xff6600,
  },
  enemy_raider: {
    name: "Raider",
    icon: "⚔",
    health: 40,
    damage: 15,
    tileDamage: 25,
    speed: 2,
    detectionRadius: 4,
    color: 0xff0000,
  },
  enemy_swarm: {
    name: "Swarm",
    icon: "🐛",
    health: 15,
    damage: 8,
    tileDamage: 5,
    speed: 1,
    detectionRadius: 3,
    color: 0xffcc00,
  },
};
```

### 3.3 PAWN_TYPES Registry (Replaces Flat PAWN Constants)

```typescript
export const PAWN_TYPES: Record<string, PawnTypeDef> = {
  builder: {
    name: "Builder",
    icon: "🔨",
    creatureType: "pawn_builder",
    health: 50,
    cost: { wood: 10, stone: 5 },
    upkeep: { wood: 1 },
    maxCount: 5,
    damage: 0,
    detectionRadius: 0,
    maxStamina: 20,
    staminaCostPerMove: 1,
    staminaRegenPerTick: 2,
    exhaustedThreshold: 5,
    visionRadius: 4,
  },
  defender: {
    name: "Defender",
    icon: "🛡",
    creatureType: "pawn_defender",
    health: 80,
    cost: { wood: 15, stone: 10 },
    upkeep: { wood: 2 },
    maxCount: 3,
    damage: 20,
    detectionRadius: 5,
    maxStamina: 25,
    staminaCostPerMove: 1,
    staminaRegenPerTick: 2,
    exhaustedThreshold: 5,
    visionRadius: 4,
  },
  attacker: {
    name: "Attacker",
    icon: "⚔",
    creatureType: "pawn_attacker",
    health: 60,
    cost: { wood: 20, stone: 15 },
    upkeep: { wood: 3 },
    maxCount: 2,
    damage: 25,
    detectionRadius: 6,
    maxStamina: 30,
    staminaCostPerMove: 1,
    staminaRegenPerTick: 2,
    exhaustedThreshold: 5,
    visionRadius: 5,
  },
};
```

**Migration note:** The existing flat `PAWN.BUILDER_COST_WOOD` etc. constants should be kept for backward compatibility and aliased to `PAWN_TYPES.builder.*` values. Or migrate callers to use the registry directly. Recommend the latter — there are only ~10 call sites.

### 3.4 COMBAT Constants

```typescript
export const COMBAT = {
  ATTACK_COOLDOWN_TICKS: 4,          // 1 second between creature attacks
  TILE_ATTACK_COOLDOWN_TICKS: 8,     // 2 seconds between tile attacks
  COMBAT_TICK_INTERVAL: 2,           // Check combat every 0.5s
};
```

### 3.5 ENEMY_SPAWNING Constants

```typescript
export const ENEMY_SPAWNING = {
  BASE_SPAWN_INTERVAL_TICKS: 480,    // 2 minutes between base spawns
  MAX_BASES: 8,                       // Map-wide cap
  MIN_DISTANCE_FROM_HQ: 15,          // Tiles from any player HQ
  MIN_DISTANCE_BETWEEN_BASES: 10,    // Tiles between enemy bases
  FIRST_BASE_DELAY_TICKS: 240,       // 1 minute grace period at game start
};
```

---

## 4. Combat Resolution

### 4.1 Tick-Based Adjacency Combat

Combat occurs in a dedicated `tickCombat()` function called every `COMBAT.COMBAT_TICK_INTERVAL` ticks. Resolution is symmetric and simultaneous:

```
For each creature with damage > 0:
  If has a combat target AND target is adjacent (Manhattan dist ≤ 1):
    If attack cooldown expired:
      Deal damage to target
      Reset cooldown
  Else:
    Clear combat target (target moved away or died)
```

### 4.2 Hostility Rules

| Attacker → Target | Hostile? |
|---|---|
| Enemy mobile → Player pawn (any type) | ✅ |
| Enemy mobile → Player tile (shapeHP) | ✅ |
| Player defender → Enemy mobile | ✅ |
| Player defender → Enemy base | ❌ (defenders don't leave territory) |
| Player attacker → Enemy mobile | ✅ |
| Player attacker → Enemy base | ✅ |
| Carnivore → Any player pawn | ✅ (existing behavior preserved) |
| Player defender → Carnivore | ✅ (new: defenders protect against wildlife too) |

### 4.3 Tile Damage

When an enemy mobile reaches a player-owned tile, it attacks the tile:
- Reduce `tile.shapeHP` by `mobileDef.tileDamage`
- If `shapeHP ≤ 0`: unclaim tile (`ownerID = ""`, `structureType = ""`, `shapeHP = 0`)
- HQ territory tiles (`isHQTerritory = true`) are immune — enemy mobiles skip them
- Tile attack has its own cooldown (`TILE_ATTACK_COOLDOWN_TICKS`)

### 4.4 Death and Cleanup

When any creature's `health ≤ 0`:
- Remove from `state.creatures`
- If enemy mobile: remove from parent base's `spawnedMobileIds`
- If enemy base: all mobiles with matching `sourceBaseId` despawn (health → 0, then remove)
- If player pawn: remove from player counts; no resource refund
- Award XP/score to nearby player for kills (deferred — not MVP)

---

## 5. AI Behavior Patterns

### 5.1 Enemy Base AI

**File:** `server/src/rooms/enemyBaseAI.ts` (new)

**FSM States:** `"active"` only (bases don't change behavior).

**Tick logic:**
1. If `tick >= base.nextMoveTick` AND `spawnedMobileIds.size < maxMobiles`:
   - Find walkable tile adjacent to base position
   - Spawn enemy mobile creature at that tile
   - Add mobile ID to base's `spawnedMobileIds`
   - Set `base.nextMoveTick = tick + baseDef.spawnInterval`
2. Base does not move. Ever.

### 5.2 Enemy Mobile AI

**File:** `server/src/rooms/enemyMobileAI.ts` (new)

**FSM States:** `"seek_territory"` → `"move_to_target"` → `"attacking_tile"` → loop

**Behavior:**
1. **seek_territory:** Find nearest player-owned tile (scan within `detectionRadius`). If found, set as target. If not, wander toward map center or random direction.
2. **move_to_target:** Use `moveToward()` to approach target tile. If adjacent, transition to `"attacking_tile"`.
3. **attacking_tile:** Deal `tileDamage` to target tile per cooldown. If tile unclaimed, return to `"seek_territory"`.
4. **combat engagement:** If a player pawn is adjacent, switch to fighting it (deal `damage` per cooldown). Mobiles prefer tile damage over pawn combat (they're destructive, not combat-focused).

**Territory access:** Enemy mobiles CAN enter player-owned tiles. This requires updating `isTileOpenForCreature()`:
```typescript
if (isEnemyMobile(creature.creatureType)) return true; // Enemies enter any tile
```

### 5.3 Defender AI

**File:** `server/src/rooms/defenderAI.ts` (new)

**FSM States:** `"patrol"` → `"engage"` → `"returning"` → `"patrol"`

**Behavior:**
1. **patrol:** Wander randomly within own territory. Only move to tiles with `ownerID === creature.ownerID`. Provides passive presence.
2. **engage:** When hostile creature detected within `detectionRadius` AND within own territory: move toward hostile, attack when adjacent.
3. **returning:** If hostile moves outside territory, return to nearest owned tile. Do NOT pursue outside territory.

**Detection priority:** Nearest enemy mobile > nearest carnivore within territory. Defenders ignore targets outside territory.

**Territory constraint:** Defenders NEVER leave owned territory. `isTileOpenForCreature()` for defenders:
```typescript
if (creature.pawnType === "defender") {
  return tile.ownerID === creature.ownerID; // Must stay in own territory
}
```

### 5.4 Attacker AI

**File:** `server/src/rooms/attackerAI.ts` (new)

**FSM States:** `"seek_target"` → `"move_to_target"` → `"attacking"` → `"returning"`

**Behavior:**
1. **seek_target:** Find nearest enemy base or enemy mobile (prefer bases). Set as `targetX`, `targetY`.
2. **move_to_target:** Move toward target using `moveToward()`. Can leave own territory. Can enter any tile (like enemy mobiles).
3. **attacking:** When adjacent to target, deal `damage` per cooldown. Continue until target destroyed.
4. **returning:** After target destroyed OR `returnTick` reached: move toward `homeTileX`, `homeTileY` (nearest owned tile at time of dispatch). On arrival, transition to `"seek_target"`.

**Duration limit:** Attackers have a `ATTACKER_SORTIE_TICKS` (200 ticks = 50 seconds) timer. After this, they disengage and return regardless of target status. Prevents attackers from wandering forever.

**Territory access:** Attackers can enter ANY walkable tile.

---

## 6. Integration with Existing Systems

### 6.1 `isTileOpenForCreature()` Changes

The walkability function needs updating for the new movement rules:

```typescript
export function isTileOpenForCreature(state, creature, x, y): boolean {
  if (!state.isWalkable(x, y)) return false;
  const tile = state.getTile(x, y);
  if (!tile) return false;

  // Enemy mobiles can enter any walkable tile
  if (isEnemyMobile(creature.creatureType)) return true;

  // Enemy bases don't move, but function should handle them
  if (isEnemyBase(creature.creatureType)) return false;

  // Attackers can enter any walkable tile
  if (creature.pawnType === "attacker") return true;

  // Defenders stay in own territory only
  if (creature.pawnType === "defender") {
    return tile.ownerID === creature.ownerID;
  }

  // Builders: own territory only (existing behavior)
  if (creature.pawnType === "builder") {
    return tile.ownerID === "" || tile.ownerID === creature.ownerID;
  }

  // Wildlife: cannot enter owned territory (existing behavior)
  return tile.ownerID === "";
}
```

### 6.2 Spawn Handler Extension

Extend `handleSpawnPawn()` in `GameRoom.ts`:

```typescript
onMessage("spawn_pawn", (client, message) => {
  const pawnDef = PAWN_TYPES[message.pawnType];
  if (!pawnDef) return; // Invalid pawn type

  const player = this.state.players.get(client.sessionId);
  if (!player) return;

  // Cost check
  if (player.wood < pawnDef.cost.wood || player.stone < pawnDef.cost.stone) return;

  // Count check
  const count = countPlayerPawns(this.state, client.sessionId, message.pawnType);
  if (count >= pawnDef.maxCount) return;

  // Spawn
  const pos = this.findHQWalkableTile(player);
  if (!pos) return;

  player.wood -= pawnDef.cost.wood;
  player.stone -= pawnDef.cost.stone;

  const creature = new CreatureState();
  creature.id = `pawn_${this.nextCreatureId++}`;
  creature.creatureType = pawnDef.creatureType;
  creature.pawnType = message.pawnType;
  creature.ownerID = client.sessionId;
  creature.health = pawnDef.health;
  creature.x = pos.x;
  creature.y = pos.y;
  creature.stamina = pawnDef.maxStamina;
  // ... etc
});
```

### 6.3 Tick Loop Extension

Add new tick functions to the simulation interval:

```typescript
this.setSimulationInterval((_dt) => {
  this.state.tick += 1;
  this.tickDayNightCycle();
  this.tickClaiming();
  this.tickResourceRegen();
  this.tickCreatureAI();         // Now also dispatches defender/attacker/enemy AI
  this.tickCreatureRespawn();
  this.tickStructureIncome();
  this.tickPawnUpkeep();         // Now handles all pawn types via PAWN_TYPES
  this.tickFogOfWar();
  this.tickEnemyBaseSpawning();  // NEW: periodically spawn enemy bases
  this.tickCombat();             // NEW: resolve combat interactions
}, 1000 / TICK_RATE);
```

### 6.4 Creature AI Dispatch

In `creatureAI.ts`, extend the per-creature dispatch:

```typescript
// In tickCreatureAI, after stamina/exhaustion check:
switch (true) {
  case creature.creatureType === "pawn_builder":
    stepBuilder(creature, state); break;
  case creature.pawnType === "defender":
    stepDefender(creature, state); break;
  case creature.pawnType === "attacker":
    stepAttacker(creature, state, room); break;
  case isEnemyBase(creature.creatureType):
    stepEnemyBase(creature, state, room); break;
  case isEnemyMobile(creature.creatureType):
    stepEnemyMobile(creature, state); break;
  case creature.creatureType === "herbivore":
    stepHerbivore(creature, state); break;
  case creature.creatureType === "carnivore":
    stepCarnivore(creature, state); break;
}
```

### 6.5 Fog of War

- Defenders and attackers provide vision identically to builders (use `PAWN_TYPES[type].visionRadius`)
- Enemy bases and mobiles are visible when within any player's computed vision area (existing behavior — creatures on visible tiles are shown)
- No changes to fog-of-war computation needed beyond replacing hardcoded `PAWN_RADIUS` with per-type `visionRadius`

### 6.6 Upkeep Extension

`tickPawnUpkeep()` already iterates all creatures with `ownerID`. Extend to use `PAWN_TYPES` registry:

```typescript
const pawnDef = PAWN_TYPES[creature.pawnType];
if (!pawnDef) continue;
if (player.wood >= pawnDef.upkeep.wood) {
  player.wood -= pawnDef.upkeep.wood;
} else {
  creature.health -= PAWN.UPKEEP_DAMAGE;
}
```

### 6.7 Client Rendering

Extend `CreatureRenderer.ts`:
- Add icons: 🛡 (defender), ⚔ (attacker), ⛺/🪺/🏰 (bases), 👁/🐛 (mobiles)
- Add colors per type from registry
- Enemy bases render as larger sprites (1.5× scale) to visually distinguish from mobiles
- HP bars for all combat entities (reuse builder progress bar pattern)

### 6.8 HUD Extension

Add to `HudDOM.ts`:
- Spawn buttons for defender and attacker (same pattern as builder button)
- Per-type count display: `🔨 2/5  🛡 1/3  ⚔ 0/2`
- Enemy base count in creature section: `⛺ 3 active`

---

## 7. Branching Strategy

### Decision: Single Branch

**Branch name:** `squad/17-18-combat-system`
**Target:** `dev`

**Why one branch, not two:**
- #17 and #18 are tightly coupled — defenders need enemies to fight, combat resolution is shared
- Separate branches would require #17 to merge before #18 can begin, adding latency
- A single PR with clean ordered commits gives reviewers the same logical separation

### Commit Order

1. `feat(shared): add combat type registries and constants` — ENEMY_BASE_TYPES, ENEMY_MOBILE_TYPES, PAWN_TYPES, COMBAT, ENEMY_SPAWNING
2. `feat(shared): add type helper functions` — isEnemyBase, isEnemyMobile, isPlayerPawn, isCombatPawn
3. `feat(server): add enemy base spawning system` — tickEnemyBaseSpawning, random placement logic
4. `feat(server): add enemy base AI and mobile spawning` — enemyBaseAI.ts, stepEnemyBase
5. `feat(server): add enemy mobile AI` — enemyMobileAI.ts, seek/attack/tile-damage FSM
6. `feat(server): add combat resolution system` — tickCombat, damage/death handling
7. `feat(server): update isTileOpenForCreature for combat units` — territory access rules
8. `feat(server): add defender AI` — defenderAI.ts, patrol/engage/return FSM
9. `feat(server): add attacker AI` — attackerAI.ts, seek/attack/return FSM
10. `feat(server): extend spawn handler and upkeep for all pawn types` — generic PAWN_TYPES spawning
11. `feat(client): add combat entity rendering` — icons, colors, HP bars for new types
12. `feat(client): add defender/attacker spawn buttons to HUD` — spawn UI, count display
13. `test: add combat system integration tests` — full combat loop verification

---

## 8. Implementation Order & Dependencies

```
                    ┌────────────────────┐
                    │ 1. Constants/Types │
                    └────────┬───────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
    ┌─────────▼──────┐  ┌───▼──────┐  ┌────▼──────────┐
    │ 2. Enemy Base  │  │ 3.Combat │  │ 4. Movement   │
    │    Spawning    │  │Resolution│  │   Rules Update │
    └───────┬────────┘  └───┬──────┘  └────┬──────────┘
            │               │              │
    ┌───────▼────────┐      │              │
    │ 5. Enemy Base  │      │              │
    │    AI + Mobile │◄─────┘              │
    │    Spawning    │                     │
    └───────┬────────┘                     │
            │                              │
    ┌───────▼────────┐                     │
    │ 6. Enemy       │◄───────────────────-┘
    │    Mobile AI   │
    └───────┬────────┘
            │
            │ (enemies exist, combat works)
            │
    ┌───────▼────────┐  ┌──────────────┐
    │ 7. Defender AI │  │ 8. Attacker  │
    │                │  │    AI        │
    └───────┬────────┘  └──────┬───────┘
            │                  │
    ┌───────▼──────────────────▼───────┐
    │ 9. Spawn Handler + Upkeep       │
    │    (generic PAWN_TYPES)          │
    └───────┬──────────────────────────┘
            │
    ┌───────▼────────┐  ┌──────────────┐
    │ 10. Client     │  │ 11. HUD      │
    │   Rendering    │  │   Buttons    │
    └───────┬────────┘  └──────┬───────┘
            │                  │
    ┌───────▼──────────────────▼───────┐
    │ 12. Integration Tests            │
    └──────────────────────────────────┘
```

**Critical path:** 1 → 2 → 5 → 6 → 7/8 → 9 → 12
**Parallelizable:** Steps 7 & 8 (defender/attacker AI) can be built in parallel. Steps 10 & 11 (client) can be built in parallel with each other and after step 9.

### Work Assignment (Suggested)

- **Pemulis** (Systems Dev): Steps 1–6, 9 (constants, enemy systems, combat, spawn handler)
- **Gately** (Client Dev): Steps 10–11 (rendering, HUD)
- **Steeply** (QA): Step 12 (integration tests)
- **Steps 7–8** (defender/attacker AI): Pemulis or split between Pemulis + another agent

---

## 9. Scope Cuts

### MVP (Ship This)

- ✅ All 3 enemy base types with data-driven behavior
- ✅ All 3 enemy mobile types with data-driven stats
- ✅ Defender pawn: patrol + engage within territory
- ✅ Attacker pawn: seek + attack + timed return
- ✅ Tick-based adjacency combat (damage/HP/death)
- ✅ Tile damage from enemy mobiles (shapeHP reduction → unclaim)
- ✅ HQ territory immune to tile damage
- ✅ Spawn buttons for all 3 pawn types in HUD
- ✅ Per-type costs, upkeep, and max counts
- ✅ Fog of war integration (vision from combat pawns)
- ✅ Base destruction despawns its mobiles

### Deferred (Not MVP)

- ❌ Kill XP/score rewards — ship later, trivial to add
- ❌ Visual combat effects (damage numbers, flash, particles)
- ❌ Combat log / kill feed
- ❌ A* pathfinding — still Phase 5
- ❌ Defender rally points / patrol waypoints
- ❌ Attacker target selection UI (auto-target only)
- ❌ Base difficulty scaling over time (all bases same from start)
- ❌ Enemy mobile group movement / formations
- ❌ Loot drops from base destruction
- ❌ Sound effects

---

## 10. Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Combat tick performance with many entities | Medium | Cap enemy bases at 8. Each base caps mobiles. Total entity ceiling ~100. |
| Enemy mobiles trivially blocked by territory walls | Medium | Mobiles attack tile shapeHP to break through. Multiple mobiles overwhelm repair. |
| Defenders never engage (enemies avoid territory) | Low | Enemy AI explicitly targets player tiles. Engagement is by design. |
| Schema bloat from reusing CreatureState | Low | Only ~5 unused fields per entity type. Acceptable vs. new collection + fog-of-war duplication. |
| Attacker pathfinding to distant bases (greedy movement) | Medium | Greedy Manhattan works for ~15+ tile distances. A* deferred but not critical for MVP. |

---

## 11. Open Questions for User

1. **Should destroying an enemy base award resources?** (e.g., 20W + 10S refund). Deferred in this proposal but easy to add.
2. **Should enemy bases only spawn during certain day phases?** (e.g., night-only spawning for thematic pressure). Not in MVP.
3. **Should the `WAVE_SPAWNER` constant be merged into `ENEMY_SPAWNING`?** WAVE_SPAWNER already exists at line 89 of constants.ts and serves a similar purpose. Recommend replacing it.
