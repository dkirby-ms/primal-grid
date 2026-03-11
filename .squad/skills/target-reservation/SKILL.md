# Target Reservation Pattern

> When multiple autonomous agents select targets using identical deterministic scoring, they will always converge on the same target. Fix with target reservation.

## Problem

Multiple AI units (pawns, creatures, etc.) independently evaluate and select the "best" target using the same scoring function. Because the scoring is deterministic and runs on the same game state, every agent picks the same winner — causing visible clustering.

## Solution

Before scoring, collect tiles/targets already claimed by sibling agents into a `Set`. Skip reserved targets during candidate evaluation.

```typescript
function getReservedTargets(self: Agent, state: GameState): Set<string> {
  const reserved = new Set<string>();
  state.agents.forEach((other) => {
    if (other !== self && other.ownerID === self.ownerID && other.targetX >= 0) {
      reserved.add(`${other.targetX},${other.targetY}`);
    }
  });
  return reserved;
}

// In findTarget():
if (reserved.has(`${tx},${ty}`)) continue;
```

## When to Use

- Any system where multiple same-team AI units pick targets independently
- Builder pawns, defenders selecting patrol zones, attackers picking bases
- Creature AI selecting grazing/hunting tiles

## Complexity

O(N) where N = number of same-team agents. For Primal Grid's max-5 builders, negligible.

## Applied In

- `server/src/rooms/builderAI.ts` — PR #133, Issue #127
