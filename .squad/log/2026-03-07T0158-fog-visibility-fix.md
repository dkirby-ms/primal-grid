# Session: 2026-03-07T01:58Z — Fog-of-War Visibility Filtering Bug Fix

**Agent:** Pemulis (Systems Dev)  
**Duration:** Brief investigation  
**Status:** SUCCESS  

## Summary

Players could see entire map despite fog-of-war implementation. Root cause: missing `@view()` decorator on `tiles` ArraySchema in `GameState`.

## Fix

Added decorator to activate Colyseus 0.17 StateView filtering:

```typescript
@type([TileState])
@view()
tiles = new ArraySchema<TileState>();
```

## Results

- ✅ All 372 tests pass
- ✅ Build clean
- ✅ Server-side visibility filtering now active
- ✅ Client fog rendering ready to activate

## Design Note

Earlier decision "NO @view() on fields" was based on misunderstanding. Decorator enables the filtering pipeline; per-element filtering still via `view.add()/remove()`.
