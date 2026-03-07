# Copilot Coding Agent — Squad Instructions

You are working on a project that uses **Squad**, an AI team framework. When picking up issues autonomously, follow these guidelines.

## Team Context

Before starting work on any issue:

1. Read `.squad/team.md` for the team roster, member roles, and your capability profile.
2. Read `.squad/routing.md` for work routing rules.
3. If the issue has a `squad:{member}` label, read that member's charter at `.squad/agents/{member}/charter.md` to understand their domain expertise and coding style — work in their voice.

## Capability Self-Check

Before starting work, check your capability profile in `.squad/team.md` under the **Coding Agent → Capabilities** section.

- **🟢 Good fit** — proceed autonomously.
- **🟡 Needs review** — proceed, but note in the PR description that a squad member should review.
- **🔴 Not suitable** — do NOT start work. Instead, comment on the issue:
  ```
  🤖 This issue doesn't match my capability profile (reason: {why}). Suggesting reassignment to a squad member.
  ```

## Branch Naming

Use the squad branch convention:
```
squad/{issue-number}-{kebab-case-slug}
```
Example: `squad/42-fix-login-validation`

## Branching Strategy

The project uses a three-tier branch promotion model:

```
feature branches → dev → uat → master
```

- **All PRs must target the `dev` branch** — never `uat` or `master` directly.
- Use the branch naming convention: `squad/{issue-number}-{kebab-case-slug}` (or `copilot/{slug}` for autonomous work).
- **Do NOT close issues in PR descriptions** (no `Closes #N` or `Fixes #N`). Issues are only closed when merged to `master`, not when merged to `dev` or `uat`. Instead, reference the issue: `Refs #{issue-number}`.

## PR Guidelines

When opening a PR:
- Reference the issue: `Refs #{issue-number}` (do NOT use `Closes` or `Fixes` — issues close only on merge to master)
- Target the `dev` branch
- If the issue had a `squad:{member}` label, mention the member: `Working as {member} ({role})`
- If this is a 🟡 needs-review task, add to the PR description: `⚠️ This task was flagged as "needs review" — please have a squad member review before merging.`
- Follow any project conventions in `.squad/decisions.md`

## Decisions

If you make a decision that affects other team members, write it to:
```
.squad/decisions/inbox/copilot-{brief-slug}.md
```
The Scribe will merge it into the shared decisions file.
