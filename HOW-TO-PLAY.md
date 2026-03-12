# 🦖 How to Play Primal Grid

**Primal Grid** is a real-time strategy colony builder where you claim territory, build a thriving base, and compete against rival players and AI opponents—all while dinosaurs roam the world around you.

---

## Game Objective

Claim as much territory as possible, build a thriving colony, and outlast rival players and CPU opponents. Earn XP by expanding your territory and level up to track your progress.

---

## Getting Started

### 1. Place Your HQ 🏰

When the game begins, click a tile on the map to place your **Headquarters**. This immediately claims a **5×5 area** around the chosen tile as your starting territory. Any Water or Rock tiles in that zone are converted to Grassland so everything is walkable.

You start with **25 Wood**, **15 Stone**, and **50 Food**.

### 2. Your HQ Generates Income

Your HQ automatically produces **+2 Wood**, **+2 Stone**, and **+2 Food** every 10 seconds. This steady income is your baseline economy — invest it wisely to grow faster than your opponents.

---

## Resources: Wood, Stone & Food

Primal Grid runs on three resources: **Wood** 🪵, **Stone** 🪨, and **Food** 🍖.

| Source | Wood | Stone | Food | Frequency |
|--------|------|-------|------|-----------|
| HQ | +2 | +2 | +2 | Every 10 seconds |
| 🌾 Farm | 0 | 0 | +2 | Every 10 seconds |
| 🏭 Factory | +2 | +1 | 0 | Every 10 seconds |
| Pawns harvesting tiles | Varies | Varies | — | When gathering |

Tiles regenerate resources over time (1 resource every 20 seconds, up to 10 per tile), so the map never runs dry.

### ⚠️ Starvation

When your Food reaches **0 or below**, one random pawn takes **5 damage** each income tick (every 10 seconds). Keep your food positive by building Farms or you'll watch your army starve.

---

## Buildings

Build structures on your territory to shape your economy. Click the **Build Farm** or **Build Factory** button in the HUD, then click a tile in your territory to place it. Buildings have two bonuses:
1. **Income** — Passive resources every 10 seconds
2. **Unit Spawn Caps** — Farms add **+1** to all pawn type limits; Factories add **+2**

| Building | Cost | Income per tick | Spawn Cap Bonus |
|----------|------|-----------------|-----------------|
| 🌾 **Farm** | 12 Wood, 6 Stone | +2 Food | +1 |
| 🏭 **Factory** | 20 Wood, 12 Stone | +2 Wood, +1 Stone | +2 |

All your buildings combine their income and deposit it every **10 seconds**.

---

## Pawns

Pawns are your workers and warriors. Spawn them from the HUD panel on the right side of the screen. Each pawn type has a specific role and acts autonomously once spawned.

### 🔨 Builder

| Stat | Value |
|------|-------|
| Cost | 8 Wood, 4 Stone (spawn); 1 Food/tick (upkeep) |
| Max | 5 (base) |
| Health | 50 |
| Vision | 4 tiles |

Builders are your expansion force. They automatically scout for unclaimed tiles next to your territory, move to them, and claim them in about 2 seconds. Smart builders prioritize filling gaps in your territory first, then push outward. Each successful claim earns you **1 XP** toward leveling up. Note: Each builder consumes 1 food per income tick.

### 🛡 Defender

| Stat | Value |
|------|-------|
| Cost | 12 Wood, 8 Stone + 2 Food/tick |
| Max | 3 (base) |
| Health | 80 |
| Damage | 20 |
| Detection | 5 tiles |

Defenders patrol your territory and will fight off any threat that enters — whether it's an enemy raider or a hungry carnivore. They **never leave your territory**, so they're your reliable last line of defense. If pushed outside by an attacker, they automatically return home. Each defender costs 2 food per income tick.

### ⚔ Attacker

| Stat | Value |
|------|-------|
| Cost | 16 Wood, 12 Stone + 3 Food/tick |
| Max | 2 (base) |
| Health | 60 |
| Damage | 25 |
| Detection | 6 tiles |

Attackers are your offensive strike force. They venture beyond your territory to destroy enemy bases and take out hostile units. They'll patrol for about 50 seconds before heading home. Deploy them strategically once you've got defenders protecting your own base. Each attacker is expensive and consumes 3 food per income tick.

### 🔭 Explorer

| Stat | Value |
|------|-------|
| Cost | 10 Wood, 6 Stone + 1 Food/tick |
| Max | 3 (base) |
| Health | 35 |
| Vision | 6 tiles |

