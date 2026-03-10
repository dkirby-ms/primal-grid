## CPU Player Identification — isCPU Schema Field

**Author:** Gately (Game Dev)  
**Date:** 2026-03-11  
**Status:** Implemented

### Decision

Added a boolean `isCPU` field to `PlayerState` in the Colyseus schema (`server/src/rooms/GameState.ts`). This is the canonical client-visible flag to distinguish CPU-controlled players from humans.

### Rationale

CPU players previously could only be identified server-side via the `cpuPlayerIds` Set on GameRoom. Clients had no reliable way to know which players were CPU-controlled. Rather than having clients parse session ID prefixes (fragile coupling to `CPU_PLAYER.SESSION_PREFIX`), a first-class schema field is cleaner and automatically syncs via Colyseus state replication.

### Impact

- **Client code** should read `player.isCPU` (or `player['isCPU']`) to identify CPU players.
- **Server code** sets `player.isCPU = true` in `spawnCpuPlayer()`. Human players default to `false`.
- **Scoreboard and grid labels** now show 🤖 indicator for CPU players.
