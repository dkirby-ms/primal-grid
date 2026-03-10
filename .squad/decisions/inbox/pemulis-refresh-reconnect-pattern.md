## Browser Refresh Reconnect Pattern

**Author:** Pemulis (Systems Dev)
**Date:** 2025-07-24
**Status:** Implemented
**Issue:** #101

### Decision

On page load, `bootstrap()` checks `sessionStorage` for a Colyseus reconnect token before connecting to the lobby. If a token exists (from a prior game session in the same tab), it attempts `reconnectGameRoom()` first. Success skips the lobby entirely; failure falls through to normal lobby flow.

### Details

- Uses SDK 0.17.34's `onDrop`/`onReconnect` lifecycle hooks for proper status updates during SDK-managed reconnection
- A `pageUnloading` flag (via `beforeunload`) prevents wasted reconnection attempts when the page is being torn down
- Token persisted in `sessionStorage` under key `primal-grid-reconnect-token` — tab-scoped, survives refresh, cleared on tab close

### Impact

Anyone working on `client/src/main.ts` bootstrap flow or `client/src/network.ts` connection handlers should be aware of this pattern. The lobby is no longer the guaranteed first screen after page load.
