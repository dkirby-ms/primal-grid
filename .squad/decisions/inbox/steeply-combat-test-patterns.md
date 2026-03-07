# Decision: Combat Test Patterns — Steeply

**Date:** 2026-03-10
**Affects:** All agents writing combat-related tests

## Combat Cooldown Tick Values

Tests calling `tickCombat()` must set `room.state.tick` to at least:
- `ATTACK_COOLDOWN_TICKS` (4) for creature-vs-creature combat
- `TILE_ATTACK_COOLDOWN_TICKS` (8) for mobile tile attacks

The cooldown system uses module-level Maps with `?? 0` default, so tick=0 always fails the cooldown check. Use `FIRST_COMBAT_TICK` and `FIRST_TILE_TICK` helper constants.

## Room Mock Initialization

Any test using `tickEnemyBaseSpawning()`, `tickCreatureAI()`, or `tickCombat()` via the GameRoom must initialize:
```typescript
(room as any).nextCreatureId = 0;
(room as any).creatureIdCounter = { value: 0 };
(room as any).enemyBaseState = new Map();
(room as any).attackerState = new Map();
```

## Pair-Based Combat

Combat resolution is pair-based, not AoE. A single defender adjacent to 3 mobs will exchange damage with ALL three in the same tick (each as a separate pair). Tests should not assume 1:1 engagement per tick.
