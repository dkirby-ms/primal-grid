# Primal Grid — Game Design Document (v2)

> **Rimworld meets multiplayer arcade.** Colony survival with dinosaurs, indirect control, and territory warfare — in the browser.

**Genre:** Multiplayer Colony Builder • Tower Defense • Arcade RTS
**Platform:** Web (browser)
**Stack:** TypeScript, Colyseus (server), PixiJS (client), tile-based grid
**Perspective:** Top-down
**Players:** 2–4 per room (expandable)

---

## 1. Core Fantasy

You are a colony commander on a prehistoric frontier. You don't swing an axe or dodge raptors — you claim land, place structures, tame dinosaurs, and give orders. Your colony lives or dies by your decisions, not your reflexes. Other players are doing the same thing next door.

---

## 2. Core Loop

**Moment-to-moment, a player does this:**

1. **Claim** — Expand territory by placing claim markers on adjacent unclaimed tiles
2. **Build** — Place structures (walls, turrets, farms, workbenches) on tiles you own
3. **Command** — Assign tamed dinos to zones: gather here, patrol there, defend this
4. **Defend** — Wild creature waves and rival players threaten your borders
5. **Grow** — Unlock better structures and breed stronger dinos

```
CLAIM → BUILD → COMMAND → DEFEND → GROW → (repeat)
```

**Session length target:** 15–30 minutes per round. Fast enough to play a full game in a lunch break.

---

## 3. Systems

### 3.1 Territory

Territory is the core resource. Everything flows from it.

- **Claim tiles** by spending resources on a claim marker (cheap: 1 wood or 1 stone)
- Claims must be **adjacent to existing territory** (contiguous expansion)
- Each player starts with a **3×3 claimed area** around a randomly placed HQ structure
- You can only build on tiles you own
- Unclaimed tiles between players become **contested zones** — first to claim wins
- Losing your HQ = game over (or major penalty)
- Territory is visible: each player's tiles are tinted their color

**Constants (tunable):**
- Starting area: 3×3 (9 tiles)
- Claim cost: 1 wood per tile (increases with distance from HQ? — defer)
- Max territory: no hard cap (map-limited)

### 3.2 Building

Players place structures onto owned tiles. No avatar walks over and builds it — it's placed from an overhead view, Rimworld-style.

**Structure categories:**

| Category | Examples | Purpose |
|----------|----------|---------|
| **Walls** | Wood wall, stone wall | Block movement, protect interior |
| **Production** | Workbench, farm plot | Generate resources / items |
| **Defense** | Spike trap, arrow turret | Damage hostiles entering territory |
| **Utility** | Floor, road | Speed bonus, aesthetics |
| **HQ** | Headquarters (1 per player) | Spawn point, loss condition |

**Build rules:**
- One structure per tile
- Must be on an owned tile
- Costs resources from player stockpile
- Placement is instant (no build time for MVP; build queues deferred)
- Turrets auto-fire at hostile creatures/pawns entering range

### 3.3 Pawns (Dinosaurs)

Pawns are tamed dinosaurs. You don't move them directly — you assign them behaviors.

**Pawn commands (zone-based, indirect):**

| Command | Behavior |
|---------|----------|
| **Gather** | Pawn moves to a designated zone and collects resources, depositing at HQ |
| **Patrol** | Pawn walks a route between waypoints; attacks hostiles |
| **Guard** | Pawn stays near a structure; attacks anything hostile in range |
| **Idle** | Pawn wanders within your territory |

**Taming:** Same as current system — feed creatures to start trust. But instead of following the player avatar, tamed dinos become assignable pawns.

**Traits matter:** Docile dinos are better gatherers. Aggressive dinos are better guards. Speed affects patrol coverage. Breeding produces specialized dinos.

**Pawn limits:** 8 per player (existing `MAX_PACK_SIZE`). Expandable via structures (e.g., Dino Pen +2 capacity — deferred).

### 3.4 Resources

