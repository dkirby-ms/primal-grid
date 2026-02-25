# Project Context

- **Owner:** dkirby-ms
- **Project:** Primal Grid: Survival of the Frontier — grid-based survival colony builder with dinosaurs, dynamic ecosystems, and base automation in the browser
- **Stack:** TypeScript, HTML5 Canvas, browser-based web game
- **Design Document:** docs/design-sketch.md
- **Created:** 2026-02-25T00:45:00Z

## Current Phase

**Hal (Lead)** has decomposed the design sketch into a **6-phase build plan** (2026-02-25):
- **Phase 0:** Scaffolding (Gately + Pemulis lead)
- **Phase 1–2, 4:** Core simulation, base building, world events (Gately lead)
- **Phase 3:** Creature systems (Gately lead)
- **Phase 5:** Late game + auth (Pemulis lead)

**Your Role (Steeply):** Tester — validate each phase is **playable** before advancing. Core principle: no speculative features. See `.squad/decisions.md` for full architecture and scope fence.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### Phase 0 — Baseline Test Setup (2026-02-25)

- **Vitest** already declared in root `devDependencies` and test script (`vitest run`). Added `vitest.config.ts` at root with explicit include patterns for `shared` and `server` test dirs.
- Test convention: `<package>/src/__tests__/*.test.ts`. TypeScript source imports (not dist).
- Scaffolding was clean — all shared exports (`TileType`, constants, message types) and server schemas (`GameState`, `GameRoom`) worked without fixes.
- Colyseus `@colyseus/schema` decorators (`@type`) work fine under Vitest with `experimentalDecorators` in server tsconfig.
- **12 tests across 5 files** passing: types (2), constants (3), messages (4), GameState (2), GameRoom (1).
- Build pipeline (`npm run build`) still succeeds after adding test files and vitest config.
