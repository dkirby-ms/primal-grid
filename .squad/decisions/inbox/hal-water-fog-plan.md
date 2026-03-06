# Implementation Plan: Issues #15 & #16 — Water Variants & Fog of War

**Date:** 2026-03-07  
**By:** Hal (Lead)  
**Branch:** `feature/water-and-fog` (active)  
**Status:** DECISION — Detailed breakdown for execution  
**Map Size:** 128×128 (16,384 tiles)

---

## Executive Summary

Two high-impact features will ship in sequence to maximize parallelization and minimize merge conflicts:

1. **#15 — Shallow/Deep Water Variants** (1.5 days): Split `Water` TileType into traversable shallow vs. impassable deep variants. Map generation distinguishes water interior from edges. Client renders distinct visuals.

2. **#16 — Fog of War** (2.5 days): Per-player visibility tracking (unexplored/explored/visible states). Server computes sight from territory + builder radius each tick. Client renders fog overlay on non-visible tiles.

**Why this order:** Water variants complete first (lower complexity, isolated to map generation + rendering). Fog layers on top as final visual polish. Both teams (Pemulis + Gately) work in parallel on their domains within each issue.

---

## Issue #15: Shallow/Deep Water Variants

### Scope Definition

**What ships:**
- Water biome split into `ShallowWater` (traversable with movement penalty) and `DeepWater` (impassable)
- Map generation: shallow at water edges, deep in interior clusters
- Client rendering: distinct blue shades (light blue = shallow, dark blue = deep)
- **NOT shipped:** Movement penalty gameplay (deferred to Phase 2)

**What stays unchanged:**
- Creature AI avoidance of water (both types are non-walkable except for movement penalty phase)
- Territory claiming rules (no buildings on water)
- Resource nodes (water has no resources)

### File-by-File Changes

#### `shared/src/types.ts` (Pemulis)
```typescript
// ADD to TileType enum:
export enum TileType {
  Grassland,
  Forest,
  Swamp,
  Desert,
  Highland,
  ShallowWater,  // NEW
  DeepWater,     // NEW
  Rock,
  Sand,
  // OLD Water enum value REMOVED
}
```

**Why:** Clean enum. No deprecation dance—Water becomes two concrete types. Client code uses exact types, no guessing.

#### `shared/src/constants.ts` (Pemulis)
```typescript
// ADD new section:
export const WATER_GENERATION = {
  /** Noise threshold for shallow water (edge of bodies). */
  SHALLOW_THRESHOLD: 0.35,
  /** Noise threshold for deep water (interior). */
  DEEP_THRESHOLD: 0.20,
  /** Radius from water edge to consider "shallow". */
  SHALLOW_RADIUS: 2,
} as const;
```

**Rationale:** Centralize thresholds. Allow tuning without code changes. `SHALLOW_RADIUS` lets us define "shallow = within 2 tiles of biome edge."

#### `server/src/rooms/mapGenerator.ts` (Pemulis)
**Changes:**
1. **Update biome selection logic** in `generateBiome()` function:
   - After moisture/elevation noise, check if tile is water
   - If water: measure distance to non-water neighbor tiles
   - If distance ≤ `SHALLOW_RADIUS`: assign `ShallowWater`
   - Else: assign `DeepWater`

2. **Add helper:** `distanceToNonWaterEdge(x, y)` using BFS or simple 2-neighbor scan

3. **Sample edge cases** in tests:
   - Single water tile (should be shallow)
   - Isolated pond (outer ring shallow, inner deep)
   - Lake against map edge (shallow outside, deep center)

**Code outline:**
```typescript
// In generateBiome():
const baseType = selectBiomeFromNoise(elevation, moisture);
if (baseType === TileType.Water) {
  const distToEdge = distanceToNonWaterEdge(x, y, tiles, mapWidth);
  return distToEdge <= WATER_GENERATION.SHALLOW_RADIUS 
    ? TileType.ShallowWater 
    : TileType.DeepWater;
}
return baseType;
```

