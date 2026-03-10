# Decision: Single-layer reconnection strategy

**Author:** Gately (Game Dev)
**Date:** 2026-07
**Issue:** #101

## Context
The Colyseus SDK 0.17 has built-in auto-reconnection (15 retries, exponential backoff) via `onDrop`/`onReconnect` handlers. Our custom `onLeave` handler was also calling `reconnectGameRoom()`, creating an infinite drop→reconnect→drop loop after browser refresh.

## Decision
- **SDK handles in-session transient disconnects.** The `onDrop`/`onReconnect` callbacks update UI status. `onLeave` means the session is truly over — clear the reconnect token and return to lobby.
- **`reconnectGameRoom()` is bootstrap-only.** It's called once on page load when a sessionStorage token exists, creating a fresh connection from scratch. It is never called from `onLeave`.
- **Reset client singleton after failed bootstrap reconnect.** `resetClient()` clears `colyseusClient` before falling through to lobby to avoid stale WebSocket state.

## Impact
- No duplicate reconnection attempts — eliminates the infinite loop.
- Cleaner separation: SDK owns transport-level reconnection, our code owns application-level session recovery (bootstrap).
- `onLeave` with non-consented codes now clears the token and emits `'disconnected'`, which triggers the lobby return flow in `main.ts`.
