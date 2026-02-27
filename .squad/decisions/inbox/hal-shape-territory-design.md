# Shape-Territory System — Complete Architecture

**Author:** Hal (Lead)
**Date:** 2026-02-27
**Status:** DESIGN — ready for implementation
**Supersedes:** `hal-resource-economy.md` (all three options replaced by this unified design)
**Triggered by:** dkirby-ms directives (copilot-directive-20260227-0252.md)

---

## Summary

Three interconnected changes that reshape the core loop:

1. **Polyomino shapes** replace walls, floors, and CLAIM_TILE as the territory expansion mechanism
2. **Free worker pawn** gives every player resource income from tick 1
3. **Auto-territory** — placing a shape claims the tiles under it; no separate claim action

These solve the resource softlock, make territory expansion a spatial puzzle, and unify building with claiming.

---

## 1. SHAPE SYSTEM (Polyominoes)

### 1.1 Shape Catalog

11 shapes spanning three size tiers. Smaller pieces fill gaps; larger pieces are efficient but harder to fit.

| ID | Name | Size | Cells (offsets from origin) |
|----|------|------|-----------------------------|
| `mono` | Monomino | 1 | `(0,0)` |
| `domino` | Domino | 2 | `(0,0) (1,0)` |
| `tromino_i` | I-Tromino | 3 | `(0,0) (1,0) (2,0)` |
| `tromino_l` | L-Tromino | 3 | `(0,0) (1,0) (1,1)` |
| `tetra_i` | I-Tetromino | 4 | `(0,0) (1,0) (2,0) (3,0)` |
| `tetra_o` | O-Tetromino | 4 | `(0,0) (1,0) (0,1) (1,1)` |
| `tetra_t` | T-Tetromino | 4 | `(0,0) (1,0) (2,0) (1,1)` |
| `tetra_s` | S-Tetromino | 4 | `(1,0) (2,0) (0,1) (1,1)` |
| `tetra_z` | Z-Tetromino | 4 | `(0,0) (1,0) (1,1) (2,1)` |
| `tetra_l` | L-Tetromino | 4 | `(0,0) (0,1) (0,2) (1,2)` |
| `tetra_j` | J-Tetromino | 4 | `(1,0) (1,1) (1,2) (0,2)` |

**Why these 11:** Monominoes and dominoes are essential for gap-filling and early-game expansion when resources are tight. Trominoes bridge the gap. Standard tetrominoes provide the satisfying Tetris feel. No pentominoes — too large for a 64×64 map, deferred.

### 1.2 Data Representation

New file: `shared/src/data/shapes.ts`

```typescript
export interface ShapeDef {
  readonly id: string;
  readonly name: string;
  /** Base cells as {dx, dy} offsets from placement origin (0,0). */
  readonly cells: ReadonlyArray<{ dx: number; dy: number }>;
  /** Pre-computed rotations: [0°, 90°, 180°, 270°]. Each is an array of {dx, dy}. */
  readonly rotations: ReadonlyArray<ReadonlyArray<{ dx: number; dy: number }>>;
}

export const SHAPE_CATALOG: Record<string, ShapeDef> = { /* ... */ };
```

Each shape stores 4 pre-computed rotation variants. Rotation formula: `(dx, dy) → (dy, -dx)` for 90° clockwise, then normalize to non-negative offsets (shift so min dx/dy = 0).

The catalog is a pure data file — no logic, no imports beyond types. ~80 lines.

### 1.3 Rotation

4 rotations per shape (0°, 90°, 180°, 270°). Pre-computed at module load, stored in `rotations` array. Client sends `rotation: 0|1|2|3` in the message; server looks up `shape.rotations[rotation]` directly.

Rotation computation (build-time helper, also exported for tests):
```typescript
export function rotateCell(dx: number, dy: number): { dx: number; dy: number } {
  return { dx: dy, dy: -dx };
}

export function computeRotations(
  cells: ReadonlyArray<{ dx: number; dy: number }>
): ReadonlyArray<ReadonlyArray<{ dx: number; dy: number }>> {
  // Generate 4 rotations, normalize each to non-negative offsets
}
```

O-tetromino: all 4 rotations are identical (symmetry). I-tetromino: 2 unique rotations. Others: 4 unique. Pre-computation handles this naturally — duplicates don't hurt.

### 1.4 Placement Rules

A shape placement at `(x, y)` with rotation `r` is valid if ALL of these hold:

