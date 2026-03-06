# Decision: Copilot Coding Agent Instructions

**By:** Pemulis (Systems Dev)
**Date:** 2026-03-08
**Status:** IMPLEMENTED

## What
Created `.github/copilot-instructions.md` — the primary guidance document for GitHub Copilot coding agent when it picks up issues assigned to it.

## Scope
Comprehensive but scannable reference covering:
- Project architecture (client/server/shared monorepo)
- Build system and the shared/ incremental build gotcha
- Colyseus schema patterns and state management
- All game systems (creature AI FSM, stamina, territory, resources, map gen, pawn builders)
- Testing patterns (mock room creation, tick helpers)
- Coding conventions (strict TS, underscore prefix, no `any`)
- Explicit "do not" list (no Fiber/Berries, don't remove shapeHP, don't use global tick gate, etc.)

## Why
The Copilot coding agent works autonomously on issues. Without this file, it would lack critical context about build gotchas (shared/tsconfig.tsbuildinfo deletion), design decisions (resource simplification, per-creature timers), and patterns that have caused bugs before (global tick gates, missing stagger +1).

## Impact
Documentation-only. 287 tests pass, no code changes.
