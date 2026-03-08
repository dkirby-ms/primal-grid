# Decision: Builders Traverse Own Structures

**Date:** 2026-07-25
**Author:** Pemulis (Systems Dev)
**Context:** Fix for #39 — builder pathing oscillation

## Decision

Builders (pawn_builder) can now walk through structures (`shapeHP > 0`) on their owner's territory. This is implemented in `isTileOpenForCreature()` in `creatureAI.ts`.

**Only builders** get this traversal — defenders, attackers, wildlife, and enemy units are still blocked by structures as before.

## Rationale

Built outpost/farm tiles get `shapeHP = BLOCK_HP` (100), which makes them unwalkable. Builders creating a line of outposts would wall themselves off from frontier tiles. The greedy pathfinder (`moveToward`) can't navigate around these walls, causing oscillation.

Allowing builders through their own structures is gameplay-appropriate (construction units navigate their own constructions) and doesn't affect combat balance (attackers/enemies still blocked).

## Impact

- **Gately (Game Dev):** Builder movement tests may need updating if they assumed builders are blocked by own structures.
- **Combat:** No impact. Attackers/defenders/enemies still blocked by structures.
- **Phase 5 (A*):** When A* replaces the greedy pathfinder, this traversal rule should be preserved so builders can still path through their own territory efficiently.
