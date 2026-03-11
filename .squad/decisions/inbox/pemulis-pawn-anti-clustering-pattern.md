# Decision: Soft-Preference Anti-Clustering for All Pawn Types

**Author:** Pemulis  
**Date:** 2026-03-12  
**Status:** Implemented  

## Context

PR #134 added `getReservedTiles()` to prevent builders from targeting the same tile. Clustering persisted because:
1. Builders picked adjacent tiles (not just the same tile)
2. `moveToward()` let pawns stack on the same tile
3. Attackers all targeted the same enemy
4. Explorers converged on the same frontier

## Decision

All pawn anti-clustering uses **soft preferences**, never hard blocks:
- Target reservation: deprioritize (don't exclude) nearby targets when better options exist
- Movement: prefer unoccupied tiles but always fall back to any valid tile
- This prevents deadlocks in narrow corridors or small territories

## Implications

- Any new pawn type should follow this pattern: check `hasFriendlyPawnAt()` during movement, add target-spreading to selection logic
- `moveToward()` now has different behavior for pawns vs wildlife — wildlife takes first valid move, pawns try unoccupied first
- Performance: O(P) per pawn per movement candidate where P = same-owner pawns. Negligible for max ~13 pawns per player
