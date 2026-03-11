# Food HUD Display — Client Decision

**Author:** Gately (Game Dev)  
**Date:** 2026-03-14  
**Context:** Issue #21 — Food resource client-side implementation

## Decision

Food is displayed as a simple count in the inventory section using the 🍖 emoji, following the exact same pattern as wood (🪵) and stone (🪨). No food upkeep rate display in HUD for now — just the raw count. The starvation state is communicated purely through spawn button disabling (all buttons disabled when food ≤ 0).

## Rationale

- Keeping the food display consistent with wood/stone avoids visual clutter and complexity
- Players learn food's role through gameplay (watching it decrease as they spawn units)
- Spawn button disabling is the clearest feedback for "you can't do this"
- A food upkeep rate indicator or starvation warning overlay could be added later if playtesting shows players don't understand the mechanic

## Implications

- If we add a "food upkeep rate" indicator later, it should go below the food count in the inventory section or as a tooltip
- Any future resource types should follow this same pattern: emoji + name + count span with `id="inv-{resource}"`