Simplified from current system. Four resources, all auto-gathered by pawns or produced by structures.

| Resource | Source | Use |
|----------|--------|-----|
| **Wood** | Forest tiles | Walls, structures, claims |
| **Stone** | Highland tiles | Walls, turrets, upgrades |
| **Fiber** | Grassland/Sand tiles | Traps, farms |
| **Berries** | Grassland tiles, farms | Feeding dinos, taming, breeding |

**Key change:** Players don't manually gather. Pawns gather from tiles in their assigned zone and deposit to the player's stockpile. Farms auto-produce. The player's job is allocation, not clicking.

**Player stockpile** is global (not positional). Resources don't need to be physically transported for MVP. (Logistics/hauling = deferred.)

### 3.5 Combat & Defense

Two threat types:

**1. Wild creature waves (PvE):**
- Every N ticks, a wave of wild creatures spawns at map edges and moves toward the nearest player territory
- Waves escalate in size and composition over time
- Creatures damage structures they reach, and fight pawns
- This is the tower defense core: build walls and turrets, position guard dinos

**2. Player conflict (PvP — optional/deferred for MVP):**
- Players can send pawns into unclaimed/enemy territory
- Pawns attack enemy structures and other pawns
- Territory can be captured by destroying the claim marker
- Full PvP is a Phase 3 feature; MVP focuses on PvE + territory race

**Combat mechanics:**
- Turrets deal damage per tick to hostiles in range (2-tile radius)
- Walls have HP; hostiles attack them to break through
- Pawns auto-fight hostiles in their zone (no micro)
- Creatures have existing health/hunger/damage stats — reuse these

### 3.6 Progression (Within a Round)

A single round has natural escalation:

| Phase | Time | What happens |
|-------|------|--------------|
| **Early** | 0–5 min | Claim land, tame first dino, gather resources |
| **Mid** | 5–15 min | Build defenses, breed dinos, expand territory |
| **Late** | 15–25 min | Large waves, territory clashes, optimized builds |
| **End** | 25–30 min | Round timer expires; largest territory wins (or last colony standing) |

**Win conditions (pick one per game mode):**
- **Territory race:** Most tiles claimed when timer ends
- **Survival:** Last colony standing (HQ intact)
- **Score:** Points for tiles + structures + dinos + waves survived

**No persistent progression between rounds for MVP.** Each round is a fresh start. (Meta-progression/unlocks = deferred.)

---

## 4. Multiplayer Model

**Room structure:** One Colyseus room = one game. 2–4 players on a shared 64×64 map (doubled from current 32×32).

**Player interaction model:**

| Interaction | Supported? |
|-------------|------------|
| Shared map, separate territories | ✅ Yes (core) |
| See other players' colonies | ✅ Yes (visible) |
| Race for unclaimed territory | ✅ Yes (core) |
| Trade resources | ❌ Deferred |
| Allied defense | ❌ Deferred |
| Direct PvP (attack enemy territory) | ⚠️ Phase 3 |
| Co-op vs. AI waves | ⚠️ Phase 2 |

**No player avatar on the map.** Each player is a disembodied commander. The camera shows the full map (or a viewport the player can pan). Players interact purely through the UI: click tile → place structure, select dino → assign command, click zone → designate area.

**Server authority:** All game logic remains server-authoritative. Client sends commands (place, claim, assign). Server validates and updates state. Colyseus syncs state to all clients.

**Joining mid-game:** Deferred. MVP = all players join at round start.

---

## 5. What We Keep

These existing systems survive the pivot with modification:

