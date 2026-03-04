# Session Log: Pawn Builder Design

**Date:** 2026-03-04T22:27  
**Topic:** Pawn-Based Territory Expansion Architecture  
**Participants:** Hal (Lead), Pemulis (Systems Dev)  
**Directive:** dkirby-ms — Replace conquest mechanics with autonomous pawn-based expansion

## Summary

Two agents produced comprehensive architecture proposals for pawn-based territory expansion:

**Hal** architected the high-level builder system: pawns reuse CreatureState, 3-state FSM, 1×1 structures claim tiles, spawning removes direct shape placement. **MVP estimate: 2–3 days.**

**Pemulis** designed the full data model: extended CreatureState with pawn fields, new StructureState schema, three structure types (outpost/wall/extractor), constants registry, and 4-phase implementation roadmap. **Estimate: 3–4 days.**

**Outcome:** Fully architected system ready for dkirby-ms review. Open questions on shape placement removal, structure size, and MVP rally points.

## Decisions Captured

- `.squad/decisions/inbox/hal-pawn-builder-architecture.md` — 135 lines
- `.squad/decisions/inbox/pemulis-pawn-builder-design.md` — 786 lines  
- `.squad/decisions/inbox/copilot-directive-2026-03-04T2227.md` — 5 lines
- `.squad/agents/hal/history.md` — Updated with learning entry
- `.squad/agents/pemulis/history.md` — Updated with learning entry

## Status

All artifacts ready for merge to `.squad/decisions.md`. Awaiting dkirby-ms selection on open questions before implementation begins.
