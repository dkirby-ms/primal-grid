# Decision: Playwright E2E Testing Framework for Multiplayer

**By:** Steeply (Tester)
**Date:** 2026-03-10
**Status:** PROPOSAL — Research complete, ready for team review

---

## Summary

After researching Playwright testing patterns for Canvas-based multiplayer WebSocket games, here is the recommended approach for Primal Grid's E2E testing framework.

## Key Recommendations

### 1. Use Browser Contexts for Multi-Player Simulation

- One browser, multiple contexts (not separate browser instances)
- Each context = one player with isolated session
- Use custom Playwright fixtures to create `playerOne` / `playerTwo` with automatic join flow
- `workers: 1` is mandatory — all tests share a single Colyseus server

### 2. State-Based Assertions (70% of tests)

- Expose `window.__ROOM__` in dev mode for `page.evaluate()` access to Colyseus `room.state`
- Assert on deserialized game state (players, creatures, tiles), not pixels
- Use `page.waitForFunction()` to wait for server state sync before asserting
- DOM selectors for HUD/scoreboard/prompt (20%), visual regression sparingly (10%)

### 3. Required Client Code Change

Add to `client/src/network.ts` after room join:
```typescript
if (import.meta.env.DEV || new URLSearchParams(window.location.search).has('dev')) {
  (window as any).__ROOM__ = room;
}
```
This is gated behind dev mode — never exposed in production.

### 4. Dual webServer Config

Playwright config starts both Colyseus server (port 2567) and Vite dev client (port 3000) automatically. All test URLs use `?dev=1` to disable fog of war.

### 5. Binary Protocol Caveat

Colyseus uses `@colyseus/schema` binary encoding. WebSocket frame inspection is NOT useful for state assertions — frames are binary, not JSON. Always read state from `room.state` via `page.evaluate()`.

### 6. Test Priority

- **P0 (must-have):** Join flow, two-player room, spawn pawn — validates framework works
- **P1 (important):** Territory expansion, resource income, day/night cycle
- **P2 (valuable):** Territory contests, combat, pawn limits
- **P3 (nice-to-have):** Enemy spawning, disconnect, visual regression

### 7. Implementation Estimate

- Phase 1 (Foundation): ~2 days — install, config, P0 tests
- Phase 2 (Game Mechanics): ~3 days — state helpers, P1 tests
- Phase 3 (Multiplayer): ~3 days — P2 conflict tests
- Phase 4 (Polish): ~2 days — CI/CD, visual regression, P3 tests

## What This Means for the Team

- **Pemulis/Gately:** The `window.__ROOM__` exposure needs to be added to `client/src/network.ts`. Small, safe change behind dev-mode gate.
- **Everyone:** E2E tests will run serially (single worker). Test runs will take longer than unit tests but catch real multiplayer bugs.
- **CI/CD:** New GitHub Actions workflow needed. Can run alongside existing Vitest unit tests.

## Full Research

Complete analysis with code examples, architecture diagrams, gotchas, and comparisons is in `.squad/agents/steeply/history.md` under "Playwright E2E Research".
