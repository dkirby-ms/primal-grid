# Architecture Plan — Primal Grid Pivot

> Maps [docs/gdd.md](./gdd.md) onto the existing codebase. This is the bridge between "what we want" and "how we build it."

**Source of truth:** `docs/gdd.md` (v2)
**Baseline codebase:** Post-Phase 4.5 (304 tests, HUD redesign complete)
**Target:** Phase A deliverable — territory + camera + claim. No creatures, no building.

---

## 1. Schema Changes (Field-Level Diffs)

### TileState (`server/src/rooms/GameState.ts`)

```diff
  class TileState extends Schema {
    @type("number") type: number = TileType.Grassland;
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("number") fertility: number = 0;
    @type("number") moisture: number = 0;
    @type("number") resourceType: number = -1;
    @type("number") resourceAmount: number = 0;
+   @type("string") ownerID: string = "";          // player sessionId who owns this tile, "" = unclaimed
  }
```

### PlayerState (`server/src/rooms/GameState.ts`)

```diff
  class PlayerState extends Schema {
    @type("string") id: string = "";
-   @type("number") x: number = 0;                 // REMOVE: no avatar position
-   @type("number") y: number = 0;                 // REMOVE: no avatar position
    @type("string") color: string = "#ffffff";
    @type("number") wood: number = 0;
    @type("number") stone: number = 0;
    @type("number") fiber: number = 0;
    @type("number") berries: number = 0;
-   @type("number") meat: number = 0;              // REMOVE: not in 4-resource model
-   @type("number") hunger: number = 100;          // REMOVE: no survival stats
-   @type("number") health: number = 100;          // REMOVE: no survival stats
    @type("number") walls: number = 0;
    @type("number") floors: number = 0;
    @type("number") workbenches: number = 0;
-   @type("number") axes: number = 0;              // REMOVE: no manual gathering tools
-   @type("number") pickaxes: number = 0;          // REMOVE: no manual gathering tools
    @type("number") farmPlots: number = 0;
+   @type("number") hqX: number = -1;              // HQ structure tile X
+   @type("number") hqY: number = -1;              // HQ structure tile Y
+   @type("number") score: number = 0;             // territory tile count (live-updated)
  }
```

**Removed fields (7):** `x`, `y`, `hunger`, `health`, `meat`, `axes`, `pickaxes`
**Added fields (3):** `hqX`, `hqY`, `score`

### CreatureState (`server/src/rooms/GameState.ts`)

```diff
  class CreatureState extends Schema {
    // ... all existing fields KEPT ...
    @type("string") currentState: string = "idle";
+   @type("string") command: string = "idle";      // pawn command: idle | gather | guard | patrol
+   @type("number") zoneX: number = -1;            // assigned zone center X (-1 = no zone)
+   @type("number") zoneY: number = -1;            // assigned zone center Y (-1 = no zone)
  }
```

**Added fields (3):** `command`, `zoneX`, `zoneY`
**No removals.** All existing creature fields remain (health, hunger, trust, personality, breeding — needed for Phases C/D).

### StructureState (`server/src/rooms/GameState.ts`)

```diff
  class StructureState extends Schema {
    @type("string") id: string = "";
    @type("number") structureType: number = ItemType.Wall;
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("string") placedBy: string = "";
    @type("number") growthProgress: number = 0;
    @type("boolean") cropReady: boolean = false;
+   @type("number") health: number = -1;           // -1 = indestructible, ≥0 = destructible HP
  }
```

**Added fields (1):** `health`

### GameState (`server/src/rooms/GameState.ts`)

```diff
  class GameState extends Schema {
    @type("number") tick: number = 0;
    @type([TileState]) tiles = new ArraySchema<TileState>();
    @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
    @type({ map: CreatureState }) creatures = new MapSchema<CreatureState>();
    @type({ map: StructureState }) structures = new MapSchema<StructureState>();
    @type("number") mapWidth: number = DEFAULT_MAP_SIZE;
    @type("number") mapHeight: number = DEFAULT_MAP_SIZE;
    @type("number") mapSeed: number = DEFAULT_MAP_SEED;
+   @type("number") roundTimer: number = -1;       // ticks remaining (-1 = no timer, Phase D)
+   @type("string") roundPhase: string = "playing"; // "playing" | "ended"
  }
```

**Added fields (2):** `roundTimer`, `roundPhase`

### ITileState / IPlayerState / ICreatureState / IStructureState (`shared/src/types.ts`)

Mirror all schema changes in the corresponding interfaces:

