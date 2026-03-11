# Session Log: Enemy Spawn Cache Fix

**Date:** 2026-03-07  
**Topic:** Debugging stale TypeScript build cache blocking enemy spawns  
**Agent:** Pemulis

## Summary

Root cause of missing enemy spawns: `tsconfig.tsbuildinfo` cache prevented recompilation of `shared/src/constants.ts` (480→120 interval fix). Server was reading stale `shared/dist/constants.js` with old 480 value.

**Fix:** Deleted cache, rebuilt shared/, verified dist/. Added 7 tracing logs to tickEnemyBaseSpawning().

**Status:** 520/520 tests pass. Spawns working.

## Key Files

- `server/src/rooms/GameRoom.ts` (tracing added)
- `shared/dist/constants.js` (rebuilt)

## Lesson

TypeScript incremental build cache requires full clean rebuild after source edits. Consider pre-build cache cleanup in CI.
