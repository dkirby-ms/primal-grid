# Skill: Sacred vs. Contested Territory Pattern

**Category:** Architecture Pattern  
**Applies to:** Games with territorial control + safe zones  
**Complexity:** Low  
**Confidence:** High (proven in RTS, MOBA, colony sims)

---

## Problem

Games with territory control often need "safe zones" (spawn points, home bases, HQs) that are immune to conquest/destruction. Implementing this with complex validation logic (distance checks, ownership chains, special-case code) leads to bugs and maintenance burden.

---

## Solution

Use a **boolean flag on the tile/zone entity** to mark sacred territory. All conquest/attack logic checks this flag before executing.

### Data Model

```typescript
class TileState {
  ownerID: string;              // Who owns this tile
  isHQTerritory: boolean;       // Is this a sacred zone?
  influenceValue: number;       // Conquest mechanic state
  // ... other fields
}
```

### Initialization

```typescript
function spawnHQ(player, hqX, hqY) {
  const radius = 3; // 3×3 starting zone
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tile = getTile(hqX + dx, hqY + dy);
      tile.ownerID = player.id;
      tile.isHQTerritory = true;  // Mark as sacred
    }
  }
}
```

### Conquest Logic (with protection)

```typescript
function handleConquestAction(attacker, tile) {
  // Early exit for sacred zones
  if (tile.isHQTerritory) return;
  
  // Normal conquest logic proceeds
  if (attacker.influence > tile.defenderInfluence) {
    tile.ownerID = attacker.id;
  }
}
```

---

## Benefits

1. **Single source of truth:** One flag defines sacredness, checked everywhere
2. **Easy to reason about:** Boolean condition, not complex validation chains
3. **No distance checks:** No need to track "is this tile within 3 tiles of HQ?"
4. **Composable:** Can layer additional rules ("only sacred tiles can build X")
5. **Performance:** Single boolean check vs. distance calculations per action

---

## Trade-offs

**Cost:** +1 boolean field per tile (~1 byte × map size)  
**Benefit:** Eliminates entire class of bugs (HQ flips, spawn camping)

For a 64×64 map, cost is 4KB. Negligible.

---

## When to Use

- RTS games with uncapturable bases
- MOBA-style territory control (fountain/nexus immunity)
- Colony sims with "colony core" that can't be destroyed
- Battle royale safe zones (shrinking circles)
- Any game with "you can't attack X" rules

---

## When NOT to Use

- If "safe zones" are dynamic (e.g., temporary shields, moving sanctuaries) — use timers/buffs instead
- If sacredness is contextual (e.g., "sacred to faction A, not B") — use ownership + rules, not boolean

---

## Variations

### Distance-based sacred zones (alternative)

```typescript
function isSacredZone(tile, hqX, hqY) {
  const dist = Math.abs(tile.x - hqX) + Math.abs(tile.y - hqY);
  return dist <= 2; // Manhattan distance
}
```

**Trade-off:** No schema cost, but O(1) calculation per check. Use if schema space is constrained.

### Faction-specific sacred zones

```typescript
class TileState {
  sacredForFactions: Set<string>; // Can be empty
}

function canConquer(attacker, tile) {
  return !tile.sacredForFactions.has(attacker.faction);
}
```

**Trade-off:** Richer rules, higher complexity. Use for asymmetric factions.

---

## Example: Primal Grid Implementation

**Context:** Players start with 3×3 HQ territory that cannot be conquered. All expansion is contestable.

**Implementation:**
1. Add `isHQTerritory: boolean` to `TileState` schema
2. In `spawnHQ()`, mark 3×3 tiles with `isHQTerritory = true`
3. In conquest logic (shape placement, influence, creature raids), check `if (tile.isHQTerritory) return;`

**Files:**
- `server/src/rooms/GameState.ts` (schema)
- `server/src/rooms/territory.ts` (spawnHQ marking)
- `server/src/rooms/GameRoom.ts` (conquest validation)

**Result:** Zero HQ conquest bugs. Clear code intent. Easy to extend (e.g., "HQ tiles immune to creature damage").

---

## Related Patterns

- **Invulnerability Timers:** Temporary sacred state (spawn protection in FPS games)
- **Zone-based Rules:** Different rules per map region (PvP vs. PvE zones in MMOs)
- **Layered Permissions:** Multiple flags (sacred + no-build + no-fly) for rich rulesets

---

## References

- **Age of Empires:** Town Center cannot be deleted by enemy (implicit sacred flag)
- **StarCraft II:** Nexus/CC/Hatchery has "armored" tag (effectively sacred during early game)
- **RimWorld:** Colony "home area" has different rules vs. wild areas (zone-based)

---

**Last updated:** 2026-03-02  
**Author:** Hal (Lead)