```diff
  interface ITileState {
    // ... existing fields ...
+   ownerID: string;
  }

  interface IPlayerState {
    id: string;
-   x: number;
-   y: number;
    color: string;
    wood: number;
    stone: number;
    fiber: number;
    berries: number;
-   meat: number;
-   hunger: number;
-   health: number;
    walls: number;
    floors: number;
    workbenches: number;
-   axes: number;
-   pickaxes: number;
    farmPlots: number;
+   hqX: number;
+   hqY: number;
+   score: number;
  }

  interface ICreatureState {
    // ... existing fields ...
+   command: string;
+   zoneX: number;
+   zoneY: number;
  }

  interface IStructureState {
    // ... existing fields ...
+   health?: number;
  }
```

### ItemType enum (`shared/src/types.ts`)

```diff
  enum ItemType {
    Wall = 0,
    Floor = 1,
    Workbench = 2,
-   Axe = 3,           // REMOVE: no manual gathering tools
-   Pickaxe = 4,        // REMOVE: no manual gathering tools
    FarmPlot = 5,
+   Turret = 6,         // NEW: auto-fire defensive structure
+   HQ = 7,             // NEW: headquarters (1 per player, placed on spawn)
  }
```

**Note:** Keep numeric values for Wall/Floor/Workbench/FarmPlot stable. Axe(3) and Pickaxe(4) values become unused but shouldn't be reassigned — use 6+ for new types to avoid data collisions.

---

## 2. Message Protocol Changes

### Removed Messages (4)

| Message | Payload | Reason |
|---------|---------|--------|
| `MOVE` | `MovePayload { dx, dy }` | No avatar movement |
| `GATHER` | `GatherPayload { x, y }` | Pawns gather, not player |
| `EAT` | (none) | No hunger system |
| `SELECT_CREATURE` | `SelectCreaturePayload { creatureId }` | Replaced by `ASSIGN_PAWN` |

### Kept Messages (5, with modifications)

| Message | Payload | Modification |
|---------|---------|-------------|
| `CRAFT` | `CraftPayload { recipeId }` | Remove axe/pickaxe recipes. Add turret recipe. No other changes. |
| `PLACE` | `PlacePayload { itemType, x, y }` | **Remove avatar adjacency check.** Validate: tile owned by player, tile walkable, no existing structure. Add Turret to placeable types. |
| `TAME` | `TamePayload { creatureId }` | **Remove avatar adjacency check.** Validate: creature is on or adjacent to player's territory. Cost: berries only (for MVP single creature type). |
| `ABANDON` | `AbandonPayload { creatureId }` | No changes needed. |
| `BREED` | `BreedPayload { creatureId }` | Defer to Phase D. Keep handler but it's unused in MVP. |
| `FARM_HARVEST` | `FarmHarvestPayload { x, y }` | **Remove avatar adjacency check.** Validate: tile owned by player, farm exists and crop ready. Defer to Phase B. |

### New Messages (2)

| Message | Constant | Payload | Validation |
|---------|----------|---------|------------|
| `CLAIM_TILE` | `"claim_tile"` | `ClaimTilePayload { x: number, y: number }` | Tile unclaimed, adjacent to player's existing territory, player has ≥1 wood, tile not Water/Rock |
| `ASSIGN_PAWN` | `"assign_pawn"` | `AssignPawnPayload { creatureId: string, command: "idle" \| "gather" \| "guard" \| "patrol", zoneX?: number, zoneY?: number }` | Creature owned by player, trust ≥ 70. Zone tile must be within/adjacent to player territory. Defer to Phase C. |

### New Payload Types (`shared/src/messages.ts`)

```typescript
export const CLAIM_TILE = "claim_tile" as const;
export const ASSIGN_PAWN = "assign_pawn" as const;

export interface ClaimTilePayload {
  x: number;
  y: number;
}

export interface AssignPawnPayload {
  creatureId: string;
  command: "idle" | "gather" | "guard" | "patrol";
  zoneX?: number;
  zoneY?: number;
}
```

---

## 3. Server Tick Systems

### Removed Systems (2)

| System | Location | Reason |
|--------|----------|--------|
| `tickPlayerSurvival()` | `GameRoom.ts:419-430` | No hunger/health for commander |
| `tickPackFollow()` | `GameRoom.ts:663-683` | Replaced by pawn command system (Phase C) |

### Modified Systems (4)

#### `tickCreatureAI()` — MODIFY (Phase C)
- **Phase A:** No change to wild creature AI. Remove `skipIds` (pack follow) parameter since pack follow is gone.
- **Phase C:** Add new FSM states for tamed creatures: `gather`, `guard`, `patrol`. Tamed creatures with a command skip the wild AI FSM and execute their command logic instead.

