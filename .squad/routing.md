# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Architecture & scope | Hal | Project structure, tech decisions, priorities, trade-offs |
| Rendering & UI | Gately | Canvas rendering, game loop, input handling, UI panels, HUD |
| Game systems | Pemulis | Ecosystem simulation, creature AI, world generation, tile systems, combat |
| Code review | Hal | Review PRs, check quality, suggest improvements |
| CI/CD & DevOps | Marathe | GitHub Actions, workflows, deployment, Docker, build pipelines, test reporting |
| Testing | Steeply | Write tests, find edge cases, verify fixes, performance checks |
| Scope & priorities | Hal | What to build next, trade-offs, decisions |
| Community & Discord | Joelle | Discord notifications, release notes, README updates, player-facing comms |
| Cross-project orchestration | Avril | Studio coordination, cross-project status, scaffolding |
| Session logging | Scribe | Automatic — never needs routing |

## PR Review Gates

| PR Type | Target Branch | Reviewer | Policy |
|---------|---------------|----------|--------|
| Feature/fix branches → `dev` | `dev` | Hal (code review) | Merge after Hal approval |
| `dev` → `uat` | `uat` | @copilot (automated review) | Merge after copilot approval |
| `uat` → `prod` | `prod` | @dkirby-ms (manual) | Only created and merged by owner |

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage: analyze issue, assign `squad:{member}` label | Hal |
| `squad:hal` | Architecture, scope, review work | Hal |
| `squad:gately` | Rendering, UI, game loop work | Gately |
| `squad:pemulis` | Game systems, simulation, AI work | Pemulis |
| `squad:steeply` | Testing, quality work | Steeply |
| `squad:marathe` | CI/CD, workflows, deployment, infrastructure | Marathe |
| `squad:joelle` | Discord, README, release notes, community docs | Joelle |
| `squad:copilot` | Single-file fixes, test writing, scoped implementation | @copilot |

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a feature is being built, spawn Steeply to write test cases from requirements simultaneously.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member. Hal handles all `squad` (base label) triage.
8. **GitHub auto-close for issue PRs** — When opening a PR to fix an issue, include `Closes #N` (or `Fixes #N`, `Resolves #N`) in the PR body. PRs must target `dev` (the development branch) for issue auto-close to work, since `prod` is the default branch.
9. **PR review routing** — Automated via `squad-pr-review.yml`. See PR Review Gates above.
10. **Hal reviews every PR to `dev`** — After any agent opens or updates a PR targeting `dev`, the coordinator must spawn Hal as a code-review agent in the same session. Do not wait for external triggers or polling.
