# Session Log: Territory Control Redesign (2026-03-04T21:26Z)

**Date:** 2026-03-04T21:26:00Z  
**Topic:** Territory Control Core Identity Pivot  
**Team:** Hal (Lead), Pemulis (Systems Dev), Gately (Game Dev)  
**Mode:** Background (all 3 agents spawned in parallel)  
**Status:** ✅ Complete

## User Directive

**Core Identity:** The game is territory control + influence. Players start with immutable 9×9 territory (sacred HQ zone). All expansion territory is conquerable through game mechanics. This supersedes previous gameplay loop redesign proposals (A/B/C from 2026-03-02).

## Deliverables

### Hal (Lead) — Architecture Proposal
- **File:** `.squad/decisions/inbox/hal-territory-control-redesign.md`
- **Scope:** Territory control architecture with 3 conquest mechanic options
- **Key Output:** Recommended Option A (Influence Flooding) for MVP; estimated 6–8h implementation
- **Open questions:** HQ size, influence visibility, win condition, neutral tile income, A+B hybrid

### Pemulis (Systems Dev) — System Design & Codebase Analysis
- **File:** `.squad/decisions/inbox/pemulis-territory-conquest-mechanics.md`
- **Scope:** Deep analysis of current TileState/PlayerState schemas, 5-phase implementation roadmap
- **Key Output:** Detailed data model (5 new TileState fields), 7 mechanics with line-count estimates, phases 1–5 breakdown
- **Implementation estimate:** 7–10 days full system, can parallelize phases 2–4

### Gately (Game Dev) — Rendering Analysis
- **File:** `.squad/decisions/inbox/gately-territory-rendering.md`
- **Scope:** 4 rendering layers for territory visualization
- **Key Output:** Confirmed GridRenderer production-ready; ~50 lines for MVP (immutable vs. conquered distinction)
- **No perf impact:** Uses existing overlay system

## Key Decisions

1. **Sacred HQ Zone:** Immutable starting territory (3×3) cannot be contested via any mechanic
2. **Data Model:** Add schema-level flag (`isHQTerritory`) + influence tracking (0–100 per tile)
3. **Conquest Mechanics:** 3 options (A—Influence Flooding, B—Resource Decay, C—Creature Siege) with A recommended for MVP
4. **Existing Systems:** Preserved (shape placement, progression, resources, creatures, HUD, map gen)
5. **Rendering:** 4 layers identified (immutable/conquered distinction, contested zones, influence strength, territory health)

## Risk Assessment

- **Influence tuning:** May require 2–3 balance passes (flip speed, decay rates, cost adjustments)
- **Stalemate potential:** Both players spam shapes → locked borders (mitigated by resource decay + influence drain mechanics)
- **Visual clarity:** Influence must be obvious at glance (color gradients critical); contested zones need clear visual signal
- **Creature integration:** Phases 4–5 defer creature siege/guard; core loop (phases 1–2) independent of creature system

## Next Steps (Awaiting User Decision)

1. User confirms mechanic choice: Option A, A+B hybrid, or alternative?
2. Hal scopes approved option into work items
3. Pemulis implements server logic (schema, placement, influence tick)
4. Gately implements client rendering (immutable overlay, contested visualization)
5. Playtest → tune constants → iterate

**Estimated delivery:** 2–3 days (Option A MVP), 4–5 days (A+B hybrid).

---

**Status:** ✅ COMPLETE — All three agents delivered architecture, system design, and rendering analysis. Decision inbox ready for merge. Awaiting user direction to scope into work items.
