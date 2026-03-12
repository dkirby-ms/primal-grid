---
name: "deterministic-random-tests"
description: "How to make simulation tests deterministic when production code intentionally chooses random eligible entities"
domain: "testing"
confidence: "high"
source: "observed"
---

## Context

Use this when Primal Grid simulation code intentionally selects a random pawn, creature, or tile from an eligible set, or when non-deterministic spawn locations affect test assertions. Tests should validate the rule being enforced, not accidentally depend on hidden fixture state such as auto-spawned pawns from `GameRoom.onJoin()` or random HQ placement.

## Patterns

- First enumerate the full eligible set created by the fixture. In game-room tests, `onJoin()` auto-spawns `TERRITORY.STARTING_PAWN`, so a newly joined player already owns one pawn before the test adds more.
- If the test needs a single deterministic victim, explicitly prune the candidate set in setup so only one eligible entity remains.
- If the random choice itself is not the behavior under test, prefer asserting aggregate invariants such as total health lost across all eligible pawns.
- When testing spatial relationships relative to HQ, use dynamic offsets that adapt to spawn location. HQ placement uses `Math.random()`, not the map seed, so it can spawn near map edges. Check bounds before choosing direction.
- Keep production randomness intact unless deterministic selection is an actual gameplay requirement. Fix the fixture before changing simulation behavior.

## Examples

- `server/src/__tests__/food-economy.test.ts`: the starvation-damage test removes the starting explorer before adding a defender, making the random starvation victim deterministic.
- `server/src/rooms/GameRoom.ts`: `tickStructureIncome()` should continue choosing one random living owned pawn when `player.food <= 0`.
- `server/src/__tests__/fog-of-war.test.ts`: the "multiple sources' visible tiles" test uses `const dx = player.hqX + 3 < room.state.mapWidth ? 3 : -3` to place a builder, preventing out-of-bounds coordinates when HQ spawns near the map edge.

## Anti-Patterns

- Assuming a test fixture starts with zero owned pawns after `joinPlayer()`.
- Treating intentional random selection as a bug when the real problem is an uncontrolled eligible set in the test.
- Replacing gameplay randomness with deterministic logic just to make one test pass.
- Using fixed offsets from HQ (e.g., `player.hqX + 3`) without checking map boundaries — HQ spawn is non-deterministic and can occur near edges.
