## 2026-03-13: Outpost Upgrade Click Priority

**Author:** Gately  
**Issue:** #179  
**Status:** Proposed / implemented in client branch

### Decision

When the player is in explicit building placement mode, placement clicks take priority over outpost click-to-upgrade. Outside placement mode, left-clicking an owned, unupgraded outpost opens the upgrade modal. Right-click no longer opens upgrade UI, but the client still suppresses the native browser context menu so right-drag camera controls stay clean.

### Why

- Prevents click-to-upgrade from stealing valid farm/factory placement actions on outpost tiles.
- Matches the design goal that left-click is the canonical upgrade path without making right-click fight camera controls.
- Keeps the interaction simple: build mode means build, normal mode means click-to-upgrade is available.

### Client Implications

- `InputHandler` must check `hud.placementMode` before attempting outpost upgrade.
- Keep a `contextmenu` listener that only calls `preventDefault()`.
- Discoverability lives in HUD/help text, not a right-click context menu pattern.
