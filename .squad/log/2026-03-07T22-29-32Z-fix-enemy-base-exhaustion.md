# Session Log — Enemy Base Exhaustion Fix

**Date:** 2026-03-07  
**Agent:** Pemulis (Systems Dev)  
**Status:** ✅ COMPLETE

## Summary

Enemy bases were stuck in exhausted state due to order-of-operations bug in `tickCreatureAI()`. Generic creature logic ran before enemy-specific logic, causing early returns.

**Fix:** Moved `isEnemyBase` / `isEnemyMobile` checks to top of loop. Enemy entities skip all generic creature AI and call their own step functions directly.

**Result:** All 520 tests pass. Mobile spawning restored.

**Decision:** Documented in decisions.md (enemy entities are separate AI domain).
