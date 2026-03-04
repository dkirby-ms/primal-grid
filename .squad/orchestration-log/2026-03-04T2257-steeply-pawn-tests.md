# Orchestration Log: Steeply — Pawn Builder Tests
**Date:** 2026-03-04 22:57  
**Agent:** Steeply (QA & Testing)  
**Status:** IN_PROGRESS (background agent-14)  
**Mode:** background  

## Objectives
- Write 26 contract tests for pawn builder system
- 6 categories: spawning, FSM, adjacency, upkeep, carnivore, HQ territory
- 6 tests expected to pass initially (before impl)
- 20 tests awaiting implementation

## Expected Outcome
26 contract tests in pawnBuilder.test.ts across 6 categories. 6 passing initially (before impl), rest awaiting implementation.

## Test Categories
1. Builder spawning (cost, cap, validation)
2. Builder AI FSM (idle, move_to_site, building states)
3. Adjacency validation (prevent teleport builds)
4. Upkeep system (resource drain, frequency)
5. Carnivore interaction (targeting, killing builders)
6. HQ territory (immutability, visual distinction)

## File Created/Modified
- server/test/pawnBuilder.test.ts (NEW)

## Framework
- vitest (existing)
- expect() assertions