#### `tickTrustDecay()` — MODIFY (Phase A)
- **Current:** Proximity trust gain/decay based on Manhattan distance to `owner.x, owner.y`.
- **New:** Proximity based on whether creature is within player's territory. Creature on an owned tile = "near owner." Creature on unowned tile = "far from owner."

```
// Pseudocode for modified trust decay
for each creature with ownerID != "":
  tile = getTile(creature.x, creature.y)
  inTerritory = tile?.ownerID === creature.ownerID
  if inTerritory && tick % 10 === 0:
    creature.trust = min(100, trust + TRUST_PER_PROXIMITY_TICK)
  if !inTerritory && tick % 20 === 0:
    creature.trust = max(0, trust - TRUST_DECAY_ALONE)
  // Auto-abandon logic unchanged
```

#### `tickResourceRegen()` — MODIFY (Phase A)
- Scale unchanged, but loop now runs over 4,096 tiles instead of 1,024. **Monitor performance.** If tick budget exceeded, switch to random-sample regen (check N random tiles per interval instead of all).

#### `tickCreatureRespawn()` — MODIFY (Phase A)
- Scale creature spawn counts for 64×64 map. Current: 8 herbivores, 4 carnivores for 32×32. New: ~32 herbivores, ~16 carnivores for 64×64 (4× area → 4× population). Expose in `CREATURE_SPAWN` constants.

### New Systems (4)

#### `tickWaveSpawner()` — NEW (Phase B)

```
// Pseudocode
if tick % WAVE_INTERVAL_TICKS !== 0: return
waveNumber = floor(tick / WAVE_INTERVAL_TICKS)
creatureCount = BASE_WAVE_SIZE + floor(waveNumber * WAVE_ESCALATION)
creatureType = waveNumber < 5 ? "herbivore" : "carnivore"

for i in 0..creatureCount:
  edge = randomEdgeTile()  // random tile on map boundary
  spawn creature at edge with currentState = "aggressive"
  // Aggressive creatures pathfind toward nearest player territory
```

#### `tickTurrets()` — NEW (Phase B)

```
// Pseudocode — runs every TURRET_FIRE_INTERVAL ticks
for each structure where structureType === ItemType.Turret:
  hostiles = findHostilesInRange(structure.x, structure.y, TURRET_RANGE)
  if hostiles.length > 0:
    target = closest hostile
    target.health -= TURRET_DAMAGE
    if target.health <= 0: remove target
```

#### `tickPawnGather()` — NEW (Phase C)

```
// Pseudocode — runs every PAWN_GATHER_INTERVAL ticks
for each creature where ownerID != "" && command === "gather":
  zone = (creature.zoneX, creature.zoneY)
  if creature not at zone:
    moveToward(creature, zone.x, zone.y, state)
  else:
    tile = getTile(creature.x, creature.y)
    if tile.resourceType >= 0 && tile.resourceAmount > 0:
      tile.resourceAmount -= 1
      owner = players.get(creature.ownerID)
      switch tile.resourceType:
        case Wood:   owner.wood += 1
        case Stone:  owner.stone += 1
        case Fiber:  owner.fiber += 1
        case Berries: owner.berries += 1
      if tile.resourceAmount <= 0:
        tile.resourceType = -1
        // find next resource tile in zone
```

#### `tickRoundTimer()` — NEW (Phase D)

```
// Pseudocode — runs every tick
if roundTimer <= 0 || roundPhase === "ended": return
roundTimer -= 1
if roundTimer <= 0:
  roundPhase = "ended"
  // Calculate winner: player with highest score (territory count)
  // Broadcast round-end event
```

### Updated Simulation Interval

```typescript
this.setSimulationInterval((_deltaTime) => {
  this.state.tick += 1;
  // REMOVED: this.tickPlayerSurvival();
  this.tickResourceRegen();
  this.tickCreatureAI();
  this.tickCreatureRespawn();
  this.tickTrustDecay();         // MODIFIED: territory-based proximity
  this.tickFarms();
  // REMOVED: this.tickPackFollow();
  // NEW (Phase B): this.tickWaveSpawner();
  // NEW (Phase B): this.tickTurrets();
  // NEW (Phase C): this.tickPawnGather();
  // NEW (Phase D): this.tickRoundTimer();
}, 1000 / TICK_RATE);
```

---

## 4. Client Architecture Changes

### Camera System (`client/src/renderer/Camera.ts`) — MODIFY

- **Current:** Tracks player avatar position via `setTrackingTarget()`. WASD pans, Space toggles tracking.
- **New:** Free-panning is the default. No tracking target (no avatar to track). WASD + mouse-drag panning unchanged. Remove `setTrackingTarget()`, `toggleTracking()`, `isTracking()`, and the tracking update path. Zoom remains.
- Camera starts centered on player's HQ position (received from server state).
- Add `centerOnHQ(hqX, hqY)` method called once on room join.

