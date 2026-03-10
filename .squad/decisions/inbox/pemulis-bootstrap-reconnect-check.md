## Bootstrap Reconnection Check Pattern

**Author:** Pemulis  
**Date:** 2026-03-12  
**Status:** Implemented (PR #102, Issue #101)

**Decision:** On page load, `bootstrap()` checks `sessionStorage` for a reconnection token before connecting to the lobby. If found, it calls `reconnectGameRoom()` first. Success → skip lobby, restore game session. Failure → clear token, fall through to lobby.

**Rationale:** The reconnection infrastructure was complete but never triggered on cold start. This is the minimal wiring to close the gap — no new state, no new APIs, just a conditional check at the top of `bootstrap()`.

**Affected files:** `client/src/main.ts`, `client/src/network.ts` (export `loadReconnectToken`).

**Team impact:** None — server-side `GameRoom.onDrop`/`onReconnect` are unchanged. Gately's UI renderers bind correctly via existing `setupGameSession()` path.
