# Session Log: Builder Pathing Fix

**Date:** 2026-03-08T19:04:15Z  
**Agent:** Pemulis (Systems Dev)  
**Issue:** #39 — Builder pathing oscillation  

## Summary

Fixed root cause of builder oscillation: built structures were blocking builders from frontier expansion. Modified `isTileOpenForCreature()` to allow builders (only) to traverse their own structures. 520 tests pass. PR #55 opened.

## Changes

- `server/src/rooms/creatureAI.ts`: Builder traversal logic + expansion bias
- Related pathfinding modules: Helper function refactors

## Decision

- **ID:** pemulis-builder-pathing.md
- **Key point:** Builders traverse own structures; defenders/attackers/enemies still blocked
- **Impact:** No combat balance change; builders can now expand efficiently

## Outcome

✅ SUCCESS — Bug fixed, PR ready for review.
