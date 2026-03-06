# Decision: Day/Night Phase Names Use Lowercase Strings

**Author:** Pemulis (Systems Dev)
**Date:** 2026-03-10
**Scope:** shared types, server state, client display

## Context
Implementing #10 day/night cycle required choosing phase name casing. Pre-existing tests by Gately expected lowercase (`"dawn"`, `"day"`, `"dusk"`, `"night"`).

## Decision
Phase names are lowercase strings matching the `DayPhase` enum values: `dawn`, `day`, `dusk`, `night`. The `dayPhase` field on `GameState` syncs these values to the client. Gately should use these exact strings for client-side rendering/tinting.

## Rationale
- Aligns with pre-existing test expectations
- Lowercase strings are conventional for Colyseus schema string fields in this codebase
- `DayPhase` enum in `shared/src/types.ts` provides type-safe access

## Impact
- Client code should import `DayPhase` from `@primal-grid/shared` and compare against `room.state.dayPhase`
- `DAY_NIGHT.PHASES` array in constants has the phase boundaries for calculating tint interpolation
