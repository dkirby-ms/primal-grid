# Decision: Upgrade Node.js 20 → 22

**Author:** Pemulis (Systems Dev)  
**Date:** 2025-07-15  
**Status:** Implemented

## Context

`@colyseus/core` requires `node >= 22.x` and was throwing warnings during Docker builds. The project was pinned to Node 20 across Dockerfile, CI, and deploy workflows.

## Changes

| File | Change |
|------|--------|
| `Dockerfile` | `node:20-alpine` → `node:22-alpine` (both build and production stages) |
| `.github/workflows/ci.yml` | `node-version: 20` → `node-version: 22` |
| `.github/workflows/deploy.yml` | `node-version: 20` → `node-version: 22` |

## Not Changed

- `package.json` — no `engines` field exists, so nothing to update.
- No `.nvmrc`, `.node-version`, or `.tool-versions` files exist in the repo.

## Verification

Full workspace build (`shared → server → client`) passes cleanly on the current environment.
