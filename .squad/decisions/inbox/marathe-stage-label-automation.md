# Decision: Stage Label Automation on Dev Merge

**Author:** Marathe (DevOps / CI-CD)
**Date:** 2026-03-11
**Issue:** #107
**PR:** #108

## Context

When PRs merge to `dev`, linked issues need the `stage:ready-for-uat` label applied so the team knows which bugs/features are ready for UAT testing. This was previously manual.

## Decision

Added `.github/workflows/squad-stage-label.yml` — a lightweight workflow that:
- Triggers on PR merge to `dev` (not just close)
- Parses PR body for `Closes #N` / `Fixes #N` / `Resolves #N` (case-insensitive)
- Applies `stage:ready-for-uat` to each linked issue
- Uses `actions/github-script@v7` with `issues: write` permission only

## Why This Approach

- No checkout needed (pure API, no filesystem) — fast and cheap
- Regex parsing is reliable for GitHub's well-defined auto-close syntax
- Graceful failure: warns on individual label failures, doesn't block the pipeline
- Consistent with existing squad workflow patterns (label-enforce, triage, etc.)

## Impact

- All squad members: PRs that use `Closes #N` in the body will auto-label linked issues on merge to dev
- No action needed from developers — just keep using standard PR body conventions