**Performance:** BFS is O(n) once per map; acceptable at 128×128 (16K tiles). Cache results if needed.

#### `server/src/rooms/creatureAI.ts` (Pemulis — minimal changes)
```typescript
// In isTileOpenForCreature():
// BEFORE:
if (tile.type === TileType.Water) return false;

// AFTER:
if (tile.type === TileType.ShallowWater || tile.type === TileType.DeepWater) {
  return false;
}

// Or use helper:
if (isWaterTile(tile.type)) return false;
```

**Add helper in constants or creatureAI.ts:**
```typescript
export function isWaterTile(tileType: TileType): boolean {
  return tileType === TileType.ShallowWater || tileType === TileType.DeepWater;
}
```

**Rationale:** Creature AI logic unchanged—both water types are impassable (for now). Helper reduces duplication.

#### `client/src/renderer/GridRenderer.ts` (Gately)
**Changes:**
1. **Update color/sprite map:**
   ```typescript
   const TILE_COLORS = {
     [TileType.Grassland]: 0x90EE90,
     [TileType.Forest]: 0x228B22,
     [TileType.ShallowWater]: 0x87CEEB,  // Light blue
     [TileType.DeepWater]: 0x00008B,    // Dark blue
     [TileType.Rock]: 0x808080,
     [TileType.Sand]: 0xF4A460,
     // ... others
   };
   ```

2. **Render tile** in `renderTile()` or `drawTile()`:
   ```typescript
   const color = TILE_COLORS[tile.type] ?? 0xCCCCCC;
   graphics.beginFill(color);
   graphics.drawRect(x, y, tileSize, tileSize);
   graphics.endFill();
   ```

**No new logic needed** — just color map. Existing render loop handles both water types identically.

#### `server/src/rooms/GameRoom.ts` (Pemulis — reference only)
**No changes.** Existing tile initialization loops work unchanged. Schema `TileState.type` can hold any TileType value.

#### `server/src/rooms/GameState.ts` (Pemulis — reference only)
**No schema changes.** TileState already has `type: TileType` field. Colyseus will auto-sync new enum values.

### Testing (Steeply)

#### New tests in `server/src/__tests__/mapGenerator.test.ts`:

```typescript
describe("Water depth variants", () => {
  it("generates shallow water at edges of bodies", () => {
    const room = createRoomWithMap(12345);
    const tiles = room.state.tiles;
    
    // Find all shallow water tiles
    const shallowTiles = tiles.filter(t => t.type === TileType.ShallowWater);
    
    // Verify each shallow tile has ≤1 non-water neighbor
    // (or measure distance, ensure it's ≤ SHALLOW_RADIUS)
  });

  it("generates deep water in interior of large bodies", () => {
    const room = createRoomWithMap(12345);
    const tiles = room.state.tiles;
    
    // Find largest water cluster
    // Verify interior tiles are DeepWater
    // Verify ratio: ~30% shallow, ~20% deep total
  });

  it("handles edge cases", () => {
    // Single isolated water tile → shallow
    // Water cluster against map boundary → shallow on boundary, deep interior
  });
});
```

#### Validation in client tests (Gately):
- Verify `TILE_COLORS[TileType.ShallowWater]` exists and is distinct from `DeepWater`
- Render test: draw small map, verify color output

#### Integration test (Steeply):
```typescript
it("water variants render without crashing", () => {
  const room = createRoomWithMap(12345);
  const grid = new GridRenderer(room.state);
  grid.render(); // Should not throw
  expect(grid.container.children.length).toBeGreaterThan(0);
});
```

### Acceptance Criteria

