# Decision: Client Auth Token Storage & Silent Guest Flow

**Author:** Gately  
**Date:** 2026-03-XX  
**Issue:** #77  
**PR:** #78  

## Context
The server-side JWT auth system (PR #70) was fully built but the client never called any auth endpoints. Players couldn't persist progress across sessions.

## Decision
- **Token key:** `primal-grid-token` in localStorage
- **Auth URL:** Derived from WS URL by replacing `ws://` → `http://` (same host:port)
- **Flow:** Auto-guest on first visit, reuse token on return, silent refresh on expiry
- **No UI:** Guest auth is completely invisible to the user

## Impact
- Future login/register UI should use the same `saveToken()` / `clearToken()` helpers in `client/src/network.ts`
- Account upgrade flow (`POST /auth/upgrade`) should replace the stored token with the new one
- All auth-related client logic lives in `client/src/network.ts` — no separate auth module yet
