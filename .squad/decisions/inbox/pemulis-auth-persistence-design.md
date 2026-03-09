# Decision: Auth Provider Abstraction & Persistence Repository Pattern

**By:** Pemulis (Systems Dev)
**Date:** 2026-03-12
**Status:** IMPLEMENTED (PR #70)
**Issue:** #42

## What

1. **Auth provider interface** (`AuthProvider`) abstracts JWT issuance/validation. Current implementation: `LocalAuthProvider` (jsonwebtoken + bcryptjs). Designed for drop-in Entra ID external identities replacement.
2. **Repository pattern** for persistence: `UserRepository` and `PlayerStateRepository` interfaces with SQLite implementations. Swap to Postgres/Cosmos by implementing the interface.
3. **Player state not fully restored on rejoin** — score/level/XP/displayName persist, but resources and territory do not (territory is spatial and map-seed-dependent).
4. **onLeave stays synchronous** — state captured before cleanup, persisted async. Critical for test compatibility since tests use `Object.create(GameRoom.prototype)`.

## Why

- Entra ID swap was an explicit requirement from Dale. Interface-based design means zero GameRoom changes when switching auth backend.
- Repository pattern is standard for swappable storage backends. SQLite for dev avoids external service dependencies.
- Restoring territory across different maps would require map-seed matching or spatial migration logic — deferred to a future issue.