- ✅ `TileType` enum has `ShallowWater` and `DeepWater`, not `Water`
- ✅ Map generation produces ~30% shallow, ~20% deep (tuned via constants)
- ✅ Client renders both with visually distinct colors
- ✅ Creatures correctly avoid both water types (no new behavior)
- ✅ All 128×128 maps generate in <100ms (no perf regression)
- ✅ Tests: ≥10 new assertions covering water distribution and rendering
- ✅ Code review passed, no linting errors

### Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Water generation creates isolated single tiles (looks weird) | Visual glitch | Steeply validates water connectivity; add smoothing pass if needed |
| Deep water threshold too aggressive (no shallow zones) | Breaks gameplay intent | Tune `SHALLOW_THRESHOLD` and `SHALLOW_RADIUS` in constants; sample 5 maps |
| Client code still references old `TileType.Water` | Build breaks | Pre-commit: run `npm run build && npm run lint` to catch |
| Performance: edge-detection BFS too slow | Game startup hangs | Cache results; measure <100ms; revert to simpler heuristic if needed |

---

## Issue #16: Fog of War

### Scope Definition

**What ships:**
- Per-player visibility tracking: unexplored (black), explored (greyed), visible (full color)
- Server computes visible tiles each tick: from player territory + builder sight radius
- Client renders fog overlay on unexplored/non-visible tiles
- State sync filters data: only send visible + border tiles to reduce bandwidth
- **NOT shipped:** Minimap, scout units with extended sight, fog dynamics/trails

**What stays unchanged:**
- Game logic (creatures, resources, buildings) — unaffected by fog
- Message protocol (no new messages)
- Rendering of creatures/structures (only add fog layer on top)

### File-by-File Changes

#### `shared/src/types.ts` (Pemulis)

```typescript
// ADD new enum:
export enum VisibilityState {
  Unexplored = 0,  // Never seen
  Explored = 1,    // Seen before, not visible now
  Visible = 2,     // Visible this tick
}

// ADD to ITileState interface:
export interface ITileState {
  // ... existing fields ...
  /** Per-player visibility: bitmask (1 bit per player, up to 16 players) or Map<playerID, VisibilityState>. */
  visibility?: Record<string, number>; // playerID → VisibilityState enum value
}
```

**Design rationale:** 
- `Record<playerID, number>` avoids creating new schema per player. Pemulis will use `MapSchema<string, number>` in GameState.
- Visibility is computed server-side, not synced per-tile unless needed.
- Alternative: global `visibilityMaps: Map<playerID, Uint8Array>` in GameState (less granular, simpler to sync).

#### `server/src/rooms/GameState.ts` (Pemulis)

```typescript
// ADD to GameState class:
import { MapSchema, type } from "colyseus";

@type({ map: "string" }) // playerID → serialized visibility data (base64 or JSON)
playerVisibilityMaps = new MapSchema<string>();

// OR more detailed:
@type({ map: PlayerVisibilityState })
playerVisibility = new MapSchema<PlayerVisibilityState>();

// Where PlayerVisibilityState:
export class PlayerVisibilityState extends Schema {
  @type([VisibilityState]) // ArraySchema of per-tile visibility
  tileVisibility = new ArraySchema<number>();
}
```

**Pemulis decision:** Use global `playerVisibilityMaps` (simpler schema, easier to sync incrementally).

#### `server/src/rooms/GameRoom.ts` (Pemulis)

**Add new tick function:**