| System | Current State | How It Changes |
|--------|--------------|----------------|
| **Tile grid + biomes** | 32×32 procedural map with 7 biomes | Scale to 64×64. Add territory ownership per tile. Keep biome gen as-is. |
| **Creature types + AI FSM** | Herbivores/carnivores with idle/wander/eat/hunt states | Add `gather`, `patrol`, `guard` states for tamed dinos. Wild AI stays. |
| **Taming (trust/personality)** | Feed → gain trust → obedient at 70 | Keep mechanic. Remove adjacency-to-avatar requirement; use zone-based interaction. |
| **Breeding (traits/mutation)** | Pair same-type, trust≥70, berry cost, trait averaging | Keep as-is. This is a mid-game optimization loop. |
| **Structures (wall/floor/workbench/farm)** | Place adjacent to avatar, one per tile | Remove avatar adjacency. Place on any owned tile. Add turret type. |
| **Crafting/recipes** | 6 recipes, resource costs | Keep recipe system. Add new recipes (turret, claim marker, etc.) |
| **Resource types + regen** | Wood/stone/fiber/berries, biome-based regen | Keep. Resources gathered by pawns instead of player. |
| **Colyseus room + state sync** | GameRoom, GameState schema, tick-based sim | Keep architecture. Extend schema for territory. |
| **PixiJS rendering** | Grid/creature/player/structure renderers | Keep renderers. Replace PlayerRenderer with camera/UI. Add territory overlay. |

---

## 6. What We Cut

| System | Why |
|--------|-----|
| **Player avatar (x, y position)** | No direct character. Player is a commander, not an avatar. Remove `PlayerState.x/y`, movement handler, `PlayerRenderer`. |
| **Player movement (WASD/arrow)** | No avatar = no movement. Remove `MOVE` message handler. |
| **Manual gathering** | Pawns gather, not the player. Remove `GATHER` message handler (replaced by zone assignment). |
| **Manual eating** | No hunger/health for disembodied commander. Remove `EAT` handler, `hunger`/`health` from `PlayerState`. |
| **Player survival (hunger/health drain)** | Colony survives or dies, not a player body. Remove `tickPlayerSurvival()`. |
| **Pack follow (F key)** | Replaced by zone-based pawn commands. Remove `tickPackFollow()`, `SELECT_CREATURE` handler. |
| **Tool bonuses (axe/pickaxe)** | No player gathering = no tool use. Remove tool items. (Or repurpose as structure upgrades — deferred.) |
| **HudDOM player stats** | No hunger/health to display. Rework HUD for colony stats. |

---

## 7. What's New

| System | Description | Complexity |
|--------|-------------|------------|
| **Territory system** | Tile ownership, claim mechanics, contiguous expansion, territory visualization | Medium |
| **HQ structure** | Per-player starting structure, loss condition | Small |
| **Camera/viewport** | Free-panning camera (no avatar to follow). Zoom optional. | Medium |
| **Pawn command system** | Zone designation, command assignment (gather/patrol/guard), pawn AI extensions | Large |
| **Auto-gather loop** | Pawns collect resources from tiles, deposit to stockpile | Medium |
| **Turret structure** | New defensive structure, auto-targets hostiles in range | Small |
| **Wave spawner** | Timed wild creature waves, escalating difficulty | Medium |
| **Round timer + win condition** | Game clock, scoring, round end logic | Small |
| **Commander UI** | Click-to-place, zone painting, pawn assignment panel, minimap | Large |
| **Taming without avatar** | Click wild creature + spend resource to begin taming (range = within your territory or border) | Small |

---

## 8. MVP Scope

**The absolute minimum to make this playable and fun:**

1. ✅ 64×64 procedural map with existing biomes
2. ✅ 2 players in one Colyseus room
3. ✅ Each player spawns with 3×3 territory + HQ
4. ✅ Click to claim adjacent tiles (costs wood)
5. ✅ Click to place structures on owned tiles (wall, farm, turret)
6. ✅ 1 creature type (herbivore) tameable by clicking + spending berries
7. ✅ Tamed dino can be assigned: gather (auto-collect resources) or guard (attack hostiles)
8. ✅ Wild creature waves every 60 seconds, spawning at map edges
9. ✅ Turrets auto-fire at hostiles
10. ✅ Walls have HP, can be destroyed
11. ✅ Round timer (15 min), most territory wins
12. ✅ Free-panning camera, click-based UI
13. ✅ Territory tinted per player color