### GridRenderer (`client/src/renderer/GridRenderer.ts`) — MODIFY

- Add **territory color overlay**: when a tile has `ownerID !== ""`, tint the tile with the owner's player color at ~25% opacity. This is a semi-transparent colored rect drawn on top of the base terrain.
- Must listen to `ownerID` changes on each tile in `bindToRoom()`.
- Rebuild grid for 64×64 (constructor receives `mapSize` already — just changes constant).

### PlayerRenderer (`client/src/renderer/PlayerRenderer.ts`) — REMOVE

- Entire file becomes dead code. No avatar circles to render.
- Remove import and instantiation in `main.ts`.

### StructureRenderer (`client/src/renderer/StructureRenderer.ts`) — MODIFY (Phase B)

- Add rendering for `ItemType.Turret` (crosshair icon or similar).
- Add rendering for `ItemType.HQ` (crown/flag icon, distinct per player color).
- Add health bar for destructible structures (when `health >= 0`).
- Phase A: Add HQ rendering only.

### CreatureRenderer (`client/src/renderer/CreatureRenderer.ts`) — MODIFY (Phase C)

- Add command indicator text (gather/guard/patrol icon below creature).
- Remove pack-follow "Following" text.
- Add zone assignment visual (highlight assigned zone tiles).

### InputHandler (`client/src/input/InputHandler.ts`) — REWRITE

**Remove:**
- Arrow key movement (MOVE messages)
- `G` key (GATHER)
- `E` key (EAT)
- `F` key (SELECT_CREATURE / pack toggle)
- `B` key breed shortcut (defer to Phase D)
- Click-to-move behavior
- `localPlayerX/Y` references (no avatar position)

**Keep:**
- `C` key (craft menu toggle)
- `V` key (build mode toggle)
- Number keys (craft items / cycle build selection)
- `?` key (help screen)
- Click-to-place in build mode
- `H` key (farm harvest — defer to Phase B)

**Add:**
- Left-click on unclaimed tile → send `CLAIM_TILE { x, y }` (when not in build mode)
- Left-click on owned tile → context menu (build, assign — Phase B/C)
- Left-click on creature → select for command assignment (Phase C)

### HudDOM (`client/src/ui/HudDOM.ts`) — REWRITE

**Remove:**
- Health bar (section-health)
- Hunger bar (section-hunger)
- Meat inventory row
- Axes inventory row
- Pickaxes inventory row
- `localPlayerX/Y` tracking

**Modify:**
- Inventory section: show only wood, stone, fiber, berries
- Crafted items: remove axes, pickaxes; add turrets (Phase B)

**Add:**
- Territory count display: "🏰 Territory: N tiles"
- Round timer display (Phase D): "⏱ Time: MM:SS"
- HQ status indicator

### index.html (`client/index.html`) — MODIFY

- Remove health/hunger bar HTML sections
- Remove meat/axes/pickaxes inventory rows
- Add territory count section
- Update crafted items section

### HelpScreen (`client/src/ui/HelpScreen.ts`) — MODIFY

- Update keybindings to reflect new controls
- Remove: Arrow Keys (move), G (gather), E (eat), F (pack select), B (breed)
- Add: Click (claim tile / build), WASD (pan camera)

### CraftMenu (`client/src/ui/CraftMenu.ts`) — MODIFY

- Remove axe/pickaxe recipes from display
- Add turret recipe (Phase B)
- No structural changes

### main.ts (`client/src/main.ts`) — MODIFY

- Remove `PlayerRenderer` instantiation and binding
- Remove `camera.setTrackingTarget()` (no avatar to track)
- Add HQ center-on after room join
- Remove `hud.localPlayerX/Y` references

---

## 5. Shared Constants & Data

### Constants to Modify (`shared/src/constants.ts`)

```diff
- export const DEFAULT_MAP_SIZE = 32;
+ export const DEFAULT_MAP_SIZE = 64;

  export const CREATURE_SPAWN = {
-   HERBIVORE_COUNT: 8,
-   CARNIVORE_COUNT: 4,
+   HERBIVORE_COUNT: 32,    // scaled 4x for 64×64 map
+   CARNIVORE_COUNT: 16,    // scaled 4x for 64×64 map
  };
```

### Constants to Remove

```diff
- export const PLAYER_SURVIVAL = { ... };    // entire block — no hunger/health system
```

### Constants to Add

