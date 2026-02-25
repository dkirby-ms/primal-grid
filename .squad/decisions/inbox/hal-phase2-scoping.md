# Phase 2: Core Simulation — Scoping & Breakdown

**Date:** 2026-02-25  
**Author:** Hal (Lead)  
**Status:** Proposed  
**Goal:** Minimum viable "living world" — creatures roam, ecosystems function, player survives.

---

## Current State (Post Phase 1)

What exists today:
- 32×32 grid with 4 tile types (Grass, Water, Rock, Sand) — hardcoded placement
- Player movement (directional, server-validated), spawn on walkable tiles
- Tick-based simulation at 4 ticks/sec
- Client renders grid + players via PixiJS v8, camera with WASD/zoom
- GATHER message type stubbed but unimplemented
- Colyseus 0.17 (ESM, @colyseus/schema v4), state sync working

What's missing for a living world:
- No procedural generation (map is deterministic/handcrafted)
- No creatures
- No resources beyond tile types
- No player needs (hunger, health)
- No AI of any kind

---

## Scope Fence (Phase 2)

**In scope:** Biomes, procedural maps, creatures with FSM AI, basic resources, gathering, player hunger/health, creature food chain.

**Explicitly deferred:**
- Taming, breeding, pack AI, personality → Phase 4
- Crafting, buildings, farming, inventory UI → Phase 3
- Weather, disasters, migration → Phase 5
- Tech tree, automation → Phase 6
- Combat system (player vs creature) → defer; creatures flee or ignore player for now
- Creature death loot / drops → Phase 3 (ties to inventory)
- Day/night cycle → Phase 5
- Viewport-based chunking → defer until map size exceeds 64×64

---

## Work Items (Ordered)

### 2.1 — Biome Types & Procedural Map Generation

**Delivers:** Visually distinct, procedurally generated world with 6 biome tile types.

**Details:**
- Expand `TileType` enum: `Grass` → `Grassland`, add `Forest`, `Swamp`, `Desert`, `Highland`. Keep `Water`, `Rock`, `Sand`.
- Add noise-based map generation (simplex noise). Two layers: elevation (water/highland/rock) + moisture (forest/swamp/desert/grassland).
- Map size stays 32×32 for now but generator should accept arbitrary size.
- Each tile gains optional properties: `fertility` (0–1), `moisture` (0–1). Store as schema fields on TileState.
- Client: new tile colors per biome. No sprites yet — colored rectangles are fine.
- Seed-based generation for reproducibility (seed stored in GameState).

**Owner:** Pemulis (server generator + shared types), Gately (client tile colors)  
**Dependencies:** None  
**Arch decisions:** Use a lightweight noise library (`open-simplex-noise` or inline implementation — no heavy deps). Noise params go in `shared/src/constants.ts`.

---

### 2.2 — Resource System & Gathering

**Delivers:** Tiles contain harvestable resources. Player can gather them.

**Details:**
- Resource types in shared: `Wood`, `Stone`, `Fiber`, `Berries` (enum in `shared/src/types.ts`).
- TileState gains `resourceType` (nullable) and `resourceAmount` (number). Biome determines what spawns: Forest→Wood, Grassland→Fiber+Berries, Highland→Stone, etc.
- Implement GATHER handler in GameRoom: player must be adjacent or on tile, resource decrements, player gains resource.
- PlayerState gains a simple resource inventory: `MapSchema<number>` keyed by resource type string.
- Resources regenerate slowly (configurable ticks per regen, per biome fertility).
- No crafting — just accumulation. Inventory display is Phase 3.

**Owner:** Pemulis  
**Dependencies:** 2.1 (biomes determine resource distribution)  
**Arch decisions:** Keep inventory flat (`{ wood: 5, stone: 3 }`). No item stacks, no slots. JSON creature/resource configs live in `shared/src/data/`.

---

### 2.3 — Player Survival (Hunger & Health)

**Delivers:** Player has hunger and health. Hunger depletes over time. Eating restores it. Health drops at zero hunger.

**Details:**
- PlayerState gains: `hunger` (0–100, starts 100), `health` (0–100, starts 100).
- Hunger decreases by configurable amount per N ticks (e.g., 1 per 20 ticks = ~5 seconds).
- New message: `EAT` — player consumes Berries from inventory, restores hunger.
- When hunger hits 0, health decreases per tick. When health hits 0... nothing yet (respawn logic deferred).
- Client: simple HUD overlay showing hunger/health bars. Minimal — two colored bars, no art.

**Owner:** Pemulis (server mechanics), Gately (HUD bars)  
**Dependencies:** 2.2 (need Berries resource to eat)  
**Arch decisions:** All survival constants in `shared/src/constants.ts`. No death/respawn yet — health floors at 1 or player becomes immobile. Keep it simple.

---

### 2.4 — Creature Schema & Spawning

**Delivers:** Creatures exist on the map. They render on client. They don't do anything yet.

**Details:**
- New schema class: `CreatureState` — `id`, `creatureType`, `x`, `y`, `health`, `hunger`, `currentState` (FSM state string).
- GameState gains `creatures: MapSchema<CreatureState>`.
- Creature type definitions (data-driven JSON in `shared/src/data/creatures.json`):
  - `Herbivore` (e.g., Parasaurolophus): spawns in Grassland/Forest, eats vegetation.
  - `Carnivore` (e.g., Raptor): spawns in Forest/Highland, hunts herbivores.
  - Start with exactly 2 creature types. More is scope creep.
