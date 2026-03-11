# Food Economy Design

**Author:** Hal (Lead)  
**Date:** 2026-03-14  
**Status:** Proposed  
**Issue:** #21 — New resource type: food  

---

## Summary

Food is the third resource. It acts as a **unit allowance**: every pawn consumes food each income tick. Farms switch from producing wood/stone to producing food. This creates a clear build decision: farms feed your army, factories fund your economy.

---

## Current Economy (Audit)

| Constant | Value |
|---|---|
| Starting wood | 25 |
| Starting stone | 15 |
| HQ income (per 10s tick) | 2W, 2S |
| Farm cost | 12W, 6S |
| Farm income | 1W, 1S |
| Factory cost | 20W, 12S |
| Factory income | 2W, 1S |
| Builder spawn | 10W, 5S |
| Defender spawn | 15W, 10S |
| Attacker spawn | 20W, 15S |
| Explorer spawn | 12W, 8S |

Income tick interval: 40 ticks (10 seconds at 4 ticks/sec).

---

## New Constants

### Starting Resources

| Resource | Old | New |
|---|---|---|
| Wood | 25 | 25 (unchanged) |
| Stone | 15 | 15 (unchanged) |
| Food | — | **50** |

Rationale: 50 food gives ~4 income ticks of runway with 2 builders before needing farms.

### Food Upkeep Per Unit (per income tick)

| Pawn Type | Food/tick | Rationale |
|---|---|---|
| Builder | 1 | Cheap utility unit |
| Explorer | 1 | Cheap scout |
| Defender | 2 | Combat unit, moderate upkeep |
| Attacker | 3 | Strongest unit, highest upkeep |

### Rebalanced Pawn Spawn Costs

One-time wood/stone costs reduced slightly since food adds ongoing cost:

| Pawn Type | Old Cost | New Cost |
|---|---|---|
| Builder | 10W, 5S | **8W, 4S** |
| Defender | 15W, 10S | **12W, 8S** |
| Attacker | 20W, 15S | **16W, 12S** |
| Explorer | 12W, 8S | **10W, 6S** |

### HQ Food Income

| Source | Wood | Stone | Food |
|---|---|---|---|
| HQ (per income tick) | 2 | 2 | **2** |

### Building Changes

| Building | Cost | Income (OLD) | Income (NEW) |
|---|---|---|---|
| Farm | 12W, 6S | 1W, 1S | **0W, 0S, 2 food** |
| Factory | 20W, 12S | 2W, 1S | **2W, 1S, 0 food** |

Farms now **exclusively produce food**. Factories remain the resource engine. Clear role split.

### Enemy Base Rewards

| Base Type | Old Reward | New Reward |
|---|---|---|
| Raider Camp | 15W, 10S | 15W, 10S, **5 food** |
| Hive | 10W, 5S | 10W, 5S, **5 food** |
| Fortress | 25W, 20S | 25W, 20S, **10 food** |

### Starvation Mechanic

When `player.food <= 0`:
1. **Cannot spawn new units** (spawn blocked)
2. **One random pawn takes 5 HP damage per income tick** (starvation damage)
3. Food can go negative (debt accrues from upkeep)

Constant: `STARVATION_DAMAGE_PER_TICK = 5`

---

## Balance Analysis

**Early game (0 farms, 2 builders):**  
HQ income: 2 food/tick. Upkeep: 2 food/tick. Break-even. Starting 50 food provides buffer.

**Mid game (3 farms, 2 builders + 1 defender + 1 attacker + 1 explorer):**  
Income: 2 + 6 = 8 food/tick. Upkeep: 2 + 2 + 3 + 1 = 8 food/tick. Balanced.

**Late game (max army: 5B + 3D + 2A + 3E = 20 food/tick):**  
Needs: (20 − 2) / 2 = 9 farms. Significant investment — correct tension.

---

## Schema Changes (Pemulis)

### `shared/src/types.ts`

```typescript
// Add Food to ResourceType enum
export enum ResourceType {
  Wood = 0,
  Stone = 1,
  Food = 2,
}

// Add food to IPlayerState
export interface IPlayerState {
  // ... existing fields ...
  food: number;
}
```

### `shared/src/constants.ts`

