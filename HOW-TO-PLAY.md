# 🦖 How to Play Primal Grid

**Primal Grid: Survival of the Frontier** is a real-time strategy colony builder set on a procedurally generated world full of dinosaurs. Build your base, gather resources, expand your territory, and survive.

---

## Game Objective

Claim as much territory as possible, build a thriving colony, and outlast rival players and CPU opponents. Earn XP by expanding your territory, level up, and unlock increasingly powerful building shapes.

---

## Getting Started

### 1. Place Your HQ 🏰

When the game begins, click a tile on the map to place your **Headquarters**. This immediately claims a **5×5 area** around the chosen tile as your starting territory. Any Water or Rock tiles in that zone are converted to Grassland so everything is walkable.

You start with **25 Wood** and **15 Stone**.

### 2. Your HQ Generates Income

Your HQ automatically produces **+2 Wood** and **+2 Stone** every income tick (every 10 seconds). This is your baseline economy — build on it.

---

## Resources: Wood & Stone

Everything in Primal Grid costs **Wood** 🪵 and **Stone** 🪨.

| Source | Wood | Stone | Frequency |
|--------|------|-------|-----------|
| HQ (passive) | +2 | +2 | Every 10 sec |
| Farm (passive) | +1 | +1 | Every 10 sec |
| Factory (passive) | +2 | +1 | Every 10 sec |
| Pawn harvesting | Varies | Varies | When pawns gather from tiles |

Tiles regenerate resources over time (1 resource every 20 seconds, up to 10 per tile), so the map never runs dry.

---

## Buildings

Build structures on your territory to boost your economy. Click the **Build Farm** or **Build Factory** button in the HUD, then click a tile in your territory to place it.

| Building | Cost | Income per tick |
|----------|------|-----------------|
| 🌾 **Farm** | 12 Wood, 6 Stone | +1 Wood, +1 Stone |
| 🏭 **Factory** | 20 Wood, 12 Stone | +2 Wood, +1 Stone |

Income is distributed every **10 seconds** from all your buildings combined.

---

## Pawns

Pawns are your workers and warriors. Spawn them from the HUD panel on the right side of the screen. Each pawn type has a specific role and acts autonomously once spawned.

### 🔨 Builder

| Stat | Value |
|------|-------|
| Cost | 10 Wood, 5 Stone |
| Max | 5 |
| Health | 50 |
| Vision | 4 tiles |

Builders are the backbone of expansion. They automatically:
1. Find an unowned tile adjacent to your territory
2. Move to it
3. Claim it (takes ~2 seconds)

Builders prioritize filling interior gaps (tiles surrounded on 3+ sides by your territory) before expanding outward. Each tile claimed earns you **1 XP**.

### 🛡 Defender

| Stat | Value |
|------|-------|
| Cost | 15 Wood, 10 Stone |
| Max | 3 |
| Health | 80 |
| Damage | 20 |
| Detection | 5 tiles |

Defenders patrol your territory and engage any hostiles — enemy raiders, carnivores — that wander in. They **never leave your territory**, making them reliable guards. If pushed outside, they return to the nearest owned tile.

### ⚔ Attacker

| Stat | Value |
|------|-------|
| Cost | 20 Wood, 15 Stone |
| Max | 2 |
| Health | 60 |
| Damage | 25 |
| Detection | 6 tiles |

Attackers seek out and destroy enemy bases and hostile units. They venture beyond your territory to raid. After ~50 seconds on sortie, they return home automatically. Best used once you have defenders covering your base.

### 🔭 Explorer

| Stat | Value |
|------|-------|
| Cost | 12 Wood, 8 Stone |
| Max | 3 |
| Health | 35 |
| Vision | 6 tiles |

Explorers roam the map to reveal fog of war. They are drawn toward unclaimed and unexplored tiles. They don't fight — their value is **intelligence**. Use them to find resources, enemies, and creatures before you commit forces.

---

## Territory Expansion

Your territory starts as a 5×5 square around your HQ. To expand:

