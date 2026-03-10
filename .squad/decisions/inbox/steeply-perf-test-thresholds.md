# Decision: Performance Test Threshold Policy

**Author:** Steeply (Tester)
**Date:** 2026-03-10
**Issue:** #104
**PR:** #106

## Decision

Performance tests in CI use a **two-tier threshold** pattern:

1. **Ideal threshold** — the expected runtime on a fast machine. Exceeding this emits a `console.warn` so regressions are visible in logs.
2. **Hard ceiling** — 5x the ideal threshold. Only this value is asserted with `expect()`. Failing this means an actual algorithmic regression, not environment variance.

## Rationale

CI runners vary in speed (shared VMs, load spikes, cold caches). Hard-asserting tight thresholds creates flaky tests that erode trust in the suite. The goal of perf tests in CI is to catch algorithmic regressions (O(n²) → O(n³)), not to benchmark absolute speed. The warn-at-ideal / fail-at-ceiling pattern gives us both visibility and stability.

## Applies To

All timing-based performance assertions in the test suite.
