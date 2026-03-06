# Decision: Biome Contiguity via Noise Tuning + Cellular Automata

**Author:** Pemulis (Systems Dev)
**Date:** 2026-03-07
**Status:** Implemented
**Commit:** feat(mapgen): smoother biome regions via noise tuning + cellular automata

## Context

Biomes on the procedural map appeared pixelated — many isolated single-tile patches and noisy transitions between biome types. The root cause was twofold: noise parameters generated too much high-frequency detail, and there was no post-processing to smooth boundaries.

## Decision

### 1. Noise Parameter Tuning (`shared/src/constants.ts`)
- `ELEVATION_SCALE`: 0.08 → 0.045 (larger elevation zones)
- `MOISTURE_SCALE`: 0.06 → 0.035 (larger moisture zones)
- `ELEVATION_OCTAVES`: 4 → 3 (less fine detail)
- `MOISTURE_OCTAVES`: 3 → 2 (less fine detail)

### 2. Cellular Automata Smoothing (`server/src/rooms/mapGenerator.ts`)
- Added `smoothBiomes()` function, called after tile generation in `generateProceduralMap()`
- 2 passes, Moore neighborhood (8 neighbors), majority threshold of 5
- Water and Rock tiles are protected (never flipped) — they're gameplay barriers
- Fertility and resources recalculated for any tile whose biome changes

## Alternatives Considered

- **Gaussian blur on noise values before biome assignment:** Would smooth elevation/moisture but doesn't directly address biome boundary noise. Also requires a separate buffer pass.
- **Larger scale values only (no smoothing):** Reduces noise but doesn't eliminate isolated patches at biome boundaries where thresholds create aliasing.
- **Voronoi-based biome assignment:** More natural regions but would require rewriting the entire biome system. Overkill for the current issue.

## Consequences

- Biome regions are visibly larger and more contiguous
- All 287 existing tests pass unchanged — the smoothing is deterministic and seeded
- Slight increase in map generation time (2 extra O(W×H) passes) — negligible on 64×64
- If new biome types are added, they will automatically participate in smoothing unless explicitly protected
