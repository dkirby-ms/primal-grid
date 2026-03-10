# Team Roster

> Primal Grid: Survival of the Frontier — a grid-based survival colony builder with dinosaurs, ecosystem simulation, and base automation in the browser.

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. Does not generate domain artifacts. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Hal | Lead | `.squad/agents/hal/charter.md` | ✅ Active |
| Gately | Game Dev | `.squad/agents/gately/charter.md` | ✅ Active |
| Pemulis | Systems Dev | `.squad/agents/pemulis/charter.md` | ✅ Active |
| Steeply | Tester | `.squad/agents/steeply/charter.md` | ✅ Active |
| Marathe | DevOps / CI-CD | `.squad/agents/marathe/charter.md` | ✅ Active |
| Joelle | Community / DevRel | `.squad/agents/joelle/charter.md` | ✅ Active |
| Scribe | Session Logger | `.squad/agents/scribe/charter.md` | 📋 Silent |
| Ralph | Work Monitor | — | 🔄 Monitor |
| @copilot | Coding Agent | `copilot-instructions.md` | 🤖 Autonomous |

<!-- copilot-auto-assign: true -->

### @copilot Capability Profile

| Category | Fit | Notes |
|----------|-----|-------|
| Single-file bug fixes | 🟢 | Strong — well-scoped, clear acceptance criteria |
| Multi-file feature implementation | 🟢 | Strong — can follow patterns across packages |
| Test writing | 🟢 | Strong — good at following existing test patterns |
| Refactoring | 🟡 | Moderate — needs clear scope boundaries |
| Architecture decisions | 🔴 | Weak — needs human/Lead judgment |
| UI/visual design | 🔴 | Weak — no visual feedback loop |


## Coding Agent

<!-- copilot-auto-assign: false -->

| Name | Role | Charter | Status |
|------|------|---------|--------|
| @copilot | Coding Agent | — | 🤖 Coding Agent |

### Capabilities

**🟢 Good fit — auto-route when enabled:**
- Bug fixes with clear reproduction steps
- Test coverage (adding missing tests, fixing flaky tests)
- Lint/format fixes and code style cleanup
- Dependency updates and version bumps
- Small isolated features with clear specs
- Boilerplate/scaffolding generation
- Documentation fixes and README updates

**🟡 Needs review — route to @copilot but flag for squad member PR review:**
- Medium features with clear specs and acceptance criteria
- Refactoring with existing test coverage
- API endpoint additions following established patterns
- Migration scripts with well-defined schemas

**🔴 Not suitable — route to squad member instead:**
- Architecture decisions and system design
- Multi-system integration requiring coordination
- Ambiguous requirements needing clarification
- Security-critical changes (auth, encryption, access control)
- Performance-critical paths requiring benchmarking
- Changes requiring cross-team discussion

## Project Context

- **Owner:** dkirby-ms
- **Stack:** TypeScript, HTML5 Canvas, browser-based web game
- **Description:** Grid-based survival colony builder with dinosaurs, dynamic ecosystems, creature AI, base building, and automation — inspired by ARK, RimWorld, and Factorio.
- **Design Document:** `docs/design-sketch.md`
- **Created:** 2026-02-25T00:45:00Z
