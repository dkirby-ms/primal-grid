# Decision: Primal Grid Pivot — Rimworld-style Multiplayer Arcade

**Author:** Hal (Lead)
**Date:** 2026-02-27
**Status:** PROPOSED
**Scope:** Project-wide architecture pivot

## Context

User requested a fundamental redesign: "Rimworld but multiplayer arcade game." The existing codebase (Phases 1–4 complete, 304 tests) has a direct-control avatar model. The new vision removes the avatar entirely in favor of commander-mode indirect control.

## Decisions

### P1: No Player Avatar
Player is a disembodied commander. `PlayerState` loses `x`, `y`, `hunger`, `health`. Player interacts via UI (click to place, click to assign). Camera is free-panning, not avatar-following.

### P2: Territory System
`TileState` gains `ownerID`. Players claim tiles adjacent to existing territory (contiguous expansion). Each player starts with 3×3 + HQ structure. Territory = the core resource.

### P3: Indirect Pawn Control
Tamed dinos are assigned commands (gather, guard, patrol) and zones, not direct movement. No pack-follow. Zone-based assignment replaces `SELECT_CREATURE` mechanic.

### P4: Tower Defense Waves
Wild creatures spawn at map edges on a timer, escalating over the round. Turret structures auto-fire. Walls have HP and can be destroyed. PvE is the primary threat for MVP.

### P5: Round-Based Multiplayer
15–30 minute rounds. 2–4 players per room. Win by territory count or last HQ standing. No persistent progression between rounds (deferred).

### P6: Map Scale
64×64 (up from 32×32). 4,096 tiles. Monitor Colyseus sync bandwidth; interest management may be needed at 4 players.

### P7: Four Implementation Phases
- **Phase A:** Strip avatar, add territory + camera (~1–2 weeks)
- **Phase B:** Building + turrets + waves (~1–2 weeks)
- **Phase C:** Pawn commands + auto-gather (~1–2 weeks)
- **Phase D:** Multiplayer polish + balance (~1 week)

### P8: What Survives
Tile grid, biomes, creature AI FSM, taming/trust, breeding, structures, crafting/recipes, Colyseus architecture, PixiJS rendering (modified).

### P9: What's Cut
Player avatar, WASD movement, manual gathering, player hunger/health/survival, pack follow, tool bonuses (axe/pickaxe).

## Impact
- All previous phase numbering (0–7) is superseded by Phases A–D
- `docs/gdd.md` is now the active design document
- `docs/design-sketch.md` is historical reference only
- Existing tests related to cut systems will be removed during Phase A
- Existing tests for kept systems (creatures, taming, breeding, structures) remain valid

## Risks
- 64×64 map doubles state sync bandwidth — may need interest management
- Indirect control can feel unresponsive if pawn AI is sluggish — tune tick rates
- Round-based model needs good pacing or games drag — playtest early
