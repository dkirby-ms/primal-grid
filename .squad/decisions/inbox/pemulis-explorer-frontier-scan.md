## Explorer AI: Frontier Ray Scanning

**Author:** Pemulis  
**Date:** 2026-03-12  
**Status:** Implemented  
**PR:** #149  
**Issue:** #147

### Context

Explorers scored only the 4 adjacent tiles. Deep inside owned territory, all neighbors are owned and score equally — resulting in random wandering that doesn't explore.

### Decision

Added a **frontier ray scan** to explorer scoring: for each candidate direction, cast a ray of up to `PAWN_TYPES.explorer.visionRadius` (6) tiles and count unclaimed tiles. This bonus steers explorers through owned territory toward the frontier.

Scoring weights:
- Unclaimed adjacent tile: +3 (was +2)
- Owned adjacent tile: +1
- Unclaimed tiles along ray: +1 each (0-6 range)
- Away from same-owner explorers: +2 (was +1)

### Implications

- `countFrontierInDirection()` is exported from `explorerAI.ts` for direct testing
- Performance: O(4 × scan_radius) per explorer per tick — negligible for max 3 explorers per player
- If future pawn types need frontier awareness, reuse `countFrontierInDirection`