```typescript
tickVisibility(): void {
  const { state } = this;
  
  // For each player, recompute visible tiles
  for (const [playerID, player] of state.players) {
    const visibleTiles = new Set<number>();
    
    // 1. Add all owned tiles
    for (let i = 0; i < state.tiles.length; i++) {
      if (state.tiles[i].ownerID === playerID) {
        visibleTiles.add(i);
      }
    }
    
    // 2. Add radius around each builder (pawn)
    const SIGHT_RADIUS = 3; // Tune in constants
    for (const creature of state.creatures.values()) {
      if (creature.pawnType === "builder" && creature.ownerID === playerID) {
        const { x, y } = creature;
        for (let dx = -SIGHT_RADIUS; dx <= SIGHT_RADIUS; dx++) {
          for (let dy = -SIGHT_RADIUS; dy <= SIGHT_RADIUS; dy++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < state.mapWidth && ny >= 0 && ny < state.mapHeight) {
              const idx = ny * state.mapWidth + nx;
              visibleTiles.add(idx);
            }
          }
        }
      }
    }
    
    // 3. Update visibility map for this player
    // Mark newly visible as "Visible"
    // Mark previously visible but not now as "Explored"
    // Mark never-seen as "Unexplored"
    const newVisMap = new Uint8Array(state.tiles.length);
    for (let i = 0; i < state.tiles.length; i++) {
      const wasExplored = /* check previous state */;
      if (visibleTiles.has(i)) {
        newVisMap[i] = VisibilityState.Visible;
      } else if (wasExplored) {
        newVisMap[i] = VisibilityState.Explored;
      } else {
        newVisMap[i] = VisibilityState.Unexplored;
      }
    }
    
    // Store in state for sync
    state.playerVisibilityMaps.set(playerID, base64Encode(newVisMap));
  }
}
```

**Call in game loop** (in `onCreate()` tick handler):
```typescript
this.tickVisibility(); // After creature AI, before broadcast
```

**Optimization (for later):** Incremental updates (only send changed tiles, not full map each tick).

#### `server/src/rooms/GameRoom.ts` — Message Filtering (Pemulis)

**Optional (Phase 1 can skip this; full state is acceptable):**

```typescript
// Before sending state to client, filter tiles based on visibility
onMessage(client, message, payload) {
  // ... existing handlers ...
}

// Override state broadcasting:
private broadcastToPlayer(playerID: string) {
  // Create filtered state with only visible/explored tiles
  // Send to that player only
}
```

**Note:** Colyseus has built-in filtering via `filterData()`. Pemulis can defer incremental filtering to Phase 2 if bandwidth is acceptable.

#### `client/src/renderer/GridRenderer.ts` (Gately)

**Changes:**

1. **Store visibility state locally:**
   ```typescript
   private playerVisibilityMap: Uint8Array = new Uint8Array(16384); // 128×128
   
   updateVisibility(visibilityData: Uint8Array) {
     this.playerVisibilityMap = visibilityData;
   }
   ```

2. **Update render logic:**
   ```typescript
   renderTile(tile: ITileState, index: number) {
     const visibility = this.playerVisibilityMap[index] ?? VisibilityState.Unexplored;
     
     // Draw base terrain
     const baseColor = TILE_COLORS[tile.type];
     graphics.beginFill(baseColor);
     graphics.drawRect(x, y, TILE_SIZE, TILE_SIZE);
     graphics.endFill();
     
     // Draw fog overlay based on visibility
     if (visibility === VisibilityState.Unexplored) {
       // Black fog
       graphics.beginFill(0x000000, 0.8);
       graphics.drawRect(x, y, TILE_SIZE, TILE_SIZE);
       graphics.endFill();
     } else if (visibility === VisibilityState.Explored) {
       // Greyed/desaturated terrain
       graphics.beginFill(0x666666, 0.6); // Grey tint overlay
       graphics.drawRect(x, y, TILE_SIZE, TILE_SIZE);
       graphics.endFill();
     }
     // else Visible: draw normally, no overlay
   }
   ```

3. **Hook to state updates:**
   ```typescript
   this.room.state.playerVisibilityMaps.onAdd((visibility, playerID) => {
     if (playerID === this.room.sessionId) {
       const data = base64Decode(visibility);
       this.updateVisibility(data);
     }
   });
   ```

**Rendering order:** Base tile → Creatures/structures → Fog overlay. Fog is **always on top**.

#### `client/src/network.ts` or connection handler (Gately)

