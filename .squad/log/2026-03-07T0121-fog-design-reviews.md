# Session Log: Fog of War Design Reviews

**Date:** 2026-03-07T01:21:00Z  
**Topic:** Fog of War Game Mechanics + Client Rendering Architecture Review  
**Duration:** Two independent background reviews (Steeply, Pemulis)

## Input

- **Hal:** Fog of War Game Mechanics Design (4-phase implementation, 5 vision sources, day/night modifiers, watchtower structure)
- **Gately:** Fog of War Client Rendering & Camera Design (ExploredTileCache, FogManager, dynamic bounds, StateView integration)
- **User Directives:** Three decisions on watchtowers (destructible future), team vision (alliances future), explored tile silhouettes

## Process

Two parallel expert reviews assigned:
1. **Steeply (Tester):** Testability + edge cases (40 test cases identified)
2. **Pemulis (Systems Dev):** Technical feasibility + system integration (4 items flagged)

Both reviews APPROVE WITH NOTES. No architectural blockers. Implementation ready pending precautions.

## Outcome

**Steeply's Key Findings:**
- Fully testable with existing infrastructure
- 14 edge cases identified (high/medium severity)
- Performance estimate revised upward: 4-8ms typical (not 12ms)
- Test plan: 40 cases across 4 phases

**Pemulis's Key Findings:**
- StateView API correctly applied
- Skip @view() field decorators (simplification)
- **Must merge owned-tile cache into Phase 2** (performance gate)
- Tile access pattern is breaking change (needs migration)
- All user decisions are compatible with design

## Critical Actions

**Required Before Implementation Starts:**
1. onLeave cleanup specification (Steeply E5)
2. @view() decorator simplification (Pemulis)
3. Owned-tile cache → Phase 2 (Pemulis)
4. Watchtower constants definition (Pemulis)
5. Camera bounds minimum padding (Pemulis)

## Next Steps

- Merge reviews into decision log
- Update Hal + Gately history files
- Proceed to implementation phase with precautions
