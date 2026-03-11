# Gately: Docker Build Fix — Exclude Test Files

**Spawn:** Background task from PR #43 review (2026-03-07)  
**Task:** Fix Docker build failure — exclude *.test.ts, *.spec.ts, __tests__/** from client/tsconfig.json  
**Outcome:** ✅ SUCCESS

## Work Done

- Root cause: Vitest import in tests was breaking tsc compilation during Docker build (production code path)
- Added `exclude` pattern to client/tsconfig.json excluding all test files
- Pattern: `*.test.ts`, `*.spec.ts`, `__tests__/**`
- No changes to src/ code required — only tsconfig configuration

## Test Results

- All 520 tests passing
- tsc clean (no errors)
- Docker build now succeeds

## Commit

**37e34e1** — "fix: exclude test files from client tsconfig for Docker builds"

## Impact

- Resolves CI failure on Docker image builds
- No test code modified — safe for all test suites
