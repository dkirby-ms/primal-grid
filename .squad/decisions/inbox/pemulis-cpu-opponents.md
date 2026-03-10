## CPU Opponent Architecture

**Author:** Pemulis (Systems Dev)
**Date:** 2026-03-12
**Context:** Issue #105 — Computer controlled player-opponents

### Decision

CPU opponents are first-class `PlayerState` entries added at `GameRoom.onCreate()` time. They use synthetic session IDs (`cpu_0` through `cpu_6`), receive income/scoring from existing tick functions for free, and make strategic decisions via a flat priority-based AI loop in `cpuPlayerAI.ts`. Tactical behavior is delegated entirely to existing pawn AIs (builder, defender, attacker, explorer).

### Key Design Points

1. **`spawnPawnCore()` is now a public method on GameRoom** — extracted from `handleSpawnPawn` so CPU AI can spawn pawns without a Client reference. Any future system that needs to spawn pawns programmatically should use this method.
2. **`cpuPlayerIds` Set on GameRoom** — tracks which session IDs are CPU-controlled. Must be null-guarded (`?.`) in methods that tests invoke via `Object.create()`.
3. **`CreateGamePayload.cpuPlayers`** — new optional field in the lobby payload. LobbyRoom passes it through to GameRoom options.
4. **Room auto-disposal** — `checkCpuOnlyRoom()` runs after every human player removal. If only CPU players remain, the room calls `this.disconnect()`.
5. **CPU players skip StateView** — no `initPlayerView()` call, zero rendering cost.

### Impact

- **Gately (Frontend):** The client's create-game UI should expose a `cpuPlayers` number input (0–7) in the lobby.
- **Steeply (Testing):** 20 new tests cover CPU AI decisions, spawn mechanics, and room cleanup. Existing 716 tests pass with no regressions.
- **All:** New shared constant `CPU_PLAYER` in `constants.ts`. New pawn type names in `CPU_PLAYER.NAMES`.
