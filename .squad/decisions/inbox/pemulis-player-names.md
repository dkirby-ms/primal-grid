# Decision: Player Display Name Schema & Message Protocol

**By:** Pemulis (Systems Dev)
**Date:** 2026-03-11
**Issue:** #9

## What

- `PlayerState.displayName` is a `@type("string")` Colyseus schema field, default `""`. Synced to all clients automatically.
- `SET_NAME` message (`"set_name"`) with `SetNamePayload { name: string }` is the client→server protocol for setting names.
- Server validates: trims whitespace, caps at 20 characters, rejects empty strings.
- Server broadcasts `game_log` with `"{name} has joined"` on successful name set.

## Why

- Schema field (not a side-channel) so scoreboard/nameplate rendering on any client can read `player.displayName` directly from synced state.
- 20-char limit prevents layout-breaking names in UI. Trim + empty-check prevents blank names.
- Broadcast on name-set gives all players feedback when someone identifies themselves.

## Impact

- Client team needs to: (1) send `SET_NAME` message after joining, (2) read `player.displayName` from schema for scoreboard/nameplates.
- Any future rename feature reuses the same message — handler is idempotent.