```typescript
/** Territory system constants. */
export const TERRITORY = {
  /** Starting territory size (NxN around HQ). */
  STARTING_SIZE: 3,
  /** Wood cost to claim one tile. */
  CLAIM_COST_WOOD: 1,
  /** Starting wood given to each player (enough for initial expansion). */
  STARTING_WOOD: 10,
  /** Starting stone. */
  STARTING_STONE: 5,
  /** Starting fiber. */
  STARTING_FIBER: 0,
  /** Starting berries. */
  STARTING_BERRIES: 5,
} as const;

/** Wave spawner constants (Phase B). */
export const WAVE_SPAWNER = {
  /** Ticks between waves (240 ticks = 60 seconds at 4 ticks/sec). */
  INTERVAL_TICKS: 240,
  /** Base number of creatures per wave. */
  BASE_WAVE_SIZE: 3,
  /** Additional creatures per wave number. */
  ESCALATION_PER_WAVE: 1,
} as const;

/** Turret constants (Phase B). */
export const TURRET = {
  /** Turret firing range in tiles. */
  RANGE: 2,
  /** Damage per turret shot. */
  DAMAGE: 15,
  /** Ticks between turret shots. */
  FIRE_INTERVAL: 4,
} as const;

/** Round timer constants (Phase D). */
export const ROUND = {
  /** Round duration in ticks (3600 ticks = 15 minutes at 4 ticks/sec). */
  DURATION_TICKS: 3600,
} as const;

/** Pawn command constants (Phase C). */
export const PAWN_COMMAND = {
  /** Ticks between pawn gather attempts. */
  GATHER_INTERVAL: 4,
  /** Guard detection radius in tiles. */
  GUARD_RANGE: 3,
  /** Patrol movement: ticks between steps. */
  PATROL_STEP_INTERVAL: 2,
} as const;
```

### Data Changes

#### `shared/src/data/recipes.ts` — MODIFY

```diff
  // REMOVE these recipes:
- axe: { ... },
- pickaxe: { ... },

  // ADD (Phase B):
+ turret: {
+   id: "turret",
+   output: ItemType.Turret,
+   outputCount: 1,
+   ingredients: [
+     { resource: "wood", amount: 5 },
+     { resource: "stone", amount: 5 },
+   ],
+ },
```

Remove `Axe` and `Pickaxe` entries from `ITEM_TYPE_TO_FIELD` map. Add `Turret` entry:

```diff
- [ItemType.Axe]: "axes",
- [ItemType.Pickaxe]: "pickaxes",
+ [ItemType.Turret]: "turrets",    // Phase B — requires adding turrets field to PlayerState
```

**Design note:** When turrets are added in Phase B, `PlayerState` will need a `turrets: number = 0` field. Defer this addition to Phase B implementation.

#### `shared/src/data/creatures.ts` — KEEP (Phase A)

No changes for Phase A. Phase D adds back carnivore usage.

### Index Exports (`shared/src/index.ts`) — MODIFY

Add new constant exports:

```diff
  export * from "./types.js";
  export * from "./constants.js";
  export * from "./messages.js";
  export * from "./data/creatures.js";
  export * from "./data/recipes.js";
```

No new files needed — all new constants and messages go in existing files.

---

## 6. File-Level Change Map

### `server/src/`

| File | Action | Details |
|------|--------|---------|
| `rooms/GameState.ts` | **MODIFY** | Add fields per §1. Remove PlayerState fields. |
| `rooms/GameRoom.ts` | **MODIFY** | Remove handlers (MOVE, GATHER, EAT, SELECT_CREATURE). Remove ticks (playerSurvival, packFollow). Add CLAIM_TILE handler. Modify onJoin (HQ spawn + 3×3 territory). Modify map gen call (64×64). Modify tickTrustDecay (territory-based). |
| `rooms/creatureAI.ts` | **MODIFY** | Phase A: minor — remove `skipIds` param. Phase C: add gather/guard/patrol FSM branches. |
| `rooms/mapGenerator.ts` | **KEEP** | Works with any map size already (receives width/height params). |
| `index.ts` | **KEEP** | No changes. Encoder buffer may need increase for 4× tile count — monitor. |
| `__tests__/` | **MODIFY** | Update all tests touching removed fields/handlers. Estimated 40-60% of tests need changes. |

### `client/src/`