- Spawn N creatures at room creation based on biome suitability. Cap at ~20 total for 32×32 map.
- Client: render creatures as colored shapes (circle for herbivore, triangle for carnivore). No sprites.

**Owner:** Pemulis (schema + spawning), Gately (creature rendering)  
**Dependencies:** 2.1 (biome-based spawn rules)  
**Arch decisions:** Creature type config is JSON, not code. Schema uses string IDs. `creatureType` references the JSON key.

---

### 2.5 — Creature AI (Finite State Machine)

**Delivers:** Creatures move, eat, flee, and hunt. The world feels alive.

**Details:**
- FSM states: `Idle`, `Wander`, `Eat`, `Flee`, `Hunt`.
- Herbivore behavior: Wander randomly → when hungry, find nearest food tile and move toward it → Eat (restore hunger) → if carnivore nearby, Flee (move away).
- Carnivore behavior: Wander → when hungry, Hunt (find nearest herbivore, move toward it) → attack adjacent herbivore (damage its health) → Eat (restore hunger from kill).
- Creature hunger depletes over time (same model as player).
- Creature death: when health ≤ 0, remove from map. No drops yet.
- AI runs server-side in the tick loop. One creature AI step per tick. Creatures move max 1 tile per AI step.
- Detection radius: configurable per creature type (e.g., carnivore detects prey within 5 tiles).

**Owner:** Pemulis  
**Dependencies:** 2.4 (creatures exist), 2.1 (tile data for food sources)  
**Arch decisions:**
- FSM is a simple switch/map on `currentState`. No heavyweight framework.
- AI tick budget: process all creatures every N ticks (e.g., every 2 ticks = 2 AI steps/sec). Prevents lag on larger populations.
- Movement uses pathfinding? **No — not yet.** Manhattan-direction toward target (greedy). Pathfinding deferred to Phase 4 (pack AI). If blocked, skip turn.

---

### 2.6 — Ecosystem Integration & Demo Polish

**Delivers:** The full loop is visible — creatures graze, predators hunt, populations fluctuate, player gathers and eats to survive.

**Details:**
- Herbivore grazing depletes tile `resourceAmount` (Berries/Fiber on grassland). Resources regenerate.
- Carnivore kills reduce herbivore population. If all herbivores die, carnivores starve.
- Basic creature respawning: every M ticks, if population below threshold, spawn a new creature in a valid biome tile. Keeps the world alive.
- Client polish: creature state label or color tint to show current AI state (optional, Gately's call).
- Verify the full loop runs stable for 5+ minutes without crashes or population collapse.

**Owner:** Pemulis (systems), Gately (visual feedback), Steeply (test the loop)  
**Dependencies:** 2.1–2.5 all complete  

---

## Architecture Decisions (Phase 2)

| # | Decision | Rationale |
|---|----------|-----------|
| A1 | **Noise-based procedural generation** (simplex noise, 2-layer: elevation + moisture) | Simple, proven, seed-reproducible. No external tilemap editor needed. |
| A2 | **Creature AI is server-only FSM** (switch on state string) | Matches existing server-authoritative model. No client prediction for creatures. Simple to debug and extend. |
| A3 | **AI tick rate decoupled from game tick** (creatures update every 2 game ticks) | Prevents creature AI from dominating the tick budget. Scales with population. |
| A4 | **Data-driven creature/resource definitions** (JSON in `shared/src/data/`) | Aligns with decision #9 (no hardcoded gameplay data). Easy to add creature types later. |
| A5 | **No pathfinding yet** (greedy Manhattan movement) | A* is premature for 2 creature types on a 32×32 map. Defer to Phase 4. |
| A6 | **Flat inventory** (`MapSchema<number>` on PlayerState) | Simplest representation. No slots, no weight, no UI complexity. Phase 3 adds proper inventory. |
| A7 | **No player death** (health floors at 1, player becomes immobile) | Death/respawn needs UI, spawn point selection, penalty design. All deferred. |
| A8 | **Creature respawn via population threshold** (not breeding) | Breeding is Phase 4. Threshold respawn keeps demo alive without complexity. |

---

## Dependency Graph

```
2.1 Biomes & Map Gen
 ├──▶ 2.2 Resources & Gathering
 │     └──▶ 2.3 Player Survival (Hunger/Health)
 ├──▶ 2.4 Creature Schema & Spawning
 │     └──▶ 2.5 Creature AI (FSM)
 └──────────────────┘
           └──▶ 2.6 Ecosystem Integration
```

2.2 and 2.4 can run in parallel after 2.1. 2.3 and 2.5 can run in parallel after their respective parents. 2.6 is the integration pass.

---

## Definition of Done (Phase 2)

A player joins the game and sees:
- A procedurally generated map with distinct biome regions
- Herbivore creatures wandering and grazing in grasslands
- Carnivore creatures hunting herbivores in forests
- Resources on tiles that can be gathered
- A hunger bar that depletes, restored by eating berries
- A world that sustains itself for 5+ minutes without intervention

That's the minimum viable living world.