**Connect visibility sync to room listener:**
```typescript
room.state.playerVisibilityMaps.onChange = (visibility, playerID) => {
  if (playerID === room.sessionId) {
    const data = base64Decode(visibility);
    gridRenderer.updateVisibility(data);
  }
};
```

#### `shared/src/constants.ts` (Pemulis)

```typescript
export const VISIBILITY = {
  /** Sight radius around builder creatures. */
  BUILDER_SIGHT_RADIUS: 3,
  /** Unexplored tile fog opacity (0-1). */
  UNEXPLORED_FOG_ALPHA: 0.85,
  /** Explored tile desaturation amount (0-1). */
  EXPLORED_FOG_ALPHA: 0.5,
} as const;
```

**Rationale:** Centralize tuning. Easy to adjust balance without code changes.

### Testing (Steeply)

#### New tests in `server/src/__tests__/visibility.test.ts`:

```typescript
describe("Visibility system", () => {
  it("marks player's own territory as visible", () => {
    const room = createRoomWithMap();
    const player = new PlayerState();
    player.id = "p1";
    room.state.players.set("p1", player);
    
    // Mark some tiles as owned by p1
    room.state.getTile(10, 10).ownerID = "p1";
    room.state.getTile(11, 10).ownerID = "p1";
    
    room.tickVisibility();
    
    const vis = room.state.playerVisibilityMaps.get("p1");
    expect(vis).toBeDefined();
    // Decode and verify owned tiles are Visible
  });

  it("marks builder's sight radius as visible", () => {
    const room = createRoomWithMap();
    const player = new PlayerState();
    player.id = "p1";
    room.state.players.set("p1", player);
    
    const builder = new CreatureState();
    builder.id = "builder-1";
    builder.ownerID = "p1";
    builder.pawnType = "builder";
    builder.x = 32;
    builder.y = 32;
    room.state.creatures.set("builder-1", builder);
    
    room.tickVisibility();
    
    const vis = room.state.playerVisibilityMaps.get("p1");
    // Verify tiles within radius 3 of (32, 32) are Visible
  });

  it("retains explored state when visibility moves", () => {
    const room = createRoomWithMap();
    // ... setup builder at (32, 32) ...
    room.tickVisibility(); // Mark tiles around (32, 32) as visible
    
    // Move builder to (50, 50)
    builder.x = 50;
    builder.y = 50;
    room.tickVisibility();
    
    const vis = room.state.playerVisibilityMaps.get("p1");
    // Verify: tiles around old position are Explored, new position are Visible
  });

  it("unexplored tiles remain unexplored for other players", () => {
    const room = createRoomWithMap();
    // Setup p1 with territory, p2 with separate territory
    room.tickVisibility();
    
    const visP1 = base64Decode(room.state.playerVisibilityMaps.get("p1"));
    const visP2 = base64Decode(room.state.playerVisibilityMaps.get("p2"));
    
    // p1 can see their tiles, p2 sees them as unexplored
  });
});
```

#### Integration test (Gately + Steeply):
```typescript
it("fog overlay renders for unexplored tiles", () => {
  const room = createRoomWithMap();
  const grid = new GridRenderer(room.state);
  
  const visibility = new Uint8Array(16384);
  visibility[0] = VisibilityState.Unexplored;
  visibility[1] = VisibilityState.Explored;
  visibility[2] = VisibilityState.Visible;
  
  grid.updateVisibility(visibility);
  grid.render();
  
  // Verify rendering doesn't crash; visual output TBD (manual QA)
});
```

### Acceptance Criteria

- ✅ `VisibilityState` enum exists with three states
- ✅ Server computes per-player visibility each tick
- ✅ Visible tiles = owned territory + builder sight radius (≥3 tiles)
- ✅ Explored state persists when visibility moves
- ✅ Client receives only visible/border tiles (or full state if unfiltered)
- ✅ Fog overlay renders: black on unexplored, grey on explored, clear on visible
- ✅ No performance regression at 128×128 (tick <16ms, render <16ms)
- ✅ Multiplayer: each player sees only their own visibility
- ✅ Tests: ≥15 new assertions covering visibility logic
- ✅ Code review passed, no linting errors

### Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Visibility computation is O(players × visible_tiles) each tick | Tick time balloons | Optimize: cache visible tiles, only recompute on creature/territory change; target <5ms per player |
| Fog rendering adds 3 render calls per tile (base + creatures + fog) | Frame time > 60 FPS | Use single overlay texture instead of per-tile; batch fog rendering |
| Players see different maps → network desync | Contradictory state | Server-authoritative: all visibility computed server-side, never client-predicted |
| Bandwidth bloat: syncing 16K visibility values per player per tick | Network congestion | Incremental updates: only sync changed tiles; use RLE or bitmask compression |
| Explored state explosions: all tiles explored after one pass | Trivializes fog | Tuning: increase sight radius or make builders rarer; add shroud mechanics later |

---

## Parallelization Strategy

### Phase 1: Server & Constants (Parallel)
- **Pemulis:** Types + constants + map generation + visibility tick logic
- **Gately:** Idle (no client work yet)
- **Duration:** 0.75 days

### Phase 2: Rendering (Parallel to Phase 1.5)
- **Pemulis:** Testing & refinement of visibility
- **Gately:** Fog rendering + client state hooks
- **Duration:** 1 day

### Critical Path
```
Pemulis types.ts (30 min)
  ↓ (depends on)
Pemulis mapGenerator.ts (2 hours) + Gately GridRenderer water colors (1.5 hours) — PARALLEL
  ↓ (depends on)
Testing + integration
  ↓ (depends on)
Pemulis types.ts (30 min) for VisibilityState
  ↓
Pemulis GameRoom.tickVisibility() (2 hours) + Gately GridRenderer fog (2 hours) — PARALLEL
  ↓
Testing + integration
  ↓
Final QA
```

**Total:** ~5.5 days (Pemulis ~4 days, Gately ~2.5 days, staggered start)

---

## File Conflict Matrix

| File | #15 | #16 | Risk | Resolution |
|------|-----|-----|------|-----------|
| `types.ts` | ✓ (TileType) | ✓ (VisibilityState) | MODERATE | Both are enum additions; no merge conflict if in separate blocks |
| `constants.ts` | ✓ (WATER_GENERATION) | ✓ (VISIBILITY) | NONE | Different sections, no conflict |
| `mapGenerator.ts` | ✓ | — | NONE | #15 only |
| `GameState.ts` | — | ✓ (playerVisibilityMaps) | LOW | Additive; new field doesn't conflict |
| `GameRoom.ts` | — | ✓ (tickVisibility method + loop call) | LOW | New method, easy merge |
| `creatureAI.ts` | ✓ (isWaterTile helper) | — | NONE | #15 only |
| `GridRenderer.ts` | ✓ (water colors) | ✓ (fog overlay) | HIGH | **Serialize:** #15 first, #16 rebases after merge |

**Conflict resolution:** #15 merges first; #16 rebases on main after #15 is integrated. GridRenderer changes stack cleanly (water colors → fog overlay).

---

## Agent Assignments

| Agent | #15 Scope | #16 Scope |
|-------|-----------|-----------|
| **Pemulis** | types (TileType), constants (WATER_GENERATION), mapGenerator (depth detection), creatureAI (helper), testing | types (VisibilityState), GameState (schema), GameRoom (tick + loop), constants (VISIBILITY), testing |
| **Gately** | GridRenderer (water color map, no new logic), testing | GridRenderer (fog overlay + visibility updates), network hook, testing |
| **Steeply** | Map gen validation (shallow/deep ratio), edge cases | Visibility logic tests (territory visible, sight radius, explored persistence), integration |