| File | Action | Details |
|------|--------|---------|
| `main.ts` | **MODIFY** | Remove PlayerRenderer. Remove tracking target. Add HQ centering. |
| `network.ts` | **KEEP** | No changes. |
| `renderer/Camera.ts` | **MODIFY** | Remove tracking logic. Add `centerOnHQ()`. Free-pan is default. |
| `renderer/GridRenderer.ts` | **MODIFY** | Add territory overlay (colored tint per ownerID). |
| `renderer/PlayerRenderer.ts` | **REMOVE** | No avatar to render. |
| `renderer/CreatureRenderer.ts` | **KEEP** (Phase A) | Phase C: add command indicators. |
| `renderer/StructureRenderer.ts` | **MODIFY** | Phase A: add HQ rendering. Phase B: add turret rendering + health bars. |
| `input/InputHandler.ts` | **MODIFY** | Remove movement/gather/eat/select keys. Add click-to-claim. |
| `ui/HudDOM.ts` | **MODIFY** | Remove health/hunger/meat/axes/pickaxes. Add territory count. |
| `ui/CraftMenu.ts` | **MODIFY** | Remove axe/pickaxe recipes. |
| `ui/CraftMenu.ts` | **KEEP** (Phase A) | Phase B: add turret recipe. |
| `ui/HelpScreen.ts` | **MODIFY** | Update keybinding list. |
| `ui/ConnectionStatus.ts` | **KEEP** | No changes. |
| `ui/HudRenderer.ts` | **REMOVE** | Already deprecated in Phase 4.5. Clean up now. |

### `shared/src/`

| File | Action | Details |
|------|--------|---------|
| `types.ts` | **MODIFY** | Update interfaces (ITileState, IPlayerState, ICreatureState, IStructureState). Update ItemType enum. |
| `constants.ts` | **MODIFY** | DEFAULT_MAP_SIZE → 64. Remove PLAYER_SURVIVAL. Add TERRITORY, WAVE_SPAWNER, TURRET, ROUND, PAWN_COMMAND. Scale CREATURE_SPAWN. |
| `messages.ts` | **MODIFY** | Remove MOVE, GATHER, EAT, SELECT_CREATURE exports. Add CLAIM_TILE, ASSIGN_PAWN with payload types. |
| `data/creatures.ts` | **KEEP** | No changes for Phase A. |
| `data/recipes.ts` | **MODIFY** | Remove axe/pickaxe recipes + ITEM_TYPE_TO_FIELD entries. |
| `index.ts` | **KEEP** | All new exports covered by existing wildcard re-exports. |

### `client/index.html`

| File | Action | Details |
|------|--------|---------|
| `index.html` | **MODIFY** | Remove health/hunger bars, meat/axes/pickaxes rows. Add territory section. |

### New Files

| File | Phase | Purpose |
|------|-------|---------|
| `server/src/rooms/territory.ts` | A | Territory validation logic: `isAdjacentToTerritory()`, `claimTile()`, `spawnHQ()`, `getTerritoryCounts()`. Extracted from GameRoom for testability. |

---

## 7. Migration Strategy

### Approach: Single Clean Break at Phase A

Phase A is a breaking change — the avatar removal touches schema, messages, handlers, renderers, and HUD simultaneously. **There is no way to do this incrementally** within Phase A. However, within Phase A, we can order the work to minimize throwaway:

### Ordering Principle

```
shared (schema + messages) → server (handlers + ticks) → client (render + input + HUD)
```

1. **Start with shared:** Change types, constants, messages. This breaks compilation everywhere — that's intentional. The compiler errors become the task list.
2. **Fix server:** Remove dead handlers, add new handler, modify tick systems. Server compiles and runs (but no client connects yet).
3. **Fix client:** Remove dead renderers, update remaining ones, rewrite input and HUD. Client compiles and connects.
4. **Test end-to-end:** Join room, see 64×64 map, claim tiles, see territory colors.

### What NOT to Do

- **Don't** try to keep the old avatar system working alongside the new territory system. It doubles the code and delays the pivot.
- **Don't** implement pawn commands (Phase C) during Phase A. Creatures exist on the map but players can't command them yet.
- **Don't** implement waves or turrets (Phase B) during Phase A. No combat in Phase A.
- **Don't** implement the round timer (Phase D) during Phase A.

### Test Strategy

- Existing 304 tests will break. Estimated ~180 directly reference removed fields/handlers.
- **Don't fix all 304.** Delete tests for removed systems (MOVE, GATHER, EAT, playerSurvival, packFollow). Write new tests for: claim validation, territory adjacency, HQ spawn, score tracking.
- Target: 150+ tests post-Phase A (fewer total, but covering new functionality).

---

## 8. Risk Register

### R1: Sync Bandwidth at 64×64 (Severity: Medium)

**Risk:** 4,096 tiles × ~40 bytes per TileState = ~164 KB initial state. With `ownerID` added, each tile grows. Colyseus delta-sync should handle it, but initial join payload may be large.

**Mitigation:** Encoder buffer already at 128 KB (set in server/index.ts). Increase to 256 KB. Monitor first-join latency. If >500ms, consider interest management (send only visible tiles). Currently deferred — 2-player rooms should be fine.

