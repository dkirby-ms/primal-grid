# Decision: Territory perimeter color scheme

**Author:** Gately  
**Date:** 2026-03-05  
**Status:** Implemented

## What changed

- Own territory perimeter edges: **yellow** (`0xffd700`)
- Other players' territory perimeter edges: **red** (`0xe6194b`)
- HQ territory fill tint follows the same yellow/red logic
- Optimistic claim overlay uses yellow (always local player)
- Gold border around HQ castle marker **removed** — 🏰 emoji is the sole HQ visual

## Why

User requested clear at-a-glance distinction between own and enemy territory. Yellow for self is warm/friendly, red for opponents is instinctively hostile — good contrast and immediately readable.

## Impact

- `GridRenderer.ts` now has a `localPlayerId` field set via `setLocalPlayerId(id)` — any future renderer that needs local-player awareness can follow this pattern.
- `playerColors` map is still maintained (used for claiming animation colors) but no longer drives territory border rendering.