```typescript
// Add to TERRITORY
STARTING_FOOD: 50,

// Add foodUpkeep to PawnTypeDef interface
export interface PawnTypeDef {
  // ... existing fields ...
  readonly foodUpkeep: number;
}

// Update PAWN_TYPES entries with new costs + foodUpkeep
builder:  { cost: { wood: 8, stone: 4 },  foodUpkeep: 1, ... },
defender: { cost: { wood: 12, stone: 8 }, foodUpkeep: 2, ... },
attacker: { cost: { wood: 16, stone: 12 }, foodUpkeep: 3, ... },
explorer: { cost: { wood: 10, stone: 6 }, foodUpkeep: 1, ... },

// Add HQ_FOOD to STRUCTURE_INCOME
HQ_FOOD: 2,

// Update BUILDING_INCOME types to include food
export const BUILDING_INCOME: Record<string, { wood: number; stone: number; food: number }> = {
  farm:    { wood: 0, stone: 0, food: 2 },
  factory: { wood: 2, stone: 1, food: 0 },
};

// Update EnemyBaseTypeDef.reward to include food
reward: { wood: number; stone: number; food: number };

// Update ENEMY_BASE_TYPES rewards
enemy_base_raider:   { ..., reward: { wood: 15, stone: 10, food: 5 } },
enemy_base_hive:     { ..., reward: { wood: 10, stone: 5,  food: 5 } },
enemy_base_fortress: { ..., reward: { wood: 25, stone: 20, food: 10 } },

// New constant
export const STARVATION = {
  DAMAGE_PER_TICK: 5,
} as const;
```

### `server/src/rooms/GameState.ts`

```typescript
// Add to PlayerState class
@type("number")
food: number = 0;
```

---

## Server Logic Changes (Pemulis)

### `GameRoom.ts` — Player init

```typescript
player.food = TERRITORY.STARTING_FOOD;
```

### `GameRoom.ts` — `tickStructureIncome()`

1. After granting HQ wood/stone, also grant HQ food:
   ```typescript
   player.food += STRUCTURE_INCOME.HQ_FOOD;
   ```

2. Building income loop — farm now gives food, not wood/stone:
   ```typescript
   player.food += count * income.food;
   ```

3. **NEW: Deduct food upkeep** — after income, iterate all pawns and deduct:
   ```typescript
   let totalUpkeep = 0;
   this.state.creatures.forEach((c) => {
     if (c.ownerID === playerId && c.pawnType !== "") {
       const def = PAWN_TYPES[c.pawnType];
       if (def) totalUpkeep += def.foodUpkeep;
     }
   });
   player.food -= totalUpkeep;
   ```

4. **NEW: Starvation check** — if `player.food <= 0`, deal 5 HP to one random pawn:
   ```typescript
   if (player.food <= 0) {
     // Find random pawn owned by player, deal STARVATION.DAMAGE_PER_TICK
   }
   ```

### `GameRoom.ts` — `spawnPawnCore()`

Add food check — block spawning if `player.food <= 0`:
```typescript
if (player.food <= 0) return null;
```

### `GameRoom.ts` — Enemy base destruction rewards

Where enemy base rewards are granted, also add:
```typescript
player.food += reward.food;
```

---

## Client/HUD Changes (Gately)

### `client/index.html`

Add food display next to wood/stone in inventory section:
```html
<span class="inv-count" id="inv-food">0</span>
```
Use 🍖 or 🌾 emoji as icon.

### `client/src/ui/HudDOM.ts`

1. Add `invFood` DOM element reference and `currentFood` field
2. In `bindToRoom()`, listen for `player.food` changes and update display
3. In spawn button validation (`updateSpawnButton()`), also check `currentFood > 0`
4. Show food cost breakdown on spawn buttons is NOT needed (food is upkeep, not spawn cost) — but show current food upkeep rate somewhere in HUD

### Spawn Button Labels

Update button labels to still show wood/stone cost (unchanged UX — food is ongoing, not per-spawn):
```
🔨 Spawn Builder (8W, 4S)
🛡 Spawn Defender (12W, 8S)
⚔ Spawn Attacker (16W, 12S)
🔭 Spawn Explorer (10W, 6S)
```

Add a tooltip or subtitle showing food upkeep: `+1 🍖/tick`

---

## Scope

### IN scope (this issue)
- `Food` resource type in enum, schema, constants
- `food` field on PlayerState (server + client sync)
- Starting food amount (50)
- HQ passive food income (2/tick)
- Farm produces food (2/tick), no longer wood/stone
- Food upkeep per unit per income tick
- Starvation mechanic (block spawn + pawn damage at food ≤ 0)
- Rebalanced pawn spawn costs (wood/stone)
- Food in enemy base rewards
- HUD display of food count
- Spawn button disable when food ≤ 0

### DEFERRED
- Food as tile resource (harvestable from map) — not needed, farms are enough
- Granary building (food storage bonus) — future feature
- Food trading between players — future multiplayer feature
- Food-specific research/upgrades — future progression feature
- CPU player food AI — CPU already uses `spawnPawnCore`, food check is automatic
