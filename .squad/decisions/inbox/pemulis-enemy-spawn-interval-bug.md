# Decision: Enemy Base Spawn Interval Alignment Bug

**By:** Pemulis (Systems Dev)
**Date:** 2026-03-12
**Status:** BUG REPORT — needs fix

## Problem

`ENEMY_SPAWNING.BASE_SPAWN_INTERVAL_TICKS` (480) is identical to `DAY_NIGHT.CYCLE_LENGTH_TICKS` (480). The base spawn check uses `tick % 480 === 0`, which always fires when `dayTick` is 0 — the start of the **dawn** phase (0%). Since `tickEnemyBaseSpawning` gates on `dayPhase === DayPhase.Night` (65–100%), the two conditions **never overlap**. Enemy bases can never spawn.

## Recommended Fix

Change `BASE_SPAWN_INTERVAL_TICKS` to a value that doesn't divide evenly into the cycle length. For example:
- `120` (check 4x per cycle, guaranteeing a night-phase hit)
- `200` (check ~2.4x per cycle, staggered)

Alternatively, decouple the spawn check from modulo arithmetic entirely — use a `nextBaseSpawnTick` counter that only advances during night ticks.

## Impact

This explains why no enemy bases (and therefore no enemy mobiles) appear at night.
