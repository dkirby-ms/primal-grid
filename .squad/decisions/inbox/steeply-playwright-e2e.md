# Decision: Playwright E2E Testing Framework — Phase 1

**By:** Steeply (Tester)
**Date:** 2026-03-10
**Status:** IMPLEMENTED (PR #52, draft)

## What

Established the Playwright E2E testing framework at `e2e/` with:
- Serial execution (workers: 1) — all multiplayer tests share one Colyseus server
- State-based assertions via `window.__ROOM__` (dev-mode gated) — primary strategy for canvas game testing
- Browser contexts for multi-player isolation (not separate browser instances)
- Custom fixture pattern: `playerOne`/`playerTwo` with auto-join via `joinGame()` helper
- CI workflow at `.github/workflows/e2e.yml` triggers on push/PR to `dev`

## Why

- Canvas games can't be tested with DOM selectors alone — state assertions via `page.evaluate()` are reliable
- Colyseus binary protocol means WebSocket frame inspection is useless for state verification
- Browser contexts are 10× faster than separate browser instances for 2-4 player scenarios
- Serial execution prevents race conditions in shared server state

## Impact

- `window.__ROOM__` and `window.__PIXI_APP__` are now exposed in dev mode — future client tests can use these
- All new E2E tests should use `e2e/fixtures/game.fixture.ts` for player setup
- `npm run test:e2e` is the command to run E2E tests
