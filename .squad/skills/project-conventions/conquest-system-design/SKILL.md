# Skill: Conquest System Design Pattern

**Pattern:** Multi-layered territorial control with influence scoring, progressive conquest, and asymmetric defense

**When to use:** Designing PvP territory control mechanics for grid-based games where binary ownership (owned/unowned) is too simplistic and you need gradual, strategic conquest with defensive counterplay.

---

## Core Architecture

### Three-Layer Model

1. **Ownership layer** (who legally owns the tile)
   - `ownerID: string` — current owner
   - `isStartingTerritory: boolean` — immutable flag for protected zones

2. **Influence layer** (who exerts control)
   - `influenceScore: number` — 0-100 strength metric
   - `influenceOwner: string` — player currently dominating influence
   - Calculated from: adjacency (neighboring owned tiles), depth (distance from enemy), structures, base value

3. **Contest layer** (who's actively fighting for control)
   - `contestingPlayerID: string` — attacker attempting capture
   - `contestProgress: number` — 0-100 progress toward flip
   - Resolved via influence differential (high influence resists conquest)

**Why three layers:** Ownership is the goal, influence is the currency, contest is the transaction. Separating these allows:
- Defensive preparation (build influence before attack arrives)
- Gradual conquest (not instant flip)
- Counterplay windows (detect contest, reinforce, repel)
- Strategic depth (influence projection creates "fronts")

---

## Reusable Components

### Influence Calculation Pattern

**Frequency:** Every N ticks (recommend 20 = 5 seconds at 4 ticks/sec)  
**Inputs:** Tile ownership, adjacent tiles, structures, distance to enemy territory  
**Output:** Numeric score 0-100

```typescript
function calculateInfluence(tile: TileState, state: GameState): number {
  let influence = BASE_INFLUENCE; // e.g., 10
  
  // Adjacency bonus
  const adjacent = getAdjacentTiles(tile.x, tile.y);
  for (const neighbor of adjacent) {
    if (neighbor.ownerID === tile.ownerID && neighbor.shapeHP > 0) {
      influence += SHAPE_INFLUENCE; // e.g., +20
    }
  }
  
  // Depth bonus (distance from enemy border)
  const depthFromEnemy = computeDistanceToEnemyTerritory(tile, state);
  influence += depthFromEnemy * DEPTH_INFLUENCE; // e.g., +5 per hop
  
  // Structure bonus
  if (hasStructure(tile)) {
    influence += STRUCTURE_INFLUENCE; // e.g., +10
  }
  
  return Math.min(influence, 100);
}
```

**Key insight:** Influence rewards smart placement (adjacency), defensive investment (structures), and strategic depth (far from border = safe). Make adjacency dominant — this creates cascading effects where losing one tile weakens neighbors.

---

## When This Pattern Fits

✅ **Good fit:**
- Grid-based games (tile ownership is discrete)
- Multiplayer territory control (PvP land grab)
- Resource-driven gameplay (conquest costs resources, defense costs resources)
- Strategic depth desired (placement matters, timing matters)
- Games with structure/unit systems (integration points for defense/attack)

❌ **Poor fit:**
- Real-time action games (too much state to track per tile)
- Single-player puzzle games (no territorial pressure)
- Games where territory is just a score metric (no strategic value to holding tiles)
- Small grids (16×16 or less — influence systems need space to develop fronts)

---

**Full details:** See `.squad/decisions/inbox/pemulis-territory-conquest-mechanics.md` for complete implementation spec with code examples, constants tuning, integration patterns, and 5-phase roadmap.