**Estimated effort:**
- **Pemulis:** #15 (1 day), #16 (1.5 days) = 2.5 days total
- **Gately:** #15 (0.5 day), #16 (1 day) = 1.5 days total
- **Steeply:** #15 (0.5 day), #16 (0.5 day) = 1 day total

---

## Scope Cuts (Deferred)

### From #15 — Water Variants:
- **Movement penalty in shallow water** → Phase 2 (requires creature AI logic overhaul)
- **Marsh biome on shallow water edges** → Phase 3 (new biome type)
- **Fishing mechanic** (water-exclusive resources) → Phase 4 (new economy)
- **Water animation** (wave sprites) → Phase 5 (visual polish)

### From #16 — Fog of War:
- **Incremental visibility updates** → Phase 2 (bandwidth optimization; v1 sends full map)
- **Scout units with extended sight** → Phase 3 (new unit type)
- **Minimap showing explored regions** → Phase 4 (UI feature)
- **Shroud mechanics** (explored tiles fade over time) → Phase 5 (game mechanic)
- **Multi-tier sight radii** (HQ sees further than builders) → Phase 6 (tuning)

---

## Definition of Done

### Issue #15 Completion:
- ✅ PR created with water variant code
- ✅ All water tiles correctly typed (no old `Water` enum references)
- ✅ Map generation produces shallow/deep split (tuned ratios)
- ✅ Client renders distinct colors (light vs. dark blue)
- ✅ Creatures avoid both water types (behavior unchanged)
- ✅ Steeply: 5+ new tests, all passing
- ✅ Code review signed off
- ✅ Linting clean (`npm run lint` passes)
- ✅ Pemulis: performance validated (<100ms map gen)

### Issue #16 Completion:
- ✅ PR created with fog of war code
- ✅ VisibilityState enum defined
- ✅ Server computes visibility each tick
- ✅ Client renders fog overlay (black/grey/clear)
- ✅ Multiplayer: each player sees only their visibility
- ✅ Steeply: 8+ new tests covering visibility logic, all passing
- ✅ Code review signed off
- ✅ Linting clean
- ✅ Performance validated: tick <16ms, render <16ms at 128×128

### Both Issues:
- ✅ No merge conflicts on merged files
- ✅ End-to-end test: full map generates, creatures spawn, players see correct fog
- ✅ All 273 baseline tests still passing + ~13 new tests
- ✅ Ready to merge to main

---

## Summary

| Aspect | #15 | #16 |
|--------|-----|-----|
| **Complexity** | MEDIUM | HIGH |
| **Duration** | 1.5 days | 2.5 days |
| **Files touched** | 5 | 5 |
| **Schema changes** | TileType enum | PlayerVisibilityMaps field |
| **Rendering changes** | Color map only | Overlay logic + visibility sync |
| **Key risk** | Water distribution looks wrong | Visibility computation is slow |
| **Deferred to Phase 2+** | Movement penalties, fishing | Incremental sync, minimap |
| **Parallelization** | Server + client simultaneous (after types finalized) | Server + client simultaneous (after types finalized) |

---

## Next Steps

1. **Day 1 AM:** Pemulis starts #15 types.ts + constants.ts. Gately prepares GridRenderer baseline.
2. **Day 1 PM:** Pemulis finishes mapGenerator.ts. Gately implements water color rendering. Steeply writes water gen tests.
3. **Day 2:** Full #15 testing, Steeply validation. PR review & merge.
4. **Day 3 AM:** After #15 merges, Pemulis starts #16 types.ts + GameState.ts.
5. **Day 3 PM:** Pemulis implements tickVisibility(). Gately prepares fog rendering.
6. **Day 4:** Pemulis finishes GameRoom loop + filtering. Gately finishes fog + network hooks. Steeply writes visibility tests.
7. **Day 5:** Full #16 testing, integration, PR review & merge.

---

**Approved by:** Hal (Lead)  
**For execution:** Pemulis (Systems), Gately (Game Dev), Steeply (Test)
