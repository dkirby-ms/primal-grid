## CORS + Auth Graceful Degradation (Pemulis, 2026-03-12)

**Context:** PR #78 review feedback from Hal.

**Decisions:**

1. **CORS via `cors` npm package** on Express server — permissive (`cors()` with defaults). Needed for dev mode where Vite (port 3000) makes `fetch()` calls to Colyseus (port 2567). In production, same-origin serves both, so CORS headers are harmless but unused.

2. **Auth is always optional on the client.** If `ensureToken()` fails for any reason (network, CORS, server down), the client joins the room without a token. If a token-bearing join fails, the client retries without auth. The game must never crash due to auth infrastructure being unavailable.

**Impact:** All agents touching `connect()` or adding auth endpoints should respect this pattern — auth failures are warnings, never errors.
