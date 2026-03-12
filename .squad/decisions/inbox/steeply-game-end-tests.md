## Game-End Condition Test Coverage

**Author:** Steeply  
**Date:** 2026-03-15  
**Status:** Tests landed

### Decision

Added 6 tests for the CPU-inclusion and grace period game-end fixes. All tests use `room.state.tick = ELIMINATION_GRACE_TICKS` (40) to bypass grace period and hit elimination check interval. Tests are forward-compatible — they document the NEW behavior where CPU players participate in elimination/victory logic.

### Note for team

The existing test "does NOT eliminate CPU players" (line ~208) still passes because it sets tick=10 (within grace period), so elimination never fires. This test now documents **grace period behavior** rather than CPU-skip behavior. If the team wants to explicitly remove or rename that test to avoid confusion, that's a cleanup task.

### Coverage added

1. Single human + CPUs with territory → game continues
2. Human eliminated, CPUs alive → game continues
3. CPU with 0 tiles/pawns → eliminated
4. Grace period blocks elimination at tick 10, allows at tick 40
5. CPU can be the winner (LastStanding)
6. Human wins after all CPUs eliminated