### R2: Territory Contiguity Validation (Severity: Medium)

**Risk:** Every `CLAIM_TILE` must verify the tile is adjacent to existing territory. Naïve check (scan all tiles for adjacency) is O(N) per claim. With 4,096 tiles, this is fine. But contiguity can be broken if territory is ever lost (PvP Phase D) — player could end up with disconnected islands.

**Mitigation:** Phase A: simple adjacency check (any of 4 cardinal neighbors owned by player). No contiguity graph needed. Phase D: add connected-component check only when territory destruction is implemented.

### R3: Test Suite Rebuild (Severity: High)

**Risk:** ~180 of 304 tests break. Developers may be blocked on unrelated test failures during Phase A.

**Mitigation:** First commit of Phase A: strip failing tests for removed systems. Second commit: add new territory tests. Never be in a state where `npm test` has >0 unexplained failures.

### R4: Resource Regen Performance at 64×64 (Severity: Low)

**Risk:** `tickResourceRegen()` iterates all 4,096 tiles every 80 ticks. 4× more iterations than before.

**Mitigation:** This is still <4K iterations of trivial math — well within tick budget at 4 ticks/sec. Only escalates if map grows to 128×128+, which is not planned. No action needed.

### R5: Client Click Disambiguation (Severity: Medium)

**Risk:** In commander mode, a single click could mean: claim tile, select creature, select structure, or open context menu. Without clear visual feedback, players won't know what they're interacting with.

**Mitigation:** Phase A: clicks only claim tiles (no building, no creature interaction). Phase B/C: add build mode (already exists) and creature selection mode. Use modifier keys or mode toggles (current V-for-build pattern works). Don't try to be smart about context-sensitive clicks — explicit modes are clearer.

---

## 9. Phase A Work Breakdown

Phase A delivers: join room → see 64×64 map → claim tiles → see territory grow. No creatures, no building, no combat.

### A1: Shared Schema & Constants Update

**What:** Update `types.ts`, `constants.ts`, `messages.ts`, `recipes.ts` with all field additions/removals per §1, §2, §5. This is the foundation — everything else depends on it.

**Files touched:**
- `shared/src/types.ts`
- `shared/src/constants.ts`
- `shared/src/messages.ts`
- `shared/src/data/recipes.ts`

**Dependencies:** None
**Complexity:** S
**Owner:** Pemulis (backend — shared is server-adjacent)

---

### A2: Server Schema Migration

**What:** Update `GameState.ts` to match new schema: remove PlayerState fields (x, y, hunger, health, meat, axes, pickaxes), add PlayerState fields (hqX, hqY, score), add TileState.ownerID, add CreatureState fields (command, zoneX, zoneY), add StructureState.health, add GameState fields (roundTimer, roundPhase).

**Files touched:**
- `server/src/rooms/GameState.ts`

**Dependencies:** A1
**Complexity:** S
**Owner:** Pemulis

---

### A3: Server Handler Cleanup

**What:** Remove handlers for MOVE, GATHER, EAT, SELECT_CREATURE. Remove `tickPlayerSurvival()` and `tickPackFollow()`. Remove `playerSelectedPacks` map. Remove `handleMove`, `handleGather`, `handleEat`, `handleSelectCreature` methods. Update `tickCreatureAI` to remove `skipIds` parameter. Clean up unused imports.

**Files touched:**
- `server/src/rooms/GameRoom.ts`
- `server/src/rooms/creatureAI.ts`

**Dependencies:** A1, A2
**Complexity:** M
**Owner:** Pemulis

---

### A4: Territory System (Server)

**What:** Implement territory mechanics. Extract `territory.ts` with: `isAdjacentToTerritory(state, playerId, x, y)` — checks if any cardinal neighbor tile is owned by player; `claimTile(state, playerId, x, y)` — sets ownerID, decrements wood, updates score; `spawnHQ(state, player, x, y)` — creates HQ structure, claims 3×3 area. Add `CLAIM_TILE` message handler in GameRoom. Modify `onJoin`: find random walkable tile, call `spawnHQ()`, set player.hqX/hqY, give starting resources (TERRITORY.STARTING_WOOD, etc.).

**Files touched:**
- `server/src/rooms/territory.ts` (NEW)
- `server/src/rooms/GameRoom.ts`

**Dependencies:** A2, A3
**Complexity:** M
**Owner:** Pemulis

---

### A5: Map Size & Creature Scaling

