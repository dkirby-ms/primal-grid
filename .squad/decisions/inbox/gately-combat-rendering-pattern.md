# Decision: Registry-Driven Rendering for Combat Entities

**Author:** Gately (Game Dev)
**Date:** 2026-03-05
**Scope:** Client rendering, all future entity types

## Decision

All combat entity rendering (icons, colors, HP bar max values, costs) is driven by the shared type registries (`ENEMY_BASE_TYPES`, `ENEMY_MOBILE_TYPES`, `PAWN_TYPES`) rather than hardcoded client-side constants. The renderer uses `isEnemyBase()`, `isEnemyMobile()`, and `isPlayerPawn()` type helpers from shared to dispatch rendering logic.

## Rationale

- Adding a new enemy type or pawn type only requires updating the shared registry — the renderer automatically picks up the icon, color, and health values.
- Reduces risk of client/server drift on display values.
- Follows the existing pattern where `CREATURE_TYPES` drives wildlife rendering.

## Impact

- **Pemulis:** If you add new enemy/pawn types to the registries, the renderer will handle them automatically as long as they follow the `enemy_base_*`, `enemy_*`, or `pawn_*` naming conventions.
- **Hal:** Future entity types should include `icon` and `color` fields in their registry definitions.