1. **Spawn a Builder** pawn (10 Wood, 5 Stone)
2. The builder autonomously finds and claims adjacent tiles
3. Each claim takes **~2 seconds**
4. You can only claim tiles **adjacent** to territory you already own — no jumping

Expansion is contiguous. Think of your territory like a growing blob on the map.

---

## Creatures

The world is alive with dinosaurs that follow their own AI.

### 🦕 Herbivores (Parasaurolophus)

- Graze on tile resources (eat 1 resource per action)
- Wander peacefully across the map
- Flee from carnivores
- Population maintained at a minimum of 4

### 🦖 Carnivores (Raptors)

- Hunt herbivores and **your builder pawns**
- Deal 30 damage per attack
- Prefer Forest and Highland biomes
- Population maintained at a minimum of 2
- Can be killed by your Defender and Attacker pawns

**Tip:** Keep defenders spawned to protect builders from raptors, especially near forests.

---

## Enemy Bases

Hostile bases spawn on the map over time (first one appears after ~60 seconds). They generate enemy mobiles that threaten your territory.

| Base Type | Health | Spawns | Reward |
|-----------|--------|--------|--------|
| ⛺ Raider Camp | 200 | Scouts, Raiders | 15W, 10S |
| 🪺 Hive | 150 | Swarms | 10W, 5S |
| 🏰 Fortress | 400 | Raiders | 25W, 20S |

Destroy them with **Attacker pawns** to earn resource rewards and remove the threat.

---

## Day/Night Cycle

The world cycles through four phases every **2 minutes**:

| Phase | Icon | Vision Effect |
|-------|------|---------------|
| 🌅 Dawn | Orange glow | -1 tile vision |
| ☀️ Day | Bright | Normal vision |
| 🌆 Dusk | Orange-red | -1 tile vision |
| 🌙 Night | Blue tint | -2 tile vision |

At night your vision is significantly reduced. Carnivores are harder to spot, and enemies can approach unseen. Keep defenders on patrol.

---

## Progression: XP & Levels

Earn **1 XP** every time a builder claims a tile. As you level up, new building shapes unlock:

| Level | XP Required | Unlocks |
|-------|-------------|---------|
| 1 | 0 | O-piece, I-piece |
| 2 | 10 | T-piece |
| 3 | 25 | L-piece |
| 4 | 45 | J-piece |
| 5 | 70 | S-piece, Z-piece |
| 6 | 100 | Pets |
| 7 | 140 | Pet breeding |

Building shapes let you place multi-tile structures that claim territory more efficiently.

---

## CPU Opponents

You can play against **0–7 CPU opponents** (configurable in the lobby). CPU players:

- Place their own HQ and expand territory
- Spawn builders, defenders, and attackers based on strategic priorities
- Defend first, expand second, attack when strong
- Use the same pawn types and mechanics as human players

CPU names: Atlas, Borealis, Cypher, Draco, Echo, Fenrir, Golem.

---

## Tips & Strategies

1. **Economy first.** Build 1–2 Farms early for steady income before expanding aggressively.
2. **Defend your builders.** Raptors target builders. Spawn at least one Defender before sending builders into forests.
3. **Fill gaps.** Builders prioritize interior territory gaps — this is efficient. Let them work.
4. **Scout before attacking.** Spawn an Explorer to find enemy bases before committing Attackers.
5. **Watch the clock.** Night reduces vision by 2 tiles. Pull back or fortify before dusk.
6. **Destroy enemy bases early.** They spawn increasingly dangerous mobiles. A Raider Camp left alone becomes a constant drain on your defenders.
7. **Level up for shapes.** Larger building shapes claim more territory per placement — XP investment pays off.
8. **Factory over Farm (late game).** Factories cost more but produce double wood (+2 vs +1). Worth it once your economy is rolling.

---

## Controls

| Key | Action |
|-----|--------|
| W A S D | Pan camera |
| Scroll wheel | Zoom in / out |
| Space | Center on your HQ |
| ? | Open/close help screen |

---

*For more details, see the [README](README.md) or check the in-game help screen (press `?`).*
