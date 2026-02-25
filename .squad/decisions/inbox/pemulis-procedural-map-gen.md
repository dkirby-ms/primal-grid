# Decision: Procedural Map Generation Architecture

**Date:** 2026-02-25
**Author:** Pemulis (Systems Dev)
**Status:** Active

## Context

Phase 2.1 replaces the hardcoded deterministic map with noise-based procedural generation.

## Decisions

1. **Inline simplex noise** — no external dependency. 2D simplex with seeded permutation tables in `server/src/rooms/mapGenerator.ts`.
2. **Dual noise layers** — elevation and moisture are independent noise fields (different seeds). Biome is determined by thresholding both values.
3. **All noise params centralized** in `shared/src/constants.ts` as `NOISE_PARAMS`. Tuning biome distribution only requires changing thresholds.
4. **Seed propagated via GameState schema** — `mapSeed` field synced to clients for potential client-side prediction/display.
5. **Generator is a standalone function** — `generateProceduralMap(state, seed, width, height)`, not coupled to GameRoom. Can be used in tests, tools, or future map-editing flows.
6. **Fertility derived from biome + moisture** — not a separate noise layer. Keeps generation simple and biome-coherent.

## Implications

- New biomes or terrain features should add thresholds to `NOISE_PARAMS`, not hardcode in the generator.
- Tests for map content must use dynamic tile scanning, not fixed coordinates.
- Client already handles unknown tile types gracefully (falls back to Grassland color).
