# Orchestration Log: Pemulis — Pawn Builder Implementation
**Date:** 2026-03-04 22:57  
**Agent:** Pemulis (Systems Dev)  
**Status:** IN_PROGRESS (background agent-12)  
**Mode:** background  

## Objectives
- Implement server-side pawn builder system
- Builder FSM AI (idle → move_to_site → building)
- Pawn upkeep system (separate tick every 60 ticks)
- Carnivore targeting integration
- HQ territory immutability (isHQTerritory)
- Resource simplification (wood/stone only)

## Expected Outcome
Full implementation — resource simplification (wood/stone only), shape placement removed, 9×9 HQ territory with isHQTerritory, complete builder FSM AI, upkeep, carnivore targeting. 207 tests passing.

## Key Decisions Implemented
- Builder AI uses 3-state FSM in builderAI.ts module
- Pawn upkeep runs separately every 60 ticks
- Building state validates adjacency on every tick
- Carnivores target builders via findNearestPrey()
- isHQTerritory is immutable boolean set at spawnHQ

## Files Modified
- server/src/game/creatures/builderAI.ts (NEW)
- server/src/game/gameState.ts
- server/src/game/creatures/creatureAI.ts
- server/src/game/creatures/herbivores.ts
- server/src/game/tile.ts
