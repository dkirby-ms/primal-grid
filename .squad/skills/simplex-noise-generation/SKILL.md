# Skill: Simplex Noise Procedural Generation

## Pattern

Inline 2D simplex noise for seed-based procedural content without external dependencies.

## Key Components

1. **Seeded permutation table** — Fisher-Yates shuffle with LCG PRNG (`Math.imul(s, 1664525) + 1013904223`). Double to 512 entries to avoid modular wrapping.
2. **2D simplex noise** — Skew input to triangular grid (F2/G2 factors), compute gradient contributions from 3 simplex corners, sum and scale to [0,1].
3. **Fractal Brownian motion (fBm)** — Layer multiple octaves with halving amplitude and doubling frequency for natural-looking detail.
4. **Multi-layer independence** — Use different seeds for each noise layer (e.g., `seed` for elevation, `seed + 31337` for moisture) to avoid correlation.

## Usage Pattern

```typescript
const perm = createPermTable(seed);
const value = fbm(perm, x, y, octaves, scale);
// value is in [0, 1], use thresholds to classify
```

## Tuning Tips

- **Scale** controls feature size: 0.08 gives ~2-3 features across 32 tiles
- **Octaves** add detail: 3-4 is good for terrain, 1-2 for broad regions
- **Thresholds** near 0.5 produce ~50/50 splits; near extremes produce rare features
- fBm values cluster around 0.5 — extreme thresholds (<0.2, >0.8) produce sparse features

## Files

- `server/src/rooms/mapGenerator.ts` — reference implementation
- `shared/src/constants.ts` — `NOISE_PARAMS` for tunable thresholds
