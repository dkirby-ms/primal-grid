# Resource Economy Fix — Wood Softlock

**Author:** Hal (Lead)
**Date:** 2026-02-27
**Status:** PROPOSAL — awaiting decision from dkirby-ms
**Priority:** Critical (blocks playability)

---

## Problem

Players softlock when they run out of wood and don't own Forest tiles. The economy has no recovery path.

**Root cause:** The pivot removed the player avatar's manual `GATHER` action but didn't replace it with any active or passive resource-acquisition mechanic. Resources regenerate *on tiles*, but nothing moves them *from tiles to the player's stockpile*. Pawn gathering (Phase C) is the intended long-term fix, but Phase A/B are unplayable without it.

**Current flow:**
```
Player starts → 10 wood → claims tiles (1 wood each) → wood = 0
                                                         ↓
                             No forest tiles owned? → SOFTLOCKED
                             Forest tiles owned? → passive regen on tile, but NO way to collect it
```

Even if a player owns Forest tiles, tile resources just sit there. There's no harvest action.

---

## Option 1: Territory Income (Passive Auto-Harvest) ⭐ RECOMMENDED

**What:** Owned tiles automatically deposit resources into the owner's stockpile at a slow rate. If you own a Forest tile, you get wood. Own Highland, get stone. Etc.

**Changes:**
- `server/src/rooms/GameRoom.ts`: New `tickTerritoryIncome()` method (or modify `tickResourceRegen`). Every `RESOURCE_REGEN.INTERVAL_TICKS` (20s), iterate owned tiles — if tile has resources, transfer 1 unit from tile to owner's stockpile.
- `shared/src/constants.ts`: Add `TERRITORY_INCOME` constants (interval, amount per tile, optional cap per tick to prevent runaway scaling).
- **Files touched:** 2
- **Lines of code:** ~30-40

**Pseudocode:**
```typescript
tickTerritoryIncome() {
  if (this.state.tick % TERRITORY_INCOME.INTERVAL_TICKS !== 0) return;
  // Build per-player income map
  for each tile where tile.ownerID !== "" && tile.resourceAmount > 0:
    owner = players.get(tile.ownerID)
    tile.resourceAmount -= 1
    switch tile.resourceType:
      case Wood:    owner.wood += 1
      case Stone:   owner.stone += 1
      case Fiber:   owner.fiber += 1
      case Berries: owner.berries += 1
}
```

**Game feel:**
- ✅ Creates a real engine: more territory → more income → more territory. This is the Factorio/RimWorld loop.
- ✅ Fits commander fantasy — you manage territory, not click on trees.
- ✅ Makes *which* tiles you claim matter (Forest vs Desert = meaningful choice).
- ✅ Self-balancing: tile resources deplete, so income isn't free — tiles must regen before giving more.
- ✅ Pawns (Phase C) remain valuable: they can gather *faster* than passive income and from *unowned* tiles.

**Risks:**
- Could feel too passive in early game if interval is too slow. Tunable.
- Large territory = large income — may need a per-tick cap or diminishing returns later. Fine for MVP.
- Drains tile resources, which means wild creature grazing competes with player income — this is actually good emergent gameplay.

**Suggested constants:**
```typescript
export const TERRITORY_INCOME = {
  INTERVAL_TICKS: 40,  // 10 seconds at 4 ticks/sec (faster than regen so tiles deplete)
  AMOUNT: 1,           // 1 resource per tile per interval
} as const;
```

---

## Option 2: Click-to-Harvest (Active Manual Gathering)

**What:** Add a `HARVEST_TILE` message. Player clicks an owned tile → server extracts 1 resource from the tile → adds to player's stockpile.

**Changes:**
- `shared/src/types.ts` or `shared/src/messages.ts`: New `HARVEST_TILE` message type + payload.
- `server/src/rooms/GameRoom.ts`: New `handleHarvestTile()` handler. Validates: tile owned by player, tile has resources, extracts 1 unit.
- `client/src/input/InputHandler.ts`: New click handler or keybind for harvesting.
- `client/src/ui/HudDOM.ts`: Optional feedback (resource gain indicator).
- **Files touched:** 3-4
- **Lines of code:** ~60-80

**Game feel:**
- ✅ Gives players agency — something active to do.
- ❌ Contradicts the commander fantasy. GDD explicitly says "players don't manually gather."
- ❌ Becomes tedious at scale (clicking 50 tiles to harvest).
- ❌ Creates a clicking minigame that competes with the strategic layer.

**Risks:**
- Feature that gets removed in Phase C when pawns take over. Throwaway work.
- Players will feel obligated to click-harvest constantly, which is the opposite of what the game wants to be.

---

## Option 3: Guaranteed Forest + Tuning (Band-Aid)

**What:** Ensure HQ always spawns adjacent to Forest tiles. Increase starting wood. Reduce claim cost.

**Changes:**
- `server/src/rooms/GameRoom.ts`: Modify `findHQSpawnLocation()` to require ≥2 Forest tiles within the 3×3 starting area.
- `shared/src/constants.ts`: Increase `STARTING_WOOD` to 20-30, optionally reduce `CLAIM_COST_WOOD` to 0.5 → round to 1 every 2 claims.
- **Files touched:** 2
- **Lines of code:** ~15-20

**Game feel:**
- ✅ Simplest possible change.
- ❌ Doesn't fix the core problem — just delays the softlock. If a player claims non-forest tiles, they'll still run dry.
- ❌ No interesting decision-making. Just "you have more stuff."
- ❌ Passive regen is still stuck on tiles with no transfer to stockpile.

**Risks:**
- False sense of security. Economy still fundamentally broken.
- Increasing starting resources makes early game feel less consequential.

---

## Recommendation: Option 1 (Territory Income)

**Why:**
1. **Minimum viable fix** — 2 files, ~35 lines, solves the softlock completely.
2. **Creates the right game loop** — territory is the engine, not clicking. This matches the GDD's commander fantasy.
3. **Forward-compatible** — pawn gathering (Phase C) stacks on top of this. Pawns gather faster + from unowned tiles. Territory income becomes the baseline, pawns become the multiplier.
4. **Emergent depth** — tile resources deplete, so income isn't free. Players must balance territory expansion (more tiles = more income sources) against tile depletion rate. Wild creatures graze the same tiles. Forest tiles near your border are *worth fighting for*.
5. **Tunable** — one constant (`INTERVAL_TICKS`) controls the entire economy tempo.

**Complementary micro-fix:** Also apply Option 3's spawn logic (guarantee ≥2 Forest tiles in starting 3×3) as a 5-line bonus. This ensures no player gets a dead start while the territory income system ramps up.

**Implementation order:**
1. Add `TERRITORY_INCOME` constants to `shared/src/constants.ts`
2. Add `tickTerritoryIncome()` to `GameRoom.ts`, wire into simulation interval
3. Modify `findHQSpawnLocation()` to prefer Forest-adjacent spawns
4. Playtest: verify wood flows, territory expansion feels smooth, tiles deplete and regen naturally

---

*"Resources should flow, not stall." — This fix makes territory the engine that drives everything else.*
