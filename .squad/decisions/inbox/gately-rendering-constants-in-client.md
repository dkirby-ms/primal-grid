# Decision: Rendering constants live in client, not shared

**Author:** Gately  
**Date:** 2026-03-07  
**Status:** Applied

## Context
The particle effects system needed tuning constants (particle counts, colors, speeds, alpha ranges). These are purely visual/rendering values — they don't affect game logic, server simulation, or client-server sync.

## Decision
All particle/overlay rendering constants are defined at the top of `client/src/renderer/ParticleSystem.ts`, **not** in `shared/src/constants.ts`. This keeps the shared package focused on game-mechanic tuning that both server and client need.

## Implications
- Future rendering-only constants (animation speeds, glow radii, camera effects) should follow the same pattern: define them in the client file that uses them.
- If a visual constant ever needs to be driven by server state (e.g. server controls particle density per biome), it should migrate to shared at that point.
