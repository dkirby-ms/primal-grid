---
name: "resource-depletion-feedback"
description: "How to implement non-negative resource floors with player-facing depletion feedback"
domain: "game-systems"
confidence: "high"
source: "earned"
---

## Context
Use this pattern when a server-authoritative resource should never go below zero, but depletion still needs gameplay consequences and clear player feedback.

## Patterns

### Clamp at the simulation boundary
Apply the floor where the resource changes on the server tick or spend path. In Primal Grid, `server/src/rooms/GameRoom.ts` clamps food after upkeep with `Math.max(0, ...)` so starvation uses a stable zero state instead of negative debt.

### Keep consequences tied to the floored state
Do not remove the penalty when you remove negative values. Starvation still checks the depleted state (`food === 0`) and continues damaging one random living pawn per income tick.

### Mirror the invariant in persistence and UI
Clamp persisted values when serializing/deserializing legacy saves, and clamp the HUD defensively so stale state never renders as a negative counter.

### Emit feedback on state transitions
Avoid log spam by warning once when the player first reaches the depleted state. Use a state-tracking set or similar transition detector, then send a direct error on blocked actions like spawning.

## Examples
- `server/src/rooms/GameRoom.ts` — zero-floor upkeep, starvation damage, one-time depletion log, spawn-denied error
- `server/src/persistence/playerStateSerde.ts` — save/load clamping for legacy negative food values
- `client/src/ui/HudDOM.ts` — defensive HUD clamp and depletion tooltip
- `server/src/__tests__/food-economy.test.ts` — tests for floor behavior, starvation, and feedback

## Anti-Patterns
- Allowing the server to keep negative debt while only hiding it in the HUD
- Removing the resource penalty when clamping the counter
- Broadcasting the same depletion warning every tick instead of on state transition
- Updating server logic without adding persistence or feedback coverage
