## Token Refresh Mechanism — Design Decision

**By:** Pemulis (Systems Dev)
**Date:** 2026-03-12
**Status:** IMPLEMENTED (PR #75)

**What:**
- Access tokens expire in 24 hours, refresh tokens in 7 days (configurable via constructor)
- JWT payload includes `type: "access" | "refresh"` field to distinguish token types
- `validateToken` rejects refresh tokens (security: can't use refresh as access)
- `POST /auth/refresh` exchanges a valid refresh token for a fresh token pair
- `AuthProvider` interface extended with `refreshToken()` method

**Why:** Issue #42 scope requires token refresh mechanism. 24h access + 7d refresh matches common web app patterns. Token type field in JWT prevents misuse without needing separate signing keys.

**Impact:** When Entra ID integration comes, the new provider must implement `refreshToken()` in addition to existing methods. The token type validation pattern works regardless of issuer.
