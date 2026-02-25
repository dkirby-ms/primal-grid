# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Architecture & scope | Hal | Project structure, tech decisions, priorities, trade-offs |
| Rendering & UI | Gately | Canvas rendering, game loop, input handling, UI panels, HUD |
| Game systems | Pemulis | Ecosystem simulation, creature AI, world generation, tile systems, combat |
| Code review | Hal | Review PRs, check quality, suggest improvements |
| Testing | Steeply | Write tests, find edge cases, verify fixes, performance checks |
| Scope & priorities | Hal | What to build next, trade-offs, decisions |
| Session logging | Scribe | Automatic — never needs routing |

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage: analyze issue, assign `squad:{member}` label | Hal |
| `squad:hal` | Architecture, scope, review work | Hal |
| `squad:gately` | Rendering, UI, game loop work | Gately |
| `squad:pemulis` | Game systems, simulation, AI work | Pemulis |
| `squad:steeply` | Testing, quality work | Steeply |

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a feature is being built, spawn Steeply to write test cases from requirements simultaneously.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member. Hal handles all `squad` (base label) triage.
