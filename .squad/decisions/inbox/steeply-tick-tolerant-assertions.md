# Decision: Tick-Tolerant E2E Assertions

**Author:** Steeply  
**Date:** 2026-03-10  
**Context:** PR #52 re-review — flaky resource assertions in multiplayer E2E tests

## Decision

E2E tests must not use exact equality (`toBe`) for resource values that can be modified by game ticks (HQ income, pawn upkeep). Use inequality checks (`toBeLessThan`, `toBeGreaterThan`) or tolerance ranges instead.

When testing negative outcomes (e.g., "spawn should fail"), always verify the precondition (e.g., "resources are actually insufficient") before sending the command.

Replace all `waitForTimeout()` usage with `expect.poll()` or `waitForFunction()` — fixed-duration waits are inherently nondeterministic.

## Rationale

HQ income fires every 40 ticks and pawn upkeep every 60 ticks. A spawn happening near those boundaries shifts resource values, making exact assertions flaky. Inequality checks assert the game invariant (resources decreased) without coupling to tick timing.

## Scope

Applies to all E2E tests in `e2e/tests/`.
