# Ceremonies

> Team meetings that happen before or after work. Each squad configures their own.

## Design Review

| Field | Value |
|-------|-------|
| **Trigger** | auto |
| **When** | before |
| **Condition** | multi-agent task involving 2+ agents modifying shared systems |
| **Facilitator** | lead |
| **Participants** | all-relevant |
| **Time budget** | focused |
| **Enabled** | ✅ yes |

**Agenda:**
1. Review the task and requirements
2. Agree on interfaces and contracts between components
3. Identify risks and edge cases
4. Assign action items

---

## Auto Code Review

| Field | Value |
|-------|-------|
| **Trigger** | auto |
| **When** | after |
| **Condition** | agent pushes code to a PR targeting `dev` branch |
| **Facilitator** | lead |
| **Participants** | lead (Hal) |
| **Time budget** | focused |
| **Enabled** | ✅ yes |

**Agenda:**
1. Lead reviews the PR diff for correctness, architecture, security
2. Approve or request changes via `gh pr review`
3. If approved and CI green, PR is ready for merge

**Scope:** Only PRs targeting `dev`. CI cherry-picks to uat/prod skip this ceremony.

---

## Retrospective

| Field | Value |
|-------|-------|
| **Trigger** | auto |
| **When** | after |
| **Condition** | build failure, test failure, or reviewer rejection |
| **Facilitator** | lead |
| **Participants** | all-involved |
| **Time budget** | focused |
| **Enabled** | ✅ yes |

**Agenda:**
1. What happened? (facts only)
2. Root cause analysis
3. What should change?
4. Action items for next iteration