**Explicitly NOT in MVP:**
- PvP combat (players can't attack each other)
- Breeding
- Crafting beyond basic recipes
- Multiple creature types
- Build queues or build time
- Persistent progression
- Sound/music
- Mobile support
- Matchmaking/lobbies

---

## 9. Phase Breakdown

### Phase A — Foundation Pivot (~1–2 weeks)
> Strip the avatar, add territory and camera.

- Remove player avatar (x/y, movement, survival stats)
- Add `ownerID` to `TileState` for territory
- Implement HQ structure + starting 3×3 claim
- Implement claim mechanics (click → server validates → tile ownership)
- Replace PlayerRenderer with free-panning camera
- Build basic commander UI (click tile → action menu)
- Territory color overlay in renderer

**Deliverable:** You can join a room, see the map, claim tiles, and see your territory grow. No creatures, no building yet.

### Phase B — Build & Defend (~1–2 weeks)
> Place structures, survive waves.

- Extend structure placement to work on owned tiles (remove avatar adjacency)
- Add turret structure type + auto-fire logic
- Add wall HP + destruction
- Implement wave spawner (wild creatures from map edges)
- Creature pathfinding toward nearest player territory
- Farm auto-production (berries over time)
- Resource stockpile UI

**Deliverable:** You can build walls and turrets, farm generates food, wild dino waves attack your base. Tower defense loop works.

### Phase C — Pawn Commands (~1–2 weeks)
> Tame dinos, give them orders.

- Rework taming: click creature in/near territory → spend resource → begin trust
- Implement gather command: pawn moves to resource tile, collects, deposits to stockpile
- Implement guard command: pawn stays near structure, attacks hostiles
- Zone designation UI (paint tiles as gather/patrol zones)
- Pawn status in HUD (list of owned dinos + current command)

**Deliverable:** Full core loop. Claim → build → tame → assign → defend → expand. Playable game.

### Phase D — Multiplayer Polish (~1 week)
> Make it competitive and replayable.

- Round timer + win condition (territory count)
- Score screen at round end
- Balance pass: wave escalation curve, resource costs, turret damage
- Second creature type (carnivore as tougher guard/attacker)
- Breeding (reuse existing system — mid-game optimization)
- Basic PvP: pawns can enter enemy territory and attack structures
- Bug fixing, edge cases, 2-player playtesting

**Deliverable:** Shippable multiplayer game. Two players, one map, territory race with dino armies and tower defense.

---

## Appendix: Technical Notes

**Schema changes (high-level):**
- `TileState`: add `ownerID: string` (player who controls this tile)
- `PlayerState`: remove `x`, `y`, `hunger`, `health`. Add `hqX`, `hqY`, `score`.
- `CreatureState`: add `command: string` (idle/gather/guard/patrol), `zoneX/zoneY` (assigned zone center)
- `StructureState`: add `health: number`, extend `structureType` enum for turret/HQ
- `GameState`: add `roundTimer: number`, `roundPhase: string`

**Message changes:**
- Remove: `MOVE`, `GATHER`, `EAT`
- Keep: `CRAFT`, `PLACE` (modify validation), `TAME`, `BREED`, `ABANDON`
- Add: `CLAIM_TILE`, `ASSIGN_PAWN`, `DESIGNATE_ZONE`, `PAN_CAMERA` (client-only)

**Map size:** 64×64 = 4,096 tiles. Current `ArraySchema<TileState>` with Colyseus should handle this (was 1,024 at 32×32). Monitor sync bandwidth; may need interest management at 4+ players.

**Tick rate:** Keep at 4 ticks/sec. Wave spawner and turret firing use tick intervals. Pawn gather/patrol also tick-driven.

---

*This document is the north star for the Primal Grid pivot. It will be refined as implementation reveals what's fun and what isn't. When in doubt: ship the simpler version, playtest, iterate.*
