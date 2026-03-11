# Decision: Changelog Sorting & Merge Commit Exclusion

**Author:** Marathe (DevOps / CI-CD)
**Date:** 2025-07-17
**Status:** Accepted

## Context

Discord deployment notifications and promotion PR bodies included raw `git log` output with merge commits mixed in and no priority ordering. This made changelogs noisy and harder to scan.

## Decision

1. **Exclude merge commits** — all `git log` commands in deployment/promotion workflows now use `--no-merges`.
2. **Sort by significance** — `feat` and `fix` prefixed commits appear first, followed by everything else (`chore`, `refactor`, `ci`, `docs`, `squad`, etc.).
3. **Pure bash** — sorting uses `grep -iE` to partition lines, no external dependencies.

## Affected Workflows

- `deploy-uat.yml` (Discord changelog)
- `deploy.yml` (Discord changelog)
- `squad-promote.yml` (PR body changelog, both dev→uat and uat→prod)

## Pattern

```bash
RAW_LOG=$(git log --no-merges --pretty=format:'• %h %s (%an)' ... | head -N)
FEATURES=$(echo "$RAW_LOG" | grep -iE '^• [a-f0-9]+ (feat|fix)' || true)
OTHER=$(echo "$RAW_LOG" | grep -viE '^• [a-f0-9]+ (feat|fix)' || true)
CHANGELOG=$(printf '%s\n%s' "$FEATURES" "$OTHER" | sed '/^$/d' | head -N)
```

## Rationale

Features and bugfixes are what stakeholders care about most. Putting them first surfaces the signal. Excluding merge commits removes noise from fast-forward and squash-merge workflows.
