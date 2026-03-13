# Decision: Outpost upgrade constant contract and cooldown semantics

## Context

Issue #179 keeps the outpost-upgrade mechanic tile-targeted, but both server and client code already referenced the older `OUTPOST_UPGRADE` object. Hal's updated spec names discrete exports (`OUTPOST_UPGRADE_COST_WOOD`, `OUTPOST_UPGRADE_COST_STONE`, `UPGRADED_OUTPOST_RANGE`, `UPGRADED_OUTPOST_DAMAGE`, `UPGRADED_OUTPOST_ATTACK_INTERVAL`) and the simulation uses `tile.attackCooldown` to pace fire rate.

## Decision

1. Export the new discrete constants from `shared/src/constants.ts`.
2. Keep the legacy `OUTPOST_UPGRADE` object as a compatibility alias built from those discrete exports.
3. Treat `tile.attackCooldown` as "ticks remaining until the next eligible shot after this one," so upgraded outposts must write back `UPGRADED_OUTPOST_ATTACK_INTERVAL - 1` after firing to achieve a real 8-tick cadence.

## Why

- Gately can consume the explicit shared constants directly for UI copy and modal display without breaking existing imports elsewhere.
- Compatibility aliases avoid churn while multiple agents work on the same branch.
- The cooldown semantics remove an off-by-one bug where writing back the full interval produced a 9-tick firing cycle instead of the intended 8 ticks.
