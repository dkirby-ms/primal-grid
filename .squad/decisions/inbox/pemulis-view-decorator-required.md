# Decision: @view() Decorator Required for StateView Filtering

**Author:** Pemulis (Systems Dev)  
**Date:** 2025-07-25  
**Status:** Implemented  
**Affects:** Server (GameState schema), all team members working with Colyseus state sync

## Context

The Phase A fog-of-war implementation wired StateView correctly (view.add/remove, client.view assignment, tickFogOfWar) but tiles were not being filtered per-player. Players could see the entire map.

## Decision

Added `@view()` decorator to the `tiles` field in `GameState`. This reverses the earlier decision of "NO @view() field decorators."

## Why

In Colyseus 0.17, `@view()` on a collection field is the **required activation mechanism** for element-level StateView filtering. Without it:
- `encoder.context.hasFilters` stays `false`
- `SchemaSerializer` ignores `client.view` entirely
- Full state is broadcast to all clients

The earlier "no @view" decision was based on a misunderstanding — `@view()` on the field doesn't filter the field itself, it enables per-element filtering within the collection via `view.add(item)` / `view.remove(item)`.

## Impact

- **Gately (Client):** No client changes needed. The fog overlay code already reacts to which tiles exist in Colyseus state. With filtering active, `state.tiles.forEach` only iterates visible tiles, and the fog system handles the rest.
- **Server:** Non-@view fields (players, creatures, tick, etc.) are still sent to all clients via the shared encoding pass. Only tiles are per-client filtered.
- **Tests:** All 372 tests pass unchanged. Test code accesses state directly, not through the encoding pipeline.

## Future Considerations

If creatures or players need per-client filtering (e.g., hiding enemy pawns in fog), add `@view()` to `creatures` MapSchema and manage creature visibility in the StateView alongside tiles.
