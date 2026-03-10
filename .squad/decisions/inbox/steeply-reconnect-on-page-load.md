## Reconnect-Before-Lobby Pattern — Issue #101

**Author:** Steeply (Tester)
**Date:** 2026-03-10
**Status:** Recommendation

### Context

Browser refresh drops the user session despite the reconnection infrastructure being fully implemented. The gap is that `bootstrap()` never attempts reconnection on cold start.

### Decision

On page load, `main.ts` should check `sessionStorage` for a stored reconnection token **before** connecting to the lobby. If a token exists, attempt `reconnectGameRoom()` first. On success, skip the lobby entirely and go straight to `setupGameSession()`. On failure, clear the token and fall through to the normal lobby flow.

This keeps the reconnection token in `sessionStorage` (tab-scoped — correct for reconnection, since reconnection tokens are session-specific and shouldn't cross tabs).

### Affected Files

- `client/src/main.ts` — add reconnection check in `bootstrap()` / `connectToLobbyAndShow()`
- `client/src/network.ts` — export `loadReconnectToken()` (currently private)

### Rationale

The reconnection plumbing is complete — the only missing piece is a trigger on page load. This is the minimal change that fixes the bug without restructuring the connection flow.
