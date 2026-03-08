# Decision: Add Client URL to Server Startup Log

**Made by:** Marathe (DevOps Engineer)  
**Date:** 2026-03-08  
**Issue:** QoL improvement for developer startup experience

## Decision

Added the client URL (`http://localhost:3000`) to the server startup log output in `server/src/index.ts`.

## Rationale

When the server starts, developers now see both:
- The Colyseus server listening address (port 2567)
- The client application URL (port 3000)

This provides immediate clarity on where to access the application without requiring developers to reference configuration files.

## Implementation

- Modified `server/src/index.ts` to log both URLs in the startup output
- Client URL is configurable via `CLIENT_URL` env var, defaults to `http://localhost:3000` (matches Playwright config and client dev server)
- Server port remains configurable via `PORT` env var, defaults to 2567

## Files Changed

- `server/src/index.ts`: Added client URL to startup log

## Impact

- **Scope:** Startup logging only (no behavioral changes)
- **Backwards Compatibility:** Fully compatible (additive change)
- **Testing:** No new tests required (simple logging enhancement)
