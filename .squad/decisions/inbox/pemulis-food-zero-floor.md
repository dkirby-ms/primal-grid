## 2026-03-14: Food depletion uses a zero-floor model

### Context
Issue #189 exposed that food could fall below zero, which made the HUD confusing and left starvation behavior unclear to players.

### Decision
Food is now clamped at 0 instead of accruing debt. When upkeep would push food below zero, `GameRoom.tickStructureIncome()` floors it at 0, starvation damage still applies while food is depleted, and the server emits a one-time depletion `game_log` warning. Spawn attempts at 0 food return an explicit error, and player-state serialization/deserialization clamps legacy negative food values back to 0.

### Impact
Simulation, persistence, and HUD now agree on the same invariant: food is never displayed or persisted as negative. Player feedback is clearer because starvation explains both the spawn lockout and the per-income-tick HP loss.
