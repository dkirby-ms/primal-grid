## Territory Color Rendering: Local Gold + Dynamic Player Colors

**Author:** Gately (Game Dev)  
**Date:** 2026-03-12  
**PR:** #142  

### Decision

Territory borders and HQ fills use a two-tier color scheme:
- **Local player:** Always gold (`0xffd700`) — special "your territory" highlight
- **Other players:** Their actual assigned color from `playerColors` map (populated from server state sync)
- **Fallback:** Red (`#e6194b`) if a player's color is missing (defensive)

### Rationale

Previously, all non-local territory was hard-coded red. This made multiplayer unreadable — you couldn't tell which opponent owned which territory. The `playerColors` map was already populated and used correctly for claiming animations, just not for owned territory rendering.

### Implications

- Any new territory visual (influence zones, contested tiles, etc.) should use `playerColors.get(ownerID)` for non-local players, not a hard-coded color.
- Gold is reserved for local player territory rendering. Don't assign gold as a player color on the server side.
