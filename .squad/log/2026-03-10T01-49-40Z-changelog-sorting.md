# Session Log: Changelog Sorting & Merge Commit Exclusion

**Timestamp:** 2026-03-10T01:49:40Z  
**Agent:** Marathe (DevOps/CI-CD)  
**Task:** Discord changelog generation improvements  

## What Happened

Marathe updated three GitHub Actions workflows to exclude merge commits and sort features/bugfixes first in Discord notifications:

- `deploy-uat.yml`
- `deploy.yml`
- `squad-promote.yml`

All workflows now use `--no-merges` and grep-based partitioning to surface `feat` and `fix` commits ahead of other commit types.

## Decisions Made

**Decision:** Changelog Sorting & Merge Commit Exclusion (Marathe)
- Exclude merge commits: `--no-merges`
- Sort by significance: `feat`/`fix` first, then everything else
- Implementation: pure bash with `grep -iE` partitioning

## Files Changed

✏️ 3 workflow files modified  
📝 2 decision inbox files written  

## Status

✅ Complete — ready for merge
