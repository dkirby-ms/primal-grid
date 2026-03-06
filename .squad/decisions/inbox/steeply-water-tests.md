# Decision: Water Depth Test Strategy

**By:** Steeply (Tester)  
**Date:** 2026-03-09  
**Status:** IMPLEMENTED  
**Issue:** #15 — Shallow/Deep Water Variants

## What

Wrote 18 tests covering the water depth variant system across 4 categories:
1. **Enum integrity (6):** ShallowWater/DeepWater exist, Water removed, isWaterTile() correctness
2. **Map generation distribution (6):** Both variants present, shallow at edges, deep in interior, multi-seed consistency
3. **Creature AI avoidance (5):** Both water types blocked for all creature types via isWalkable and isTileOpenForCreature
4. **Performance (1):** 128×128 map with water depth pass under 500ms

## Key Decision: Cardinal Distance for DeepWater Assertions

The `classifyWaterDepth()` BFS uses **cardinal neighbors only** (not diagonal). Tests for DeepWater validate using Manhattan distance (`|dx| + |dy| > radius`) to match the BFS semantics. This is important — using Chebyshev distance (max of |dx|, |dy|) would create false negatives at diagonal positions.

## Outcome

331 total tests, all passing. No regressions. Water depth tests are deterministic and seed-stable.
