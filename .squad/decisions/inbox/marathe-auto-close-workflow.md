# Decision: Auto-Close Workflow for Squash-Merged PRs

**Date:** 2026-03-09  
**Author:** Marathe (DevOps / CI-CD)  
**Status:** BINDING

## Context

GitHub's squash-merge rewrites the commit message. Depending on repo settings, the squash commit message may use only the PR title (dropping the body where `Closes #N` lives). This caused 6+ issues (#19, #30, #31, #42, #74, #77) to remain open after their PRs were merged, requiring manual cleanup every time.

## Decision

Added `.github/workflows/auto-close-issues.yml` — a GitHub Actions workflow that:
- Triggers on `pull_request` `closed` events when the PR was merged
- Parses the PR body for `Closes #N`, `Fixes #N`, `Resolves #N` (case-insensitive)
- Closes each matched issue via `gh issue close` with `--reason completed`
- Adds a comment on each closed issue linking to the merged PR
- Is idempotent: skips issues that are already closed or not found
- Uses minimal permissions: `issues: write`, `pull-requests: read`

## Implications

- **Agents no longer need to manually close issues** after squash-merging PRs
- `Closes #N` should still be placed in PR bodies (best practice for traceability), and this workflow acts as a safety net
- The workflow runs on all merged PRs across all branches — no branch filtering needed
- No secrets required beyond the default `GITHUB_TOKEN`

## Alternatives Considered

- **Repo settings (squash merge commit message format):** GitHub offers a repo-level setting to include the PR body in squash commit messages. However, this is a UI setting not under version control, and could be accidentally changed. The workflow approach is more reliable and auditable.
