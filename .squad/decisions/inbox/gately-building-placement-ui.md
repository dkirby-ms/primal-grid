## 2026-03-11: Building Placement UI Pattern

**Author:** Gately (Game Dev)
**Context:** Issue #110 — Building placement UI and rendering

### Decision

Building placement uses a **modal placement mode** triggered from HUD buttons rather than a drag-and-drop or direct-click pattern. The flow is:

1. Player clicks "Build Farm" or "Build Factory" in the HUD panel
2. Valid tiles highlight with green overlay (owned, no structure, not water/rock)
3. Player clicks a highlighted tile to place
4. ESC cancels placement mode

### Rendering Pattern

Building icons use the same `Text` + `Container` pattern as HQ markers (emoji on tile center), rendered in a dedicated `buildingContainer` layer between `hqContainer` and `fogContainer`. Placement highlights are dynamically allocated Graphics (not pre-allocated like territory overlays) since placement mode is brief and infrequent.

### Impact

- **InputHandler** now has a `setGridRenderer()` setter and a canvas click handler. Future click-to-tile features should use the `screenToTile()` method.
- **HudDOM** exposes `placementMode`, `cancelPlacementMode()`, `sendPlaceBuilding()`, and an `onPlacementModeChange` callback. Other UI systems can subscribe to placement state changes.
- **GridRenderer** caches `tileOwners`, `tileStructures`, and `tileTypes` Maps for client-side validation. These are updated every state sync and available for any future feature that needs tile metadata.
