# Decision: B1 — Shape Data & Shared Types

**Author:** Pemulis (Systems Dev)
**Date:** 2026-02-26
**Status:** Implemented

## Context

Hal's shape-territory design requires a shape catalog and shared type changes before server-side placement logic (B2) and client rendering (B3) can proceed.

## Decision

Implemented the shape data layer exactly per Hal's spec:

1. **`shared/src/data/shapes.ts`** — 11 polyomino shapes (mono → tetra_j) with pre-computed 4-rotation arrays. Rotation uses 90° CW transform `{dx: dy, dy: -dx}` with normalization to non-negative offsets.

2. **`shared/src/types.ts`** — Added `shapeHP: number` to `ITileState` between `resourceAmount` and `ownerID`.

3. **`shared/src/constants.ts`** — Added `SHAPE` (cost/HP), `WORKER` (health/gather), `TERRITORY_INCOME` (interval/amount) constant objects.

4. **`shared/src/messages.ts`** — Added `PLACE_SHAPE` message constant and `PlaceShapePayload` interface.

5. **`shared/src/index.ts`** — Re-exported shapes module.

## Consequences

- Server schema (`TileState`) will need a `shapeHP` field added when B2 is implemented — it's not in the Colyseus schema yet, just the shared interface.
- B2 (server placement logic) can now import `SHAPE_CATALOG`, `SHAPE`, and `PlaceShapePayload` directly.
- B3 (client rendering) can import `SHAPE_CATALOG` for shape preview/placement UI.
- All 240 existing tests pass with no regressions.