Explorers roam the map to reveal the unknown. They're drawn to unexplored and unclaimed areas. They won't fight, but they'll show you what's out there — enemy bases, resources, creatures — before you commit your army. Like builders, explorers consume 1 food per income tick.

---

## Territory Expansion

Your territory starts as a 5×5 square around your HQ. To expand:

1. **Spawn a Builder** (8 Wood, 4 Stone)
2. The builder automatically finds and claims nearby unclaimed tiles
3. Each claim takes about 2 seconds
4. You can only claim tiles **next to territory you already own** — no jumping across the map

Your territory grows as a connected landmass. Think of it like a living blob expanding outward.

---

## Creatures

The world is alive with dinosaurs that follow their own AI.

### 🦕 Herbivores (Parasaurolophus)

- Graze on tile resources, consuming 1 resource per meal
- Wander peacefully across the map
- Flee from carnivores
- Population maintained at a minimum of 4

### 🦖 Carnivores (Raptors)

- Hunt herbivores and **your builder pawns**
- Deal 30 damage per attack
- Prefer Forest and Highland biomes
- Population maintained at a minimum of 2
- Can be killed by your Defender and Attacker pawns

**💡 Pro tip:** Keep a Defender or two spawned whenever you're expanding near forests. Raptors hunt builders, so active defense saves your workforce.

---

## Enemy Bases

Enemy bases appear on the map as the game progresses (the first one shows up after about a minute). They spawn hostile units that probe your defenses and threaten your territory.

| Base Type | Health | Spawns | Reward |
|-----------|--------|--------|--------|
| ⛺ Raider Camp | 200 | Scouts, Raiders | 15W, 10S, 5 Food |
| 🪺 Hive | 150 | Swarms | 10W, 5S, 5 Food |
| 🏰 Fortress | 400 | Raiders | 25W, 20S, 10 Food |

Destroy them with **Attacker pawns** to earn resource rewards and eliminate the threat.

---

## Day/Night Cycle

The world cycles through four phases every **2 minutes**:

| Phase | Icon | Vision Effect |
|-------|------|---------------|
| 🌅 Dawn | Orange glow | -1 tile vision |
| ☀️ Day | Bright | Normal vision |
| 🌆 Dusk | Orange-red | -1 tile vision |
| 🌙 Night | Blue tint | -2 tile vision |

At night, your vision shrinks dramatically — perfect cover for lurking raptors and sneaky enemy units. Enemies become harder to spot, and dangers approach unseen. Keep defenders patrolling and stay vigilant.

---

## Progression: XP & Levels

Earn **1 XP** every time a builder claims a tile. Your level increases as you accumulate XP:

| Level | XP Required |
|-------|-------------|
| 1 | 0 |
| 2 | 10 |
| 3 | 25 |
| 4 | 45 |
| 5 | 70 |
| 6 | 100 |
| 7 | 140 |

Your level tracks your expansion progress — keep claiming tiles to climb the ranks!

---

## CPU Opponents

You can face **0 to 7 CPU opponents** (customize this in the lobby before starting). CPU players:

- Place their own HQ and expand territory
- Spawn builders, defenders, and attackers based on strategic priorities
- Defend first, expand second, attack when strong
- Use the same pawn types and mechanics as human players

CPU names: Atlas, Borealis, Cypher, Draco, Echo, Fenrir, Golem.

---

## Tips & Strategies

1. **Build your economy first.** Place 1–2 Farms early to generate food for your army before you expand too aggressively.
2. **Watch your food.** Food is your unit limit — starvation kills your army one pawn at a time. Keep it positive.
3. **Use building caps.** Factories boost your spawn caps by 2 each; use them to field more units once your wood/stone economy is stable.
4. **Protect your builders.** Raptors hunt builders, so always have at least one Defender running before expanding toward forests.
5. **Let builders fill gaps.** Your territory will have interior gaps — builders prioritize filling them first, which is smart and efficient.
6. **Scout before you strike.** Send an Explorer to locate enemy bases before committing your Attackers.
7. **Fear the night.** Night cuts your vision in half. Either pull back to defend or fortify before dusk falls.
8. **Eliminate enemy bases early.** The longer they sit, the more dangerous units they spawn. A neglected Raider Camp will slowly drain your defenses.
9. **Keep expanding for XP.** Claiming tiles earns XP and levels — a handy way to track your colony's growth.
10. **Farms vs Factories.** Early game: spam Farms to feed builders. Late game: Factories beat Farms for raw resource output once you're established.

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
