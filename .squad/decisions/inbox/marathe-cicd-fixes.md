# Decision: CI/CD Audit Remediation Complete

**Author:** Marathe (DevOps/CI-CD)
**Date:** 2024-01-29
**Status:** Implemented

## Context

A comprehensive audit of all 16 GitHub Actions workflows identified 3 critical issues and 6 warnings. All 9 findings have been fixed.

## Decisions Made

### Standards established (all team members should follow):

1. **Node 22 is the standard** — all workflows must use `node-version: 22`. No exceptions.
2. **Always cache npm** — every `setup-node` step should include `cache: npm`.
3. **Pre-merge validation required** — any workflow that validates a branch must have a `pull_request` trigger, not just `push`. Validation after push is too late.
4. **Concurrency guards on git operations** — workflows that push, merge, or reset branches must use concurrency groups to prevent race conditions.
5. **ASCII-safe output** — workflow scripts should use ASCII or well-supported emoji (✅, ❌, ⛔, ⚠️). Avoid special Unicode that may render as mojibake in different environments.

## Files Changed

- `.github/workflows/e2e.yml` — Node 22
- `.github/workflows/squad-ci.yml` — removed push trigger, added workflow_dispatch, added npm cache
- `.github/workflows/squad-preview.yml` — added pull_request trigger
- `.github/workflows/squad-release.yml` — added npm cache
- `.github/workflows/squad-insider-release.yml` — added npm cache
- `.github/workflows/reset-uat.yml` — added concurrency guard
- `.github/workflows/squad-promote.yml` — added concurrency guard
- `.github/workflows/squad-main-guard.yml` — fixed mojibake
- `.github/workflows/squad-heartbeat.yml` — documented disabled cron

## Impact

- Faster CI runs (npm caching)
- No more wasted compute (redundant push triggers removed)
- Safer git operations (concurrency guards)
- Pre-merge validation on preview branch (catches issues before they land)
- Readable error messages in squad-main-guard
