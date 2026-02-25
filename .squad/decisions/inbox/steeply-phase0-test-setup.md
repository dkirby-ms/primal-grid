# Decision: Phase 0 Test Setup

**Date:** 2026-02-25  
**Author:** Steeply (Tester)  
**Status:** Active

## Context

Phase 0 scaffolding complete. Needed baseline tests to verify monorepo structure and exports before advancing to Phase 1.

## Decisions

1. **Vitest config:** Root-level `vitest.config.ts` with explicit `include` patterns targeting `shared/src/__tests__/**/*.test.ts` and `server/src/__tests__/**/*.test.ts`. No per-workspace vitest configs needed.
2. **Test file convention:** `<package>/src/__tests__/<module>.test.ts` — tests live next to source, import from relative paths (not from dist).
3. **No client tests yet:** Per `decisions.md`, client uses manual smoke tests. Automated client tests deferred.
4. **Server tests import source directly:** Vitest handles TypeScript natively; no build step needed before testing.

## Findings

- Scaffolding is clean. All shared exports and server schemas work as expected.
- No issues found with the monorepo setup, imports, or Colyseus schema decorators.

## Test Coverage (Phase 0 Baseline)

| File | Tests | What's Covered |
|------|-------|----------------|
| shared: types.test.ts | 2 | TileType enum values and member count |
| shared: constants.test.ts | 3 | TICK_RATE, DEFAULT_MAP_SIZE, SERVER_PORT values |
| shared: messages.test.ts | 4 | MOVE/GATHER constants, payload interfaces |
| server: GameState.test.ts | 2 | Instantiation, initial tick value |
| server: GameRoom.test.ts | 1 | Import smoke test |
| **Total** | **12** | |
