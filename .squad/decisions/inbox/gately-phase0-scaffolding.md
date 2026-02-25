# Decision: Phase 0 Client & Root Scaffolding Choices

**Date:** 2026-02-25
**Author:** Gately (Game Dev)
**Status:** Active

## Context
Phase 0 scaffolding for the monorepo root and client package.

## Decisions

1. **PixiJS v8 async init pattern** — `new Application()` + `await app.init({...})` is the v8 API. The old v7 constructor-with-options pattern is deprecated.
2. **Vite 6** chosen for client bundling — native ESM, fast HMR, good PixiJS compatibility.
3. **Vite dev server port 3000** — leaves 2567 (Colyseus default) free for game server.
4. **Root tsconfig uses `moduleResolution: "bundler"`** — best fit for a Vite + TypeScript monorepo. Supports package.json `exports` fields.
5. **ESLint 8 + @typescript-eslint** — ESLint 8 is stable with TypeScript plugin ecosystem. Config is `.eslintrc.cjs` (CJS required since root is `type: module`).
6. **Canvas size 800×600** — initial dev viewport. Will be made responsive in Phase 1.
7. **`concurrently`** for parallel dev scripts — runs client and server dev servers together from root.

## Implications
- All agents should use `moduleResolution: "bundler"` in their tsconfigs (inherited from root).
- Client renders into `<div id="app">` — all future UI/HUD overlays should mount here or as siblings.
