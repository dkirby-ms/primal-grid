# Decision: Minimum Outpost Spacing

**Author:** Gately  
**Date:** 2026-03-11  
**PR:** #140  
**Issue:** #139  

## Context

Builders placed outposts on every claimed tile, visually cluttering the map.

## Decision

Added `MIN_OUTPOST_SPACING = 4` (Manhattan distance) in `shared/src/constants.ts`. The `hasNearbyOutpost()` function in `builderAI.ts` checks proximity before placing an outpost structure. Tiles are still claimed — only the outpost icon is suppressed when too close.

## Impact

- Rendering: Fewer outpost markers on map — cleaner visuals
- Client: No changes needed — already renders based on `structureType`
- Balance: Spacing of 4 tiles means roughly 1 outpost per ~20 tiles of territory. Tunable via constant.