1. **Shape exists:** `shapeId` is in `SHAPE_CATALOG`
2. **Rotation valid:** `rotation ∈ {0, 1, 2, 3}`
3. **All cells buildable:** For each cell `(x+dx, y+dy)`:
   - Tile exists (in bounds)
   - Tile is NOT Water or Rock
   - Tile has no existing structure (farm, turret, workbench, HQ)
   - Tile has `shapeHP === 0` (no existing shape block)
4. **No enemy territory:** No cell lands on a tile owned by another player
5. **Adjacency:** At least one cell of the shape is cardinally adjacent to a tile the player already owns. Exception: if the player owns zero tiles (shouldn't happen — HQ spawn claims 3×3), any valid placement is allowed.
6. **Affordability:** Player has `cells.length * SHAPE.COST_WOOD_PER_CELL` wood

**Key decisions:**
- Shapes CAN overlap tiles the player already owns (to build walls on your own open territory). Already-owned tiles don't cost extra — you pay wood per cell regardless. This keeps the UX simple: you always pay the same cost.
- Placing on your own open territory adds shape blocks (walls) without changing ownership.
- Placing on unclaimed tiles claims them AND adds shape blocks.
- A cell landing on a tile you already own still costs resources (you're building the wall, not just claiming).

### 1.5 Resource Cost

**Flat cost per cell: 2 wood.**

| Shape | Cells | Total Cost |
|-------|-------|------------|
| Monomino | 1 | 2 wood |
| Domino | 2 | 4 wood |
| Trominoes | 3 | 6 wood |
| Tetrominoes | 4 | 8 wood |

**Why 2 wood/cell:** Old CLAIM_TILE was 1 wood/tile but only claimed territory. Shapes claim territory AND create walls (blocking). The doubled cost reflects the dual function. With starting wood of 10, a player can immediately place one tetromino (8 wood) + one monomino (2 wood), expanding by up to 5 tiles. Worker pawn generates income for further expansion.

Constant: `SHAPE.COST_WOOD_PER_CELL = 2` (tunable in constants.ts).

No stone cost for shapes. Stone is reserved for turrets and workbenches, preserving resource tension.

### 1.6 What Replaces Wall/Floor

**Wall → Shape cells.** Shape cells block movement, replacing Wall's defensive function. Shape cells have HP and can be destroyed by enemies (when wave combat is implemented).

**Floor → Open owned territory.** The 3×3 starting area and any tiles claimed (via shape adjacency to already-owned tiles) are open/walkable. Floor's function (walkable owned tile) is now just "owned tile without a shape block on it."

**Wall and Floor are fully removed:**
- `ItemType.Wall` and `ItemType.Floor` removed from craftable/placeable items
- Wall and Floor recipes removed from `recipes.ts`
- `walls` and `floors` inventory fields removed from `PlayerState`
- Wall removed from `isWalkable` blocking check (replaced by `shapeHP > 0`)

**Structures that remain as individual placements:**
- Workbench (on open owned tile)
- FarmPlot (on open owned tile, Grassland/Forest)
- Turret (on open owned tile)
- HQ (pre-placed at spawn)

These are placed one at a time via the existing `PLACE` message. The shape system doesn't replace them.

### 1.7 Shape Block Storage

New field on `TileState`:

```typescript
// TileState schema
@type("number")
shapeHP: number = 0;  // 0 = no shape block; > 0 = shape block with HP
```

```typescript
// ITileState interface (shared/src/types.ts)
shapeHP: number;
```

**Why TileState, not StructureState:** Shapes can cover hundreds of tiles. Creating a StructureState per cell would generate hundreds of MapSchema entries, increasing sync bandwidth and iteration cost. A single numeric field on TileState is O(1) to check and syncs as a delta — far more efficient.

`isWalkable` update:
```typescript
// In GameState.isWalkable()
if (tile.shapeHP > 0) return false;  // shape block
```

**Shape HP:** `SHAPE.BLOCK_HP = 100`. Indestructible for now — no damage system targets shape blocks until the wave combat system is built (Phase B-wave). The HP field is there for future use.

### 1.8 Visual Appearance

Shape cells render as solid colored rectangles in the player's color, with a darker border/outline distinguishing them from open territory (which uses the existing semi-transparent overlay).

```
Open territory:  semi-transparent tint (existing TERRITORY_ALPHA = 0.25)
Shape block:     solid fill (alpha ~0.6) + 1px border in darker shade
```

This makes the base look like a walled compound — Tetris pieces forming the perimeter, interior visible through the lighter tint.

### 1.9 Message Protocol

**New message:** `PLACE_SHAPE`

```typescript
// shared/src/messages.ts
export const PLACE_SHAPE = "place_shape" as const;

export interface PlaceShapePayload {
  /** Shape ID from SHAPE_CATALOG. */
  shapeId: string;
  /** Origin tile X coordinate. */
  x: number;
  /** Origin tile Y coordinate. */
  y: number;
  /** Rotation index: 0 = 0°, 1 = 90°, 2 = 180°, 3 = 270°. */
  rotation: number;
}
```

**Replaces:** `CLAIM_TILE` message (removed entirely).

---

## 2. WORKER PAWN

### 2.1 Spawn

One worker pawn spawns per player when HQ is placed. Location: on the HQ tile itself (guaranteed walkable, within owned territory).

Added to `spawnHQ()` in `territory.ts`:
```typescript
const worker = new CreatureState();
worker.id = `creature_${nextCreatureId.value++}`;
worker.creatureType = "worker";
worker.x = hqX;
worker.y = hqY;
worker.ownerID = player.id;
worker.trust = 100;
worker.command = "gather";
worker.currentState = "idle";
worker.health = 50;
worker.hunger = 100;
worker.personality = Personality.Docile;
state.creatures.set(worker.id, worker);
```

### 2.2 Identity

The worker IS a `CreatureState` with `creatureType = "worker"`. No new schema needed.

**New creature type definition** in `shared/src/data/creatures.ts`:

```typescript
worker: {
  name: "Worker",
  icon: "🐜",
  health: 50,
  hunger: 100,
  speed: 1,
  detectionRadius: 0,   // doesn't detect enemies
  preferredBiomes: [],   // spawns at HQ, not in the wild
  color: "#FFD700",      // gold
  minPopulation: 0,      // no wild respawn
  personalityChart: [100, 0, 0] as const,  // always docile
}
```

`minPopulation: 0` ensures workers never wild-spawn. They only come from player HQ spawn or (future) taming.

### 2.3 Gather Behavior

Worker AI loop (integrated into `creatureAI.ts`):

```
IDLE → SEEK_RESOURCE → MOVE_TO → GATHER → SEEK_RESOURCE → ...
```

**Tick-by-tick behavior** (runs on creature AI tick, every `CREATURE_AI.TICK_INTERVAL` = 2 ticks):

1. **SEEK_RESOURCE:** Scan owned tiles (tiles where `ownerID === worker.ownerID`) for any tile with `resourceAmount > 0` and `shapeHP === 0` (walkable). Pick the nearest one (Manhattan distance). If none found, stay idle.
2. **MOVE_TO:** Greedy movement toward target tile. Move 1 tile per AI tick toward target (cardinal direction that reduces Manhattan distance). Skip tiles that aren't walkable.
3. **GATHER:** Arrive at resource tile. Extract 1 unit: `tile.resourceAmount -= 1`. Add to owner stockpile: `owner[resourceField] += 1`. If tile depleted (`resourceAmount === 0`), clear `resourceType = -1`. Immediately seek next target.

**Speed:** 1 tile per AI tick = 1 tile per 0.5 seconds. Traversing 10 tiles takes 5 seconds. This is fast enough to feel useful, slow enough that larger territory means slower gathering loops.

**Hunger:** Workers do NOT drain hunger. Their `hunger` field stays at 100. They're a game mechanic, not a pet. (Workers can take damage from wild creatures — health matters. If health reaches 0, the worker dies and must be re-obtained via taming.)

**Deposit:** Instant. Resources go directly to owner's stockpile when gathered. No hauling, no HQ trip. (Physical hauling = deferred, post-MVP complexity.)

**Constants** (new in `constants.ts`):

```typescript
export const WORKER = {
  /** Starting HP for worker pawns. */
  HEALTH: 50,
  /** Resources gathered per gather action. */
  GATHER_AMOUNT: 1,
} as const;
```

### 2.4 Interaction with Taming

The starting worker IS a tamed creature. It occupies 1 of the player's 8 pack slots (`TAMING.MAX_PACK_SIZE`).

Players can tame additional wild creatures and assign them `command = "gather"` to create more workers. This is the existing taming system unchanged — any tamed creature with the gather command works the same way.

**No special "worker" taming mechanic.** The starting worker is free. Additional workers cost berries (taming) + time (trust building), same as any creature.

### 2.5 Worker AI Integration

Workers use the existing creature AI tick (`tickCreatureAI`). The worker behavior is a new branch in the FSM:

```typescript
// In tickCreatureAI():
if (creature.ownerID !== "" && creature.command === "gather") {
  tickWorkerGather(state, creature);
  return; // skip wild AI
}
```

This runs for ANY owned creature with `command = "gather"`, not just `creatureType === "worker"`. A tamed herbivore set to "gather" behaves identically. The creature type determines stats (health, speed), not the gather behavior.

### 2.6 Visuals

Worker creatures render with the 🐜 icon (distinct from 🦕 herbivore and 🦖 carnivore). Client-side, `CreatureRenderer` already reads `creatureType` and can map it to an icon/color. The gold color (#FFD700) distinguishes workers from wild creatures visually.

Owned creatures (workers included) should render with the owner's color border or a small flag indicator — this is existing behavior per Phase 4 creature rendering.

---

## 3. AUTO-TERRITORY FROM SHAPES

### 3.1 Mechanism

When `handlePlaceShape()` processes a valid placement, for each cell `(x+dx, y+dy)`:

```typescript
const tile = state.getTile(cellX, cellY);
if (tile.ownerID !== player.id) {
  tile.ownerID = player.id;
  player.score += 1;  // only score for newly claimed tiles
}
tile.shapeHP = SHAPE.BLOCK_HP;  // set wall regardless
```

Territory expansion is a side effect of shape placement. No separate action.

### 3.2 Expansion Rule

**At least one cell** of the shape must be cardinally adjacent to a tile already owned by the player. This maintains contiguous territory (no island claims). Uses the existing `isAdjacentToTerritory()` function with a small adaptation:

```typescript
function isShapeAdjacentToTerritory(
  state: GameState,
  playerId: string,
  cells: Array<{ x: number; y: number }>
): boolean {
  for (const cell of cells) {
    if (isAdjacentToTerritory(state, playerId, cell.x, cell.y)) return true;
    // Also count the cell itself as adjacent if already owned
    const tile = state.getTile(cell.x, cell.y);
    if (tile && tile.ownerID === playerId) return true;
  }
  return false;
}
```

Placing a shape entirely within your own territory (e.g., adding walls inside your base) is always valid — you own those tiles already.

### 3.3 What Happens to CLAIM_TILE

**Removed entirely.**

- `CLAIM_TILE` constant deleted from `messages.ts`
- `ClaimTilePayload` interface deleted from `messages.ts`
- `handleClaimTile()` method deleted from `GameRoom.ts`
- `onMessage(CLAIM_TILE, ...)` handler removed from `onCreate()`
- `TERRITORY.CLAIM_COST_WOOD` constant removed (replaced by `SHAPE.COST_WOOD_PER_CELL`)

The `isAdjacentToTerritory()` function in `territory.ts` is **kept** — it's reused by shape adjacency validation.

### 3.4 Starting Territory

**Unchanged: 3×3 area around HQ.** Player spawns with 9 open (walkable, no shape blocks) owned tiles. This provides:
- Space for the worker pawn to move and gather
- Room for initial structure placement (farm, workbench)
- A base that shapes attach to for expansion

The starting tiles are set via `spawnHQ()` (existing behavior, no change).

---

## 4. WHAT GETS REMOVED / CHANGED

### 4.1 Removed (Dead Code)

| Item | File | Type |
|------|------|------|
| `CLAIM_TILE` constant | `shared/src/messages.ts` | message const |
| `ClaimTilePayload` | `shared/src/messages.ts` | interface |
| `handleClaimTile()` | `server/src/rooms/GameRoom.ts` | method |
| `onMessage(CLAIM_TILE, ...)` | `server/src/rooms/GameRoom.ts` | handler registration |
| `TERRITORY.CLAIM_COST_WOOD` | `shared/src/constants.ts` | constant |
| `wall` recipe | `shared/src/data/recipes.ts` | recipe entry |
| `floor` recipe | `shared/src/data/recipes.ts` | recipe entry |
| `Wall` entry in `ITEM_TYPE_TO_FIELD` | `shared/src/data/recipes.ts` | mapping |
| `Floor` entry in `ITEM_TYPE_TO_FIELD` | `shared/src/data/recipes.ts` | mapping |
| `walls` field on `PlayerState` | `server/src/rooms/GameState.ts` | schema field |
| `floors` field on `PlayerState` | `server/src/rooms/GameState.ts` | schema field |
| `walls` field on `IPlayerState` | `shared/src/types.ts` | interface field |
| `floors` field on `IPlayerState` | `shared/src/types.ts` | interface field |
| Normal click → `CLAIM_TILE` | `client/src/input/InputHandler.ts` | click handler |
| `Wall` in `PLACEABLE_ITEMS` | `client/src/input/InputHandler.ts` | array entry |
| `Floor` in `PLACEABLE_ITEMS` | `client/src/input/InputHandler.ts` | array entry |
| `CLAIM_TILE` import | `client/src/input/InputHandler.ts` | import |

### 4.2 Modified

| Item | File | Change |
|------|------|--------|
| `TileState` class | `server/src/rooms/GameState.ts` | Add `shapeHP: number` field |
| `ITileState` interface | `shared/src/types.ts` | Add `shapeHP: number` field |
| `isWalkable()` | `server/src/rooms/GameState.ts` | Check `shapeHP > 0` for blocking; remove `ItemType.Wall` from structure blocking check |
| `handlePlace()` | `server/src/rooms/GameRoom.ts` | Remove `ItemType.Wall` and `ItemType.Floor` from `placeableTypes` array |
| `PLACEABLE_ITEMS` | `client/src/input/InputHandler.ts` | Remove Wall/Floor entries; add shape selector |
| Click handler | `client/src/input/InputHandler.ts` | Replace claim-on-click with shape placement |
| `GridRenderer` | `client/src/renderer/GridRenderer.ts` | Add shape block rendering (solid fill for tiles with `shapeHP > 0`) |
| `TERRITORY` constants | `shared/src/constants.ts` | Remove `CLAIM_COST_WOOD` |
| `tickCreatureAI()` | `server/src/rooms/creatureAI.ts` | Add worker gather branch |
| `spawnHQ()` | `server/src/rooms/territory.ts` | Add worker pawn spawn |
| `GameRoom.onCreate()` | `server/src/rooms/GameRoom.ts` | Add `PLACE_SHAPE` handler, add `tickTerritoryIncome()` to sim interval |
| `shared/src/index.ts` | `shared/src/index.ts` | Export shapes module |

### 4.3 Added (New Code)

| Item | File | Type |
|------|------|------|
| `shared/src/data/shapes.ts` | new file | Shape catalog + rotation helpers |
| `PLACE_SHAPE` message const | `shared/src/messages.ts` | message const |
| `PlaceShapePayload` | `shared/src/messages.ts` | interface |
| `SHAPE` constants | `shared/src/constants.ts` | constants object |
| `WORKER` constants | `shared/src/constants.ts` | constants object |
| `TERRITORY_INCOME` constants | `shared/src/constants.ts` | constants object |
| `worker` creature type | `shared/src/data/creatures.ts` | creature def |
| `handlePlaceShape()` | `server/src/rooms/GameRoom.ts` | handler method |
| `isShapeAdjacentToTerritory()` | `server/src/rooms/territory.ts` | validation helper |
| `tickWorkerGather()` | `server/src/rooms/creatureAI.ts` | AI behavior |
| `tickTerritoryIncome()` | `server/src/rooms/GameRoom.ts` | sim tick method |
| Shape selector UI | `client/src/input/InputHandler.ts` | keyboard + click |
| Shape ghost preview | `client/src/renderer/GridRenderer.ts` | rendering |

---

## 5. IMPLEMENTATION PLAN

### Work Items

Items are numbered B1–B10 (Phase B, continuing from Phase A numbering).

---

#### B1: Shape Data & Shared Types
**Scope:** S (~70 lines)
**Assignee:** Pemulis (shared)
**Dependencies:** None
**Files:**
- **Create** `shared/src/data/shapes.ts` — shape catalog (11 shapes), `ShapeDef` interface, `computeRotations()` helper, `SHAPE_CATALOG` export
- **Edit** `shared/src/messages.ts` — add `PLACE_SHAPE` const + `PlaceShapePayload` interface
- **Edit** `shared/src/constants.ts` — add `SHAPE`, `WORKER`, `TERRITORY_INCOME` constant objects
- **Edit** `shared/src/types.ts` — add `shapeHP: number` to `ITileState`
- **Edit** `shared/src/index.ts` — add `export * from "./data/shapes.js"`

**Definition of done:** `SHAPE_CATALOG` contains 11 shapes with pre-computed rotations. All rotation variants verified correct. New types compile. Existing tests still pass.

---

#### B2: Shape Placement Server Handler
**Scope:** M (~90 lines)
**Assignee:** Pemulis (server)
**Dependencies:** B1
**Files:**
- **Edit** `server/src/rooms/GameState.ts` — add `@type("number") shapeHP: number = 0` to TileState; update `isWalkable()` to check `shapeHP > 0`
- **Edit** `server/src/rooms/GameRoom.ts` — add `handlePlaceShape()` method; wire `onMessage(PLACE_SHAPE, ...)` in `onCreate()`
- **Edit** `server/src/rooms/territory.ts` — add `isShapeAdjacentToTerritory()` helper

**Handler logic:**
1. Validate player exists
2. Validate shapeId in SHAPE_CATALOG, rotation 0–3
3. Compute cell positions from shape + origin + rotation
4. Validate all cells (in bounds, not water/rock, no structures, no shape blocks, not enemy territory)
5. Validate adjacency (at least one cell adjacent to player's existing territory or on an already-owned tile)
6. Validate cost (player.wood >= cells.length * SHAPE.COST_WOOD_PER_CELL)
7. Deduct cost
8. For each cell: set ownerID (if not already), set shapeHP, increment score for newly claimed tiles

**Definition of done:** Server accepts PLACE_SHAPE messages, validates all rules, creates shape blocks, claims territory. Invalid placements rejected silently.

---

#### B3: Remove CLAIM_TILE
**Scope:** S (~30 lines removed)
**Assignee:** Pemulis (server + shared)
**Dependencies:** B2 (new system works before removing old)
**Files:**
- **Edit** `shared/src/messages.ts` — remove `CLAIM_TILE` const, `ClaimTilePayload` interface
- **Edit** `shared/src/constants.ts` — remove `CLAIM_COST_WOOD` from `TERRITORY`
- **Edit** `server/src/rooms/GameRoom.ts` — remove `handleClaimTile()` method, remove `onMessage(CLAIM_TILE, ...)`, remove `ClaimTilePayload` import

**Definition of done:** No CLAIM_TILE handler exists. Server rejects unknown "claim_tile" messages. Shape placement is the sole territory expansion path.

---

#### B4: Remove Wall/Floor Items
**Scope:** M (~40 lines removed/modified)
**Assignee:** Pemulis (server + shared)
**Dependencies:** B2
**Files:**
- **Edit** `shared/src/data/recipes.ts` — remove `wall` and `floor` recipe entries; remove Wall/Floor from `ITEM_TYPE_TO_FIELD`
- **Edit** `shared/src/types.ts` — remove `walls` and `floors` from `IPlayerState`
- **Edit** `server/src/rooms/GameState.ts` — remove `walls` and `floors` schema fields from `PlayerState`; remove `ItemType.Wall` from `isWalkable` structure blocking check (shape blocks handle this now)
- **Edit** `server/src/rooms/GameRoom.ts` — remove `ItemType.Wall` and `ItemType.Floor` from `placeableTypes` in `handlePlace()`

**Definition of done:** Wall and Floor cannot be crafted or placed. No inventory fields for them. isWalkable blocks on shapeHP instead of Wall structures. Existing turret/farm/workbench placement unaffected.

---

#### B5: Worker Pawn Spawn
**Scope:** S (~35 lines)
**Assignee:** Pemulis (server + shared)
**Dependencies:** B1 (for WORKER constants)
**Files:**
- **Edit** `shared/src/data/creatures.ts` — add `worker` creature type definition
- **Edit** `server/src/rooms/territory.ts` — in `spawnHQ()`, spawn a worker CreatureState for the player

**Worker spawn details:**
- `creatureType = "worker"`, `ownerID = player.id`, `trust = 100`
- `command = "gather"`, position at (hqX, hqY)
- Health = `WORKER.HEALTH` (50), hunger = 100 (no drain)
- Personality = Docile

**Definition of done:** Every new player gets 1 worker pawn at HQ. Worker appears in creatures MapSchema with correct owner. Worker counts against pack size (1/8 used).

---

#### B6: Worker Gather AI
**Scope:** M (~70 lines)
**Assignee:** Pemulis (server)
**Dependencies:** B5, B2 (needs shapeHP to check walkability)
**Files:**
- **Edit** `server/src/rooms/creatureAI.ts` — add `tickWorkerGather()` function; add gather command branch to main AI tick

**Gather AI loop:**
1. If creature has no target tile or target is depleted/unreachable, scan for nearest resource tile in owned territory (walkable, resourceAmount > 0)
2. Greedy move toward target (1 tile per AI tick, cardinal, reducing Manhattan distance)
3. On arrival: extract `WORKER.GATHER_AMOUNT` (1) resource, add to owner's stockpile, mark tile depleted if empty
4. Immediately seek next target
5. If no targets found: wander randomly within owned territory

Workers skip hunger drain (hunger stays at 100). Workers take damage from hostile creatures (existing combat system handles this).

**Definition of done:** Worker pawn visibly moves between resource tiles within territory. Owner's stockpile increases over time. Worker respects shape blocks (can't walk through them). Depleted tiles get skipped.

---

#### B7: Territory Income Tick
**Scope:** S (~25 lines)
**Assignee:** Pemulis (server)
**Dependencies:** None (can be built in parallel)
**Files:**
- **Edit** `server/src/rooms/GameRoom.ts` — add `tickTerritoryIncome()` method, wire into simulation interval

**Logic:** Every `TERRITORY_INCOME.INTERVAL_TICKS` (40 ticks = 10 seconds), iterate all tiles. For each tile where `ownerID !== ""` and `resourceAmount > 0` and `shapeHP === 0` (open territory, not walled over):
- Transfer 1 resource unit from tile to owner's stockpile
- Decrement tile.resourceAmount

This is the passive baseline income. Worker pawns provide active income on top of this. Tiles under shape blocks don't generate income (they're built over).

**Constants:**
```typescript
export const TERRITORY_INCOME = {
  INTERVAL_TICKS: 40,  // 10 seconds at 4 ticks/sec
  AMOUNT: 1,
} as const;
```

**Definition of done:** Players passively earn resources from owned open tiles. Income scales with territory size. Tile resources deplete and regen naturally.

---

#### B8: Client Shape Placement UI
**Scope:** L (~130 lines)
**Assignee:** Gately (client)
**Dependencies:** B1 (shape data), B2 (server handler)
**Files:**
- **Edit** `client/src/input/InputHandler.ts` — shape selector, rotation, placement
- **Edit** `client/src/ui/HudDOM.ts` — show selected shape + rotation indicator

**UX design:**
- **Default mode:** Shape placement (replaces old "normal click = claim")
- **Shape selection:** Number keys 1–9 cycle through available shapes (monomino default). Or dedicated shape palette in HUD.
- **Rotation:** `R` key rotates selected shape 90° clockwise
- **Preview:** Semi-transparent ghost of shape cells shown at cursor position (follows mouse)
- **Place:** Left-click sends `PLACE_SHAPE` with current shape, position, rotation
- **Build mode (V key):** Existing build mode for structures (farm, turret, workbench) unchanged
- **PLACEABLE_ITEMS:** Remove Wall and Floor entries. Keep Workbench, FarmPlot.

**Ghost preview:** GridRenderer draws translucent shape cells at cursor position. Updates every mouse move. Shows red tint if placement would be invalid (water, rock, enemy territory, occupied).

**Definition of done:** Player can select shapes, rotate them, see a ghost preview, and click to place. Shapes appear on the map after server confirms. Wall/Floor no longer appear in build options.

---

#### B9: Client Rendering Updates
**Scope:** M (~60 lines)
**Assignee:** Gately (client)
**Dependencies:** B2 (shapeHP in state), B5 (worker creature type)
**Files:**
- **Edit** `client/src/renderer/GridRenderer.ts` — render shape blocks (tiles with `shapeHP > 0`) with solid player-colored fill + border
- **Edit** `client/src/renderer/CreatureRenderer.ts` (if exists) — render worker with 🐜 icon and gold color

**Shape block rendering:**
- In `onStateChange`, check each tile's `shapeHP` value
- If `shapeHP > 0`: draw solid rectangle with player's color at alpha 0.6 + 1px darker border
- If `shapeHP === 0` and `ownerID !== ""`: existing territory overlay (alpha 0.25)
- If `ownerID === ""`: no overlay (existing behavior)

**Definition of done:** Shape blocks visually distinct from open territory. Workers render differently from wild creatures. No visual glitches at shape boundaries.

---

#### B10: Test Updates
**Scope:** L (~150 lines)
**Assignee:** Steeply (tests)
**Dependencies:** B1–B9 (all implementation complete)
**Files:**
- **Edit** existing test files — remove/update CLAIM_TILE tests, Wall/Floor tests
- **Create** new test files for shape placement, worker gather, territory income

**Test categories:**
1. **Shape data:** All 11 shapes have valid cells. Rotations are correct. Rotation count matches expectations.
2. **Shape placement validation:** Rejects invalid shapeId, out-of-bounds, water/rock, enemy territory, non-adjacent, insufficient resources. Accepts valid placements.
3. **Shape placement effects:** Tiles claimed correctly, shapeHP set, score incremented, resources deducted.
4. **Worker spawn:** Player gets 1 worker at HQ. Worker has correct fields (owner, trust, command, type).
5. **Worker gather:** Worker moves to resource tiles, gathers correctly, stockpile increases.
6. **Territory income:** Passive income flows at correct interval. Only open tiles generate income. Depleted tiles don't.
7. **Removal verification:** CLAIM_TILE message rejected. Wall/Floor can't be crafted or placed.
8. **Integration:** Full flow — join → place shape → worker gathers → territory income → place more shapes.

**Definition of done:** 240+ tests passing (baseline was 240). All new features covered. All removed features verified gone.

---

### Dependency Graph

```
B1 (Shape Data)
├── B2 (Shape Placement Handler)
│   ├── B3 (Remove CLAIM_TILE)
│   ├── B4 (Remove Wall/Floor)
│   ├── B8 (Client Shape UI)
│   └── B9 (Client Rendering)
├── B5 (Worker Spawn)
│   └── B6 (Worker Gather AI)
└── (none)

B7 (Territory Income) — independent, can run in parallel

B10 (Tests) — depends on B1–B9
```

**Critical path:** B1 → B2 → B8 (shape data → server handler → client UI)
**Parallel track 1:** B5 → B6 (worker pawn, can start after B1)
**Parallel track 2:** B7 (territory income, fully independent)
**Cleanup track:** B3 + B4 (after B2 confirms shapes work)

### Assignment Summary

| Item | Assignee | Scope | Est. Lines |
|------|----------|-------|------------|
| B1 | Pemulis | S | ~70 |
| B2 | Pemulis | M | ~90 |
| B3 | Pemulis | S | ~30 (removed) |
| B4 | Pemulis | M | ~40 (removed/modified) |
| B5 | Pemulis | S | ~35 |
| B6 | Pemulis | M | ~70 |
| B7 | Pemulis | S | ~25 |
| B8 | Gately | L | ~130 |
| B9 | Gately | M | ~60 |
| B10 | Steeply | L | ~150 |

**Pemulis total:** ~360 lines (B1–B7, server+shared)
**Gately total:** ~190 lines (B8–B9, client)
**Steeply total:** ~150 lines (B10, tests)

---

## Design Decisions Summary

| ID | Decision | Rationale |
|----|----------|-----------|
| F1 | Shape cells block movement (wall-like) | Unifies territory expansion + defense into one action. Creates spatial puzzle (perimeter vs interior). |
| F2 | shapeHP on TileState, not StructureState | Hundreds of shape cells per player. TileState field is O(1) lookup, minimal sync overhead. |
| F3 | 11 shapes (mono through tetrominoes) | Full Tetris feel with gap-filling options. No pentominoes (too large for 64×64). |
| F4 | 2 wood per cell cost | Higher than old 1-wood claim cost because shapes also create walls. Balanced against 10 starting wood + worker income. |
| F5 | Worker is a CreatureState, not a new schema | Reuses all existing creature infrastructure (AI ticks, rendering, pack size, commands). Zero schema additions. |
| F6 | Worker doesn't drain hunger | Workers are a game mechanic, not a survival challenge. Removing hunger frees the player from feeding busywork. |
| F7 | Territory income (passive) + worker income (active) | Dual income prevents softlock. Passive = baseline floor. Worker = active multiplier. Territory size matters for both. |
| F8 | Shape blocks indestructible for MVP | No damage system targets them yet. HP field is set for future wave combat. Simplifies MVP scope. |
| F9 | Starting 3×3 remains open territory | Worker needs walkable space. Structures need open tiles. First shapes attach to this area. |
| F10 | CLAIM_TILE fully removed, not deprecated | Clean break. Shapes are the sole expansion path. No legacy code path to maintain. |

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Players wall themselves in with shapes | Medium | Monomino (1-cell) shapes can fill individual gaps. UX: ghost preview shows blocked movement. Future: "demolish shape block" action. |
| Worker pathfinding fails in complex base layouts | Low | Greedy movement is imperfect but sufficient for MVP. Worker skips blocked paths and picks alternate targets. Full A* deferred. |
| Shape placement UX feels clunky on first try | Medium | Ghost preview + rotation feedback + clear invalid-placement indicators. Iterate based on playtesting. |
| Large territory = too much passive income | Low | Tunable via TERRITORY_INCOME.INTERVAL_TICKS. Tiles deplete naturally (self-balancing). Can add per-player cap later. |
| Test suite breakage from Wall/Floor removal | High | B3+B4 (removal) happen AFTER B2 (new system works). Update tests incrementally. Run full suite after each item. |

---

*"Place shapes, claim ground, let your workers do the rest." — The core loop in one sentence.*