**What:** Change `DEFAULT_MAP_SIZE` from 32 to 64. Update `generateMap()` call to use new size. Scale creature spawn counts (HERBIVORE_COUNT: 32, CARNIVORE_COUNT: 16). Increase Encoder.BUFFER_SIZE to 256 KB. Modify `tickTrustDecay` to use territory-based proximity (check tile.ownerID instead of Manhattan distance to avatar).

**Files touched:**
- `shared/src/constants.ts` (already done in A1, just the size/spawn values)
- `server/src/index.ts` (buffer size)
- `server/src/rooms/GameRoom.ts` (trust decay modification)

**Dependencies:** A1, A4
**Complexity:** S
**Owner:** Pemulis

---

### A6: Client Camera Pivot

**What:** Remove `setTrackingTarget()`, `toggleTracking()`, `isTracking()`, tracking-related state from Camera. Free-pan is now the only mode. Add `centerOnHQ(hqX: number, hqY: number)` method (calls existing `centerOn`). Ensure grid constructor accepts 64-tile map size (it already does via parameter — just verify).

**Files touched:**
- `client/src/renderer/Camera.ts`

**Dependencies:** A1
**Complexity:** S
**Owner:** Odie (frontend)

---

### A7: Client Avatar Removal & Territory Rendering

**What:** Delete `PlayerRenderer.ts`. Remove its import/instantiation from `main.ts`. Add territory color overlay to `GridRenderer`: for each tile with `ownerID !== ""`, draw a semi-transparent rect in the owner's player color. This requires `GridRenderer.bindToRoom()` to read both tile data and player colors. Add HQ rendering to `StructureRenderer` (distinct icon for ItemType.HQ).

**Files touched:**
- `client/src/renderer/PlayerRenderer.ts` (DELETE)
- `client/src/renderer/GridRenderer.ts`
- `client/src/renderer/StructureRenderer.ts`
- `client/src/main.ts`

**Dependencies:** A2, A6
**Complexity:** M
**Owner:** Odie

---

### A8: HUD Overhaul

**What:** Rework `HudDOM.ts`: remove health/hunger bar references, remove meat/axes/pickaxes inventory bindings. Add territory count display (`score` field from PlayerState). Update `index.html`: remove health/hunger sections, remove meat/axes/pickaxes rows, add territory section. Remove `localPlayerX`/`localPlayerY` (no avatar). Remove deprecated `HudRenderer.ts` file.

**Files touched:**
- `client/src/ui/HudDOM.ts`
- `client/index.html`
- `client/src/ui/HudRenderer.ts` (DELETE)

**Dependencies:** A2, A7
**Complexity:** M
**Owner:** Odie

---

### A9: Input & UI Update

**What:** Rewrite `InputHandler.ts`: remove arrow-key movement, G/E/F/B keybindings and their message sends. Add left-click → `CLAIM_TILE` when not in build mode (convert screen coords to tile, send message). Keep build mode (V key + click-to-place) for later phases but disable it in Phase A (no PLACE items available). Update `HelpScreen.ts` keybinding list. Update `CraftMenu.ts` to exclude axe/pickaxe recipes.

**Files touched:**
- `client/src/input/InputHandler.ts`
- `client/src/ui/HelpScreen.ts`
- `client/src/ui/CraftMenu.ts`

**Dependencies:** A7, A8
**Complexity:** M
**Owner:** Odie

---

### A10: Test Rebuild & Integration

**What:** Delete tests for removed systems (MOVE, GATHER, EAT, playerSurvival, packFollow, selectCreature). Write new tests: territory claim validation (adjacency, cost, ownership), HQ spawn (3×3 claim, structure placed), score tracking (increments on claim), trust decay (territory-based). End-to-end: player joins → HQ placed → claim adjacent tile → tile.ownerID updated → score incremented.

**Files touched:**
- `server/src/__tests__/` (modify existing, add new)

**Dependencies:** A4, A5 (server must compile)
**Complexity:** M
**Owner:** Mario (tester)

---

### Phase A Dependency Graph

```
A1 (shared)
├── A2 (server schema) ─── A3 (handler cleanup) ─── A4 (territory) ─── A5 (map/scale)
├── A6 (camera) ────────── A7 (avatar removal + territory render) ─── A8 (HUD) ─── A9 (input)
└── A10 (tests) ← depends on A4 + A5 + A9
```

**Critical path:** A1 → A2 → A3 → A4 → A5 (server) then A7 → A8 → A9 (client)
**Parallel track:** A6 (camera) can start as soon as A1 lands.
**Total items:** 10
**Estimated duration:** 5–7 working days (2 tracks, Pemulis + Odie in parallel after A1)

---

*This document is the implementation spec for the GDD pivot. When a work item says "do X," the implementer should do exactly X — no more, no less. Scope questions go to Hal. Implementation questions go to the owning agent.*
